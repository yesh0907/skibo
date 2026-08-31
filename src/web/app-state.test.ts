import { describe, expect, test } from "bun:test";

import { playingPlayerViewFixture, stalePlayerViewFixture, waitingPlayerViewFixture } from "../tests/fixtures/transport";
import { appReducer, initialAppState } from "./app-state";

describe("appReducer", () => {
  test("accepts the first snapshot and only strictly newer revisions", () => {
    const waiting = appReducer(initialAppState, { type: "viewReceived", view: waitingPlayerViewFixture });
    const playing = appReducer(waiting, { type: "viewReceived", view: playingPlayerViewFixture });
    const duplicate = appReducer(playing, { type: "viewReceived", view: { ...playingPlayerViewFixture } });
    const stale = appReducer(duplicate, { type: "viewReceived", view: stalePlayerViewFixture });

    expect(waiting.view?.revision).toBe(2);
    expect(playing.view?.revision).toBe(3);
    expect(duplicate.view).toBe(playing.view);
    expect(stale.view).toBe(playing.view);
  });

  test("retains the last valid view when a request fails", () => {
    const ready = appReducer(initialAppState, { type: "viewReceived", view: playingPlayerViewFixture });
    const pending = appReducer(ready, { type: "requestStarted", request: "command" });
    const failed = appReducer(pending, {
      type: "requestFailed",
      error: { error: { code: "room_conflict", message: "Move rejected" } },
    });

    expect(failed.view).toBe(playingPlayerViewFixture);
    expect(failed.pending).toBeNull();
    expect(failed.error?.error.code).toBe("room_conflict");
  });

  test("ignores duplicate live views without unlocking an HTTP mutation", () => {
    const ready = appReducer(initialAppState, {
      type: "viewReceived",
      view: playingPlayerViewFixture,
    });
    const pending = appReducer(ready, {
      type: "requestStarted",
      request: "command",
    });
    const duplicate = appReducer(pending, {
      type: "liveViewReceived",
      view: { ...playingPlayerViewFixture },
    });
    const stale = appReducer(duplicate, {
      type: "liveViewReceived",
      view: stalePlayerViewFixture,
    });
    const newer = appReducer(stale, {
      type: "liveViewReceived",
      view: { ...playingPlayerViewFixture, revision: 4 },
    });

    expect(duplicate).toBe(pending);
    expect(stale).toBe(pending);
    expect(newer.view?.revision).toBe(4);
    expect(newer.pending).toBe("command");
  });
});
