import type { JoinRoomRequest, RoomState } from "../shared/room-state";

const DEFAULT_API_BASE_URL =
  process.env.SKIBO_API_BASE_URL ?? "http://127.0.0.1:8787";

type CreateGameResponse = {
  gameId: string;
  state: RoomState;
};

function printUsage(): void {
  console.log(`skibo CLI

Usage:
  bun run cli create
  bun run cli join <gameId> <playerName>
  bun run cli start <gameId>
  bun run cli pass-turn <gameId>
  bun run cli state <gameId>

Environment:
  SKIBO_API_BASE_URL  Defaults to ${DEFAULT_API_BASE_URL}`);
}

function requireArg(value: string | undefined, name: string): string {
  if (!value?.trim()) {
    throw new Error(`${name} is required`);
  }

  return value.trim();
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(new URL(path, DEFAULT_API_BASE_URL), init);
  const text = await response.text();
  const body = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    throw new Error(
      `Request failed with ${response.status}: ${JSON.stringify(body)}`,
    );
  }

  return body as T;
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

async function main(): Promise<void> {
  const [command, ...args] = Bun.argv.slice(2);

  switch (command) {
    case undefined:
    case "help":
    case "--help":
    case "-h": {
      printUsage();
      return;
    }

    case "create": {
      const response = await requestJson<CreateGameResponse>("/api/games", {
        method: "POST",
      });
      printJson(response);
      return;
    }

    case "join": {
      const gameId = requireArg(args[0], "gameId");
      const playerName = requireArg(args[1], "playerName");
      const body: JoinRoomRequest = { playerName };

      printJson(
        await requestJson<RoomState>(`/api/games/${gameId}/join`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
      return;
    }

    case "start": {
      const gameId = requireArg(args[0], "gameId");

      printJson(
        await requestJson<RoomState>(`/api/games/${gameId}/start`, {
          method: "POST",
        }),
      );
      return;
    }

    case "pass-turn": {
      const gameId = requireArg(args[0], "gameId");

      printJson(
        await requestJson<RoomState>(`/api/games/${gameId}/pass-turn`, {
          method: "POST",
        }),
      );
      return;
    }

    case "state": {
      const gameId = requireArg(args[0], "gameId");

      printJson(await requestJson<RoomState>(`/api/games/${gameId}/state`));
      return;
    }

    default: {
      throw new Error(`Unknown command: ${command}`);
    }
  }
}

await main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
