export type CardInHandSource = {
  type: "hand";
  index: number;
};

type DiscardPileSource = {
  type: "discardPile";
  index: number;
};

type StockPileSource = {
  type: "stockPile";
};

export type PlayCardSource =
  | CardInHandSource
  | DiscardPileSource
  | StockPileSource;
