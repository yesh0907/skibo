import { DurableObject } from "cloudflare:workers";

import type { RoomState } from "../shared/room-state";

export interface Env {
  GAME_ROOM: DurableObjectNamespace<GameRoomDO>;
}

const STORAGE_KEY = "game-room-state";

export class GameRoomDO extends DurableObject {
  #state: RoomState | undefined;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  async getState(): Promise<RoomState> {
    if (this.#state !== undefined) {
      return this.#state;
    }
    const cached = await this.ctx.storage.get<RoomState>(STORAGE_KEY);
    if (cached !== undefined) {
      this.#state = cached;
      return this.#state;
    }
    const newState: RoomState = {
      gameId: this.ctx.id.name ?? this.ctx.id.toString(),
      status: "waiting",
      players: [],
      turnIndex: null,
    };
    await this.ctx.storage.put(STORAGE_KEY, newState);
    this.#state = newState;
    return this.#state;
  }

  async join(playerName: string): Promise<RoomState> {
    this.#state = await this.getState();
    if (this.#state.status !== "waiting") {
      throw new Error("Can't join a game that has started");
    }
    if (this.#state.players.includes(playerName)) {
      throw new Error("Player already joined");
    }

    const newState: RoomState = {
      ...this.#state,
      players: [...this.#state.players, playerName],
    };
    await this.ctx.storage.put(STORAGE_KEY, newState);
    this.#state = newState;
    return this.#state;
  }

  async start(): Promise<RoomState> {
    this.#state = await this.getState();
    if (this.#state.status !== "waiting") {
      throw new Error("Game is already started");
    }
    if (this.#state.players.length < 2) {
      throw new Error("Can't start a game with less than 2 players");
    }

    const newState: RoomState = {
      ...this.#state,
      status: "started",
      turnIndex: 0,
    };
    await this.ctx.storage.put(STORAGE_KEY, newState);
    this.#state = newState;
    return this.#state;
  }

  async passTurn(): Promise<RoomState> {
    this.#state = await this.getState();
    if (this.#state.status !== "started") {
      throw new Error("Game is not started");
    }
    if (this.#state.turnIndex === null) {
      throw new Error("Turn index is null - game wasn't started properly");
    }

    const newState: RoomState = {
      ...this.#state,
      turnIndex: (this.#state.turnIndex + 1) % this.#state.players.length,
    };
    await this.ctx.storage.put(STORAGE_KEY, newState);
    this.#state = newState;
    return this.#state;
  }
}
