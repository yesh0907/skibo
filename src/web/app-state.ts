import type { ApiError, PlayerView } from "../shared/transport";

export interface AppState {
  phase: "idle" | "ready";
  view: PlayerView | null;
  error: ApiError | null;
}

export type AppAction =
  | { type: "scaffoldOpened" }
  | { type: "viewReceived"; view: PlayerView }
  | { type: "requestFailed"; error: ApiError };

export const initialAppState: AppState = {
  phase: "idle",
  view: null,
  error: null,
};

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "scaffoldOpened":
      return { ...state, phase: "ready" };
    case "viewReceived":
      return { phase: "ready", view: action.view, error: null };
    case "requestFailed":
      return { ...state, error: action.error };
  }
}
