import { describe, expect, test } from "bun:test";
import { shuffleCards } from "../shared/deck";

describe("shuffleCards", () => {
  test("uses injected randomness without mutating the input", () => {
    const cards = [1, 2, 3, 4];

    const shuffled = shuffleCards(cards, () => 0);

    expect(shuffled).toEqual([2, 3, 4, 1]);
    expect(shuffled.toSorted((left, right) => left - right)).toEqual(cards);
    expect(cards).toEqual([1, 2, 3, 4]);
  });
});
