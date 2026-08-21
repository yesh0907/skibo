import { z } from "zod";

import type { Command } from "./command";
import type { JoinRoomRequest as LegacyJoinRoomRequest } from "./room-state";

export const INITIAL_ROOM_REVISION = 0;

export const RoomRevisionSchema = z.number().int().nonnegative();
export type RoomRevision = z.infer<typeof RoomRevisionSchema>;

export const RoomStatusSchema = z.enum(["waiting", "playing", "finished"]);
export type TransportRoomStatus = z.infer<typeof RoomStatusSchema>;

const GameIdSchema = z.string().min(1);
const PlayerNameSchema = z.string().trim().min(1).max(32);
const CardValueSchema = z.number().int().min(0).max(12);
const PileIndexSchema = z.number().int().nonnegative();

const CardInHandSourceSchema = z
  .object({
    type: z.literal("hand"),
    index: PileIndexSchema,
  })
  .strict();

const PlayCardSourceSchema = z.discriminatedUnion("type", [
  CardInHandSourceSchema,
  z.object({ type: z.literal("discardPile"), index: PileIndexSchema }).strict(),
  z.object({ type: z.literal("stockPile") }).strict(),
]);

export const CommandSchema: z.ZodType<Command> = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("playCard"),
      cardValue: CardValueSchema,
      source: PlayCardSourceSchema,
      destinationIndex: PileIndexSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("discardCard"),
      cardValue: CardValueSchema,
      source: CardInHandSourceSchema,
      discardPileIndex: PileIndexSchema,
    })
    .strict(),
]);

export type TransportCommand = z.infer<typeof CommandSchema>;

export const PlayerGameViewSchema = z
  .object({
    name: PlayerNameSchema,
    cardsInHand: z.array(CardValueSchema).max(5).nullable(),
    handCount: z.number().int().nonnegative().max(5),
    stockTopCard: CardValueSchema.nullable(),
    stockCount: z.number().int().nonnegative(),
    discardPiles: z.array(z.array(CardValueSchema)).length(4),
  })
  .strict();

const PlayerViewBaseSchema = z.object({
  gameId: GameIdSchema,
  revision: RoomRevisionSchema,
  viewerName: PlayerNameSchema,
  players: z.array(PlayerGameViewSchema).min(1).max(6),
  deckCount: z.number().int().nonnegative(),
  buildPiles: z.array(z.array(CardValueSchema)).length(4),
  completedBuildPileCount: z.number().int().nonnegative(),
  legalCommands: z.array(CommandSchema),
});

const WaitingPlayerViewSchema = PlayerViewBaseSchema.extend({
  status: z.literal("waiting"),
  currentPlayerName: z.null(),
  winnerName: z.null(),
  isYourTurn: z.literal(false),
}).strict();

const PlayingPlayerViewSchema = PlayerViewBaseSchema.extend({
  status: z.literal("playing"),
  currentPlayerName: PlayerNameSchema,
  winnerName: z.null(),
  isYourTurn: z.boolean(),
}).strict();

const FinishedPlayerViewSchema = PlayerViewBaseSchema.extend({
  status: z.literal("finished"),
  currentPlayerName: PlayerNameSchema,
  winnerName: PlayerNameSchema,
  isYourTurn: z.literal(false),
  legalCommands: z.array(CommandSchema).length(0),
}).strict();

