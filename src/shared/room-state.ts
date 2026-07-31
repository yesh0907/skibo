import type { Command } from "./command";
import type { Effect } from "./effect";
import type { GameState } from "./game-state";

export type RoomStatus = "waiting" | "started" | "finished";

export interface RoomPlayer {
  name: string;
  token: string;
}

export interface RoomState {
  gameId: string;
  status: RoomStatus;
  players: RoomPlayer[];
  gameState: GameState | null;
}

export interface RoomSummary {
  gameId: string;
  status: RoomStatus;
  playerNames: string[];
}

export interface PlayerGameView {
  name: string;
  cardsInHand: number[] | null;
  handCount: number;
  stockTopCard: number | null;
  stockCount: number;
  discardPiles: number[][];
}

export interface GameView {
  gameId: string;
  status: RoomStatus;
  viewerName: string;
  players: PlayerGameView[];
  currentPlayerName: string | null;
  isYourTurn: boolean;
  deckCount: number;
  buildPiles: number[][];
  completedBuildPileCount: number;
  legalCommands: Command[];
}

export interface JoinResult {
  playerToken: string;
  view: GameView;
}

export interface CommandResult {
  view: GameView;
  effects: Effect[];
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
