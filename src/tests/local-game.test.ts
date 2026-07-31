import { describe, expect, test } from "bun:test";
import { createGameState } from "../shared/game-state";
import { playLocalGame } from "../shared/local-game";

describe("playLocalGame", () => {
  test("lets the human choose a legal command and win", async () => {
    const state = createGameState(["You", "Bot"], 1);
    state.players[0]!.stockPile = [1];
    state.players[0]!.cardsInHand = [7];
    state.buildPiles = [[], [], [], []];

    const output: string[] = [];
    const result = await playLocalGame({
      initialState: state,
      humanPlayerIndex: 0,
      readLine: async () => "1",
      writeLine: (line) => output.push(line),
    });

    expect(result.status).toBe("won");
    expect(result.winnerName).toBe("You");
    expect(result.finalState.isGameOver).toBe(true);
    expect(output.join("\n")).toContain("Stock: 1 (1 card)");
    expect(output.join("\n")).toContain("Hand: [1] 7");
    expect(output.join("\n")).toContain("Discards: 1:-  2:-  3:-  4:-");
    expect(output.join("\n")).toContain("Opponents: Bot (1 stock)");
    expect(output.join("\n")).toContain("1. Play stock 1 onto build pile 1");
    expect(output.join("\n")).toContain("You win!");
  });

  test("re-prompts after invalid input and allows quitting", async () => {
    const inputs = ["not-a-number", "999", "q"];
    const output: string[] = [];

    const result = await playLocalGame({
      playerNames: ["You", "Bot"],
      stockPileSize: 5,
      readLine: async () => inputs.shift()!,
      writeLine: (line) => output.push(line),
    });

    expect(result.status).toBe("quit");
    expect(output.filter((line) => line === "Choose a command number or q to quit:")).toHaveLength(3);
    expect(output.join("\n")).toContain("Enter one of the listed command numbers.");
  });

  test("lets the bot finish its turn before returning control to the human", async () => {
    const state = createGameState(["You", "Bot"], 1);
    state.currentPlayerIndex = 1;
    state.players[1]!.cardsInHand = [1, 8];
    state.players[1]!.stockPile = [9];
    state.deck = [1, 2, 3, 4, 5];

    const output: string[] = [];
    const result = await playLocalGame({
      initialState: state,
      humanPlayerIndex: 0,
      readLine: async () => "q",
      writeLine: (line) => output.push(line),
    });

    expect(result.status).toBe("quit");
    expect(result.finalState.currentPlayerIndex).toBe(0);
    expect(output.join("\n")).toContain(
      "Bot: Play hand 1 1 onto build pile 1",
    );
    expect(output.join("\n")).toContain(
      "Bot: Discard hand 1 (8) onto discard pile 1",
    );
    expect(output.join("\n")).toContain("Turn: You");
  });

  test("rejects a malformed terminal starting snapshot", async () => {
    const state = createGameState(["You", "Bot"], 1);
    state.players[0]!.stockPile = [];
    state.isGameOver = true;
    state.buildPiles[0] = [2];

    expect(
      playLocalGame({
        initialState: state,
        readLine: async () => "q",
        writeLine: () => {},
      }),
    ).rejects.toThrow("Build piles must follow the sequence from 1 to 12");
  });
});
