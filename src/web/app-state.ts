import type {
  ApiError,
  PlayerView,
  TransportCommand,
} from "../shared/transport";

export type RequestKind = "restore" | "create" | "join" | "refresh" | "start" | "command" | "leave";

export interface AppState {
  view: PlayerView | null;
  pending: RequestKind | null;
  error: ApiError | null;
  selectedCommand: TransportCommand | null;
}

export type AppAction =
  | { type: "requestStarted"; request: RequestKind }
  | { type: "viewReceived"; view: PlayerView }
  | { type: "liveViewReceived"; view: PlayerView }
  | { type: "requestFailed"; error: ApiError }
  | { type: "commandSelected"; command: TransportCommand | null }
  | { type: "sessionExited" };

export const initialAppState: AppState = {
  view: null,
  pending: null,
  error: null,
  selectedCommand: null,
};

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "requestStarted":
      return { ...state, pending: action.request, error: null };
    case "viewReceived":
      if (state.view !== null && action.view.revision <= state.view.revision) {
        return { ...state, pending: null, error: null };
      }
      return {
        view: action.view,
        pending: null,
        error: null,
        selectedCommand: null,
      };
    case "liveViewReceived":
      if (state.view !== null && action.view.revision <= state.view.revision) {
        return state;
      }
      return {
        ...state,
        view: action.view,
        selectedCommand: null,
      };
    case "requestFailed":
      return { ...state, pending: null, error: action.error };
    case "commandSelected":
      return { ...state, selectedCommand: action.command };
    case "sessionExited":
      return initialAppState;
  }
}
