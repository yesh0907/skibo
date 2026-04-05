import { DurableObject } from "cloudflare:workers";

import type { RoomState } from "../shared/room-state";

export interface Env {
  GAME_ROOM: DurableObjectNamespace<GameRoomDO>;
}

export class GameRoomDO extends DurableObject {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  async getState(): Promise<RoomState> {
    throw new Error("Implement GameRoomDO.getState()");
  }

  async join(playerName: string): Promise<RoomState> {
    void playerName;
    throw new Error("Implement GameRoomDO.join()");
  }

  async start(): Promise<RoomState> {
    throw new Error("Implement GameRoomDO.start()");
  }

  async passTurn(): Promise<RoomState> {
    throw new Error("Implement GameRoomDO.passTurn()");
  }
}
