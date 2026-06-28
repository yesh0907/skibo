import { describe, expect, test } from "bun:test";
import { copyGameState, createGameState } from "../shared/game-state";
import type { Command } from "../shared/command";
import { resolveCommand } from "../shared/game-engine";
import { WILD_CARD } from "../shared/deck";

describe("GameEngine", () => {
  test("playing a card from the cards in hand", () => {
    const gameState = createGameState(["player1", "player2"]);
    gameState.players[0]!.cardsInHand = [5, 1, 2, 12, WILD_CARD];
    gameState.players[1]!.cardsInHand = [9, 10, 3];

    const gameStateCopy = copyGameState(gameState);
    const playCardCommand: Command = {
      type: "playCard",
      cardValue: WILD_CARD,
      source: {
        type: "hand",
        index: 4,
      },
      destinationIndex: 0,
    };
    const {
      nextState: nextState,
      effects,
      availableActions,
    } = resolveCommand(playCardCommand, gameState);

    expect(gameState).toEqual(gameStateCopy);
    expect(nextState.buildPiles[0]).toEqual([WILD_CARD]);
    expect(nextState.players[0]!.cardsInHand).toEqual([5, 1, 2, 12]);
    expect(effects).toEqual([
      {
        type: "cardPlayed",
        source: { type: "hand", index: 4 },
        cardValue: WILD_CARD,
        destinationIndex: 0,
      },
    ]);
    expect(availableActions).toEqual(["playCard", "discardCard"]);
  });

  test("playing a card from the top of a discard pile", () => {
    const gameState = createGameState(["player1", "player2"]);
    gameState.players[0]!.discardPiles = [[], [4, 5], [], []];
    gameState.buildPiles[0] = [1, 2, 3, 4];

    const playCardCommand: Command = {
      type: "playCard",
      cardValue: 5,
      source: {
        type: "discardPile",
        index: 1,
      },
      destinationIndex: 0,
    };

    const { nextState, effects, availableActions } = resolveCommand(
      playCardCommand,
      gameState,
    );

    expect(nextState.players[0]!.discardPiles[1]).toEqual([4]);
    expect(nextState.buildPiles[0]).toEqual([1, 2, 3, 4, 5]);
    expect(effects).toEqual([
      {
        type: "cardPlayed",
        source: { type: "discardPile", index: 1 },
        cardValue: 5,
        destinationIndex: 0,
      },
    ]);
    expect(availableActions).toEqual(["playCard", "discardCard"]);
  });

  test("playing the last stock pile card ends the game", () => {
    const gameState = createGameState(["player1", "player2"]);
    gameState.players[0]!.stockPile = [WILD_CARD];

    const playCardCommand: Command = {
      type: "playCard",
      cardValue: WILD_CARD,
      source: {
        type: "stockPile",
      },
      destinationIndex: 0,
    };

    const { nextState, effects, availableActions } = resolveCommand(
      playCardCommand,
      gameState,
    );

    expect(nextState.players[0]!.stockPile).toEqual([]);
    expect(nextState.isGameOver).toBe(true);
    expect(effects).toEqual([
      {
        type: "cardPlayed",
        source: { type: "stockPile" },
        cardValue: WILD_CARD,
        destinationIndex: 0,
      },
    ]);
    expect(availableActions).toEqual([]);
  });

  test("playing the last hand card refills from the deck", () => {
    const gameState = createGameState(["player1", "player2"]);
    gameState.players[0]!.cardsInHand = [WILD_CARD];
    gameState.deck = [8, 9, 10, 11, 12];

    const playCardCommand: Command = {
      type: "playCard",
      cardValue: WILD_CARD,
      source: {
        type: "hand",
        index: 0,
      },
      destinationIndex: 0,
    };

    const { nextState, effects } = resolveCommand(playCardCommand, gameState);

    expect(nextState.players[0]!.cardsInHand).toEqual([12, 11, 10, 9, 8]);
    expect(nextState.deck).toEqual([]);
    expect(effects).toEqual([
      {
        type: "cardPlayed",
        source: { type: "hand", index: 0 },
        cardValue: WILD_CARD,
        destinationIndex: 0,
      },
      {
        type: "cardsDrawn",
        cardValues: [12, 11, 10, 9, 8],
      },
    ]);
  });

  test("completing a build pile clears it and shuffles it back into the deck", () => {
    const gameState = createGameState(["player1", "player2"]);
    gameState.players[0]!.cardsInHand = [12];
    gameState.buildPiles[2] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    gameState.deck = [];

    const playCardCommand: Command = {
      type: "playCard",
      cardValue: 12,
      source: {
        type: "hand",
        index: 0,
      },
      destinationIndex: 2,
    };

    const { nextState, effects } = resolveCommand(playCardCommand, gameState);

    expect(nextState.buildPiles[2]).toEqual([]);
    expect(nextState.deck).toHaveLength(7);
    expect(nextState.players[0]!.cardsInHand).toHaveLength(5);
    expect(effects[0]).toEqual({
      type: "cardPlayed",
      source: { type: "hand", index: 0 },
      cardValue: 12,
      destinationIndex: 2,
    });
    expect(effects[1]).toEqual({
      type: "buildPileResolved",
      pileIndex: 2,
    });
    expect(effects[2]).toEqual({
      type: "cardsDrawn",
      cardValues: expect.any(Array),
    });
    expect((effects[2] as { cardValues: number[] }).cardValues).toHaveLength(5);
  });

  test("discarding a card from cards in hand", () => {
    const gameState = createGameState(["player1", "player2"]);
    gameState.players[0]!.cardsInHand = [5, 3, 2, 12, 7];
    gameState.players[1]!.cardsInHand = [9, 10, 3, 11];

    const gameStateCopy = copyGameState(gameState);
    const discardCardCommand: Command = {
      type: "discardCard",
      cardValue: 7,
      source: {
        type: "hand",
        index: 4,
      },
      discardPileIndex: 0,
    };
    const {
      nextState: nextState,
      effects,
      availableActions,
    } = resolveCommand(discardCardCommand, gameState);

    expect(gameState).toEqual(gameStateCopy);
    expect(nextState.buildPiles).toEqual(gameState.buildPiles);
    expect(nextState.currentPlayerIndex).toEqual(
      gameState.currentPlayerIndex + 1,
    );
    expect(effects.length).toBe(2);
    expect(effects[0]).toEqual({
      type: "cardDiscarded",
      cardValue: 7,
      pileIndex: 0,
    });
    expect(effects[1]?.type).toEqual("cardsDrawn");
    expect(
      availableActions,
      "available actions for current player should include playCard and discardCard",
    ).toEqual(["playCard", "discardCard"]);

    const currPlayer = nextState.players[nextState.currentPlayerIndex]!;
    expect(
      currPlayer.cardsInHand.length,
      "current player should have 5 cards in hand",
    ).toEqual(5);

    const prevPlayer = nextState.players[gameState.currentPlayerIndex]!;
    expect(
      prevPlayer.cardsInHand.length,
      "previous player should have 4 cards in hand",
    ).toEqual(4);
    expect(
      prevPlayer.discardPiles[0],
      "previous player discard pile should have the card that was discarded",
    ).toEqual([7]);
  });

  test("discarding from the last player wraps turn order back to the first player", () => {
    const gameState = createGameState(["player1", "player2"]);
    gameState.currentPlayerIndex = 1;
    gameState.players[1]!.cardsInHand = [4, 6, 8, 10, 12];
    gameState.players[0]!.cardsInHand = [1, 2, 3, 4];
    gameState.deck = [7];

    const discardCardCommand: Command = {
      type: "discardCard",
      cardValue: 12,
      source: {
        type: "hand",
        index: 4,
      },
      discardPileIndex: 3,
    };

    const { nextState, effects } = resolveCommand(discardCardCommand, gameState);

    expect(nextState.currentPlayerIndex).toBe(0);
    expect(nextState.players[0]!.cardsInHand).toEqual([1, 2, 3, 4, 7]);
    expect(effects).toEqual([
      {
        type: "cardDiscarded",
        cardValue: 12,
        pileIndex: 3,
      },
      {
        type: "cardsDrawn",
        cardValues: [7],
      },
    ]);
  });

  test("rejects playing a non-one card onto an empty build pile", () => {
    const gameState = createGameState(["player1", "player2"]);
    gameState.players[0]!.cardsInHand = [5];

    const playCardCommand: Command = {
      type: "playCard",
      cardValue: 5,
      source: {
        type: "hand",
        index: 0,
      },
      destinationIndex: 0,
    };

    expect(() => resolveCommand(playCardCommand, gameState)).toThrow(
      "First card played to a build pile must be 1",
    );
  });

  test("a wild card keeps the build pile sequence playable for the next numeric card", () => {
    const gameState = createGameState(["player1", "player2"]);
    gameState.players[0]!.cardsInHand = [WILD_CARD, 6];
    gameState.buildPiles[0] = [1, 2, 3, 4];

    const playWildCardCommand: Command = {
      type: "playCard",
      cardValue: WILD_CARD,
      source: {
        type: "hand",
        index: 0,
      },
      destinationIndex: 0,
    };

    const { nextState: afterWildState } = resolveCommand(
      playWildCardCommand,
      gameState,
    );

    const playNextNumericCardCommand: Command = {
      type: "playCard",
      cardValue: 6,
      source: {
        type: "hand",
        index: 0,
      },
      destinationIndex: 0,
    };

    const { nextState } = resolveCommand(
      playNextNumericCardCommand,
      afterWildState,
    );

    expect(nextState.buildPiles[0]).toHaveLength(6);
    expect(nextState.buildPiles[0]?.at(-1)).toBe(6);
  });

  test("rejects discarding to an invalid discard pile index", () => {
    const gameState = createGameState(["player1", "player2"]);
    gameState.players[0]!.cardsInHand = [5, 3, 2, 12, 7];

    const discardCardCommand: Command = {
      type: "discardCard",
      cardValue: 7,
      source: {
        type: "hand",
        index: 4,
      },
      discardPileIndex: 4,
    };

    expect(() => resolveCommand(discardCardCommand, gameState)).toThrow(
      "Invalid discard pile index",
    );
  });

  test("refilling a hand can draw from a resolved build pile when the deck is short", () => {
    const gameState = createGameState(["player1", "player2"]);
    gameState.players[0]!.cardsInHand = [12];
    gameState.buildPiles[1] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    gameState.deck = [8, 9];

    const playCardCommand: Command = {
      type: "playCard",
      cardValue: 12,
      source: {
        type: "hand",
        index: 0,
      },
      destinationIndex: 1,
    };

    const { nextState, effects } = resolveCommand(playCardCommand, gameState);

    expect(nextState.buildPiles[1]).toEqual([]);
    expect(nextState.players[0]!.cardsInHand).toHaveLength(5);
    expect(effects).toEqual([
      {
        type: "cardPlayed",
        source: { type: "hand", index: 0 },
        cardValue: 12,
        destinationIndex: 1,
      },
      {
        type: "buildPileResolved",
        pileIndex: 1,
      },
      {
        type: "cardsDrawn",
        cardValues: expect.any(Array),
      },
    ]);
    expect((effects[2] as { cardValues: number[] }).cardValues).toHaveLength(5);
  });

  test("rejects playing from an invalid discard pile index", () => {
    const gameState = createGameState(["player1", "player2"]);
    gameState.players[0]!.discardPiles = [[], [], [], []];

    const playCardCommand: Command = {
      type: "playCard",
      cardValue: 5,
      source: {
        type: "discardPile",
        index: 4,
      },
      destinationIndex: 0,
    };

    expect(() => resolveCommand(playCardCommand, gameState)).toThrow(
      "Invalid discard pile index",
    );
  });

  test("rejects playing to an invalid build pile index", () => {
    const gameState = createGameState(["player1", "player2"]);
    gameState.players[0]!.cardsInHand = [WILD_CARD];

    const playCardCommand: Command = {
      type: "playCard",
      cardValue: WILD_CARD,
      source: {
        type: "hand",
        index: 0,
      },
      destinationIndex: 4,
    };

    expect(() => resolveCommand(playCardCommand, gameState)).toThrow(
      "Invalid build pile index",
    );
  });

  test("rejects playing from an empty stock pile", () => {
    const gameState = createGameState(["player1", "player2"]);
    gameState.players[0]!.stockPile = [];

    const playCardCommand: Command = {
      type: "playCard",
      cardValue: WILD_CARD,
      source: {
        type: "stockPile",
      },
      destinationIndex: 0,
    };

    expect(() => resolveCommand(playCardCommand, gameState)).toThrow(
      "Stock pile top card must match card played",
    );
  });

  test("a wild card that starts an empty build pile lets the next player continue with 2", () => {
    const gameState = createGameState(["player1", "player2"]);
    gameState.players[0]!.cardsInHand = [WILD_CARD, 2];

    const playWildCardCommand: Command = {
      type: "playCard",
      cardValue: WILD_CARD,
      source: {
        type: "hand",
        index: 0,
      },
      destinationIndex: 0,
    };

    const { nextState: afterWildState } = resolveCommand(
      playWildCardCommand,
      gameState,
    );

    const playTwoCommand: Command = {
      type: "playCard",
      cardValue: 2,
      source: {
        type: "hand",
        index: 0,
      },
      destinationIndex: 0,
    };

    const { nextState } = resolveCommand(playTwoCommand, afterWildState);

    expect(nextState.buildPiles[0]).toEqual([WILD_CARD, 2]);
  });
});
