import type { Command } from "../shared/command";
import type { PlayCardSource } from "../shared/types";
import type {
  JoinRoomRequest,
  PlayCommandRequest,
  StartGameRequest,
} from "../shared/room-state";
import { GameRoomDO, type Env } from "./game-room-do";

export { GameRoomDO };

function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

function createGameId(): string {
  return `game_${crypto.randomUUID().replaceAll("-", "")}`;
}

function getGameIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/api\/games\/([^/]+)(?:\/.*)?$/);
  return match?.[1] ?? null;
}

async function readJson(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    throw new HttpError(400, "Expected JSON body");
  }

  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "Expected JSON body");
  }
}

function requirePlayerName(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new HttpError(400, "playerName is required");
  }
  return value.trim();
}

function requirePlayerToken(request: Request): string {
  const authorization = request.headers.get("authorization");
  const prefix = "Bearer ";
  if (!authorization?.startsWith(prefix)) {
    throw new HttpError(401, "Bearer player token is required");
  }
  const token = authorization.slice(prefix.length);
  if (token.length < 16) {
    throw new HttpError(401, "Bearer player token is required");
  }
  return token;
}

function requireStockPileSize(value: unknown): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isInteger(value) || (value as number) < 1) {
    throw new HttpError(400, "stockPileSize must be a positive integer");
  }
  return value as number;
}

function requireCommand(value: unknown): Command {
  if (!isRecord(value) || typeof value.type !== "string") {
    throw new HttpError(400, "command is invalid");
  }

  if (
    value.type === "playCard" &&
    typeof value.cardValue === "number" &&
    Number.isInteger(value.cardValue) &&
    typeof value.destinationIndex === "number" &&
    Number.isInteger(value.destinationIndex) &&
    isPlaySource(value.source)
  ) {
    return {
      type: "playCard",
      cardValue: value.cardValue,
      destinationIndex: value.destinationIndex,
      source: value.source,
    };
  }

  if (
    value.type === "discardCard" &&
    typeof value.cardValue === "number" &&
    Number.isInteger(value.cardValue) &&
    typeof value.discardPileIndex === "number" &&
    Number.isInteger(value.discardPileIndex) &&
    isRecord(value.source) &&
    value.source.type === "hand" &&
    typeof value.source.index === "number" &&
    Number.isInteger(value.source.index)
  ) {
    return {
      type: "discardCard",
      cardValue: value.cardValue,
      discardPileIndex: value.discardPileIndex,
      source: {
        type: "hand",
        index: value.source.index,
      },
    };
  }

  throw new HttpError(400, "command is invalid");
}

function isPlaySource(value: unknown): value is PlayCardSource {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }
  if (value.type === "stockPile") {
    return true;
  }
  return (
    (value.type === "hand" || value.type === "discardPile") &&
    typeof value.index === "number" &&
    Number.isInteger(value.index)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      const gameId = getGameIdFromPath(url.pathname);

      if (request.method === "POST" && url.pathname === "/api/games") {
        const newGameId = createGameId();
        const room = env.GAME_ROOM.getByName(newGameId);
        const state = await room.initialize();

        return json({ gameId: newGameId, state }, { status: 201 });
      }

      if (!gameId) {
        return json({ error: "Not found" }, { status: 404 });
      }

      const room = env.GAME_ROOM.getByName(gameId);

      if (
        request.method === "GET" &&
        url.pathname === `/api/games/${gameId}/state`
      ) {
        const playerToken = requirePlayerToken(request);
        return json(await room.getView(playerToken));
      }

      if (
        request.method === "POST" &&
        url.pathname === `/api/games/${gameId}/join`
      ) {
        const body = (await readJson(request)) as Partial<JoinRoomRequest>;
        const playerName = requirePlayerName(body.playerName);
        return json(await room.join(playerName));
      }

      if (
        request.method === "POST" &&
        url.pathname === `/api/games/${gameId}/start`
      ) {
        const body = (await readJson(request)) as Partial<StartGameRequest>;
        return json(
          await room.start(
            requirePlayerToken(request),
            requireStockPileSize(body.stockPileSize),
          ),
        );
      }

      if (
        request.method === "POST" &&
        url.pathname === `/api/games/${gameId}/commands`
      ) {
        const body = (await readJson(request)) as Partial<PlayCommandRequest>;
        return json(
          await room.playCommand(
            requirePlayerToken(request),
            requireCommand(body.command),
          ),
        );
      }

      return json({ error: "Not found" }, { status: 404 });
    } catch (error) {
      if (error instanceof HttpError) {
        return json({ error: error.message }, { status: error.status });
      }
      const roomErrorMessage = getRoomErrorMessage(error);
      if (roomErrorMessage !== null) {
        return json({ error: roomErrorMessage }, { status: 409 });
      }
      console.error(
        JSON.stringify({
          event: "game_api_request_failed",
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return json({ error: "Internal server error" }, { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;

function getRoomErrorMessage(error: unknown): string | null {
  if (!(error instanceof Error)) {
    return null;
  }
  if (error.name === "RoomError") {
    return error.message;
  }

  const remotePrefix = "RoomError: ";
  return error.message.startsWith(remotePrefix)
    ? error.message.slice(remotePrefix.length)
    : null;
}