/** The player-safe, revisioned room snapshot used by the React transport. */
export const PlayerViewSchema = z
  .discriminatedUnion("status", [
    WaitingPlayerViewSchema,
    PlayingPlayerViewSchema,
    FinishedPlayerViewSchema,
  ])
  .superRefine((view, context) => {
    const playerNames = view.players.map((player) => player.name);
    if (new Set(playerNames).size !== playerNames.length) {
      context.addIssue({
        code: "custom",
        message: "Player names must be unique",
        path: ["players"],
      });
    }

    const viewer = view.players.find(
      (player) => player.name === view.viewerName,
    );
    if (viewer === undefined) {
      context.addIssue({
        code: "custom",
        message: "The viewer must be in the player roster",
        path: ["viewerName"],
      });
    }

    view.players.forEach((player, index) => {
      const maySeeHand = player.name === view.viewerName;
      if (!maySeeHand && player.cardsInHand !== null) {
        context.addIssue({
          code: "custom",
          message: "Opponent hands must remain private",
          path: ["players", index, "cardsInHand"],
        });
      }
      if (
        player.cardsInHand !== null &&
        player.cardsInHand.length !== player.handCount
      ) {
        context.addIssue({
          code: "custom",
          message: "Visible hand length must equal handCount",
          path: ["players", index, "handCount"],
        });
      }
      if (
        (player.stockCount === 0) !== (player.stockTopCard === null)
      ) {
        context.addIssue({
          code: "custom",
          message: "stockTopCard must reflect whether the stock is empty",
          path: ["players", index, "stockTopCard"],
        });
      }
    });

    if (view.status !== "waiting" && viewer?.cardsInHand === null) {
      context.addIssue({
        code: "custom",
        message: "A playing viewer must receive their own hand",
        path: ["players"],
      });
    }
    if (
      view.currentPlayerName !== null &&
      !playerNames.includes(view.currentPlayerName)
    ) {
      context.addIssue({
        code: "custom",
        message: "The current player must be in the roster",
        path: ["currentPlayerName"],
      });
    }
    if (view.winnerName !== null && !playerNames.includes(view.winnerName)) {
      context.addIssue({
        code: "custom",
        message: "The winner must be in the roster",
        path: ["winnerName"],
      });
    }
    if (
      view.status === "finished" &&
      view.currentPlayerName !== view.winnerName
    ) {
      context.addIssue({
        code: "custom",
        message: "The finished room current player must be the winner",
        path: ["winnerName"],
      });
    }
    if (view.status === "finished") {
      const winner = view.players.find(
        (player) => player.name === view.winnerName,
      );
      if (winner !== undefined && winner.stockCount !== 0) {
        context.addIssue({
          code: "custom",
          message: "The winner's stock must be empty",
          path: ["players"],
        });
      }
    }
    if (
      view.status === "playing" &&
      view.isYourTurn !== (view.currentPlayerName === view.viewerName)
    ) {
      context.addIssue({
        code: "custom",
        message: "isYourTurn must agree with the current player",
        path: ["isYourTurn"],
      });
    }
    if (!view.isYourTurn && view.legalCommands.length > 0) {
      context.addIssue({
        code: "custom",
        message: "Only the current viewer may receive legal commands",
        path: ["legalCommands"],
      });
    }
  });
export type PlayerView = z.infer<typeof PlayerViewSchema>;

export const ApiErrorCodeSchema = z.enum([
  "invalid_request",
  "unauthorized",
  "not_found",
  "room_conflict",
  "stale_revision",
  "internal_error",
]);

export const ApiErrorSchema = z
  .object({
    error: z
      .object({
        code: ApiErrorCodeSchema,
        message: z.string().min(1),
        currentRevision: RoomRevisionSchema.optional(),
      })
      .strict(),
  })
  .strict();
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const CreateGameRequestSchema = z.object({}).strict();
export const JoinRoomRequestSchema: z.ZodType<LegacyJoinRoomRequest> = z
  .object({
    playerName: PlayerNameSchema,
  })
  .strict();
export const StartGameRequestSchema = z
  .object({
    expectedRevision: RoomRevisionSchema,
    stockPileSize: z.number().int().positive().optional(),
  })
  .strict();
export const PlayCommandRequestSchema = z
  .object({
    expectedRevision: RoomRevisionSchema,
    command: CommandSchema,
  })
  .strict();
export const LeaveRoomRequestSchema = z
  .object({
    expectedRevision: RoomRevisionSchema,
  })
  .strict();
export const LeaveRoomResponseSchema = z
  .object({
    revision: RoomRevisionSchema,
  })
  .strict();

export type CreateGameRequest = z.infer<typeof CreateGameRequestSchema>;
export type JoinRoomRequest = z.infer<typeof JoinRoomRequestSchema>;
export type RevisionedStartGameRequest = z.infer<
  typeof StartGameRequestSchema
>;
export type RevisionedPlayCommandRequest = z.infer<
  typeof PlayCommandRequestSchema
>;
export type RevisionedLeaveRoomRequest = z.infer<
  typeof LeaveRoomRequestSchema
>;
export type LeaveRoomResponse = z.infer<typeof LeaveRoomResponseSchema>;

/** View-only WebSocket delivery. Gameplay commands continue to use HTTP. */
export const ServerWebSocketEnvelopeSchema = z
  .object({
    version: z.literal(1),
    type: z.literal("room.view"),
    view: PlayerViewSchema,
  })
  .strict();

export type ServerWebSocketEnvelope = z.infer<
  typeof ServerWebSocketEnvelopeSchema
>;
