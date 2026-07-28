import {
  createSeededRandom,
  simulateGame,
} from "../shared/game-simulation";

interface SimulationCliOptions {
  seed: number;
  stockPileSize: number;
  maxCommands: number;
  playerNames: string[];
}

function printUsage(): void {
  console.log(`skibo local game simulation

Usage:
  bun run simulate
  bun run simulate -- --seed 42 --stock 5 Ada Grace

Options:
  --seed <integer>  Reproduce the same deck and shuffles (default: 1)
  --stock <count>   Cards in each player's stock pile (default: 5)
  --max <count>     Stop after this many commands (default: 10000)`);
}

function parseOptions(args: string[]): SimulationCliOptions {
  let seed = 1;
  let stockPileSize = 5;
  let maxCommands = 10_000;
  const playerNames: string[] = [];

  for (let index = 0; index < args.length; index++) {
    const argument = args[index]!;
    if (argument === "--seed") {
      seed = parseInteger(args[++index], "--seed");
    } else if (argument === "--stock") {
      stockPileSize = parsePositiveInteger(args[++index], "--stock");
    } else if (argument === "--max") {
      maxCommands = parsePositiveInteger(args[++index], "--max");
    } else if (argument.startsWith("--")) {
      throw new Error(`Unknown option: ${argument}`);
    } else {
      playerNames.push(argument);
    }
  }

  return {
    seed,
    stockPileSize,
    maxCommands,
    playerNames:
      playerNames.length > 0 ? playerNames : ["Player 1", "Player 2"],
  };
}

function parseInteger(value: string | undefined, option: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${option} requires an integer`);
  }
  return parsed;
}

function parsePositiveInteger(
  value: string | undefined,
  option: string,
): number {
  const parsed = parseInteger(value, option);
  if (parsed < 1) {
    throw new Error(`${option} requires a positive integer`);
  }
  return parsed;
}

function main(): void {
  const args = Bun.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    return;
  }

  const options = parseOptions(args);
  const result = simulateGame({
    playerNames: options.playerNames,
    stockPileSize: options.stockPileSize,
    maxCommands: options.maxCommands,
    random: createSeededRandom(options.seed),
  });

  console.log("Skip-Bo simulation");
  console.log(`Players: ${options.playerNames.join(", ")}`);
  console.log(`Seed: ${options.seed}`);
  console.log(`Stock cards per player: ${options.stockPileSize}`);
  console.log(`Commands: ${result.commandCount}`);
  console.log(`Turns: ${result.turnCount}`);

  if (result.status === "won") {
    console.log(`Winner: ${result.winnerName}`);
    return;
  }

  const reason =
    result.status === "commandLimitReached"
      ? `command limit of ${options.maxCommands} reached without a winner`
      : "current player has no legal command";
  console.error(`Stopped: ${reason}`);
  process.exitCode = 2;
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
