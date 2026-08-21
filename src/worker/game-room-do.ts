import { DurableObject } from "cloudflare:workers";
import { z } from "zod";

import type { Command } from "../shared/command";
import {
  getLegalCommands,
  isCommandLegal,
  resolveCommand,
} from "../shared/game-engine";
import { createGameState } from "../shared/game-state";
import { ServerWebSocketEnvelopeSchema } from "../shared/transport";
import type {
  CommandResult,
  GameView,
  JoinResult,
  LeaveResult,
  RoomPlayer,
  RoomState,
  RoomSummary,
} from "../shared/room-state";
import { RoomError } from "./room-error";

export interface Env {
  GAME_ROOM: DurableObjectNamespace<GameRoomDO>;
}

const STORAGE_KEY = "game-room-state";
const MAX_PLAYERS = 6;
const textEncoder = new TextEncoder();
export const INTERNAL_PLAYER_TOKEN_HEADER = "x-skibo-player-token";
const ConnectionAttachmentSchema = z
  .object({
    version: z.literal(1),
    playerToken: z.string().min(16).max(256),
    playerName: z.string().trim().min(1).max(32),
  })
  .strict();

export class GameRoomDO extends DurableObject<Env> {
  #state: RoomState | undefined;

  override async fetch(request: Request): Promise<Response> {
    if (
      request.method !== "GET" ||
      request.headers.get("upgrade")?.toLowerCase() !== "websocket"
    ) {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }

    const state = await this.#loadState();
    const player = this.#authenticate(
      state,
      request.headers.get(INTERNAL_PLAYER_TOKEN_HEADER) ?? "",
    );
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({
      version: 1,
      playerToken: player.token,
      playerName: player.name,
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  override webSocketMessage(
    socket: WebSocket,
    _message: string | ArrayBuffer,
  ): void {
    socket.close(1008, "Client messages are not supported");
  }

  override webSocketClose(
    _socket: WebSocket,
    _code: number,
    _reason: string,
    _wasClean: boolean,
  ): void {}

  override webSocketError(socket: WebSocket, error: unknown): void {
    console.error(
      JSON.stringify({
        event: "game_websocket_error",
        message: error instanceof Error ? error.message : "WebSocket error",
      }),
    );
    socket.close(1011, "Live update connection failed");
  }

  async initialize(): Promise<RoomSummary> {
    const cached = await this.ctx.storage.get<unknown>(STORAGE_KEY);
    if (cached !== undefined) {
      throw new RoomError("room_conflict", "Game room is already initialized");
    }

    const state = await this.#persist({
      gameId: this.ctx.id.name ?? this.ctx.id.toString(),
      revision: 0,
      status: "waiting",
      players: [],
      gameState: null,
    });
    return createRoomSummary(state);
  }

