import type { Command } from "./command";
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
  const inputPlayer = inputState.players[inputState.currentPlayerIndex]!;

  if (command.type === "playCard") {
    if (command.destinationIndex >= inputState.buildPiles.length) {
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
      if (command.source.index >= inputPlayer.discardPiles.length) {
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

    if (command.cardValue !== WILD_CARD) {
      const buildPileTopCard =
        inputState.buildPiles[command.destinationIndex]!.at(-1);
      if (buildPileTopCard === undefined && command.cardValue !== 1) {
        throw new Error("First card played to a build pile must be 1");
      } else if (
        buildPileTopCard !== undefined &&
        buildPileTopCard !== WILD_CARD &&
        command.cardValue - buildPileTopCard !== 1
      ) {
        throw new Error(
          "Card played must be one higher than the top card of the build pile",
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
    } else if (command.discardPileIndex >= inputPlayer.discardPiles.length) {
      throw new Error("Invalid discard pile index");
    }
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

  const availableActions: PlayerAction[] = nextState.isGameOver
    ? []
    : ["playCard", "discardCard"];

  return { nextState, effects, availableActions };
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
  return cardsInHand.at(cardIndex) === cardValue;
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
