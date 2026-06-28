import type { PlayCardSource } from "./types";

type CardPlayedEffect = {
  type: "cardPlayed";
  cardValue: number;
  source: PlayCardSource;
  destinationIndex: number;
};

type BuildPileResolvedEffect = {
  type: "buildPileResolved";
  pileIndex: number;
};

type CardDiscardedEffect = {
  type: "cardDiscarded";
  cardValue: number;
  pileIndex: number;
};

type CardsDrawnEffect = {
  type: "cardsDrawn";
  cardValues: number[];
};

export type Effect =
  | CardPlayedEffect
  | BuildPileResolvedEffect
  | CardDiscardedEffect
  | CardsDrawnEffect;
