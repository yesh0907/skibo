import { afterAll, afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

import type { PlayerView } from "../shared/transport";
import { finishedPlayerViewFixture, playingPlayerViewFixture, waitingPlayerViewFixture } from "../tests/fixtures/transport";
import type { GameApi } from "./api-client";
import { CURRENT_GAME_KEY, GameApiError } from "./api-client";
import type { LiveSocket } from "./hooks/use-live-game-updates";

GlobalRegistrator.register();

const { act, cleanup, render, waitFor } = await import("@testing-library/react");
const userEvent = (await import("@testing-library/user-event")).default;
const { App, LEGACY_SESSION_KEY } = await import("./app");

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

class TestSocket implements LiveSocket {
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  close() {}
}

function viewAt(revision: number): PlayerView {
  return { ...playingPlayerViewFixture, revision };
}

function makeApi(overrides: Partial<GameApi> = {}): GameApi {
  return {
    create: mock(async () => waitingPlayerViewFixture.gameId),
    join: mock(async () => waitingPlayerViewFixture),
    read: mock(async () => waitingPlayerViewFixture),
    start: mock(async () => playingPlayerViewFixture),
    command: mock(async () => viewAt(4)),
    leave: mock(async () => ({ revision: 3 })),
    ...overrides,
  };
}

beforeAll(() => {
  Object.defineProperty(globalThis.navigator, "clipboard", {
    configurable: true,
    value: { writeText: mock(async () => undefined) },
  });
  Object.defineProperty(globalThis, "WebSocket", {
    configurable: true,
    value: TestSocket,
  });
});

afterEach(() => cleanup());
afterAll(async () => GlobalRegistrator.unregister());

describe("React game client", () => {
  test("creates, joins, stores only the public game id, and shows the lobby", async () => {
    const api = makeApi();
    const storage = new MemoryStorage();
    const user = userEvent.setup();
    const screen = render(<App api={api} storage={storage} />);

    await user.type(screen.getAllByLabelText("Your name")[0]!, "Alice");
    await user.click(screen.getByRole("button", { name: "Create table" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "The table is open." })).not.toBeNull());
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(api.join).toHaveBeenCalledWith(waitingPlayerViewFixture.gameId, "Alice");
    expect(storage.getItem(CURRENT_GAME_KEY)).toBe(waitingPlayerViewFixture.gameId);
    expect(JSON.stringify(storage)).not.toContain("token");
  });

  test("prevents duplicate create submissions while create-and-join is pending", async () => {
    let resolveCreate!: (gameId: string) => void;
    const create = mock(() => new Promise<string>((resolve) => { resolveCreate = resolve; }));
    const api = makeApi({ create });
    const storage = new MemoryStorage();
    const user = userEvent.setup();
    const screen = render(<App api={api} storage={storage} />);
    await user.type(screen.getAllByLabelText("Your name")[0]!, "Alice");
    const createButton = screen.getByRole("button", { name: "Create table" });

    await user.click(createButton);
    await user.click(createButton);
    expect(create).toHaveBeenCalledTimes(1);
    resolveCreate(waitingPlayerViewFixture.gameId);
    await waitFor(() => expect(screen.getByRole("heading", { name: "The table is open." })).not.toBeNull());
  });

  test("restores a cookie-backed session from the public game id", async () => {
    const storage = new MemoryStorage();
    storage.setItem(CURRENT_GAME_KEY, waitingPlayerViewFixture.gameId);
    const api = makeApi();
    const screen = render(<App api={api} storage={storage} />);

    await waitFor(() => expect(screen.getByText("Alice")).not.toBeNull());
    expect(api.read).toHaveBeenCalledWith(waitingPlayerViewFixture.gameId);
  });

  test("migrates only the public game id from an active legacy tab", async () => {
    const storage = new MemoryStorage();
    const legacyStorage = new MemoryStorage();
    legacyStorage.setItem(
      LEGACY_SESSION_KEY,
      JSON.stringify({
        gameId: waitingPlayerViewFixture.gameId,
        playerToken: "legacy-secret-token",
      }),
    );
    const api = makeApi();
    const screen = render(
      <App api={api} legacyStorage={legacyStorage} storage={storage} />,
    );

    await waitFor(() => expect(screen.getByText("Alice")).not.toBeNull());
    expect(api.read).toHaveBeenCalledWith(waitingPlayerViewFixture.gameId);
    expect(storage.getItem(CURRENT_GAME_KEY)).toBe(waitingPlayerViewFixture.gameId);
    expect(legacyStorage.getItem(LEGACY_SESSION_KEY)).toBeNull();
    expect(JSON.stringify(storage)).not.toContain("legacy-secret-token");
  });

  test("starts with the current revision and prevents duplicate submission", async () => {
    let resolveStart!: (view: PlayerView) => void;
    const start = mock(() => new Promise<PlayerView>((resolve) => { resolveStart = resolve; }));
    const api = makeApi({ read: mock(async () => waitingPlayerViewFixture), start });
    const storage = new MemoryStorage();
    storage.setItem(CURRENT_GAME_KEY, waitingPlayerViewFixture.gameId);
    const user = userEvent.setup();
    const screen = render(<App api={api} storage={storage} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Start game" })).not.toBeNull());

    const startButton = screen.getByRole("button", { name: "Start game" });
    await user.click(startButton);
    await user.click(startButton);
    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith(waitingPlayerViewFixture.gameId, { expectedRevision: 2, stockPileSize: 5 });
    resolveStart(playingPlayerViewFixture);
    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "Alice" })).not.toBeNull());
  });

  test("retains the lobby start and game-length safeguards", async () => {
    const onePlayerView = {
      ...waitingPlayerViewFixture,
      revision: 1,
      players: [waitingPlayerViewFixture.players[0]!],
    } satisfies PlayerView;
    const sixPlayerView = {
      ...waitingPlayerViewFixture,
      revision: 6,
      players: Array.from({ length: 6 }, (_, index) => ({
        ...waitingPlayerViewFixture.players[0]!,
        name: `Player ${index + 1}`,
      })),
    } satisfies PlayerView;
    const read = mock()
      .mockResolvedValueOnce(onePlayerView)
      .mockResolvedValueOnce(sixPlayerView);
    const api = makeApi({ read });
    const storage = new MemoryStorage();
    storage.setItem(CURRENT_GAME_KEY, waitingPlayerViewFixture.gameId);
    const user = userEvent.setup();
    const screen = render(<App api={api} storage={storage} />);

    const startButton = await screen.findByRole("button", { name: "Start game" });
    expect(startButton.hasAttribute("disabled")).toBeTrue();

    await user.selectOptions(screen.getByLabelText("Game length"), "30");
    await user.click(screen.getByRole("button", { name: "Refresh game" }));
    const gameLength = screen.getByRole("combobox", {
      name: "Game length",
    });
    if (!(gameLength instanceof HTMLSelectElement)) {
      throw new Error("Game length control must be a select element");
    }
    await waitFor(() => expect(gameLength.value).toBe("20"));
    expect([...gameLength.options].find((option) => option.value === "25")?.disabled).toBeTrue();
    expect([...gameLength.options].find((option) => option.value === "30")?.disabled).toBeTrue();
    expect(startButton.hasAttribute("disabled")).toBeFalse();
  });

  test("leaves the waiting room on the server before clearing the local session", async () => {
    const leave = mock(async () => ({ revision: 3 }));
    const api = makeApi({ read: mock(async () => waitingPlayerViewFixture), leave });
    const storage = new MemoryStorage();
    storage.setItem(CURRENT_GAME_KEY, waitingPlayerViewFixture.gameId);
    const user = userEvent.setup();
    const screen = render(<App api={api} storage={storage} />);
    await screen.findByRole("heading", { name: "The table is open." });

    await user.click(screen.getByRole("button", { name: "Leave waiting room" }));

    await waitFor(() => expect(leave).toHaveBeenCalledWith(
      waitingPlayerViewFixture.gameId,
      { expectedRevision: waitingPlayerViewFixture.revision },
    ));
    expect(storage.getItem(CURRENT_GAME_KEY)).toBeNull();
    expect(screen.getByRole("heading", { name: "Pull up a seat." })).not.toBeNull();
  });

  test("uses server legal commands for keyboard-friendly select then destination", async () => {
    const command = mock(async () => viewAt(4));
    const api = makeApi({ read: mock(async () => playingPlayerViewFixture), command });
    const storage = new MemoryStorage();
    storage.setItem(CURRENT_GAME_KEY, playingPlayerViewFixture.gameId);
    const user = userEvent.setup();
    const screen = render(<App api={api} storage={storage} />);
    const source = await screen.findByRole("button", { name: "card 1 from hand position 1" });

    await user.click(source);
    await user.click(screen.getByRole("button", { name: "Play selected card on Build pile 1" }));

    await waitFor(() => expect(command).toHaveBeenCalledTimes(1));
    expect(command).toHaveBeenCalledWith(playingPlayerViewFixture.gameId, {
      expectedRevision: 3,
      command: playingPlayerViewFixture.legalCommands[0],
    });
    await waitFor(() => expect(document.activeElement?.id).toBe("turn-heading"));
  });

  test("cancels keyboard selection with Escape and restores source focus", async () => {
    const api = makeApi({ read: mock(async () => playingPlayerViewFixture) });
    const storage = new MemoryStorage();
    storage.setItem(CURRENT_GAME_KEY, playingPlayerViewFixture.gameId);
    const user = userEvent.setup();
    const screen = render(<App api={api} storage={storage} />);
    const source = await screen.findByRole("button", { name: "card 1 from hand position 1" });

    source.focus();
    await user.keyboard("[Space]");
    await waitFor(() => expect(screen.getByRole("group", { name: "Build pile 1" }).className).toContain("drop-allowed"));
    expect(screen.getByRole("group", { name: "Build pile 2" }).className).not.toContain("drop-allowed");
    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.getByRole("group", { name: "Build pile 1" }).className).not.toContain("drop-allowed"));
    expect(document.activeElement).toBe(source);
  });

  test("retains the table after a rejected move", async () => {
    const command = mock(async () => { throw new GameApiError({ error: { code: "room_conflict", message: "That move is no longer legal." } }); });
    const api = makeApi({ read: mock(async () => playingPlayerViewFixture), command });
    const storage = new MemoryStorage();
    storage.setItem(CURRENT_GAME_KEY, playingPlayerViewFixture.gameId);
    const user = userEvent.setup();
    const screen = render(<App api={api} storage={storage} />);
    await user.click(await screen.findByRole("button", { name: "card 1 from hand position 1" }));
    await user.click(screen.getByRole("button", { name: "Play selected card on Build pile 1" }));

    await waitFor(() => expect(screen.getAllByText("That move is no longer legal.").length).toBeGreaterThan(0));
    expect(screen.getByRole("heading", { level: 1, name: "Alice" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "card 1 from hand position 1" })).not.toBeNull();
  });

  test("recovers a stale mutation with a current full snapshot", async () => {
    const read = mock()
      .mockResolvedValueOnce(playingPlayerViewFixture)
      .mockResolvedValueOnce(viewAt(4));
    const command = mock(async () => {
      throw new GameApiError({ error: { code: "stale_revision", message: "The table changed.", currentRevision: 4 } });
    });
    const api = makeApi({ read, command });
    const storage = new MemoryStorage();
    storage.setItem(CURRENT_GAME_KEY, playingPlayerViewFixture.gameId);
    const user = userEvent.setup();
    const screen = render(<App api={api} storage={storage} />);
    await user.click(await screen.findByRole("button", { name: "card 1 from hand position 1" }));
    await user.click(screen.getByRole("button", { name: "Play selected card on Build pile 1" }));

    await waitFor(() => expect(document.querySelector(".game-view")?.getAttribute("data-revision")).toBe("4"));
    expect(read).toHaveBeenCalledTimes(2);
  });

  test("manually refreshes and ignores an equal revision snapshot", async () => {
    const read = mock(async () => playingPlayerViewFixture);
    const api = makeApi({ read });
    const storage = new MemoryStorage();
    storage.setItem(CURRENT_GAME_KEY, playingPlayerViewFixture.gameId);
    const user = userEvent.setup();
    const screen = render(<App api={api} storage={storage} />);
    const refresh = await screen.findByRole("button", { name: "Refresh game" });

    await user.click(refresh);
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    expect(document.querySelector(".game-view")?.getAttribute("data-revision")).toBe("3");
    expect(refresh.hasAttribute("disabled")).toBeFalse();
  });

  test("applies live views and refreshes a snapshot after reconnect", async () => {
    const sockets: TestSocket[] = [];
    const scheduled: Array<() => void> = [];
    const read = mock()
      .mockResolvedValueOnce(playingPlayerViewFixture)
      .mockResolvedValueOnce(playingPlayerViewFixture)
      .mockResolvedValueOnce(viewAt(5));
    const api = makeApi({ read });
    const storage = new MemoryStorage();
    storage.setItem(CURRENT_GAME_KEY, playingPlayerViewFixture.gameId);
    const screen = render(
      <App
        api={api}
        liveConnection={{
          createSocket: () => {
            const socket = new TestSocket();
            sockets.push(socket);
            return socket;
          },
          schedule: (callback) => {
            scheduled.push(callback);
            return scheduled.length;
          },
          cancel: () => undefined,
          random: () => 0,
          location: { protocol: "https:", host: "skibo.example" },
        }}
        storage={storage}
      />,
    );

    await waitFor(() => expect(sockets).toHaveLength(1));
    await act(async () => {
      sockets[0]!.onopen?.();
      await Promise.resolve();
    });
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    expect(screen.getByText("Live updates connected.")).not.toBeNull();

    act(() =>
      sockets[0]!.onmessage?.({
        data: JSON.stringify({
          version: 1,
          type: "room.view",
          view: viewAt(4),
        }),
      }),
    );
    await waitFor(() => expect(document.querySelector(".game-view")?.getAttribute("data-revision")).toBe("4"));

    act(() => sockets[0]!.onclose?.());
    expect(screen.getByText(/Reconnecting live updates/)).not.toBeNull();
    act(() => scheduled[0]?.());
    await waitFor(() => expect(sockets).toHaveLength(2));
    await act(async () => {
      sockets[1]!.onopen?.();
      await Promise.resolve();
    });
    await waitFor(() => expect(document.querySelector(".game-view")?.getAttribute("data-revision")).toBe("5"));
    expect(read).toHaveBeenCalledTimes(3);
  });

  test("keeps Exit final when an older request completes late", async () => {
    let resolveRefresh!: (view: PlayerView) => void;
    const read = mock()
      .mockResolvedValueOnce(playingPlayerViewFixture)
      .mockImplementationOnce(() => new Promise<PlayerView>((resolve) => { resolveRefresh = resolve; }));
    const api = makeApi({ read });
    const storage = new MemoryStorage();
    storage.setItem(CURRENT_GAME_KEY, playingPlayerViewFixture.gameId);
    const user = userEvent.setup();
    const screen = render(<App api={api} storage={storage} />);
    await user.click(await screen.findByRole("button", { name: "Refresh game" }));
    await user.click(screen.getByRole("button", { name: "Exit game" }));
    resolveRefresh(viewAt(4));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Pull up a seat." })).not.toBeNull());
    expect(storage.getItem(CURRENT_GAME_KEY)).toBeNull();
  });

  test("does not let an obsolete rejected request erase a newly joined game", async () => {
    let rejectRefresh!: (error: unknown) => void;
    const read = mock()
      .mockResolvedValueOnce(playingPlayerViewFixture)
      .mockImplementationOnce(() => new Promise<PlayerView>((_resolve, reject) => { rejectRefresh = reject; }));
    const newGame = { ...waitingPlayerViewFixture, gameId: "game_new" };
    const api = makeApi({ read, join: mock(async () => newGame) });
    const storage = new MemoryStorage();
    storage.setItem(CURRENT_GAME_KEY, playingPlayerViewFixture.gameId);
    const user = userEvent.setup();
    const screen = render(<App api={api} storage={storage} />);
    await user.click(await screen.findByRole("button", { name: "Refresh game" }));
    await user.click(screen.getByRole("button", { name: "Exit game" }));
    await user.type(screen.getByLabelText("Game code"), "game_new");
    await user.type(screen.getAllByLabelText("Your name")[1]!, "Alice");
    await user.click(screen.getByRole("button", { name: "Join table" }));
    await waitFor(() => expect(storage.getItem(CURRENT_GAME_KEY)).toBe("game_new"));
    rejectRefresh(new GameApiError({ error: { code: "unauthorized", message: "Old session expired." } }));

    await waitFor(() => expect(screen.getAllByText("game_new").length).toBeGreaterThan(0));
    expect(storage.getItem(CURRENT_GAME_KEY)).toBe("game_new");
  });

  test("does not resurrect a game when Exit interrupts stale recovery", async () => {
    let resolveRecovery!: (view: PlayerView) => void;
    const read = mock()
      .mockResolvedValueOnce(playingPlayerViewFixture)
      .mockImplementationOnce(() => new Promise<PlayerView>((resolve) => { resolveRecovery = resolve; }));
    const command = mock(async () => {
      throw new GameApiError({ error: { code: "stale_revision", message: "The table changed.", currentRevision: 4 } });
    });
    const api = makeApi({ read, command });
    const storage = new MemoryStorage();
    storage.setItem(CURRENT_GAME_KEY, playingPlayerViewFixture.gameId);
    const user = userEvent.setup();
    const screen = render(<App api={api} storage={storage} />);
    await user.click(await screen.findByRole("button", { name: "card 1 from hand position 1" }));
    await user.click(screen.getByRole("button", { name: "Play selected card on Build pile 1" }));
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    await user.click(screen.getByRole("button", { name: "Exit game" }));
    resolveRecovery(viewAt(4));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Pull up a seat." })).not.toBeNull());
    expect(storage.getItem(CURRENT_GAME_KEY)).toBeNull();
  });

  test("renders the full completion state and exits locally", async () => {
    const api = makeApi({ read: mock(async () => finishedPlayerViewFixture) });
    const storage = new MemoryStorage();
    storage.setItem(CURRENT_GAME_KEY, finishedPlayerViewFixture.gameId);
    const user = userEvent.setup();
    const screen = render(<App api={api} storage={storage} />);

    expect(await screen.findByRole("dialog")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "You won!" })).not.toBeNull();
    await waitFor(() => expect(document.activeElement?.id).toBe("completion-title"));
    await user.click(screen.getByRole("button", { name: "Leave table" }));
    expect(storage.getItem(CURRENT_GAME_KEY)).toBeNull();
    expect(screen.getByRole("heading", { name: "Pull up a seat." })).not.toBeNull();
  });
});
