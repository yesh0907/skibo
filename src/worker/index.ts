import { GameRoomDO, type Env } from "./game-room-do";
import type { JoinRoomRequest } from "../shared/room-state";

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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const gameId = getGameIdFromPath(url.pathname);

    if (request.method === "POST" && url.pathname === "/api/games") {
      const newGameId = createGameId();
      const room = env.GAME_ROOM.getByName(newGameId);
      const state = await room.getState();

      return json({ gameId: newGameId, state }, { status: 201 });
    }

    if (!gameId) {
      return json({ error: "Not found" }, { status: 404 });
    }

    const room = env.GAME_ROOM.getByName(gameId);

    if (request.method === "GET" && url.pathname === `/api/games/${gameId}/state`) {
      return json(await room.getState());
    }

    if (request.method === "POST" && url.pathname === `/api/games/${gameId}/join`) {
      let body: JoinRoomRequest;

      try {
        body = (await request.json()) as JoinRoomRequest;
      } catch {
        return json({ error: "Expected JSON body" }, { status: 400 });
      }

      if (!body.playerName?.trim()) {
        return json({ error: "playerName is required" }, { status: 400 });
      }

      return json(await room.join(body.playerName.trim()));
    }

    if (request.method === "POST" && url.pathname === `/api/games/${gameId}/start`) {
      return json(await room.start());
    }

    if (request.method === "POST" && url.pathname === `/api/games/${gameId}/pass-turn`) {
      return json(await room.passTurn());
    }

    return json({ error: "Not found" }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
