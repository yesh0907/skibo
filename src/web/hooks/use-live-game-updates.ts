import { useEffect, useEffectEvent, useState } from "react";

import {
  ServerWebSocketEnvelopeSchema,
  type ApiError,
  type PlayerView,
} from "../../shared/transport";

export const RECONNECT_BASE_DELAY_MS = 500;
export const RECONNECT_MAX_DELAY_MS = 10_000;

export type LiveUpdateStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting";

export interface LiveSocket {
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  close(code?: number, reason?: string): void;
}

export interface LiveConnectionDependencies {
  createSocket?: (url: string) => LiveSocket;
  schedule?: (callback: () => void, delay: number) => number;
  cancel?: (timer: number) => void;
  random?: () => number;
  location?: Pick<Location, "protocol" | "host">;
}

class BrowserLiveSocket implements LiveSocket {
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readonly #socket: WebSocket;

  constructor(url: string) {
    this.#socket = new WebSocket(url);
    this.#socket.addEventListener("open", () => this.onopen?.());
    this.#socket.addEventListener("message", (event) =>
      this.onmessage?.({ data: event.data }),
    );
    this.#socket.addEventListener("close", () => this.onclose?.());
    this.#socket.addEventListener("error", () => this.onerror?.());
  }

  close(code?: number, reason?: string): void {
    this.#socket.close(code, reason);
  }
}

interface LiveGameConnectionOptions extends LiveConnectionDependencies {
  gameId: string;
  refreshSnapshot: () => Promise<PlayerView>;
  onView: (view: PlayerView) => void;
  onStatus: (status: LiveUpdateStatus) => void;
  onError: (error: ApiError | null) => void;
}

const CONNECTION_ERROR: ApiError = {
  error: {
    code: "internal_error",
    message: "Live updates were interrupted. Reconnecting…",
  },
};

const SNAPSHOT_ERROR: ApiError = {
  error: {
    code: "internal_error",
    message:
      "Live updates connected, but the recovery snapshot could not be refreshed.",
  },
};

const MESSAGE_ERROR: ApiError = {
  error: {
    code: "internal_error",
    message: "The game server sent an invalid live update.",
  },
};

export function reconnectDelayMs(
  attempt: number,
  randomValue: number,
): number {
  const exponential = Math.min(
    RECONNECT_MAX_DELAY_MS,
    RECONNECT_BASE_DELAY_MS * 2 ** Math.max(0, attempt),
  );
  const jittered = exponential * (0.75 + Math.min(1, Math.max(0, randomValue)) * 0.5);
  return Math.min(RECONNECT_MAX_DELAY_MS, Math.round(jittered));
}

