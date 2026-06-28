export type PlayerAction = "playCard" | "discardCard";

export interface PlayerState {
  name: string;
  cardsInHand: number[];
  discardPiles: number[][];
  stockPile: number[];
}

export function createPlayerState({
  name,
  cardsInHand,
  stockPile,
}: Omit<PlayerState, "discardPiles">): PlayerState {
  return {
    name,
    cardsInHand,
    discardPiles: new Array(4).fill(null).map(() => []),
    stockPile,
  };
}

export function copyPlayerState(state: PlayerState): PlayerState {
  return {
    name: state.name,
    cardsInHand: [...state.cardsInHand],
    discardPiles: state.discardPiles.map((pile) => [...pile]),
    stockPile: [...state.stockPile],
  };
}
