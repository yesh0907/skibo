import type { CardInHandSource, PlayCardSource } from "./types";

export type PlayCardCommand = {
  type: "playCard";
  cardValue: number;
  source: PlayCardSource;
  destinationIndex: number;
};

export type DiscardCardCommand = {
  type: "discardCard";
  cardValue: number;
  source: CardInHandSource;
  discardPileIndex: number;
};

export type Command = PlayCardCommand | DiscardCardCommand;