  async getState(): Promise<RoomState> {
    return structuredClone(await this.#loadState());
  }

  async join(playerName: string): Promise<JoinResult> {
    const state = await this.#loadState();
    if (state.status !== "waiting") {
      throw new RoomError("room_conflict", "Can't join a game that has started");
    }
    if (state.players.some((player) => player.name === playerName)) {
      throw new RoomError("room_conflict", "Player already joined");
    }
    if (state.players.length >= MAX_PLAYERS) {
      throw new RoomError(
        "room_conflict",
        "Game already has the maximum of 6 players",
      );
    }

    const player: RoomPlayer = {
      name: playerName,
      token: crypto.randomUUID(),
    };
    const nextState = await this.#persistAndBroadcast({
      ...state,
      revision: state.revision + 1,
      players: [...state.players, player],
    });
    return {
      playerToken: player.token,
      view: createGameView(nextState, player),
    };
  }

  async start(
    playerToken: string,
    expectedRevision: number,
    stockPileSize?: number,
  ): Promise<GameView> {
    const state = await this.#loadState();
    const player = this.#authenticate(state, playerToken);
    this.#requireRevision(state, expectedRevision);
    if (state.status !== "waiting") {
      throw new RoomError("room_conflict", "Game is already started");
    }
    if (state.players.length < 2) {
      throw new RoomError(
        "room_conflict",
        "Can't start a game with less than 2 players",
      );
    }
    if (
      stockPileSize !== undefined &&
      state.players.length * (stockPileSize + 5) > 162
    ) {
      throw new RoomError(
        "room_conflict",
        "Not enough cards to deal the requested game setup",
      );
    }

    const gameState = createGameState(
      state.players.map((roomPlayer) => roomPlayer.name),
      stockPileSize,
    );
    const nextState = await this.#persistAndBroadcast({
      ...state,
      revision: state.revision + 1,
      status: "started",
      gameState,
    });
    return createGameView(nextState, player);
  }

  async getView(playerToken: string): Promise<GameView> {
    const state = await this.#loadState();
    return createGameView(state, this.#authenticate(state, playerToken));
  }

  async playCommand(
    playerToken: string,
    expectedRevision: number,
    command: Command,
  ): Promise<CommandResult> {
    const state = await this.#loadState();
    const player = this.#authenticate(state, playerToken);
    this.#requireRevision(state, expectedRevision);
    if (state.status !== "started" || state.gameState === null) {
      throw new RoomError("room_conflict", "Game is not started");
    }

    const currentPlayer =
      state.gameState.players[state.gameState.currentPlayerIndex]!;
    if (currentPlayer.name !== player.name) {
      throw new RoomError(
        "room_conflict",
        `It is not ${player.name}'s turn`,
      );
    }
    if (!isCommandLegal(state.gameState, command)) {
      throw new RoomError(
        "room_conflict",
        "Command is not legal in the current game state",
      );
    }

    const resolution = resolveCommand(command, state.gameState);
    const nextState = await this.#persistAndBroadcast({
      ...state,
      revision: state.revision + 1,
      status: resolution.nextState.isGameOver ? "finished" : "started",
      gameState: resolution.nextState,
    });

    return {
      view: createGameView(nextState, player),
      effects:
        command.type === "discardCard"
          ? resolution.effects.filter((effect) => effect.type !== "cardsDrawn")
          : resolution.effects,
    };
  }

  async leave(
    playerToken: string,
    expectedRevision: number,
  ): Promise<LeaveResult> {
    const state = await this.#loadState();
    const player = this.#authenticate(state, playerToken);
    this.#requireRevision(state, expectedRevision);
    if (state.status !== "waiting") {
      throw new RoomError(
        "room_conflict",
        "Can't leave a game that has started",
      );
    }

    const nextState = await this.#persistAndBroadcast({
      ...state,
      revision: state.revision + 1,
      players: state.players.filter((candidate) => candidate !== player),
    });
    return { revision: nextState.revision };
  }

  #broadcast(state: RoomState): void {
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = ConnectionAttachmentSchema.safeParse(
        socket.deserializeAttachment(),
      );
      if (!attachment.success) {
        socket.close(1008, "Invalid live update session");
        continue;
      }

      try {
        const player = this.#authenticate(state, attachment.data.playerToken);
        if (player.name !== attachment.data.playerName) {
          socket.close(1008, "Invalid live update session");
          continue;
        }
        const envelope = ServerWebSocketEnvelopeSchema.parse({
          version: 1,
          type: "room.view",
          view: createGameView(state, player),
        });
        socket.send(JSON.stringify(envelope));
      } catch {
        socket.close(1008, "Live update session expired");
      }
    }
  }

  async #persistAndBroadcast(state: RoomState): Promise<RoomState> {
    const persisted = await this.#persist(state);
    this.#broadcast(persisted);
    return persisted;
  }

  async #loadState(): Promise<RoomState> {
    if (this.#state !== undefined) {
      return this.#state;
    }

    const cached = await this.ctx.storage.get<unknown>(STORAGE_KEY);
    if (!isRoomState(cached)) {
      if (cached === undefined) {
        throw new RoomError("not_found", "Game room does not exist");
      }
      throw new RoomError(
        "room_conflict",
        "Game room state version is unsupported",
      );
    }

    this.#state = cached;
    return cached;
  }

  async #persist(state: RoomState): Promise<RoomState> {
    await this.ctx.storage.put(STORAGE_KEY, state);
    this.#state = state;
    return structuredClone(state);
  }

  #authenticate(state: RoomState, playerToken: string): RoomPlayer {
    const suppliedToken = textEncoder.encode(playerToken);
    const player = state.players.find((candidate) => {
      const storedToken = textEncoder.encode(candidate.token);
      return timingSafeEqual(storedToken, suppliedToken);
    });
    if (player === undefined) {
      throw new RoomError("unauthorized", "Player authentication is invalid");
    }
    return player;
  }

  #requireRevision(state: RoomState, expectedRevision: number): void {
    if (state.revision !== expectedRevision) {
      throw new RoomError(
        "stale_revision",
        "The room changed; refresh and try again",
        state.revision,
      );
    }
  }
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) {
    return false;
  }
  const workersSubtleCrypto = crypto.subtle as SubtleCrypto & {
    timingSafeEqual?: (left: Uint8Array, right: Uint8Array) => boolean;
  };
  if (typeof workersSubtleCrypto.timingSafeEqual === "function") {
    return workersSubtleCrypto.timingSafeEqual(left, right);
  }

  // Bun's Web Crypto test runtime does not yet expose the Workers extension.
  let difference = 0;
  for (let index = 0; index < left.byteLength; index++) {
    difference |= left[index]! ^ right[index]!;
  }
  return difference === 0;
}

