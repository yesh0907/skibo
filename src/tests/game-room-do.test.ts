import { describe, expect, mock, test } from "bun:test";

import type { RoomState } from "../shared/room-state";
import type { Env as GameRoomEnv } from "../worker/game-room-do";

mock.module("cloudflare:workers", () => ({
  DurableObject: class DurableObject {
    constructor(
      readonly ctx: DurableObjectState,
      readonly env: unknown,
    ) {}
  },
}));

const { GameRoomDO } = await import("../worker/game-room-do");

type TestRoom = InstanceType<typeof GameRoomDO>;

class InMemoryDurableObjectStorage {
  #values = new Map<string, unknown>();
  #alarm: number | null = null;
  #putError: Error | undefined;

  failNextPut(error: Error): void {
    this.#putError = error;
  }

  async get<T = unknown>(
    key: string | string[],
  ): Promise<T | Map<string, T> | undefined> {
    if (Array.isArray(key)) {
      const entries: Array<[string, T]> = key
        .filter((entry) => this.#values.has(entry))
        .map((entry): [string, T] => [entry, this.#values.get(entry) as T]);

      return new Map(entries);
    }

    return this.#values.get(key) as T | undefined;
  }

  async list<T = unknown>(): Promise<Map<string, T>> {
    return new Map(this.#values as Map<string, T>);
  }

  async put<T>(key: string | Record<string, T>, value?: T): Promise<void> {
    if (this.#putError !== undefined) {
      const error = this.#putError;
      this.#putError = undefined;
      throw error;
    }
    if (typeof key === "string") {
      this.#values.set(key, value);
      return;
    }

    for (const [entryKey, entryValue] of Object.entries(key)) {
      this.#values.set(entryKey, entryValue);
    }
  }

  async delete(key: string | string[]): Promise<boolean | number> {
    if (Array.isArray(key)) {
      let deleted = 0;

      for (const entry of key) {
        if (this.#values.delete(entry)) {
          deleted += 1;
        }
      }

      return deleted;
    }

    return this.#values.delete(key);
  }

  async deleteAll(): Promise<void> {
    this.#values.clear();
  }

  async transaction<T>(
    closure: (txn: DurableObjectTransaction) => Promise<T>,
  ): Promise<T> {
    return closure(this as unknown as DurableObjectTransaction);
  }

  transactionSync<T>(closure: () => T): T {
    return closure();
  }

  async getAlarm(): Promise<number | null> {
    return this.#alarm;
  }

  async setAlarm(scheduledTime: number | Date): Promise<void> {
    this.#alarm =
      typeof scheduledTime === "number"
        ? scheduledTime
        : scheduledTime.getTime();
  }

  async deleteAlarm(): Promise<void> {
    this.#alarm = null;
  }

  async sync(): Promise<void> {}

  async getCurrentBookmark(): Promise<string> {
    return "bookmark";
  }

  async getBookmarkForTime(_timestamp: number | Date): Promise<string> {
    return "bookmark";
  }

  async onNextSessionRestoreBookmark(_bookmark: string): Promise<string> {
    return "bookmark";
  }

  sql = {} as SqlStorage;
  kv = {} as SyncKvStorage;
}

function createRoom(
  gameId: string,
  storage = new InMemoryDurableObjectStorage(),
): {
  room: TestRoom;
  storage: InMemoryDurableObjectStorage;
} {
  const ctx = {
    storage,
    id: {
      toString: () => gameId,
      equals: (other: DurableObjectId) => other.toString() === gameId,
    },
    exports: {},
    props: {},
    waitUntil: (_promise: Promise<unknown>) => {},
    blockConcurrencyWhile: async <T>(callback: () => Promise<T>) => callback(),
    acceptWebSocket: (_ws: WebSocket, _tags?: string[]) => {},
    getWebSockets: (_tag?: string) => [],
    setWebSocketAutoResponse: (
      _maybeReqResp?: WebSocketRequestResponsePair,
    ) => {},
    getWebSocketAutoResponse: () => null,
    getWebSocketAutoResponseTimestamp: (_ws: WebSocket) => null,
    setHibernatableWebSocketEventTimeout: (_timeoutMs?: number) => {},
    getHibernatableWebSocketEventTimeout: () => null,
    getTags: (_ws: WebSocket) => [],
    abort: (reason?: string) => {
      throw new Error(reason ?? "aborted");
    },
  } as unknown as DurableObjectState;

  return {
    room: new GameRoomDO(ctx, {} as GameRoomEnv),
    storage,
  };
}

async function createInitializedRoom(gameId = "game_test"): Promise<{
  room: TestRoom;
}> {
  const setup = createRoom(gameId);
  await setup.room.initialize();
  return { room: setup.room };
}

describe("GameRoomDO", () => {
  test("initializes a new room with the expected default state", async () => {
    const { room } = createRoom("game_test");
    await room.initialize();

    expect(room.getState()).resolves.toEqual<RoomState>({
      gameId: "game_test",
      status: "waiting",
      players: [],
      gameState: null,
    });
  });

  test("does not persist a room addressed by an arbitrary uninitialized id", async () => {
    const { room, storage } = createRoom("game_missing");

    expect(room.getView("not-a-token")).rejects.toThrow(
      "Game room does not exist",
    );
    expect(await storage.list()).toEqual(new Map());
  });

  test("adds players in join order while the room is waiting", async () => {
    const { room } = await createInitializedRoom("game_test");

    await room.join("Alice");
    await room.join("Bob");
    const updated = await room.getState();

    expect(updated).toMatchObject({
      status: "waiting",
      gameState: null,
    });
    expect(updated.players.map((player) => player.name)).toEqual([
      "Alice",
      "Bob",
    ]);

    expect(updated.players.every((player) => player.token.length > 16)).toBe(
      true,
    );
  });

  test("starts a real short game from the joined player roster", async () => {
    const { room } = await createInitializedRoom("game_test");

    const alice = await room.join("Alice");
    await room.join("Bob");

    const view = await room.start(alice.playerToken, 5);

    expect(view).toMatchObject({
      gameId: "game_test",
      status: "started",
      currentPlayerName: "Alice",
      isYourTurn: true,
    });
    expect(view.players[0]!.cardsInHand).toHaveLength(5);
    expect(view.players[0]!.stockCount).toBe(5);
    expect(view.legalCommands.length).toBeGreaterThan(0);
  });

  test("does not allow starting before two players have joined", async () => {
    const { room } = await createInitializedRoom("game_test");

    const solo = await room.join("Solo");

    expect(room.start(solo.playerToken, 5)).rejects.toThrow();
  });

  test("does not allow joining after the room has started", async () => {
    const { room } = await createInitializedRoom("game_test");

    const alice = await room.join("Alice");
    await room.join("Bob");
    await room.start(alice.playerToken, 5);

    expect(room.join("Carol")).rejects.toThrow();
  });

  test("rejects a seventh player before the room becomes unstartable", async () => {
    const { room } = await createInitializedRoom("game_test");
    for (const name of ["A", "B", "C", "D", "E", "F"]) {
      await room.join(name);
    }

    expect(room.join("G")).rejects.toThrow(
      "Game already has the maximum of 6 players",
    );
  });

  test("returns player-specific views without exposing opponent hands", async () => {
    const { room } = await createInitializedRoom("game_test");

    const alice = await room.join("Alice");
    const bob = await room.join("Bob");
    await room.start(alice.playerToken, 5);

    const aliceView = await room.getView(alice.playerToken);
    const bobView = await room.getView(bob.playerToken);

    expect(aliceView.players.find((player) => player.name === "Alice")?.cardsInHand)
      .toHaveLength(5);
    expect(aliceView.players.find((player) => player.name === "Bob")?.cardsInHand)
      .toBeNull();
    expect(aliceView.legalCommands.length).toBeGreaterThan(0);
    expect(bobView.players.find((player) => player.name === "Alice")?.cardsInHand)
      .toBeNull();
    expect(bobView.players.find((player) => player.name === "Bob")?.cardsInHand)
      .toHaveLength(5);
    expect(bobView.legalCommands).toEqual([]);
  });

  test("rejects invalid player tokens for views, starts, and commands", async () => {
    const { room } = await createInitializedRoom("game_test");
    const alice = await room.join("Alice");
    await room.join("Bob");

    expect(room.getView("invalid-player-token")).rejects.toThrow(
      "Player token is invalid",
    );
    expect(room.start("invalid-player-token", 5)).rejects.toThrow(
      "Player token is invalid",
    );

    await room.start(alice.playerToken, 5);
    expect(
      room.playCommand("invalid-player-token", {
        type: "discardCard",
        cardValue: 1,
        source: { type: "hand", index: 0 },
        discardPileIndex: 0,
      }),
    ).rejects.toThrow("Player token is invalid");
  });

  test("rejects a command from a player who does not own the turn", async () => {
    const { room } = await createInitializedRoom("game_test");
    const alice = await room.join("Alice");
    const bob = await room.join("Bob");
    await room.start(alice.playerToken, 5);

    const aliceView = await room.getView(alice.playerToken);

    expect(
      room.playCommand(bob.playerToken, aliceView.legalCommands[0]!),
    ).rejects.toThrow("It is not Bob's turn");
  });

  test("rejects a structured command that is not in the exact legal list", async () => {
    const { room } = await createInitializedRoom("game_test");
    const alice = await room.join("Alice");
    await room.join("Bob");
    await room.start(alice.playerToken, 5);

    expect(
      room.playCommand(alice.playerToken, {
        type: "playCard",
        cardValue: 12,
        source: { type: "stockPile" },
        destinationIndex: 0,
      }),
    ).rejects.toThrow();
  });

  test("persists resolved engine state and returns effects with the next view", async () => {
    const setup = createRoom("game_test");
    await setup.room.initialize();
    const alice = await setup.room.join("Alice");
    const bob = await setup.room.join("Bob");
    const aliceView = await setup.room.start(alice.playerToken, 5);
    const command = aliceView.legalCommands.find(
      (candidate) => candidate.type === "discardCard",
    )!;

    const result = await setup.room.playCommand(alice.playerToken, command);
    const rehydratedRoom = createRoom("game_test", setup.storage).room;
    const persistedBobView = await rehydratedRoom.getView(bob.playerToken);

    expect(result.effects.some((effect) => effect.type === "cardDiscarded")).toBe(
      true,
    );
    expect(result.effects.some((effect) => effect.type === "cardsDrawn")).toBe(
      false,
    );
    expect(result.view.currentPlayerName).toBe("Bob");
    expect(persistedBobView.currentPlayerName).toBe("Bob");
    expect(persistedBobView.isYourTurn).toBe(true);
  });

  test("does not update the memory cache when persistence fails", async () => {
    const setup = createRoom("game_test");
    await setup.room.initialize();
    setup.storage.failNextPut(new Error("storage unavailable"));

    expect(setup.room.join("Alice")).rejects.toThrow("storage unavailable");
    expect((await setup.room.getState()).players).toEqual([]);
  });

  test("rejects legacy started state instead of silently reopening it", async () => {
    const storage = new InMemoryDurableObjectStorage();
    await storage.put("game-room-state", {
      gameId: "game_legacy",
      status: "started",
      players: ["Alice", "Bob"],
      turnIndex: 1,
    });
    const room = createRoom("game_legacy", storage).room;

    expect(room.getState()).rejects.toThrow(
      "Game room state version is unsupported",
    );
  });
});
