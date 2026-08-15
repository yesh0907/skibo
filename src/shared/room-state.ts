import type { Command } from "./command";
import type { Effect } from "./effect";
import type { GameState } from "./game-state";
import type { PlayerView } from "./transport";

export type RoomStatus = "waiting" | "started" | "finished";

export interface RoomPlayer {
  name: string;
  token: string;
}

export interface RoomState {
  gameId: string;
  revision: number;
  status: RoomStatus;
  players: RoomPlayer[];
  gameState: GameState | null;
}

export interface RoomSummary {
  gameId: string;
  revision: number;
  status: RoomStatus;
  playerNames: string[];
}

export type GameView = PlayerView;

export interface JoinResult {
  playerToken: string;
  view: GameView;
}

export interface CommandResult {
  view: GameView;
  effects: Effect[];
}

export interface LeaveResult {
  revision: number;
}

export interface JoinRoomRequest {
  playerName: string;
}

export interface StartGameRequest {
  stockPileSize?: number;
}

export interface PlayCommandRequest {
  command: Command;
}
