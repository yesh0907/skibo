import { describe, expect, test } from "bun:test";

import { playingPlayerViewFixture } from "../tests/fixtures/transport";
import { commandForDrop, destinationKey, sameSource } from "./commands";
import { MOUSE_ACTIVATION_CONSTRAINT, TOUCH_ACTIVATION_CONSTRAINT } from "./dnd-config";

describe("authoritative command mapping", () => {
  const command = playingPlayerViewFixture.legalCommands[0]!;

  test("maps only an exact server-provided destination", () => {
    expect(commandForDrop([command], { type: "build", index: 0 })).toBe(command);
    expect(commandForDrop([command], { type: "build", index: 1 })).toBeNull();
    expect(commandForDrop([command], { type: "discard", index: 0 })).toBeNull();
  });

  test("treats cancel and outside-drop as a no-op", () => {
    expect(commandForDrop([command], { type: "build", index: 99 })).toBeNull();
  });

  test("compares indexed sources without conflating duplicate card values", () => {
    expect(sameSource({ type: "hand", index: 0 }, { type: "hand", index: 0 })).toBeTrue();
    expect(sameSource({ type: "hand", index: 0 }, { type: "hand", index: 1 })).toBeFalse();
    expect(destinationKey(command)).toBe("build-0");
  });

  test("preserves the legacy movement threshold for mouse and touch dragging", () => {
    expect(MOUSE_ACTIVATION_CONSTRAINT).toEqual({ distance: 6 });
    expect(TOUCH_ACTIVATION_CONSTRAINT).toEqual({ distance: 6 });
  });
});
