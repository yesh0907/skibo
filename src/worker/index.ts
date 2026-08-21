import { z } from "zod";

import {
  ApiErrorSchema,
  CommandSchema,
  CreateGameRequestSchema,
  JoinRoomRequestSchema,
  LeaveRoomRequestSchema,
  PlayerViewSchema,
  PlayCommandRequestSchema,
  StartGameRequestSchema,
  type ApiError,
} from "../shared/transport";
import {
  GameRoomDO,
  INTERNAL_PLAYER_TOKEN_HEADER,
  type Env,
} from "./game-room-do";
import { parseRoomError } from "./room-error";

export { GameRoomDO };

const PLAYER_COOKIE_NAME = "skibo_player";
type ApiErrorCode = ApiError["error"]["code"];
const PLAYER_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;
const MAX_JSON_BODY_BYTES = 16 * 1024;
const GameIdSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z0-9_-]+$/);
const PlayerTokenSchema = z.string().min(16).max(256);
function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

function createGameId(): string {
  return `game_${crypto.randomUUID().replaceAll("-", "")}`;
}

function getGameIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/api\/games\/([^/]+)(?:\/.*)?$/);
  const result = GameIdSchema.safeParse(match?.[1]);
  return result.success ? result.data : null;
}

async function parseJson<T>(
  request: Request,
  schema: z.ZodType<T>,
  allowEmpty = false,
): Promise<T> {
  if (request.body === null && allowEmpty) {
    return schema.parse({});
  }
  const hasJsonContentType = request.headers
    .get("content-type")
    ?.includes("application/json");
  if (!allowEmpty && !hasJsonContentType) {
    throw new HttpError(400, "invalid_request", "Expected a JSON body");
  }

  let body: unknown;
  try {
    const jsonText = await readBoundedBody(request);
    if (allowEmpty && jsonText.length === 0) {
      return schema.parse({});
    }
    if (!hasJsonContentType) {
      throw new HttpError(400, "invalid_request", "Expected a JSON body");
    }
    body = JSON.parse(jsonText);
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    throw new HttpError(400, "invalid_request", "Expected a JSON body");
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    throw new HttpError(400, "invalid_request", "Request body is invalid");
  }
  return result.data;
}

