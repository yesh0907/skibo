import type { CardInHandSource, PlayCardSource } from "./types";

type PlayCardCommand = {
  type: "playCard";
  cardValue: number;
  source: PlayCardSource;
  destinationIndex: number;
};

type DiscardCardCommand = {
  type: "discardCard";
  cardValue: number;
  source: CardInHandSource;
  discardPileIndex: number;
};

export type Command = PlayCardCommand | DiscardCardCommand;
