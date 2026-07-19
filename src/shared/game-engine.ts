import type {
  Command,
  DiscardCardCommand,
  PlayCardCommand,
} from "./command";
import type { Effect } from "./effect";
import type { GameState } from "./game-state";
import type { PlayerAction } from "./player-state";
import { copyGameState } from "./game-state";
import { drawCards, shuffleCardsBackIntoDeck, WILD_CARD } from "./deck";

export function resolveCommand(
  command: Command,
  gameState: GameState,
): {
  nextState: GameState;
  effects: Effect[];
  availableActions: PlayerAction[];
} {
  const inputState = gameState;

  if (inputState.isGameOver) {
    throw new Error("Cannot resolve a command after the game is over");
  }

  const inputPlayer = inputState.players[inputState.currentPlayerIndex]!;

  if (command.type === "playCard") {
    if (!isValidIndex(command.destinationIndex, inputState.buildPiles)) {
      throw new Error("Invalid build pile index");
    }
    if (command.source.type === "hand") {
      if (
        !isCardInHand(
          inputPlayer.cardsInHand,
          command.source.index,
          command.cardValue,
        )
      ) {
        throw new Error("Card not found in hand");
      }
    } else if (command.source.type === "discardPile") {
      if (!isValidIndex(command.source.index, inputPlayer.discardPiles)) {
        throw new Error("Invalid discard pile index");
      } else if (
        inputPlayer.discardPiles[command.source.index]!.at(-1) !==
        command.cardValue
      ) {
        throw new Error("Card played must match top card of discard pile");
      }
    } else if (command.source.type === "stockPile") {
      if (inputPlayer.stockPile.at(-1) !== command.cardValue) {
        throw new Error("Stock pile top card must match card played");
      }
    }

    const buildPile = inputState.buildPiles[command.destinationIndex]!;
    if (!canPlayCardOnBuildPile(command.cardValue, buildPile)) {
      if (buildPile.length === 0) {
        throw new Error("First card played to a build pile must be 1");
      } else {
        throw new Error(
          "Card played must match the next build pile value",
        );
      }
    }
  } else if (command.type === "discardCard") {
    if (
      !isCardInHand(
        inputPlayer.cardsInHand,
        command.source.index,
        command.cardValue,
      )
    ) {
      throw new Error("Card not found in hand");
    } else if (
      !isValidIndex(command.discardPileIndex, inputPlayer.discardPiles)
    ) {
      throw new Error("Invalid discard pile index");
    }
  }

  if (
    !getLegalCommands(inputState).some((legal) =>
      commandsEqual(legal, command),
    )
  ) {
    throw new Error("Command is not legal in the current game state");
  }

  const nextState = copyGameState(inputState);
  const effects: Effect[] = [];

  const currentPlayerNextState = nextState.players[nextState.currentPlayerIndex]!;

  if (command.type === "playCard") {
    if (command.source.type === "hand") {
      const cardIndex = command.source.index;
      currentPlayerNextState.cardsInHand = removeCardFromHand(
        currentPlayerNextState.cardsInHand,
        cardIndex,
      );
    } else if (command.source.type === "discardPile") {
      const discardPile =
        currentPlayerNextState.discardPiles[command.source.index]!;
      currentPlayerNextState.discardPiles[command.source.index] =
        discardPile.slice(0, -1);
    } else if (command.source.type === "stockPile") {
      currentPlayerNextState.stockPile = currentPlayerNextState.stockPile.slice(
        0,
        -1,
      );
    }

    nextState.buildPiles[command.destinationIndex]!.push(command.cardValue);
    effects.push({
      type: "cardPlayed",
      source: command.source,
      cardValue: command.cardValue,
      destinationIndex: command.destinationIndex,
    });
  } else if (command.type === "discardCard") {
    const cardIndex = command.source.index;
    currentPlayerNextState.cardsInHand = removeCardFromHand(
      currentPlayerNextState.cardsInHand,
      cardIndex,
    );
    currentPlayerNextState.discardPiles[command.discardPileIndex]!.push(
      command.cardValue,
    );
  }

  if (command.type === "playCard") {
    const buildPile = nextState.buildPiles[command.destinationIndex]!;
    if (currentPlayerNextState.stockPile.length === 0) {
      nextState.isGameOver = true;
    } else {
      if (buildPile.length === 12) {
        const completedBuildPile =
          nextState.buildPiles[command.destinationIndex]!;
        nextState.deck = shuffleCardsBackIntoDeck(
          nextState.deck,
          completedBuildPile,
        );
        nextState.buildPiles[command.destinationIndex] = [];
        effects.push({
          type: "buildPileResolved",
          pileIndex: command.destinationIndex,
        });
      }

      if (currentPlayerNextState.cardsInHand.length === 0) {
        const { remainingDeck, cardsInHand, cardsDrawn } = drawCardsFromDeck(
          nextState.deck,
          currentPlayerNextState.cardsInHand,
        );
        nextState.deck = remainingDeck;
        currentPlayerNextState.cardsInHand = cardsInHand;
        effects.push({
          type: "cardsDrawn",
          cardValues: cardsDrawn,
        });
      }
    }
  } else if (command.type === "discardCard") {
    effects.push({
      type: "cardDiscarded",
      cardValue: command.cardValue,
      pileIndex: command.discardPileIndex,
    });

    nextState.currentPlayerIndex =
      (nextState.currentPlayerIndex + 1) % nextState.players.length;
    const nextPlayerState = nextState.players[nextState.currentPlayerIndex]!;
    const { remainingDeck, cardsInHand, cardsDrawn } = drawCardsFromDeck(
      nextState.deck,
      nextPlayerState.cardsInHand,
    );
    nextState.players[nextState.currentPlayerIndex] = {
      ...nextPlayerState,
      cardsInHand,
    };
    nextState.deck = remainingDeck;

    if (cardsDrawn.length > 0) {
      effects.push({
        type: "cardsDrawn",
        cardValues: cardsDrawn,
      });
    }
  }

  const legalCommands = getLegalCommands(nextState);
  const availableActions: PlayerAction[] = [];
  if (legalCommands.some((legalCommand) => legalCommand.type === "playCard")) {
    availableActions.push("playCard");
  }
  if (
    legalCommands.some((legalCommand) => legalCommand.type === "discardCard")
  ) {
    availableActions.push("discardCard");
  }

  return { nextState, effects, availableActions };
}

