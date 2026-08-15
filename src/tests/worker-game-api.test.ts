import { describe, expect, mock, test } from "bun:test";

import type { GameView } from "../shared/room-state";
import type { Env } from "../worker/game-room-do";
import { RoomError } from "../worker/room-error";

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
  revision: 1,
  status: "waiting",
  viewerName: "Alice",
  players: [
    {
      name: "Alice",
      cardsInHand: null,
      handCount: 0,
      stockTopCard: null,
      stockCount: 0,
      discardPiles: [[], [], [], []],
    },
  ],
  currentPlayerName: null,
  winnerName: null,
  isYourTurn: false,
  deckCount: 0,
  buildPiles: [[], [], [], []],
  completedBuildPileCount: 0,
  legalCommands: [],
};

const playingView: GameView = {
  ...waitingView,
  revision: 3,
  status: "playing",
  currentPlayerName: "Alice",
  isYourTurn: true,
  players: waitingView.players.map((player) => ({
    ...player,
    cardsInHand: [],
  })),
};

function createEnv(overrides: Record<string, unknown> = {}): {
  env: Env;
  room: Record<string, ReturnType<typeof mock>>;
} {
  const room = {
    initialize: mock(async () => ({
      gameId: "game_test",
      revision: 0,
      status: "waiting",
      playerNames: [],
    })),
    join: mock(async () => ({
      playerToken: "player-token-alice",
      view: waitingView,
    })),
    getView: mock(async () => waitingView),
    start: mock(async () => playingView),
    playCommand: mock(async () => ({ view: waitingView, effects: [] })),
    leave: mock(async () => ({ revision: 2 })),
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

  test("accepts the runtime's zero-byte stream for an empty create request", async () => {
    const { env, room } = createEnv();
    const response = await worker.fetch(
      new Request("http://local/api/games", {
        method: "POST",
        body: "",
      }),
      env,
    );

    expect(response.status).toBe(201);
    expect(room.initialize).toHaveBeenCalledTimes(1);
  });

  test("joins a player and issues a one-year game-scoped HttpOnly cookie", async () => {
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
    expect(response.headers.get("set-cookie")).toBe(
      "skibo_player=player-token-alice; Path=/api/games/game_test; Max-Age=31536000; HttpOnly; SameSite=Strict",
    );
    const body: unknown = await response.json();
    expect(body).toEqual({
      playerToken: "player-token-alice",
      view: waitingView,
    });
  });

  test("marks the player cookie Secure on HTTPS production requests", async () => {
    const { env } = createEnv();
    const response = await worker.fetch(
      new Request("https://skibo.example/api/games/game_test/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playerName: "Alice" }),
      }),
      env,
    );

    expect(response.headers.get("set-cookie")).toEndWith("; Secure");
  });

  test("authenticates state reads from the game cookie", async () => {
    const { env, room } = createEnv();
    const response = await worker.fetch(
      new Request("http://local/api/games/game_test/state", {
        headers: { cookie: "other=x; skibo_player=player-token-alice" },
      }),
      env,
    );

    expect(response.status).toBe(200);
    expect(room.getView).toHaveBeenCalledWith("player-token-alice");
  });

  test("temporarily accepts bearer authentication", async () => {
    const { env, room } = createEnv();
    const response = await worker.fetch(
      new Request("http://local/api/games/game_test/state", {
        headers: { authorization: "Bearer player-token-alice" },
      }),
      env,
    );

    expect(response.status).toBe(200);
    expect(room.getView).toHaveBeenCalledWith("player-token-alice");
  });

  test("starts with a revisioned Zod-validated request", async () => {
    const { env, room } = createEnv();
    const response = await worker.fetch(
      new Request("http://local/api/games/game_test/start", {
        method: "POST",
        headers: {
          cookie: "skibo_player=player-token-alice",
          "content-type": "application/json",
        },
        body: JSON.stringify({ expectedRevision: 2, stockPileSize: 5 }),
      }),
      env,
    );

    expect(response.status).toBe(200);
    expect(room.start).toHaveBeenCalledWith("player-token-alice", 2, 5);
  });

  test("submits a revisioned command over DO RPC", async () => {
    const { env, room } = createEnv();
    const command = {
      type: "discardCard" as const,
      cardValue: 8,
      source: { type: "hand" as const, index: 0 },
      discardPileIndex: 1,
    };
    const response = await worker.fetch(
      new Request("http://local/api/games/game_test/commands", {
        method: "POST",
        headers: {
          authorization: "Bearer player-token-alice",
          "content-type": "application/json",
        },
        body: JSON.stringify({ expectedRevision: 3, command }),
      }),
      env,
    );

    expect(response.status).toBe(200);
    expect(room.playCommand).toHaveBeenCalledWith(
      "player-token-alice",
      3,
      command,
    );
  });

  test("leaves a waiting room and clears the game cookie", async () => {
    const { env, room } = createEnv();
    const response = await worker.fetch(
      new Request("https://skibo.example/api/games/game_test/players/me", {
        method: "DELETE",
        headers: {
          cookie: "skibo_player=player-token-alice",
          "content-type": "application/json",
        },
        body: JSON.stringify({ expectedRevision: 1 }),
      }),
      env,
    );

    expect(response.status).toBe(200);
    expect(room.leave).toHaveBeenCalledWith("player-token-alice", 1);
    expect(response.headers.get("set-cookie")).toBe(
      "skibo_player=; Path=/api/games/game_test; Max-Age=0; HttpOnly; SameSite=Strict; Secure",
    );
  });

  test("rejects malformed or extra fields before calling the room", async () => {
    const { env, room } = createEnv();
    const response = await worker.fetch(
      new Request("http://local/api/games/game_test/commands", {
        method: "POST",
        headers: {
          authorization: "Bearer player-token-alice",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          expectedRevision: 3,
          command: { type: "playCard" },
          playerName: "Alice",
        }),
      }),
      env,
    );

    expect(response.status).toBe(400);
    expect(room.playCommand).not.toHaveBeenCalled();
    const body: unknown = await response.json();
    expect(body).toEqual({
      error: { code: "invalid_request", message: "Request body is invalid" },
    });
  });

  test("rejects oversized JSON bodies before buffering or calling the room", async () => {
    const { env, room } = createEnv();
    const response = await worker.fetch(
      new Request("http://local/api/games/game_test/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playerName: "A".repeat(20_000) }),
      }),
      env,
    );

    expect(response.status).toBe(413);
    expect(room.join).not.toHaveBeenCalled();
    const body: unknown = await response.json();
    expect(body).toEqual({
      error: { code: "invalid_request", message: "Request body is too large" },
    });
  });

  test("returns stale revisions with recovery data", async () => {
    const { env } = createEnv({
      start: mock(async () => {
        throw new RoomError(
          "stale_revision",
          "The room changed; refresh and try again",
          4,
        );
      }),
    });
    const response = await worker.fetch(
      new Request("http://local/api/games/game_test/start", {
        method: "POST",
        headers: {
          authorization: "Bearer player-token-alice",
          "content-type": "application/json",
        },
        body: JSON.stringify({ expectedRevision: 3 }),
      }),
      env,
    );

    expect(response.status).toBe(409);
    const body: unknown = await response.json();
    expect(body).toEqual({
      error: {
        code: "stale_revision",
        message: "The room changed; refresh and try again",
        currentRevision: 4,
      },
    });
  });

  test("does not expose unexpected infrastructure failures", async () => {
    const { env } = createEnv({
      getView: mock(async () => {
        throw new Error("database connection details");
      }),
    });
    const response = await worker.fetch(
      new Request("http://local/api/games/game_test/state", {
        headers: { authorization: "Bearer player-token-alice" },
      }),
      env,
    );

    expect(response.status).toBe(500);
    const body: unknown = await response.json();
    expect(body).toEqual({
      error: { code: "internal_error", message: "Internal server error" },
    });
  });
});
