import type {
  CommandResult,
  GameView,
  JoinResult,
  JoinRoomRequest,
  RoomState,
  StartGameRequest,
} from "../shared/room-state";

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
  bun run cli start <gameId> <playerToken> [stockPileSize]
  bun run cli state <gameId> <playerToken>
  bun run cli command <gameId> <playerToken> <commandNumber>

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
        await requestJson<JoinResult>(`/api/games/${gameId}/join`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
      return;
    }

    case "start": {
      const gameId = requireArg(args[0], "gameId");
      const playerToken = requireArg(args[1], "playerToken");
      const stockPileSize =
        args[2] === undefined
          ? undefined
          : requirePositiveInteger(args[2], "stockPileSize");
      const body: StartGameRequest = { stockPileSize };

      printJson(
        await requestJson<GameView>(`/api/games/${gameId}/start`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${playerToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
        }),
      );
      return;
    }

    case "state": {
      const gameId = requireArg(args[0], "gameId");
      const playerToken = requireArg(args[1], "playerToken");

      printJson(
        await requestJson<GameView>(
          `/api/games/${gameId}/state`,
          { headers: { authorization: `Bearer ${playerToken}` } },
        ),
      );
      return;
    }

    case "command": {
      const gameId = requireArg(args[0], "gameId");
      const playerToken = requireArg(args[1], "playerToken");
      const commandNumber = requirePositiveInteger(args[2], "commandNumber");
      const view = await requestJson<GameView>(
        `/api/games/${gameId}/state`,
        { headers: { authorization: `Bearer ${playerToken}` } },
      );
      const command = view.legalCommands[commandNumber - 1];
      if (command === undefined) {
        throw new Error("commandNumber does not identify a legal command");
      }

      printJson(
        await requestJson<CommandResult>(`/api/games/${gameId}/commands`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${playerToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ command }),
        }),
      );
      return;
    }

    default: {
      throw new Error(`Unknown command: ${command}`);
    }
  }
}

function requirePositiveInteger(
  value: string | undefined,
  name: string,
): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

await main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