export function gameWebSocketUrl(
  gameId: string,
  currentLocation: Pick<Location, "protocol" | "host">,
): string {
  const protocol = currentLocation.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${currentLocation.host}/api/games/${encodeURIComponent(gameId)}/ws`;
}

export class LiveGameConnection {
  readonly #options: Required<
    Pick<
      LiveGameConnectionOptions,
      "createSocket" | "schedule" | "cancel" | "random" | "location"
    >
  > &
    Omit<
      LiveGameConnectionOptions,
      "createSocket" | "schedule" | "cancel" | "random" | "location"
    >;
  #active = false;
  #attempt = 0;
  #socket: LiveSocket | null = null;
  #timer: number | null = null;

  constructor(options: LiveGameConnectionOptions) {
    this.#options = {
      ...options,
      createSocket:
        options.createSocket ?? ((url) => new BrowserLiveSocket(url)),
      schedule:
        options.schedule ??
        ((callback, delay) => window.setTimeout(callback, delay)),
      cancel: options.cancel ?? ((timer) => window.clearTimeout(timer)),
      random: options.random ?? Math.random,
      location: options.location ?? window.location,
    };
  }

  start(): void {
    if (this.#active) return;
    this.#active = true;
    this.#attempt = 0;
    this.#options.onStatus("connecting");
    this.#connect();
  }

  stop(): void {
    this.#active = false;
    this.#cancelTimer();
    this.#detachSocket(1000, "Session ended");
    this.#options.onStatus("disconnected");
    this.#options.onError(null);
  }

  handleOffline(): void {
    if (!this.#active) return;
    this.#cancelTimer();
    this.#detachSocket(4000, "Network offline");
    this.#options.onStatus("reconnecting");
    this.#options.onError(CONNECTION_ERROR);
  }

  handleOnline(): void {
    if (!this.#active || this.#socket !== null || this.#timer !== null) return;
    this.#attempt = 0;
    this.#options.onStatus("connecting");
    this.#connect();
  }

  #connect(): void {
    if (!this.#active) return;
    let socket: LiveSocket;
    try {
      socket = this.#options.createSocket(
        gameWebSocketUrl(this.#options.gameId, this.#options.location),
      );
    } catch {
      this.#scheduleReconnect();
      return;
    }
    this.#socket = socket;

    socket.onopen = () => {
      if (!this.#active || this.#socket !== socket) return;
      this.#options.onStatus("connected");
      this.#options.onError(null);
      void this.#options
        .refreshSnapshot()
        .then((view) => {
          if (this.#active && this.#socket === socket) {
            this.#attempt = 0;
            this.#options.onView(view);
          }
        })
        .catch(() => {
          if (this.#active && this.#socket === socket) {
            this.#options.onError(SNAPSHOT_ERROR);
          }
        });
    };
    socket.onmessage = (event) => {
      if (!this.#active || this.#socket !== socket) return;
      try {
        if (typeof event.data !== "string") throw new TypeError();
        const envelope = ServerWebSocketEnvelopeSchema.parse(
          JSON.parse(event.data),
        );
        this.#options.onError(null);
        this.#options.onView(envelope.view);
      } catch {
        this.#options.onError(MESSAGE_ERROR);
      }
    };
    socket.onerror = () => {
      if (!this.#active || this.#socket !== socket) return;
      this.#options.onError(CONNECTION_ERROR);
    };
    socket.onclose = () => {
      if (!this.#active || this.#socket !== socket) return;
      this.#socket = null;
      this.#clearSocketCallbacks(socket);
      this.#scheduleReconnect();
    };
  }

  #scheduleReconnect(): void {
    if (!this.#active || this.#timer !== null) return;
    const delay = reconnectDelayMs(this.#attempt, this.#options.random());
    this.#attempt += 1;
    this.#options.onStatus("reconnecting");
    this.#options.onError(CONNECTION_ERROR);
    this.#timer = this.#options.schedule(() => {
      this.#timer = null;
      if (!this.#active) return;
      this.#options.onStatus("connecting");
      this.#connect();
    }, delay);
  }

  #cancelTimer(): void {
    if (this.#timer === null) return;
    this.#options.cancel(this.#timer);
    this.#timer = null;
  }

  #detachSocket(code: number, reason: string): void {
    const socket = this.#socket;
    this.#socket = null;
    if (socket === null) return;
    this.#clearSocketCallbacks(socket);
    socket.close(code, reason);
  }

  #clearSocketCallbacks(socket: LiveSocket): void {
    socket.onopen = null;
    socket.onmessage = null;
    socket.onclose = null;
    socket.onerror = null;
  }
}

interface UseLiveGameUpdatesOptions extends LiveConnectionDependencies {
  enabled: boolean;
  gameId: string | null;
  refreshSnapshot: (gameId: string) => Promise<PlayerView>;
  onView: (view: PlayerView) => void;
}

export function useLiveGameUpdates({
  enabled,
  gameId,
  refreshSnapshot,
  onView,
  ...dependencies
}: UseLiveGameUpdatesOptions): {
  status: LiveUpdateStatus;
  error: ApiError | null;
} {
  const [status, setStatus] = useState<LiveUpdateStatus>("disconnected");
  const [error, setError] = useState<ApiError | null>(null);
  const refreshSnapshotEvent = useEffectEvent(refreshSnapshot);
  const onViewEvent = useEffectEvent(onView);

  useEffect(() => {
    if (!enabled || gameId === null) return;
    const connection = new LiveGameConnection({
      ...dependencies,
      gameId,
      refreshSnapshot: () => refreshSnapshotEvent(gameId),
      onView: onViewEvent,
      onStatus: setStatus,
      onError: setError,
    });
    connection.start();
    const handleOffline = () => connection.handleOffline();
    const handleOnline = () => connection.handleOnline();
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      connection.stop();
    };
  }, [
    enabled,
    gameId,
    dependencies.cancel,
    dependencies.createSocket,
    dependencies.location,
    dependencies.random,
    dependencies.schedule,
  ]);

  return { status, error };
}
