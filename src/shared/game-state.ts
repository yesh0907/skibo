import { dealCards, populateGameDeck } from "./deck";
import {
  copyPlayerState,
  createPlayerState,
  type PlayerState,
} from "./player-state";

export interface GameState {
  players: PlayerState[];
  deck: number[];
  buildPiles: number[][];
  currentPlayerIndex: number;
  isGameOver: boolean;
}

const DEFAULT_STOCK_PILE_SIZE = 15;

export function createGameState(
  playerNames: string[],
  stockPileSize: number = DEFAULT_STOCK_PILE_SIZE,
): GameState {
  let deck = populateGameDeck();
  const players: PlayerState[] = playerNames.map((name) => {
    let { remainingDeck: deckAfterHand, dealtCards: cardsInHand } = dealCards(
      deck,
      5,
    );
    let { remainingDeck: deckAfterStock, dealtCards: stockPile } = dealCards(
      deckAfterHand,
      stockPileSize,
    );
    deck = deckAfterStock;
    return createPlayerState({ name, cardsInHand, stockPile });
  });

  return {
    players,
    deck,
    buildPiles: new Array(4).fill(null).map(() => []),
    currentPlayerIndex: 0,
    isGameOver: false,
  };
}

export function copyGameState(state: GameState): GameState {
  return {
    players: state.players.map(copyPlayerState),
    deck: [...state.deck],
    buildPiles: state.buildPiles.map((pile) => [...pile]),
    currentPlayerIndex: state.currentPlayerIndex,
    isGameOver: state.isGameOver,
  };
}