async function readBoundedBody(request: Request): Promise<string> {
  const contentLength = request.headers.get("content-length");
  if (
    contentLength !== null &&
    Number.isFinite(Number(contentLength)) &&
    Number(contentLength) > MAX_JSON_BODY_BYTES
  ) {
    throw new HttpError(413, "invalid_request", "Request body is too large");
  }

  const reader = request.body?.getReader();
  if (reader === undefined) {
    throw new SyntaxError("Missing JSON body");
  }
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    byteLength += value.byteLength;
    if (byteLength > MAX_JSON_BODY_BYTES) {
      await reader.cancel();
      throw new HttpError(413, "invalid_request", "Request body is too large");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function requirePlayerToken(request: Request): string {
  const cookieToken = readCookie(request, PLAYER_COOKIE_NAME);
  if (cookieToken !== null) {
    const result = PlayerTokenSchema.safeParse(cookieToken);
    if (result.success) {
      return result.data;
    }
  }

  const authorization = request.headers.get("authorization");
  const prefix = "Bearer ";
  const bearerToken = authorization?.startsWith(prefix)
    ? authorization.slice(prefix.length)
    : undefined;
  const result = PlayerTokenSchema.safeParse(bearerToken);
  if (!result.success) {
    throw new HttpError(
      401,
      "unauthorized",
      "Player authentication is required",
    );
  }
  return result.data;
}

function requirePlayerCookieToken(request: Request): string {
  const result = PlayerTokenSchema.safeParse(
    readCookie(request, PLAYER_COOKIE_NAME),
  );
  if (!result.success) {
    throw new HttpError(
      401,
      "unauthorized",
      "A cookie-authenticated player session is required",
    );
  }
  return result.data;
}

function readCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (cookieHeader === null) {
    return null;
  }
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) {
      continue;
    }
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

function playerCookie(
  request: Request,
  gameId: string,
  token: string,
  maxAge: number,
): string {
  const attributes = [
    `${PLAYER_COOKIE_NAME}=${encodeURIComponent(token)}`,
    `Path=/api/games/${gameId}`,
    `Max-Age=${maxAge}`,
    "HttpOnly",
    "SameSite=Strict",
  ];
  if (new URL(request.url).protocol === "https:") {
    attributes.push("Secure");
  }
  return attributes.join("; ");
}

function withCookie(response: Response, cookie: string): Response {
  const headers = new Headers(response.headers);
  headers.set("set-cookie", cookie);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly currentRevision?: number,
  ) {
    super(message);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);

      if (request.method === "POST" && url.pathname === "/api/games") {
        await parseJson(request, CreateGameRequestSchema, true);
        const gameId = createGameId();
        const state = await env.GAME_ROOM.getByName(gameId).initialize();
        return json({ gameId, state }, { status: 201 });
      }

      const gameId = getGameIdFromPath(url.pathname);
      if (gameId === null) {
        throw new HttpError(404, "not_found", "Not found");
      }
      const room = env.GAME_ROOM.getByName(gameId);

      if (
        request.method === "GET" &&
        url.pathname === `/api/games/${gameId}/ws`
      ) {
        if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
          return apiError(
            426,
            "invalid_request",
            "Expected a WebSocket upgrade",
          );
        }
        const playerToken = requirePlayerCookieToken(request);
        await room.getView(playerToken);
        const headers = new Headers(request.headers);
        headers.set(INTERNAL_PLAYER_TOKEN_HEADER, playerToken);
        return room.fetch(new Request(request, { headers }));
      }

      if (
        request.method === "GET" &&
        url.pathname === `/api/games/${gameId}/state`
      ) {
        const view = await room.getView(requirePlayerToken(request));
        return json(PlayerViewSchema.parse(view));
      }

      if (
        request.method === "POST" &&
        url.pathname === `/api/games/${gameId}/join`
      ) {
        const body = await parseJson(request, JoinRoomRequestSchema);
        const result = await room.join(body.playerName);
        const response = json({
          playerToken: result.playerToken,
          view: PlayerViewSchema.parse(result.view),
        });
        return withCookie(
          response,
          playerCookie(
            request,
            gameId,
            result.playerToken,
            PLAYER_COOKIE_MAX_AGE_SECONDS,
          ),
        );
      }

      if (
        request.method === "POST" &&
        url.pathname === `/api/games/${gameId}/start`
      ) {
        const body = await parseJson(request, StartGameRequestSchema);
        const view = await room.start(
          requirePlayerToken(request),
          body.expectedRevision,
          body.stockPileSize,
        );
        return json(PlayerViewSchema.parse(view));
      }

      if (
        request.method === "POST" &&
        url.pathname === `/api/games/${gameId}/commands`
      ) {
        const body = await parseJson(request, PlayCommandRequestSchema);
        const result = await room.playCommand(
          requirePlayerToken(request),
          body.expectedRevision,
          CommandSchema.parse(body.command),
        );
        return json({
          ...result,
          view: PlayerViewSchema.parse(result.view),
        });
      }

      if (
        request.method === "DELETE" &&
        url.pathname === `/api/games/${gameId}/players/me`
      ) {
        const body = await parseJson(request, LeaveRoomRequestSchema);
        const result = await room.leave(
          requirePlayerToken(request),
          body.expectedRevision,
        );
        return withCookie(
          json(result),
          playerCookie(request, gameId, "", 0),
        );
      }

      throw new HttpError(404, "not_found", "Not found");
    } catch (error) {
      if (error instanceof HttpError) {
        return apiError(error.status, error.code, error.message, error.currentRevision);
      }
      const roomError = parseRoomError(error);
      if (roomError !== null) {
        const status =
          roomError.code === "unauthorized"
            ? 401
            : roomError.code === "not_found"
              ? 404
              : 409;
        return apiError(
          status,
          roomError.code,
          roomError.message,
          roomError.currentRevision,
        );
      }
      console.error(
        JSON.stringify({
          event: "game_api_request_failed",
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return apiError(500, "internal_error", "Internal server error");
    }
  },
} satisfies ExportedHandler<Env>;

function apiError(
  status: number,
  code: ApiErrorCode,
  message: string,
  currentRevision?: number,
): Response {
  const body: ApiError = ApiErrorSchema.parse({
    error: {
      code,
      message,
      ...(currentRevision === undefined ? {} : { currentRevision }),
    },
  });
  return json(body, { status });
}
