import { describe, expect, mock, test } from "bun:test";

import type { RoomState } from "../shared/room-state";
import { ServerWebSocketEnvelopeSchema } from "../shared/transport";
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

class TestWebSocket extends EventTarget implements WebSocket {
  attachment: unknown = null;
  readonly sent: string[] = [];
  readonly closes: Array<{ code?: number; reason?: string }> = [];
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;
  binaryType: "blob" | "arraybuffer" = "arraybuffer";
  readonly bufferedAmount = 0;
  readonly extensions = "";
  onclose: ((this: WebSocket, event: CloseEvent) => unknown) | null = null;
  onerror: ((this: WebSocket, event: Event) => unknown) | null = null;
  onmessage: ((this: WebSocket, event: MessageEvent) => unknown) | null = null;
  onopen: ((this: WebSocket, event: Event) => unknown) | null = null;
  readonly protocol = "";
  readonly readyState = 1;
  readonly url = "";

  accept(): void {}

  serializeAttachment(value: unknown): void {
    this.attachment = structuredClone(value);
  }

  deserializeAttachment(): unknown {
    return structuredClone(this.attachment);
  }

  send(message: string | ArrayBuffer): void {
    this.sent.push(String(message));
  }

  close(code?: number, reason?: string): void {
    this.closes.push({ code, reason });
  }
}

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
  sockets: TestWebSocket[] = [],
): {
  room: TestRoom;
  storage: InMemoryDurableObjectStorage;
  sockets: TestWebSocket[];
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
    getWebSockets: (_tag?: string) => sockets,
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
    sockets,
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
      revision: 0,
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
      revision: 2,
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

    const view = await room.start(alice.playerToken, 2, 5);

    expect(view).toMatchObject({
      gameId: "game_test",
      revision: 3,
      status: "playing",
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

    expect(room.start(solo.playerToken, 1, 5)).rejects.toThrow();
    expect((await room.getState()).revision).toBe(1);
  });

  test("does not allow joining after the room has started", async () => {
    const { room } = await createInitializedRoom("game_test");

    const alice = await room.join("Alice");
    await room.join("Bob");
    await room.start(alice.playerToken, 2, 5);

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
    await room.start(alice.playerToken, 2, 5);

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

  test("restores attached player identities and broadcasts private views after hibernation", async () => {
    const setup = createRoom("game_test");
    await setup.room.initialize();
    const alice = await setup.room.join("Alice");
    const bob = await setup.room.join("Bob");
    const aliceSocket = new TestWebSocket();
    const bobSocket = new TestWebSocket();
    aliceSocket.serializeAttachment({
      version: 1,
      playerToken: alice.playerToken,
      playerName: "Alice",
    });
    bobSocket.serializeAttachment({
      version: 1,
      playerToken: bob.playerToken,
      playerName: "Bob",
    });

    const rehydrated = createRoom("game_test", setup.storage, [
      aliceSocket,
      bobSocket,
    ]).room;
    await rehydrated.start(alice.playerToken, 2, 5);

    const aliceEnvelope = ServerWebSocketEnvelopeSchema.parse(
      JSON.parse(aliceSocket.sent.at(-1)!),
    );
    const bobEnvelope = ServerWebSocketEnvelopeSchema.parse(
      JSON.parse(bobSocket.sent.at(-1)!),
    );
    expect(aliceEnvelope.view.viewerName).toBe("Alice");
    expect(bobEnvelope.view.viewerName).toBe("Bob");
    expect(
      aliceEnvelope.view.players.find((player) => player.name === "Alice")
        ?.cardsInHand,
    ).toHaveLength(5);
    expect(
      aliceEnvelope.view.players.find((player) => player.name === "Bob")
        ?.cardsInHand,
    ).toBeNull();
    expect(
      bobEnvelope.view.players.find((player) => player.name === "Bob")
        ?.cardsInHand,
    ).toHaveLength(5);
    expect(
      bobEnvelope.view.players.find((player) => player.name === "Alice")
        ?.cardsInHand,
    ).toBeNull();
  });

  test("rejects client messages and closes failed or invalid connections safely", async () => {
    const { room } = createRoom("game_test");
    const messageSocket = new TestWebSocket();
    const errorSocket = new TestWebSocket();
    const closeSocket = new TestWebSocket();

    room.webSocketMessage(messageSocket, "command");
    room.webSocketError(
      errorSocket,
      new Error("private runtime detail"),
    );
    room.webSocketClose(
      closeSocket,
      1000,
      "done",
      true,
    );

    expect(messageSocket.closes).toEqual([
      { code: 1008, reason: "Client messages are not supported" },
    ]);
    expect(errorSocket.closes).toEqual([
      { code: 1011, reason: "Live update connection failed" },
    ]);
    expect(closeSocket.closes).toEqual([]);
  });

  test("closes sockets whose hibernation attachment is invalid or revoked", async () => {
    const setup = createRoom("game_test");
    await setup.room.initialize();
    const alice = await setup.room.join("Alice");
    const invalidSocket = new TestWebSocket();
    invalidSocket.serializeAttachment({ playerName: "Alice" });
    const revokedSocket = new TestWebSocket();
    revokedSocket.serializeAttachment({
      version: 1,
      playerToken: alice.playerToken,
      playerName: "Mallory",
    });
    const rehydrated = createRoom("game_test", setup.storage, [
      invalidSocket,
      revokedSocket,
    ]).room;

    await rehydrated.join("Bob");

    expect(invalidSocket.closes[0]?.code).toBe(1008);
    expect(revokedSocket.closes[0]?.code).toBe(1008);
    expect(invalidSocket.sent).toEqual([]);
    expect(revokedSocket.sent).toEqual([]);
  });

  test("rejects invalid player tokens for views, starts, and commands", async () => {
    const { room } = await createInitializedRoom("game_test");
    const alice = await room.join("Alice");
    await room.join("Bob");

    expect(room.getView("invalid-player-token")).rejects.toThrow(
      '"code":"unauthorized"',
    );
    expect(room.start("invalid-player-token", 2, 5)).rejects.toThrow(
      '"code":"unauthorized"',
    );

    await room.start(alice.playerToken, 2, 5);
    expect(
      room.playCommand("invalid-player-token", 3, {
        type: "discardCard",
        cardValue: 1,
        source: { type: "hand", index: 0 },
        discardPileIndex: 0,
      }),
    ).rejects.toThrow('"code":"unauthorized"');
  });

  test("rejects a command from a player who does not own the turn", async () => {
    const { room } = await createInitializedRoom("game_test");
    const alice = await room.join("Alice");
    const bob = await room.join("Bob");
    await room.start(alice.playerToken, 2, 5);

    const aliceView = await room.getView(alice.playerToken);

    expect(
      room.playCommand(bob.playerToken, 3, aliceView.legalCommands[0]!),
    ).rejects.toThrow("It is not Bob's turn");
  });

  test("rejects a structured command that is not in the exact legal list", async () => {
    const { room } = await createInitializedRoom("game_test");
    const alice = await room.join("Alice");
    await room.join("Bob");
    await room.start(alice.playerToken, 2, 5);

    expect(
      room.playCommand(alice.playerToken, 3, {
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
    const aliceView = await setup.room.start(alice.playerToken, 2, 5);
    const command = aliceView.legalCommands.find(
      (candidate) => candidate.type === "discardCard",
    )!;

    const result = await setup.room.playCommand(alice.playerToken, 3, command);
    const rehydratedRoom = createRoom("game_test", setup.storage).room;
    const persistedBobView = await rehydratedRoom.getView(bob.playerToken);

    expect(result.effects.some((effect) => effect.type === "cardDiscarded")).toBe(
      true,
    );
    expect(result.effects.some((effect) => effect.type === "cardsDrawn")).toBe(
      false,
    );
    expect(result.view.currentPlayerName).toBe("Bob");
    expect(result.view.revision).toBe(4);
    expect(persistedBobView.currentPlayerName).toBe("Bob");
    expect(persistedBobView.isYourTurn).toBe(true);
  });

  test("does not update the memory cache when persistence fails", async () => {
    const setup = createRoom("game_test");
    await setup.room.initialize();
    setup.storage.failNextPut(new Error("storage unavailable"));

    expect(setup.room.join("Alice")).rejects.toThrow("storage unavailable");
    expect((await setup.room.getState()).players).toEqual([]);
    expect((await setup.room.getState()).revision).toBe(0);
  });

  test("rejects stale starts and commands without changing the revision", async () => {
    const { room } = await createInitializedRoom("game_test");
    const alice = await room.join("Alice");
    await room.join("Bob");

    expect(room.start(alice.playerToken, 1, 5)).rejects.toThrow(
      '"code":"stale_revision"',
    );
    expect((await room.getState()).revision).toBe(2);

    const view = await room.start(alice.playerToken, 2, 5);
    expect(
      room.playCommand(alice.playerToken, 2, view.legalCommands[0]!),
    ).rejects.toThrow('"currentRevision":3');
    expect((await room.getState()).revision).toBe(3);
  });

  test("removes a waiting player, revokes the token, and advances once", async () => {
    const { room } = await createInitializedRoom("game_test");
    const alice = await room.join("Alice");
    const bob = await room.join("Bob");

    await expect(room.leave(alice.playerToken, 2)).resolves.toEqual({
      revision: 3,
    });
    expect((await room.getState()).players.map((player) => player.name)).toEqual([
      "Bob",
    ]);
    expect(room.getView(alice.playerToken)).rejects.toThrow(
      '"code":"unauthorized"',
    );
    expect((await room.getView(bob.playerToken)).revision).toBe(3);
  });

  test("rejects leaving after start without removing the seat", async () => {
    const { room } = await createInitializedRoom("game_test");
    const alice = await room.join("Alice");
    await room.join("Bob");
    await room.start(alice.playerToken, 2, 5);

    expect(room.leave(alice.playerToken, 3)).rejects.toThrow(
      '"code":"room_conflict"',
    );
    expect((await room.getState()).players).toHaveLength(2);
    expect((await room.getState()).revision).toBe(3);
  });

  test("returns stale_revision before a conflicting start or leave transition", async () => {
    const { room } = await createInitializedRoom("game_test");
    const alice = await room.join("Alice");
    await room.join("Bob");
    await room.start(alice.playerToken, 2, 5);

    expect(room.start(alice.playerToken, 2, 5)).rejects.toThrow(
      '"code":"stale_revision"',
    );
    expect(room.leave(alice.playerToken, 2)).rejects.toThrow(
      '"code":"stale_revision"',
    );
  });

  test("keeps the prior revision when start, command, or leave persistence fails", async () => {
    const startSetup = createRoom("game_start_failure");
    await startSetup.room.initialize();
    const startAlice = await startSetup.room.join("Alice");
    await startSetup.room.join("Bob");
    startSetup.storage.failNextPut(new Error("start storage unavailable"));
    expect(startSetup.room.start(startAlice.playerToken, 2, 5)).rejects.toThrow(
      "start storage unavailable",
    );
    expect((await startSetup.room.getState()).revision).toBe(2);

    const commandSetup = createRoom("game_command_failure");
    await commandSetup.room.initialize();
    const commandAlice = await commandSetup.room.join("Alice");
    await commandSetup.room.join("Bob");
    const commandView = await commandSetup.room.start(
      commandAlice.playerToken,
      2,
      5,
    );
    commandSetup.storage.failNextPut(new Error("command storage unavailable"));
    expect(
      commandSetup.room.playCommand(
        commandAlice.playerToken,
        3,
        commandView.legalCommands[0]!,
      ),
    ).rejects.toThrow("command storage unavailable");
    expect((await commandSetup.room.getState()).revision).toBe(3);

    const leaveSetup = createRoom("game_leave_failure");
    await leaveSetup.room.initialize();
    const leaveAlice = await leaveSetup.room.join("Alice");
    leaveSetup.storage.failNextPut(new Error("leave storage unavailable"));
    expect(leaveSetup.room.leave(leaveAlice.playerToken, 1)).rejects.toThrow(
      "leave storage unavailable",
    );
    expect((await leaveSetup.room.getState()).revision).toBe(1);
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
