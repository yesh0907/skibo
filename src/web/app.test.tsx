import { afterAll, afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

import type { PlayerView } from "../shared/transport";
import { finishedPlayerViewFixture, playingPlayerViewFixture, waitingPlayerViewFixture } from "../tests/fixtures/transport";
import type { GameApi } from "./api-client";
import { CURRENT_GAME_KEY, GameApiError } from "./api-client";
import { POLL_INTERVAL_MS } from "./hooks/use-polling";

GlobalRegistrator.register();

const { act, cleanup, render, waitFor } = await import("@testing-library/react");
const userEvent = (await import("@testing-library/user-event")).default;
const { App } = await import("./app");

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
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
    ...overrides,
  };
}

beforeAll(() => {
  Object.defineProperty(globalThis.navigator, "clipboard", {
    configurable: true,
    value: { writeText: mock(async () => undefined) },
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
    expect(start).toHaveBeenCalledWith(waitingPlayerViewFixture.gameId, { expectedRevision: 2, stockPileSize: 30 });
    resolveStart(playingPlayerViewFixture);
    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "Alice" })).not.toBeNull());
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
    await waitFor(() => expect(screen.getByRole("group", { name: "Build pile 1" }).className).toContain("border-lime-300"));
    expect(screen.getByRole("group", { name: "Build pile 2" }).className).not.toContain("border-lime-300");
    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.getByRole("group", { name: "Build pile 1" }).className).not.toContain("border-lime-300"));
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

    await waitFor(() => expect(screen.getByText(/revision 4/)).not.toBeNull());
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
    expect(screen.getByText(/revision 3/)).not.toBeNull();
    expect(refresh.hasAttribute("disabled")).toBeFalse();
  });

  test("routes temporary polling through the isolated refresh seam", async () => {
    const originalSetInterval = window.setInterval;
    let poll: (() => void) | null = null;
    window.setInterval = ((handler: TimerHandler, timeout?: number) => {
      if (timeout === POLL_INTERVAL_MS && typeof handler === "function") poll = () => handler();
      return 77;
    }) as typeof window.setInterval;
    try {
      const read = mock(async () => playingPlayerViewFixture);
      const api = makeApi({ read });
      const storage = new MemoryStorage();
      storage.setItem(CURRENT_GAME_KEY, playingPlayerViewFixture.gameId);
      render(<App api={api} storage={storage} />);

      await waitFor(() => expect(poll).not.toBeNull());
      await act(async () => {
        (poll as (() => void) | null)?.();
        await Promise.resolve();
      });
      await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    } finally {
      window.setInterval = originalSetInterval;
    }
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
    await user.click(screen.getByRole("button", { name: "Return home" }));
    expect(storage.getItem(CURRENT_GAME_KEY)).toBeNull();
    expect(screen.getByRole("heading", { name: "Pull up a seat." })).not.toBeNull();
  });
});