function createRoomSummary(state: RoomState): RoomSummary {
  return {
    gameId: state.gameId,
    revision: state.revision,
    status: state.status,
    playerNames: state.players.map((player) => player.name),
  };
}

function createGameView(state: RoomState, viewer: RoomPlayer): GameView {
  if (state.gameState === null) {
    return {
      gameId: state.gameId,
      revision: state.revision,
      status: "waiting",
      viewerName: viewer.name,
      players: state.players.map((player) => ({
        name: player.name,
        cardsInHand: null,
        handCount: 0,
        stockTopCard: null,
        stockCount: 0,
        discardPiles: [[], [], [], []],
      })),
      currentPlayerName: null,
      winnerName: null,
      isYourTurn: false,
      deckCount: 0,
      buildPiles: [[], [], [], []],
      completedBuildPileCount: 0,
      legalCommands: [],
    };
  }

  const gameState = state.gameState;
  const currentPlayer = gameState.players[gameState.currentPlayerIndex]!;
  const isYourTurn = !gameState.isGameOver && currentPlayer.name === viewer.name;

  const commonView = {
    gameId: state.gameId,
    revision: state.revision,
    viewerName: viewer.name,
    players: gameState.players.map((player) => ({
      name: player.name,
      cardsInHand:
        player.name === viewer.name ? [...player.cardsInHand] : null,
      handCount: player.cardsInHand.length,
      stockTopCard: player.stockPile.at(-1) ?? null,
      stockCount: player.stockPile.length,
      discardPiles: player.discardPiles.map((pile) => [...pile]),
    })),
    currentPlayerName: currentPlayer.name,
    deckCount: gameState.deck.length,
    buildPiles: gameState.buildPiles.map((pile) => [...pile]),
    completedBuildPileCount: gameState.completedBuildPiles.length,
  };

  if (gameState.isGameOver) {
    return {
      ...commonView,
      status: "finished",
      currentPlayerName: currentPlayer.name,
      winnerName: currentPlayer.name,
      isYourTurn: false,
      legalCommands: [],
    };
  }
  return {
    ...commonView,
    status: "playing",
    currentPlayerName: currentPlayer.name,
    winnerName: null,
    isYourTurn,
    legalCommands: isYourTurn ? getLegalCommands(gameState) : [],
  };
}

function isRoomState(value: unknown): value is RoomState {
  if (
    typeof value !== "object" ||
    value === null ||
    !("gameId" in value) ||
    !("revision" in value) ||
    !("status" in value) ||
    !("players" in value) ||
    !("gameState" in value)
  ) {
    return false;
  }

  return (
    typeof value.gameId === "string" &&
    typeof value.revision === "number" &&
    Number.isInteger(value.revision) &&
    value.revision >= 0 &&
    (value.status === "waiting" ||
      value.status === "started" ||
      value.status === "finished") &&
    Array.isArray(value.players) &&
    value.players.every(
      (player) =>
        typeof player === "object" &&
        player !== null &&
        "name" in player &&
        "token" in player &&
        typeof player.name === "string" &&
        typeof player.token === "string",
    ) &&
    (value.gameState === null ||
      (typeof value.gameState === "object" && value.gameState !== null))
  );
}
