import {
  dealCards,
  GAME_DECK_SIZE,
  populateGameDeck,
  WILD_CARD,
} from "./deck";
import {
  copyPlayerState,
  createPlayerState,
  type PlayerState,
} from "./player-state";

export interface GameState {
  players: PlayerState[];
  deck: number[];
  buildPiles: number[][];
  completedBuildPiles: number[][];
  currentPlayerIndex: number;
  isGameOver: boolean;
}

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6;
const HAND_SIZE = 5;
const PILES_PER_GAME = 4;
const MAX_BUILD_PILE_SIZE = 11;

export function createGameState(
  playerNames: string[],
  stockPileSize?: number,
): GameState {
  assertValidPlayerNames(playerNames);

  const resolvedStockPileSize =
    stockPileSize ?? getOfficialStockPileSize(playerNames.length);
  if (
    !Number.isInteger(resolvedStockPileSize) ||
    resolvedStockPileSize < 1
  ) {
    throw new Error("Stock pile size must be a positive integer");
  }
  if (
    playerNames.length * (HAND_SIZE + resolvedStockPileSize) >
    GAME_DECK_SIZE
  ) {
    throw new Error("Not enough cards to deal the requested game setup");
  }

  let deck = populateGameDeck();
  const players: PlayerState[] = playerNames.map((name) => {
    let { remainingDeck: deckAfterHand, dealtCards: cardsInHand } = dealCards(
      deck,
      HAND_SIZE,
    );
    let { remainingDeck: deckAfterStock, dealtCards: stockPile } = dealCards(
      deckAfterHand,
      resolvedStockPileSize,
    );
    deck = deckAfterStock;
    return createPlayerState({ name, cardsInHand, stockPile });
  });

  const state: GameState = {
    players,
    deck,
    buildPiles: new Array(PILES_PER_GAME).fill(null).map(() => []),
    completedBuildPiles: [],
    currentPlayerIndex: 0,
    isGameOver: false,
  };

  assertValidGameState(state);
  return state;
}

export function copyGameState(state: GameState): GameState {
  return {
    players: state.players.map(copyPlayerState),
    deck: [...state.deck],
    buildPiles: state.buildPiles.map((pile) => [...pile]),
    completedBuildPiles: state.completedBuildPiles.map((pile) => [...pile]),
    currentPlayerIndex: state.currentPlayerIndex,
    isGameOver: state.isGameOver,
  };
}

export function assertValidGameState(state: GameState): void {
  assertValidPlayerNames(state.players.map((player) => player.name));

  if (
    !Number.isInteger(state.currentPlayerIndex) ||
    state.currentPlayerIndex < 0 ||
    state.currentPlayerIndex >= state.players.length
  ) {
    throw new Error("Current player index is invalid");
  }
  if (state.buildPiles.length !== PILES_PER_GAME) {
    throw new Error("Game must have exactly 4 build piles");
  }
  if (typeof state.isGameOver !== "boolean") {
    throw new Error("Game-over status must be a boolean");
  }

  assertCardValues(state.deck);

  state.buildPiles.forEach((buildPile) => {
    if (buildPile.length > MAX_BUILD_PILE_SIZE) {
      throw new Error("Completed build piles must be resolved");
    }
    assertCardValues(buildPile);
    buildPile.forEach((cardValue, index) => {
      if (cardValue !== WILD_CARD && cardValue !== index + 1) {
        throw new Error("Build piles must follow the sequence from 1 to 12");
      }
    });
  });

  state.completedBuildPiles.forEach((completedBuildPile) => {
    if (completedBuildPile.length !== MAX_BUILD_PILE_SIZE + 1) {
      throw new Error(
        "Completed build piles must contain exactly 12 cards",
      );
    }
    assertCardValues(completedBuildPile);
    completedBuildPile.forEach((cardValue, index) => {
      if (cardValue !== WILD_CARD && cardValue !== index + 1) {
        throw new Error(
          "Completed build piles must follow the sequence from 1 to 12",
        );
      }
    });
  });

  state.players.forEach((player) => {
    if (player.discardPiles.length !== PILES_PER_GAME) {
      throw new Error("Each player must have exactly 4 discard piles");
    }
    if (player.cardsInHand.length > HAND_SIZE) {
      throw new Error("A player hand cannot contain more than 5 cards");
    }

    assertCardValues(player.cardsInHand);
    assertCardValues(player.stockPile);
    player.discardPiles.forEach(assertCardValues);
  });

  const currentPlayer = state.players[state.currentPlayerIndex]!;
  if (state.isGameOver) {
    if (currentPlayer.stockPile.length !== 0) {
      throw new Error("The winning player's stock pile must be empty");
    }
    if (
      state.players.some(
        (player, index) =>
          index !== state.currentPlayerIndex && player.stockPile.length === 0,
      )
    ) {
      throw new Error("Only the winning player's stock pile may be empty");
    }
  } else if (state.players.some((player) => player.stockPile.length === 0)) {
    throw new Error("A game with an empty stock pile must be over");
  }
}

function getOfficialStockPileSize(playerCount: number): number {
  return playerCount <= 4 ? 30 : 20;
}

function assertValidPlayerNames(playerNames: string[]): void {
  if (
    playerNames.length < MIN_PLAYERS ||
    playerNames.length > MAX_PLAYERS
  ) {
    throw new Error("Game requires between 2 and 6 players");
  }
  if (playerNames.some((name) => name.trim().length === 0)) {
    throw new Error("Player names must not be blank");
  }

  const normalizedNames = playerNames.map((name) => name.trim());
  if (new Set(normalizedNames).size !== normalizedNames.length) {
    throw new Error("Player names must be unique");
  }
}

function assertCardValues(cards: number[]): void {
  if (
    cards.some(
      (cardValue) =>
        !Number.isInteger(cardValue) ||
        cardValue < WILD_CARD ||
        cardValue > 12,
    )
  ) {
    throw new Error("Card values must be integers from 0 to 12");
  }
}
