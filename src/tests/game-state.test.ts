import { describe, expect, test } from "bun:test";
import {
  assertValidGameState,
  copyGameState,
  createGameState,
} from "../shared/game-state";
import { WILD_CARD } from "../shared/deck";

describe("createGameState", () => {
  test.each([
    { playerCount: 2, expectedStockSize: 30 },
    { playerCount: 4, expectedStockSize: 30 },
    { playerCount: 5, expectedStockSize: 20 },
    { playerCount: 6, expectedStockSize: 20 },
  ])(
    "deals official stock piles for $playerCount players",
    ({ playerCount, expectedStockSize }) => {
      const names = Array.from(
        { length: playerCount },
        (_, index) => `player${index + 1}`,
      );

      const state = createGameState(names);

      expect(state.players.every(
        (player) => player.stockPile.length === expectedStockSize,
      )).toBe(true);
      expect(state.players.every(
        (player) => player.cardsInHand.length === 5,
      )).toBe(true);
      expect(() => assertValidGameState(state)).not.toThrow();
    },
  );

  test.each([
    { names: ["solo"], message: "Game requires between 2 and 6 players" },
    {
      names: ["1", "2", "3", "4", "5", "6", "7"],
      message: "Game requires between 2 and 6 players",
    },
    {
      names: ["player1", "   "],
      message: "Player names must not be blank",
    },
    {
      names: ["player1", "player1"],
      message: "Player names must be unique",
    },
  ])("rejects invalid player names: $message", ({ names, message }) => {
    expect(() => createGameState([...names])).toThrow(message);
  });

  test.each([0, -1, 1.5, Number.NaN])(
    "rejects invalid custom stock pile size %p",
    (stockPileSize) => {
      expect(() =>
        createGameState(["player1", "player2"], stockPileSize),
      ).toThrow("Stock pile size must be a positive integer");
    },
  );

  test("rejects a custom setup that cannot be dealt from one deck", () => {
    expect(() =>
      createGameState(
        ["player1", "player2", "player3", "player4", "player5", "player6"],
        23,
      ),
    ).toThrow("Not enough cards to deal the requested game setup");
  });

  test("supports an explicit short-game stock size", () => {
    const state = createGameState(["player1", "player2"], 10);

    expect(state.players.map((player) => player.stockPile.length)).toEqual([
      10, 10,
    ]);
  });
});

describe("assertValidGameState", () => {
  test("accepts wild cards in canonical build-pile positions", () => {
    const state = createGameState(["player1", "player2"], 10);
    state.buildPiles[0] = [1, WILD_CARD, 3];

    expect(() => assertValidGameState(state)).not.toThrow();
  });

  test.each([
    {
      mutate: (state: ReturnType<typeof createGameState>) => {
        state.currentPlayerIndex = 2;
      },
      message: "Current player index is invalid",
    },
    {
      mutate: (state: ReturnType<typeof createGameState>) => {
        state.buildPiles.pop();
      },
      message: "Game must have exactly 4 build piles",
    },
    {
      mutate: (state: ReturnType<typeof createGameState>) => {
        state.players[0]!.discardPiles.pop();
      },
      message: "Each player must have exactly 4 discard piles",
    },
    {
      mutate: (state: ReturnType<typeof createGameState>) => {
        state.players[0]!.cardsInHand.push(1);
      },
      message: "A player hand cannot contain more than 5 cards",
    },
    {
      mutate: (state: ReturnType<typeof createGameState>) => {
        state.deck[0] = 13;
      },
      message: "Card values must be integers from 0 to 12",
    },
    {
      mutate: (state: ReturnType<typeof createGameState>) => {
        state.buildPiles[0] = [1, 3];
      },
      message: "Build piles must follow the sequence from 1 to 12",
    },
    {
      mutate: (state: ReturnType<typeof createGameState>) => {
        state.buildPiles[0] = [
          1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
        ];
      },
      message: "Completed build piles must be resolved",
    },
  ])("rejects malformed state: $message", ({ mutate, message }) => {
    const state = createGameState(["player1", "player2"], 10);
    mutate(state);

    expect(() => assertValidGameState(state)).toThrow(message);
  });

  test("rejects a nonterminal state with an empty stock pile", () => {
    const state = createGameState(["player1", "player2"], 10);
    state.players[0]!.stockPile = [];

    expect(() => assertValidGameState(state)).toThrow(
      "A game with an empty stock pile must be over",
    );
  });

  test("rejects a terminal state whose current player still has stock cards", () => {
    const state = createGameState(["player1", "player2"], 10);
    state.isGameOver = true;

    expect(() => assertValidGameState(state)).toThrow(
      "The winning player's stock pile must be empty",
    );
  });

  test("rejects a terminal state with another empty stock pile", () => {
    const state = createGameState(["player1", "player2"], 10);
    state.players[0]!.stockPile = [];
    state.players[1]!.stockPile = [];
    state.isGameOver = true;

    expect(() => assertValidGameState(state)).toThrow(
      "Only the winning player's stock pile may be empty",
    );
  });

  test("does not mutate the state while validating it", () => {
    const state = createGameState(["player1", "player2"], 10);
    const original = copyGameState(state);

    assertValidGameState(state);

    expect(state).toEqual(original);
  });
});
