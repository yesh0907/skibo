import type {
  PlayerView,
  ServerWebSocketEnvelope,
} from "../../shared/transport";

const waitingPlayers = [
  {
    name: "Alice",
    cardsInHand: null,
    handCount: 0,
    stockTopCard: null,
    stockCount: 0,
    discardPiles: [[], [], [], []],
  },
  {
    name: "Bob",
    cardsInHand: null,
    handCount: 0,
    stockTopCard: null,
    stockCount: 0,
    discardPiles: [[], [], [], []],
  },
] satisfies PlayerView["players"];

export const waitingPlayerViewFixture = {
  gameId: "game_contract_fixture",
  revision: 2,
  status: "waiting",
  viewerName: "Alice",
  players: waitingPlayers,
  currentPlayerName: null,
  winnerName: null,
  isYourTurn: false,
  deckCount: 0,
  buildPiles: [[], [], [], []],
  completedBuildPileCount: 0,
  legalCommands: [],
} satisfies PlayerView;

export const playingPlayerViewFixture = {
  ...waitingPlayerViewFixture,
  revision: 3,
  status: "playing",
  players: [
    {
      name: "Alice",
      cardsInHand: [1, 5, 8, 10, 0],
      handCount: 5,
      stockTopCard: 2,
      stockCount: 5,
      discardPiles: [[], [], [], []],
    },
    {
      name: "Bob",
      cardsInHand: null,
      handCount: 5,
      stockTopCard: 7,
      stockCount: 5,
      discardPiles: [[], [], [], []],
    },
  ],
  currentPlayerName: "Alice",
  winnerName: null,
  isYourTurn: true,
  deckCount: 142,
  legalCommands: [
    {
      type: "playCard",
      cardValue: 1,
      source: { type: "hand", index: 0 },
      destinationIndex: 0,
    },
  ],
} satisfies PlayerView;

export const finishedPlayerViewFixture = {
  ...playingPlayerViewFixture,
  revision: 9,
  status: "finished",
  players: playingPlayerViewFixture.players.map((player) =>
    player.name === "Alice"
      ? { ...player, stockTopCard: null, stockCount: 0 }
      : player,
  ),
  currentPlayerName: "Alice",
  winnerName: "Alice",
  isYourTurn: false,
  legalCommands: [],
} satisfies PlayerView;

/** A valid but older snapshot used to exercise out-of-order delivery later. */
export const stalePlayerViewFixture = {
  ...playingPlayerViewFixture,
  revision: 2,
} satisfies PlayerView;

export const playingRoomEnvelopeFixture = {
  version: 1,
  type: "room.view",
  view: playingPlayerViewFixture,
} satisfies ServerWebSocketEnvelope;
