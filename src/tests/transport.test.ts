import { describe, expect, test } from "bun:test";

import {
  type ApiError,
  ApiErrorSchema,
  ClientWebSocketEnvelopeSchema,
  INITIAL_ROOM_REVISION,
  JoinRoomRequestSchema,
  PlayerViewSchema,
  PlayCommandRequestSchema,
  ServerWebSocketEnvelopeSchema,
  StartGameRequestSchema,
} from "../shared/transport";
import {
  finishedPlayerViewFixture,
  playingPlayerViewFixture,
  stalePlayerViewFixture,
  staleRoomEnvelopeFixture,
  waitingPlayerViewFixture,
} from "./fixtures/transport";

describe("transport contracts", () => {
  test("accepts waiting, playing, finished, and stale revision fixtures", () => {
    for (const fixture of [
      waitingPlayerViewFixture,
      playingPlayerViewFixture,
      finishedPlayerViewFixture,
      stalePlayerViewFixture,
    ]) {
      expect(PlayerViewSchema.parse(fixture)).toEqual(fixture);
    }
    expect(ServerWebSocketEnvelopeSchema.parse(staleRoomEnvelopeFixture)).toEqual(
      staleRoomEnvelopeFixture,
    );
  });

  test("pins a zero-based nonnegative room revision", () => {
    expect(INITIAL_ROOM_REVISION).toBe(0);
    expect(() =>
      PlayerViewSchema.parse({ ...waitingPlayerViewFixture, revision: -1 }),
    ).toThrow();
    expect(() =>
      PlayerViewSchema.parse({ ...waitingPlayerViewFixture, revision: 1.5 }),
    ).toThrow();
  });

  test("rejects status snapshots with contradictory terminal fields", () => {
    expect(() =>
      PlayerViewSchema.parse({
        ...finishedPlayerViewFixture,
        legalCommands: playingPlayerViewFixture.legalCommands,
      }),
    ).toThrow();
    expect(() =>
      PlayerViewSchema.parse({
        ...waitingPlayerViewFixture,
        currentPlayerName: "Alice",
      }),
    ).toThrow();
  });

  test("rejects views that expose private or inconsistent player data", () => {
    expect(() =>
      PlayerViewSchema.parse({
        ...playingPlayerViewFixture,
        players: playingPlayerViewFixture.players.map((player) =>
          player.name === "Bob" ? { ...player, cardsInHand: [7] } : player,
        ),
      }),
    ).toThrow();
    expect(() =>
      PlayerViewSchema.parse({
        ...playingPlayerViewFixture,
        viewerName: "Missing player",
      }),
    ).toThrow();
    expect(() =>
      PlayerViewSchema.parse({
        ...playingPlayerViewFixture,
        currentPlayerName: "Bob",
      }),
    ).toThrow();
    expect(() =>
      PlayerViewSchema.parse({
        ...finishedPlayerViewFixture,
        winnerName: "Missing player",
      }),
    ).toThrow();
    expect(() =>
      PlayerViewSchema.parse({
        ...playingPlayerViewFixture,
        players: playingPlayerViewFixture.players.map((player) =>
          player.name === "Alice" ? { ...player, handCount: 4 } : player,
        ),
      }),
    ).toThrow();
  });

  test("validates mutation requests at the transport boundary", () => {
    const legalCommand = playingPlayerViewFixture.legalCommands[0]!;

    expect(
      JoinRoomRequestSchema.parse({ playerName: "  Alice  " }),
    ).toEqual({ playerName: "Alice" });
    expect(
      StartGameRequestSchema.parse({ expectedRevision: 2, stockPileSize: 10 }),
    ).toEqual({ expectedRevision: 2, stockPileSize: 10 });
    expect(
      PlayCommandRequestSchema.parse({
        expectedRevision: 3,
        command: legalCommand,
      }),
    ).toEqual({
      expectedRevision: 3,
      command: legalCommand,
    });
  });

  test("keeps websocket commands out of the planned envelope union", () => {
    expect(
      ClientWebSocketEnvelopeSchema.parse({
        type: "room.subscribe",
        gameId: "game_contract_fixture",
        knownRevision: null,
      }),
    ).toEqual({
      type: "room.subscribe",
      gameId: "game_contract_fixture",
      knownRevision: null,
    });
    expect(() =>
      ClientWebSocketEnvelopeSchema.parse({
        type: "room.command",
        command: playingPlayerViewFixture.legalCommands[0],
      }),
    ).toThrow();
  });

  test("uses structured API errors with optional revision recovery data", () => {
    const error = {
      error: {
        code: "stale_revision",
        message: "The room changed before this command was applied",
        currentRevision: 4,
      },
    } satisfies ApiError;

    expect(ApiErrorSchema.parse(error)).toEqual(error);
  });
});
