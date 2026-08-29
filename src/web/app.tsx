import { useEffect, useReducer, useRef } from "react";
import { toast, Toaster } from "sonner";

import { GameIdSchema, type PlayerView, type TransportCommand } from "../shared/transport";
import { appReducer, initialAppState, type RequestKind } from "./app-state";
import { CURRENT_GAME_KEY, gameApi, toApiError, type GameApi } from "./api-client";
import { EntryScreen } from "./components/entry-screen";
import { GameTable } from "./components/game-table";
import { SiteHeader } from "./components/site-header";
import { WaitingRoom } from "./components/waiting-room";
import {
  useLiveGameUpdates,
  type LiveConnectionDependencies,
  type LiveUpdateStatus,
} from "./hooks/use-live-game-updates";

interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface AppProps {
  api?: GameApi;
  storage?: StorageAdapter;
  legacyStorage?: StorageAdapter;
  liveConnection?: LiveConnectionDependencies;
}

export const LEGACY_SESSION_KEY = "skibo-session";

export function App({
  api = gameApi,
  storage = window.localStorage,
  legacyStorage = window.sessionStorage,
  liveConnection,
}: AppProps) {
  const [state, dispatch] = useReducer(appReducer, initialAppState);
  const operationInFlight = useRef(false);
  const sessionGeneration = useRef(0);
  const restored = useRef(false);
  const gameId = state.view?.gameId ?? storage.getItem(CURRENT_GAME_KEY);

  async function runRequest<Result>(
    request: RequestKind,
    operation: () => Promise<Result>,
    onSuccess: (result: Result) => void,
    options: {
      quiet?: boolean;
      restoreFocus?: boolean;
      recoveryGameId?: string;
      exitOnMissingSession?: boolean;
    } = {},
  ) {
    if (operationInFlight.current) return;
    operationInFlight.current = true;
    const generation = sessionGeneration.current;
    dispatch({ type: "requestStarted", request });
    try {
      const result = await operation();
      if (generation !== sessionGeneration.current) return;
      onSuccess(result);
      if (options.restoreFocus) {
        window.setTimeout(() => {
          const target = document.querySelector<HTMLElement>("#completion-title") ?? document.querySelector<HTMLElement>("#turn-heading");
          target?.focus();
        });
      }
    } catch (error) {
      const apiError = toApiError(error);
      if (generation !== sessionGeneration.current) return;
      if (apiError.error.code === "unauthorized" || apiError.error.code === "not_found") {
        if (options.exitOnMissingSession) {
          exit();
          if (!options.quiet) toast.error(apiError.error.message);
          return;
        }
        storage.removeItem(CURRENT_GAME_KEY);
      }
      dispatch({ type: "requestFailed", error: apiError });
      if (!options.quiet) toast.error(apiError.error.message);

      if (apiError.error.code === "stale_revision") {
        try {
          if (options.recoveryGameId !== undefined) {
            const recoveredView = await api.read(options.recoveryGameId);
            if (generation === sessionGeneration.current) dispatch({ type: "viewReceived", view: recoveredView });
          }
        } catch {
          // The last valid view remains visible; reconnect or manual refresh retries.
        }
      }
    } finally {
      if (generation === sessionGeneration.current) operationInFlight.current = false;
    }
  }

  async function runViewRequest(
    request: RequestKind,
    operation: () => Promise<PlayerView>,
    options: { quiet?: boolean; restoreFocus?: boolean } = {},
  ) {
    await runRequest(
      request,
      operation,
      (view) => {
        storage.setItem(CURRENT_GAME_KEY, view.gameId);
        dispatch({ type: "viewReceived", view });
      },
      { ...options, recoveryGameId: state.view?.gameId },
    );
  }

  function refresh(quiet = false) {
    const currentGameId = state.view?.gameId ?? storage.getItem(CURRENT_GAME_KEY);
    if (currentGameId !== null) void runViewRequest("refresh", () => api.read(currentGameId), { quiet });
  }

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const savedGameId = restoreStoredGameId(storage, legacyStorage);
    if (savedGameId !== null) void runViewRequest("restore", () => api.read(savedGameId), { quiet: true });
  }, []);

  const liveUpdates = useLiveGameUpdates({
    ...liveConnection,
    enabled: state.view !== null && state.view.status !== "finished",
    gameId: state.view?.gameId ?? null,
    refreshSnapshot: (currentGameId) => api.read(currentGameId),
    onView: (view) => {
      storage.setItem(CURRENT_GAME_KEY, view.gameId);
      dispatch({ type: "liveViewReceived", view });
    },
  });

  function create(playerName: string) {
    void runViewRequest("create", async () => {
      const createdGameId = await api.create();
      return api.join(createdGameId, playerName);
    });
  }

  function join(joinGameId: string, playerName: string) {
    void runViewRequest("join", () => api.join(joinGameId, playerName));
  }

  function start(stockPileSize: number) {
    if (state.view?.status !== "waiting") return;
    const { gameId: currentGameId, revision } = state.view;
    void runViewRequest("start", () => api.start(currentGameId, { expectedRevision: revision, stockPileSize }));
  }

  function submitCommand(command: TransportCommand) {
    if (state.view?.status !== "playing") return;
    const { gameId: currentGameId, revision } = state.view;
    void runViewRequest("command", () => api.command(currentGameId, { expectedRevision: revision, command }), { restoreFocus: true });
  }

  function leaveOrExit() {
    if (state.view?.status !== "waiting") {
      exit();
      return;
    }
    const { gameId: currentGameId, revision } = state.view;
    void runRequest(
      "leave",
      () => api.leave(currentGameId, { expectedRevision: revision }),
      () => exit(),
      {
        exitOnMissingSession: true,
        recoveryGameId: currentGameId,
      },
    );
  }

  function exit() {
    sessionGeneration.current += 1;
    operationInFlight.current = false;
    storage.removeItem(CURRENT_GAME_KEY);
    legacyStorage.removeItem(LEGACY_SESSION_KEY);
    dispatch({ type: "sessionExited" });
  }

  async function copyGameCode() {
    if (gameId === null) return;
    try {
      await navigator.clipboard.writeText(gameId);
      toast.success("Game code copied.");
    } catch {
      toast.error("Could not copy the game code. Select it from the waiting room instead.");
    }
  }

  const busy = state.pending !== null;

  return (
    <div className="app-shell">
      <SiteHeader
        busy={busy}
        exitDisabled={state.view?.status === "waiting" && busy}
        exitLabel={state.view?.status === "waiting" ? "Leave waiting room" : "Exit game"}
        gameId={state.view?.gameId ?? null}
        onCopy={() => void copyGameCode()}
        onExit={leaveOrExit}
        onRefresh={() => refresh(false)}
      />
      {state.view !== null ? (
        <p
          aria-live="polite"
          className="sr-only"
          role="status"
        >
          {liveStatusLabel(liveUpdates.status)}
          {liveUpdates.error === null
            ? ""
            : ` ${liveUpdates.error.error.message}`}
        </p>
      ) : null}
      {state.view === null ? (
        <EntryScreen busy={busy} onCreate={create} onJoin={join} />
      ) : state.view.status === "waiting" ? (
        <WaitingRoom busy={busy} onStart={start} view={state.view} />
      ) : (
        <GameTable
          busy={busy}
          liveStatus={liveUpdates.status}
          onCommand={submitCommand}
          onExit={exit}
          onSelect={(command) => dispatch({ type: "commandSelected", command })}
          selectedCommand={state.selectedCommand}
          view={state.view}
        />
      )}
      <p aria-atomic="true" aria-live="polite" className="sr-only">
        {state.error?.error.message ?? ""}
      </p>
      <Toaster
        position="bottom-right"
        theme="light"
        toastOptions={{
          classNames: {
            toast: "skibo-toast",
            error: "skibo-toast-error",
          },
        }}
      />
    </div>
  );
}

function restoreStoredGameId(
  storage: StorageAdapter,
  legacyStorage: StorageAdapter,
): string | null {
  const currentGameId = storage.getItem(CURRENT_GAME_KEY);
  const legacySession = legacyStorage.getItem(LEGACY_SESSION_KEY);
  if (legacySession === null) return currentGameId;

  // Delete the legacy bearer token even when a current React session already exists.
  legacyStorage.removeItem(LEGACY_SESSION_KEY);
  if (currentGameId !== null) return currentGameId;

  try {
    const parsed = JSON.parse(legacySession) as unknown;
    const gameId = GameIdSchema.safeParse(
      typeof parsed === "object" && parsed !== null && "gameId" in parsed
        ? parsed.gameId
        : undefined,
    );
    if (!gameId.success) return null;
    storage.setItem(CURRENT_GAME_KEY, gameId.data);
    return gameId.data;
  } catch {
    return null;
  }
}

function liveStatusLabel(status: LiveUpdateStatus): string {
  switch (status) {
    case "connected":
      return "Live updates connected."
    case "connecting":
      return "Connecting live updates…"
    case "reconnecting":
      return "Reconnecting live updates…"
    case "disconnected":
      return "Live updates disconnected."
  }
}
