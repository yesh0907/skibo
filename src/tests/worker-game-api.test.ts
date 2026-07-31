import { describe, expect, mock, test } from "bun:test";

import type { GameView } from "../shared/room-state";
import type { Env } from "../worker/game-room-do";

mock.module("cloudflare:workers", () => ({
  DurableObject: class DurableObject {
    constructor(
      readonly ctx: DurableObjectState,
      readonly env: unknown,
    ) {}
  },
}));

const { default: worker } = await import("../worker/index");

const waitingView: GameView = {
  gameId: "game_test",
  status: "waiting",
  viewerName: "Alice",
  players: [],
  currentPlayerName: null,
  isYourTurn: false,
  deckCount: 0,
  buildPiles: [[], [], [], []],
  completedBuildPileCount: 0,
  legalCommands: [],
};

function createEnv(overrides: Record<string, unknown> = {}): {
  env: Env;
  room: Record<string, ReturnType<typeof mock>>;
} {
  const room = {
    initialize: mock(async () => ({
      gameId: "game_test",
      status: "waiting",
      playerNames: [],
    })),
    getState: mock(async () => ({
      gameId: "game_test",
      status: "waiting",
      players: [],
      gameState: null,
    })),
    join: mock(async () => ({
      playerToken: "player-token-alice",
      view: waitingView,
    })),
    getView: mock(async () => waitingView),
    start: mock(async () => ({ ...waitingView, status: "started" })),
    playCommand: mock(async () => ({ view: waitingView, effects: [] })),
    ...overrides,
  };

  return {
    env: {
      GAME_ROOM: {
        getByName: mock(() => room),
      },
    } as unknown as Env,
    room,
  };
}

describe("Worker game API", () => {
  test("creates and explicitly initializes a room", async () => {
    const { env, room } = createEnv();

    const response = await worker.fetch(
      new Request("http://local/api/games", { method: "POST" }),
      env,
    );

    expect(response.status).toBe(201);
    expect(room.initialize).toHaveBeenCalledTimes(1);
  });

  test("joins a player and returns their player-specific view", async () => {
    const { env, room } = createEnv();

    const response = await worker.fetch(
      new Request("http://local/api/games/game_test/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playerName: " Alice " }),
      }),
      env,
    );

    expect(response.status).toBe(200);
    expect(room.join).toHaveBeenCalledWith("Alice");
    const body: unknown = await response.json();
    expect(body).toEqual({
      playerToken: "player-token-alice",
      view: waitingView,
    });
  });

  test("starts a short game with the requesting joined player", async () => {
    const { env, room } = createEnv();

    const response = await worker.fetch(
      new Request("http://local/api/games/game_test/start", {
        method: "POST",
        headers: {
          authorization: "Bearer player-token-alice",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          stockPileSize: 5,
        }),
      }),
      env,
    );

    expect(response.status).toBe(200);
    expect(room.start).toHaveBeenCalledWith("player-token-alice", 5);
  });

  test("submits a structured command to the authoritative room", async () => {
    const { env, room } = createEnv();
    const command = {
      type: "discardCard",
      cardValue: 8,
      source: { type: "hand", index: 0 },
      discardPileIndex: 1,
    };

    const response = await worker.fetch(
      new Request("http://local/api/games/game_test/commands", {
        method: "POST",
        headers: {
          authorization: "Bearer player-token-alice",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          command,
        }),
      }),
      env,
    );

    expect(response.status).toBe(200);
    expect(room.playCommand).toHaveBeenCalledWith(
      "player-token-alice",
      command,
    );
  });

  test("reads a player view using its server-issued token", async () => {
    const { env, room } = createEnv();

    const response = await worker.fetch(
      new Request(
        "http://local/api/games/game_test/state",
        { headers: { authorization: "Bearer player-token-alice" } },
      ),
      env,
    );

    expect(response.status).toBe(200);
    expect(room.getView).toHaveBeenCalledWith("player-token-alice");
    const body: unknown = await response.json();
    expect(body).toEqual(waitingView);
  });

  test("requires player tokens in authorization headers, not URLs", async () => {
    const { env, room } = createEnv();

    const response = await worker.fetch(
      new Request(
        "http://local/api/games/game_test/state?playerToken=player-token-alice",
      ),
      env,
    );

    expect(response.status).toBe(401);
    expect(room.getView).not.toHaveBeenCalled();
  });

  test("rejects malformed commands before calling the room", async () => {
    const { env, room } = createEnv();

    const response = await worker.fetch(
      new Request("http://local/api/games/game_test/commands", {
        method: "POST",
        headers: {
          authorization: "Bearer player-token-alice",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          playerName: "Alice",
          command: { type: "playCard" },
        }),
      }),
      env,
    );

    expect(response.status).toBe(400);
    expect(room.playCommand).not.toHaveBeenCalled();
  });

  test("returns room rule conflicts as JSON", async () => {
    const { env } = createEnv({
      start: mock(async () => {
        const error = new Error("Game is already started");
        error.name = "RoomError";
        throw error;
      }),
    });

    const response = await worker.fetch(
      new Request("http://local/api/games/game_test/start", {
        method: "POST",
        headers: {
          authorization: "Bearer player-token-alice",
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      }),
      env,
    );

    expect(response.status).toBe(409);
    const body: unknown = await response.json();
    expect(body).toEqual({
      error: "Game is already started",
    });
  });

  test("normalizes RoomError messages serialized across RPC", async () => {
    const { env } = createEnv({
      getView: mock(async () => {
        throw new Error("RoomError: Game room does not exist");
      }),
    });

    const response = await worker.fetch(
      new Request(
        "http://local/api/games/game_missing/state",
        { headers: { authorization: "Bearer player-token-alice" } },
      ),
      env,
    );

    expect(response.status).toBe(409);
    const body: unknown = await response.json();
    expect(body).toEqual({ error: "Game room does not exist" });
  });

  test("does not expose unexpected infrastructure failures", async () => {
    const { env } = createEnv({
      getView: mock(async () => {
        throw new Error("database connection details");
      }),
    });

    const response = await worker.fetch(
      new Request(
        "http://local/api/games/game_test/state",
        { headers: { authorization: "Bearer player-token-alice" } },
      ),
      env,
    );

    expect(response.status).toBe(500);
    const body: unknown = await response.json();
    expect(body).toEqual({ error: "Internal server error" });
  });
});
