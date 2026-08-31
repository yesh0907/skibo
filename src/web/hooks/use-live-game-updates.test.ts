import { describe, expect, mock, test } from "bun:test";

import { playingPlayerViewFixture } from "../../tests/fixtures/transport";
import {
  LiveGameConnection,
  RECONNECT_MAX_DELAY_MS,
  gameWebSocketUrl,
  reconnectDelayMs,
  type LiveSocket,
  type LiveUpdateStatus,
} from "./use-live-game-updates";

class TestSocket implements LiveSocket {
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readonly closes: Array<{ code?: number; reason?: string }> = [];

  close(code?: number, reason?: string): void {
    this.closes.push({ code, reason });
  }
}

function flushPromises(): Promise<void> {
  return new Promise((resolve) => queueMicrotask(resolve));
}

describe("LiveGameConnection", () => {
  test("builds same-origin ws and wss URLs", () => {
    expect(
      gameWebSocketUrl("game one", {
        protocol: "https:",
        host: "skibo.example",
      }),
    ).toBe("wss://skibo.example/api/games/game%20one/ws");
    expect(
      gameWebSocketUrl("game_test", {
        protocol: "http:",
        host: "127.0.0.1:8787",
      }),
    ).toBe("ws://127.0.0.1:8787/api/games/game_test/ws");
  });

  test("bounds exponential reconnect delay with jitter", () => {
    expect(reconnectDelayMs(0, 0)).toBe(375);
    expect(reconnectDelayMs(1, 0)).toBe(750);
    expect(reconnectDelayMs(2, 1)).toBe(2_500);
    expect(reconnectDelayMs(50, 1)).toBe(RECONNECT_MAX_DELAY_MS);
  });

  test("refreshes a full snapshot on initial connection and every reconnect", async () => {
    const sockets: TestSocket[] = [];
    const scheduled: Array<{ callback: () => void; delay: number }> = [];
    const snapshots = [
      playingPlayerViewFixture,
      { ...playingPlayerViewFixture, revision: 4 },
    ];
    const refreshSnapshot = mock(async () => snapshots.shift()!);
    const onView = mock(() => undefined);
    const statuses: LiveUpdateStatus[] = [];
    const connection = new LiveGameConnection({
      gameId: "game_test",
      location: { protocol: "https:", host: "skibo.example" },
      createSocket: mock(() => {
        const socket = new TestSocket();
        sockets.push(socket);
        return socket;
      }),
      schedule: (callback, delay) => {
        scheduled.push({ callback, delay });
        return scheduled.length;
      },
      cancel: () => undefined,
      random: () => 0,
      refreshSnapshot,
      onView,
      onStatus: (status) => statuses.push(status),
      onError: () => undefined,
    });

    connection.start();
    sockets[0]!.onopen?.();
    await flushPromises();
    expect(refreshSnapshot).toHaveBeenCalledTimes(1);
    expect(onView).toHaveBeenLastCalledWith(playingPlayerViewFixture);

    sockets[0]!.onclose?.();
    expect(scheduled[0]?.delay).toBe(375);
    scheduled[0]!.callback();
    sockets[1]!.onopen?.();
    await flushPromises();

    expect(refreshSnapshot).toHaveBeenCalledTimes(2);
    expect(onView).toHaveBeenLastCalledWith({
      ...playingPlayerViewFixture,
      revision: 4,
    });
    expect(statuses).toContain("reconnecting");
    expect(statuses.at(-1)).toBe("connected");
  });

  test("backs off exponentially when handshakes close before snapshot recovery", () => {
    const sockets: TestSocket[] = [];
    const scheduled: Array<{ callback: () => void; delay: number }> = [];
    const connection = new LiveGameConnection({
      gameId: "game_test",
      location: { protocol: "https:", host: "skibo.example" },
      createSocket: () => {
        const socket = new TestSocket();
        sockets.push(socket);
        return socket;
      },
      schedule: (callback, delay) => {
        scheduled.push({ callback, delay });
        return scheduled.length;
      },
      cancel: () => undefined,
      random: () => 0,
      refreshSnapshot: () => new Promise(() => undefined),
      onView: () => undefined,
      onStatus: () => undefined,
      onError: () => undefined,
    });
    connection.start();
    sockets[0]!.onopen?.();
    sockets[0]!.onclose?.();
    scheduled[0]!.callback();
    sockets[1]!.onopen?.();
    sockets[1]!.onclose?.();

    expect(scheduled.map(({ delay }) => delay)).toEqual([375, 750]);
  });

  test("validates live envelopes and keeps invalid messages out of state", () => {
    const socket = new TestSocket();
    const onView = mock(() => undefined);
    const onError = mock(() => undefined);
    const connection = new LiveGameConnection({
      gameId: "game_test",
      location: { protocol: "https:", host: "skibo.example" },
      createSocket: () => socket,
      refreshSnapshot: async () => playingPlayerViewFixture,
      onView,
      onStatus: () => undefined,
      onError,
    });
    connection.start();

    socket.onmessage?.({ data: "not-json" });
    socket.onmessage?.({
      data: JSON.stringify({
        version: 2,
        type: "room.view",
        view: playingPlayerViewFixture,
      }),
    });
    expect(onView).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(2);

    socket.onmessage?.({
      data: JSON.stringify({
        version: 1,
        type: "room.view",
        view: playingPlayerViewFixture,
      }),
    });
    expect(onView).toHaveBeenCalledWith(playingPlayerViewFixture);
  });

  test("cancels reconnect work and detaches socket callbacks on cleanup", () => {
    const socket = new TestSocket();
    const scheduled: Array<() => void> = [];
    const cancel = mock(() => undefined);
    const createSocket = mock(() => socket);
    const connection = new LiveGameConnection({
      gameId: "game_test",
      location: { protocol: "https:", host: "skibo.example" },
      createSocket,
      schedule: (callback) => {
        scheduled.push(callback);
        return 9;
      },
      cancel,
      refreshSnapshot: async () => playingPlayerViewFixture,
      onView: () => undefined,
      onStatus: () => undefined,
      onError: () => undefined,
    });
    connection.start();
    socket.onclose?.();

    connection.stop();
    scheduled[0]?.();

    expect(cancel).toHaveBeenCalledWith(9);
    expect(createSocket).toHaveBeenCalledTimes(1);
    expect(socket.closes).toEqual([]);
    expect(socket.onopen).toBeNull();
    expect(socket.onmessage).toBeNull();
    expect(socket.onclose).toBeNull();
    expect(socket.onerror).toBeNull();
  });

  test("pauses offline and reconnects immediately when the browser returns online", () => {
    const sockets: TestSocket[] = [];
    const statuses: LiveUpdateStatus[] = [];
    const connection = new LiveGameConnection({
      gameId: "game_test",
      location: { protocol: "https:", host: "skibo.example" },
      createSocket: () => {
        const socket = new TestSocket();
        sockets.push(socket);
        return socket;
      },
      refreshSnapshot: async () => playingPlayerViewFixture,
      onView: () => undefined,
      onStatus: (status) => statuses.push(status),
      onError: () => undefined,
    });
    connection.start();

    connection.handleOffline();
    expect(sockets[0]!.closes).toEqual([
      { code: 4000, reason: "Network offline" },
    ]);
    expect(statuses.at(-1)).toBe("reconnecting");

    connection.handleOnline();
    expect(sockets).toHaveLength(2);
    expect(statuses.at(-1)).toBe("connecting");
  });
});
