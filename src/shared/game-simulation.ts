import type { Command, DiscardCardCommand, PlayCardCommand } from "./command";
import { getLegalCommands, resolveCommand } from "./game-engine";
import { createGameState, type GameState } from "./game-state";
import { WILD_CARD } from "./deck";

export interface SimulateGameOptions {
  playerNames?: string[];
  stockPileSize?: number;
  maxCommands?: number;
  random?: () => number;
}

export type SimulationResult =
  | {
      status: "won";
      winnerName: string;
      commandCount: number;
      turnCount: number;
      finalState: GameState;
    }
  | {
      status: "commandLimitReached";
      winnerName?: undefined;
      commandCount: number;
      turnCount: number;
      finalState: GameState;
    }
  | {
      status: "noLegalCommand";
      winnerName?: undefined;
      commandCount: number;
      turnCount: number;
      finalState: GameState;
    };

export function simulateGame(
  options: SimulateGameOptions = {},
): SimulationResult {
  const playerNames = options.playerNames ?? ["Player 1", "Player 2"];
  const maxCommands = options.maxCommands ?? 10_000;
  const random = options.random ?? Math.random;

  if (!Number.isInteger(maxCommands) || maxCommands < 1) {
    throw new Error("Simulation command limit must be a positive integer");
  }

  let state = createGameState(playerNames, options.stockPileSize, random);
  let commandCount = 0;
  let turnCount = 0;

  while (!state.isGameOver && commandCount < maxCommands) {
    const command = chooseCommand(state);
    if (command === undefined) {
      return {
        status: "noLegalCommand",
        commandCount,
        turnCount,
        finalState: state,
      };
    }
    const result = resolveCommand(command, state, { random });
    state = result.nextState;
    commandCount++;
    if (command.type === "discardCard") {
      turnCount++;
    }
  }

  if (state.isGameOver) {
    return {
      status: "won",
      winnerName: state.players[state.currentPlayerIndex]!.name,
      commandCount,
      turnCount: turnCount + 1,
      finalState: state,
    };
  }

  return {
    status: "commandLimitReached",
    commandCount,
    turnCount,
    finalState: state,
  };
}

export function createSeededRandom(seed: number): () => number {
  let value = seed >>> 0;

  return () => {
    value += 0x6d2b79f5;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function chooseCommand(state: GameState): Command | undefined {
  const commands = getLegalCommands(state);
  const playCommands = commands.filter(
    (command): command is PlayCardCommand => command.type === "playCard",
  );

  if (playCommands.length > 0) {
    return playCommands.toSorted(comparePlayCommands)[0]!;
  }

  const discardCommands = commands.filter(
    (command): command is DiscardCardCommand =>
      command.type === "discardCard",
  );
  if (discardCommands.length === 0) {
    return undefined;
  }

  return discardCommands.toSorted((left, right) =>
    compareDiscardCommands(left, right, state),
  )[0]!;
}

function comparePlayCommands(
  left: PlayCardCommand,
  right: PlayCardCommand,
): number {
  return (
    sourcePriority(left) - sourcePriority(right) ||
    Number(left.cardValue === WILD_CARD) -
      Number(right.cardValue === WILD_CARD) ||
    left.destinationIndex - right.destinationIndex
  );
}

function sourcePriority(command: PlayCardCommand): number {
  switch (command.source.type) {
    case "stockPile":
      return 0;
    case "discardPile":
      return 1;
    case "hand":
      return 2;
  }
}

function compareDiscardCommands(
  left: DiscardCardCommand,
  right: DiscardCardCommand,
  state: GameState,
): number {
  const player = state.players[state.currentPlayerIndex]!;
  const leftPile = player.discardPiles[left.discardPileIndex]!;
  const rightPile = player.discardPiles[right.discardPileIndex]!;

  return (
    discardPilePriority(left, leftPile) -
      discardPilePriority(right, rightPile) ||
    right.cardValue - left.cardValue ||
    left.discardPileIndex - right.discardPileIndex
  );
}

function discardPilePriority(
  command: DiscardCardCommand,
  pile: number[],
): number {
  if (pile.at(-1) === command.cardValue) {
    return 0;
  }
  if (pile.length === 0) {
    return 1;
  }
  return 2 + pile.length;
}
