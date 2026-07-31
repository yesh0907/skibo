import type { Command } from "./command";
import { WILD_CARD } from "./deck";
import { getLegalCommands, resolveCommand } from "./game-engine";
import { chooseSimulationCommand } from "./game-simulation";
import {
  assertValidGameState,
  copyGameState,
  createGameState,
  type GameState,
} from "./game-state";

export interface PlayLocalGameOptions {
  playerNames?: [string, string];
  stockPileSize?: number;
  humanPlayerIndex?: number;
  initialState?: GameState;
  random?: () => number;
  readLine: () => Promise<string>;
  writeLine: (line: string) => void;
}

export type LocalGameResult =
  | {
      status: "won";
      winnerName: string;
      finalState: GameState;
    }
  | {
      status: "quit" | "noLegalCommand";
      winnerName?: undefined;
      finalState: GameState;
    };

export async function playLocalGame(
  options: PlayLocalGameOptions,
): Promise<LocalGameResult> {
  const random = options.random ?? Math.random;
  const humanPlayerIndex = options.humanPlayerIndex ?? 0;
  let state = options.initialState
    ? copyGameState(options.initialState)
    : createGameState(
        options.playerNames ?? ["You", "Bot"],
        options.stockPileSize ?? 5,
        random,
      );

  assertValidGameState(state);

  if (
    !Number.isInteger(humanPlayerIndex) ||
    humanPlayerIndex < 0 ||
    humanPlayerIndex >= state.players.length
  ) {
    throw new Error("Human player index is invalid");
  }

  options.writeLine("Skip-Bo local game");

  while (!state.isGameOver) {
    renderState(state, humanPlayerIndex, options.writeLine);

    const command =
      state.currentPlayerIndex === humanPlayerIndex
        ? await chooseHumanCommand(state, options)
        : chooseBotCommand(state, options.writeLine);

    if (command === "quit") {
      options.writeLine("Game ended by player.");
      return { status: "quit", finalState: state };
    }
    if (command === undefined) {
      options.writeLine(
        `${state.players[state.currentPlayerIndex]!.name} has no legal command.`,
      );
      return { status: "noLegalCommand", finalState: state };
    }

    state = resolveCommand(command, state, { random }).nextState;
  }

  const winnerName = state.players[state.currentPlayerIndex]!.name;
  options.writeLine(
    state.currentPlayerIndex === humanPlayerIndex
      ? "You win!"
      : `${winnerName} wins.`,
  );
  return { status: "won", winnerName, finalState: state };
}

async function chooseHumanCommand(
  state: GameState,
  options: Pick<PlayLocalGameOptions, "readLine" | "writeLine">,
): Promise<Command | "quit" | undefined> {
  const commands = getLegalCommands(state);
  if (commands.length === 0) {
    return undefined;
  }

  commands.forEach((command, index) => {
    options.writeLine(`${index + 1}. ${describeCommand(command)}`);
  });

  while (true) {
    options.writeLine("Choose a command number or q to quit:");
    const answer = (await options.readLine()).trim().toLowerCase();
    if (answer === "q" || answer === "quit") {
      return "quit";
    }

    const selectedIndex = Number(answer) - 1;
    if (
      Number.isInteger(selectedIndex) &&
      selectedIndex >= 0 &&
      selectedIndex < commands.length
    ) {
      return commands[selectedIndex];
    }

    options.writeLine("Enter one of the listed command numbers.");
  }
}

function chooseBotCommand(
  state: GameState,
  writeLine: (line: string) => void,
): Command | undefined {
  const command = chooseSimulationCommand(state);
  if (command !== undefined) {
    writeLine(
      `${state.players[state.currentPlayerIndex]!.name}: ${describeCommand(command)}`,
    );
  }
  return command;
}

export function describeCommand(command: Command): string {
  const card = formatCard(command.cardValue);
  if (command.type === "discardCard") {
    return `Discard hand ${command.source.index + 1} (${card}) onto discard pile ${command.discardPileIndex + 1}`;
  }

  let source: string;
  switch (command.source.type) {
    case "hand":
      source = `hand ${command.source.index + 1}`;
      break;
    case "discardPile":
      source = `discard pile ${command.source.index + 1}`;
      break;
    case "stockPile":
      source = "stock";
      break;
  }
  return `Play ${source} ${card} onto build pile ${command.destinationIndex + 1}`;
}

function renderState(
  state: GameState,
  humanPlayerIndex: number,
  writeLine: (line: string) => void,
): void {
  const human = state.players[humanPlayerIndex]!;
  const current = state.players[state.currentPlayerIndex]!;
  const opponents = state.players.filter((_, index) => index !== humanPlayerIndex);

  writeLine("");
  writeLine(`Turn: ${current.name}`);
  writeLine(
    `Build piles: ${state.buildPiles
      .map((pile, index) => `${index + 1}:${formatPile(pile)}`)
      .join("  ")}`,
  );
  writeLine(
    `Hand: ${human.cardsInHand
      .map((card, index) => `[${index + 1}] ${formatCard(card)}`)
      .join("  ") || "(empty)"}`,
  );
  writeLine(
    `Stock: ${formatCard(human.stockPile.at(-1))} (${human.stockPile.length} ${human.stockPile.length === 1 ? "card" : "cards"})`,
  );
  writeLine(
    `Discards: ${human.discardPiles
      .map((pile, index) => `${index + 1}:${formatPile(pile)}`)
      .join("  ")}`,
  );
  writeLine(
    `Opponents: ${opponents
      .map((player) => `${player.name} (${player.stockPile.length} stock)`)
      .join(", ")}`,
  );
}

function formatPile(pile: number[]): string {
  return pile.length === 0
    ? "-"
    : `${formatCard(pile.at(-1))}(${pile.length})`;
}

function formatCard(card: number | undefined): string {
  if (card === undefined) {
    return "-";
  }
  return card === WILD_CARD ? "S" : String(card);
}
