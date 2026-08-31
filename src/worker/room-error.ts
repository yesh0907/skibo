import { z } from "zod";

import {
  ApiErrorCodeSchema,
} from "../shared/transport";

const ROOM_ERROR_PREFIX = "SKIBO_ROOM_ERROR:";
const RoomErrorDetailsSchema = z
  .object({
    code: ApiErrorCodeSchema.exclude(["invalid_request", "internal_error"]),
    message: z.string().min(1),
    currentRevision: z.number().int().nonnegative().optional(),
  })
  .strict();

export type RoomErrorDetails = z.infer<typeof RoomErrorDetailsSchema>;

/** Expected domain failures are serialized in the message because RPC drops own Error fields. */
export class RoomError extends Error {
  constructor(
    code: RoomErrorDetails["code"],
    message: string,
    currentRevision?: number,
  ) {
    super(
      `${ROOM_ERROR_PREFIX}${JSON.stringify({
        code,
        message,
        ...(currentRevision === undefined ? {} : { currentRevision }),
      })}`,
    );
    this.name = "RoomError";
  }
}

export function parseRoomError(error: unknown): RoomErrorDetails | null {
  if (!(error instanceof Error)) {
    return null;
  }
  const message = error.message.startsWith("RoomError: ")
    ? error.message.slice("RoomError: ".length)
    : error.message;
  if (error.name !== "RoomError" && !message.startsWith(ROOM_ERROR_PREFIX)) {
    return null;
  }
  if (!message.startsWith(ROOM_ERROR_PREFIX)) {
    return null;
  }
  try {
    return RoomErrorDetailsSchema.parse(
      JSON.parse(message.slice(ROOM_ERROR_PREFIX.length)),
    );
  } catch {
    return null;
  }
}
