export const WILD_CARD = 0;
export const WILD_CARDS_IN_DECK = 18;
export const GAME_DECK_SIZE = 12 * 12 + WILD_CARDS_IN_DECK; // 12 of each number from 1-12, and 18 wild cards cards = 162 cards

export function populateGameDeck(): number[] {
  const deck = new Array<number>(GAME_DECK_SIZE);

  for (let cardVal = 0; cardVal <= 12; cardVal++) {
    const maxCount = cardVal === WILD_CARD ? WILD_CARDS_IN_DECK : 12;
    for (let cardCount = 0; cardCount < maxCount; cardCount++) {
      let cardIndex = Math.floor(Math.random() * GAME_DECK_SIZE);
      while (deck[cardIndex] !== undefined) {
        cardIndex = Math.floor(Math.random() * GAME_DECK_SIZE);
      }
      deck[cardIndex] = cardVal;
    }
  }

  return deck;
}

export function dealCards(
  deck: number[],
  nbOfCards: number,
): { remainingDeck: number[]; dealtCards: number[] } {
  const dealtCards = new Array<number>(nbOfCards);
  const remainingDeck = deck.slice();

  if (nbOfCards > deck.length) {
    throw new Error(
      "Not enough cards in the deck to deal the requested number of cards",
    );
  }

  for (let i = 0; i < nbOfCards; i++) {
    const card = remainingDeck.pop()!;
    dealtCards[i] = card;
  }

  return { remainingDeck, dealtCards };
}

export function drawCards(
  deck: number[],
  cardsInHand: number[],
  nbOfCards: number,
): { remainingDeck: number[]; cardsInHand: number[] } {
  if (nbOfCards > deck.length) {
    throw new Error(
      "Not enough cards in the deck to draw the requested number of cards",
    );
  }

  const remainingDeck = deck.slice();
  const newCardsInHand = cardsInHand.slice();

  for (let i = 0; i < nbOfCards; i++) {
    const card = remainingDeck.pop()!;
    newCardsInHand.push(card);
  }

  return { remainingDeck, cardsInHand: newCardsInHand };
}

export function shuffleCardsBackIntoDeck(
  deck: number[],
  cards: number[],
): number[] {
  return [...deck, ...cards].sort(() => Math.random());
}
