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
  await setup.room.getState();
  return { room: setup.room };
}

describe("GameRoomDO", () => {
  test("initializes a new room with the expected default state", async () => {
    const { room } = createRoom("game_test");

    expect(room.getState()).resolves.toEqual<RoomState>({
      gameId: "game_test",
      status: "waiting",
      players: [],
      turnIndex: null,
    });
  });

  test("adds players in join order while the room is waiting", async () => {
    const { room } = await createInitializedRoom("game_test");

    await room.join("Alice");
    const updated = await room.join("Bob");

    expect(updated).toMatchObject({
      status: "waiting",
      players: ["Alice", "Bob"],
      turnIndex: null,
    });

    expect(room.getState()).resolves.toMatchObject({
      status: "waiting",
      players: ["Alice", "Bob"],
      turnIndex: null,
    });
  });

  test("starts once enough players have joined and gives turn 0 to the first player", async () => {
    const { room } = await createInitializedRoom("game_test");

    await room.join("Alice");
    await room.join("Bob");

    expect(room.start()).resolves.toEqual<RoomState>({
      gameId: "game_test",
      status: "started",
      players: ["Alice", "Bob"],
      turnIndex: 0,
    });
  });

  test("advances turn order and wraps back to the first player", async () => {
    const { room } = await createInitializedRoom("game_test");

    await room.join("Alice");
    await room.join("Bob");
    await room.join("Carol");
    await room.start();

    expect(room.passTurn()).resolves.toMatchObject({ turnIndex: 1 });
    expect(room.passTurn()).resolves.toMatchObject({ turnIndex: 2 });
    expect(room.passTurn()).resolves.toMatchObject({ turnIndex: 0 });
  });

  test("does not allow starting before two players have joined", async () => {
    const { room } = await createInitializedRoom("game_test");

    await room.join("Solo");

    expect(room.start()).rejects.toThrow();
  });

  test("does not allow joining after the room has started", async () => {
    const { room } = await createInitializedRoom("game_test");

    await room.join("Alice");
    await room.join("Bob");
    await room.start();

    expect(room.join("Carol")).rejects.toThrow();
  });

  test("does not allow passing the turn before the room has started", async () => {
    const { room } = await createInitializedRoom("game_test");

    await room.join("Alice");
    await room.join("Bob");

    expect(room.passTurn()).rejects.toThrow();
  });
});
