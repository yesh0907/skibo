import { z } from "zod";

import {
  ApiErrorSchema,
  LeaveRoomResponseSchema,
  PlayerViewSchema,
  type ApiError,
  type LeaveRoomResponse,
  type PlayerView,
  type RevisionedLeaveRoomRequest,
  type RevisionedPlayCommandRequest,
  type RevisionedStartGameRequest,
} from "../shared/transport";

const CreateResponseSchema = z.object({ gameId: z.string().min(1) }).passthrough();
const ViewResponseSchema = z.union([
  PlayerViewSchema,
  z.object({ view: PlayerViewSchema }).passthrough().transform(({ view }) => view),
]);

export const CURRENT_GAME_KEY = "skibo.currentGameId";

export interface GameApi {
  create(): Promise<string>;
  join(gameId: string, playerName: string): Promise<PlayerView>;
  read(gameId: string): Promise<PlayerView>;
  start(gameId: string, request: RevisionedStartGameRequest): Promise<PlayerView>;
  command(gameId: string, request: RevisionedPlayCommandRequest): Promise<PlayerView>;
  leave(gameId: string, request: RevisionedLeaveRoomRequest): Promise<LeaveRoomResponse>;
}

export class GameApiError extends Error {
  constructor(readonly payload: ApiError) {
    super(payload.error.message);
    this.name = "GameApiError";
  }
}

function jsonRequest(method: string, body?: unknown): RequestInit {
  return {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

async function request(path: string, init: RequestInit, schema: z.ZodType): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new GameApiError({
      error: { code: "internal_error", message: "Could not reach the game server." },
    });
  }

  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = ApiErrorSchema.safeParse(data);
    throw new GameApiError(
      parsed.success
        ? parsed.data
        : { error: { code: "internal_error", message: "The game server could not complete that request." } },
    );
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new GameApiError({
      error: { code: "internal_error", message: "The game server returned an invalid response." },
    });
  }
  return parsed.data;
}

export const gameApi: GameApi = {
  async create() {
    const result = (await request("/api/games", jsonRequest("POST", {}), CreateResponseSchema)) as z.infer<typeof CreateResponseSchema>;
    return result.gameId;
  },
  async join(gameId, playerName) {
    return (await request(
      `/api/games/${encodeURIComponent(gameId)}/join`,
      jsonRequest("POST", { playerName }),
      ViewResponseSchema,
    )) as PlayerView;
  },
  async read(gameId) {
    return (await request(
      `/api/games/${encodeURIComponent(gameId)}/state`,
      jsonRequest("GET"),
      ViewResponseSchema,
    )) as PlayerView;
  },
  async start(gameId, body) {
    return (await request(
      `/api/games/${encodeURIComponent(gameId)}/start`,
      jsonRequest("POST", body),
      ViewResponseSchema,
    )) as PlayerView;
  },
  async command(gameId, body) {
    return (await request(
      `/api/games/${encodeURIComponent(gameId)}/commands`,
      jsonRequest("POST", body),
      ViewResponseSchema,
    )) as PlayerView;
  },
  async leave(gameId, body) {
    return (await request(
      `/api/games/${encodeURIComponent(gameId)}/players/me`,
      jsonRequest("DELETE", body),
      LeaveRoomResponseSchema,
    )) as LeaveRoomResponse;
  },
};

export function toApiError(error: unknown): ApiError {
  if (error instanceof GameApiError) return error.payload;
  return {
    error: {
      code: "internal_error",
      message: "Something went wrong. Your last game view is still available.",
    },
  };
}