export function getLegalCommands(gameState: GameState): Command[] {
  if (gameState.isGameOver) {
    return [];
  }

  const player = gameState.players[gameState.currentPlayerIndex]!;
  const playCommands: PlayCardCommand[] = [];

  player.cardsInHand.forEach((cardValue, index) => {
    addLegalPlayCommands(
      playCommands,
      cardValue,
      { type: "hand", index },
      gameState.buildPiles,
    );
  });

  player.discardPiles.forEach((discardPile, index) => {
    const cardValue = discardPile.at(-1);
    if (cardValue !== undefined) {
      addLegalPlayCommands(
        playCommands,
        cardValue,
        { type: "discardPile", index },
        gameState.buildPiles,
      );
    }
  });

  const stockPileCard = player.stockPile.at(-1);
  if (stockPileCard !== undefined) {
    addLegalPlayCommands(
      playCommands,
      stockPileCard,
      { type: "stockPile" },
      gameState.buildPiles,
    );
  }

  const discardCommands: DiscardCardCommand[] = player.cardsInHand.flatMap(
    (cardValue, index) =>
      player.discardPiles.map((_, discardPileIndex) => ({
        type: "discardCard",
        cardValue,
        source: { type: "hand", index },
        discardPileIndex,
      })),
  );

  return [...playCommands, ...discardCommands];
}

function addLegalPlayCommands(
  commands: PlayCardCommand[],
  cardValue: number,
  source: PlayCardCommand["source"],
  buildPiles: number[][],
): void {
  buildPiles.forEach((buildPile, destinationIndex) => {
    if (canPlayCardOnBuildPile(cardValue, buildPile)) {
      commands.push({
        type: "playCard",
        cardValue,
        source,
        destinationIndex,
      });
    }
  });
}

function canPlayCardOnBuildPile(
  cardValue: number,
  buildPile: number[],
): boolean {
  return cardValue === WILD_CARD || cardValue === buildPile.length + 1;
}

function removeCardFromHand(
  cardsInHand: number[],
  cardIndex: number,
): number[] {
  return cardsInHand.filter((_, i) => i !== cardIndex);
}

function isCardInHand(
  cardsInHand: number[],
  cardIndex: number,
  cardValue: number,
): boolean {
  return (
    isValidIndex(cardIndex, cardsInHand) &&
    cardsInHand[cardIndex] === cardValue
  );
}

function isValidIndex(index: number, values: unknown[]): boolean {
  return Number.isInteger(index) && index >= 0 && index < values.length;
}

function commandsEqual(left: Command, right: Command): boolean {
  if (left.type !== right.type || left.cardValue !== right.cardValue) {
    return false;
  }

  if (left.type === "discardCard" && right.type === "discardCard") {
    return (
      left.source.index === right.source.index &&
      left.discardPileIndex === right.discardPileIndex
    );
  }

  if (left.type !== "playCard" || right.type !== "playCard") {
    return false;
  }

  if (
    left.destinationIndex !== right.destinationIndex ||
    left.source.type !== right.source.type
  ) {
    return false;
  }

  if (left.source.type === "stockPile" && right.source.type === "stockPile") {
    return true;
  }

  return (
    left.source.type !== "stockPile" &&
    right.source.type !== "stockPile" &&
    left.source.index === right.source.index
  );
}

function drawCardsFromDeck(
  deck: number[],
  currCardsInHand: number[],
): { remainingDeck: number[]; cardsInHand: number[]; cardsDrawn: number[] } {
  const nbOfCardsToDraw = 5 - currCardsInHand.length;
  const { remainingDeck, cardsInHand } = drawCards(
    deck,
    currCardsInHand,
    nbOfCardsToDraw,
  );

  return {
    remainingDeck,
    cardsInHand,
    cardsDrawn: nbOfCardsToDraw > 0 ? cardsInHand.slice(-nbOfCardsToDraw) : [],
  };
}
