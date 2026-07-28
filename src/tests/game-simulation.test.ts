import { describe, expect, test } from "bun:test";
import {
  createSeededRandom,
  simulateGame,
} from "../shared/game-simulation";

describe("simulateGame", () => {
  test("plays a deterministic short game through the public engine", () => {
    const result = simulateGame({
      playerNames: ["Ada", "Grace"],
      stockPileSize: 5,
      random: createSeededRandom(42),
      maxCommands: 10_000,
    });

    expect(result.status).toBe("won");
    expect(result.winnerName).toBeDefined();
    expect(result.finalState.isGameOver).toBe(true);
    expect(result.commandCount).toBeGreaterThan(0);
    expect(result.turnCount).toBeGreaterThan(0);
    expect(result.commandCount).toBeLessThanOrEqual(10_000);
  });

  test("returns a diagnostic result when the command limit is reached", () => {
    const result = simulateGame({
      playerNames: ["Ada", "Grace"],
      stockPileSize: 5,
      random: createSeededRandom(42),
      maxCommands: 1,
    });

    expect(result.status).toBe("commandLimitReached");
    expect(result.winnerName).toBeUndefined();
    expect(result.commandCount).toBe(1);
    expect(result.finalState.isGameOver).toBe(false);
  });

  test("returns a diagnostic result when a valid game has no legal command", () => {
    const result = simulateGame({
      playerNames: ["Ada", "Grace", "Linus", "Margaret"],
      stockPileSize: 30,
      random: createSeededRandom(42),
      maxCommands: 10_000,
    });

    expect(result.status).toBe("noLegalCommand");
    expect(result.winnerName).toBeUndefined();
    expect(result.finalState.isGameOver).toBe(false);
  });

  test("seeded randomness reproduces the same simulation", () => {
    const run = () =>
      simulateGame({
        playerNames: ["Ada", "Grace"],
        stockPileSize: 5,
        random: createSeededRandom(7),
        maxCommands: 10_000,
      });

    const first = run();
    const second = run();

    expect(second).toEqual(first);
  });
});
