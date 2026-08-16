import { useEffect, useReducer, useRef } from "react";
import { toast, Toaster } from "sonner";

import type { PlayerView, TransportCommand } from "../shared/transport";
import { appReducer, initialAppState, type RequestKind } from "./app-state";
import { CURRENT_GAME_KEY, gameApi, toApiError, type GameApi } from "./api-client";
import { EntryScreen } from "./components/entry-screen";
import { GameTable } from "./components/game-table";
import { SiteHeader } from "./components/site-header";
import { WaitingRoom } from "./components/waiting-room";
import { usePolling } from "./hooks/use-polling";

interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface AppProps {
  api?: GameApi;
  storage?: StorageAdapter;
}

export function App({ api = gameApi, storage = window.localStorage }: AppProps) {
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
          // The last valid view remains visible; the next poll or manual refresh retries.
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
    const savedGameId = storage.getItem(CURRENT_GAME_KEY);
    if (savedGameId !== null) void runViewRequest("restore", () => api.read(savedGameId), { quiet: true });
  }, []);

  usePolling(state.view !== null && state.view.status !== "finished" && state.pending === null, () => refresh(true));

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
    <div className="flex min-h-dvh flex-col bg-emerald-950 text-emerald-50">
      <SiteHeader
        busy={busy}
        exitDisabled={state.view?.status === "waiting" && busy}
        exitLabel={state.view?.status === "waiting" ? "Leave waiting room" : "Exit game"}
        gameId={state.view?.gameId ?? null}
        onCopy={() => void copyGameCode()}
        onExit={leaveOrExit}
        onRefresh={() => refresh(false)}
      />
      {state.view === null ? (
        <EntryScreen busy={busy} onCreate={create} onJoin={join} />
      ) : state.view.status === "waiting" ? (
        <WaitingRoom busy={busy} onStart={start} view={state.view} />
      ) : (
        <GameTable
          busy={busy}
          onCommand={submitCommand}
          onExit={exit}
          onSelect={(command) => dispatch({ type: "commandSelected", command })}
          selectedCommand={state.selectedCommand}
          view={state.view}
        />
      )}
      <p aria-atomic="true" aria-live="polite" className="sr-only">{state.error?.error.message ?? ""}</p>
      <Toaster closeButton position="top-center" richColors theme="dark" />
    </div>
  );
}
