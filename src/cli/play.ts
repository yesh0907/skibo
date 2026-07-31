import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { createSeededRandom } from "../shared/game-simulation";
import { playLocalGame } from "../shared/local-game";

interface PlayCliOptions {
  seed: number;
  stockPileSize: number;
  humanName: string;
  botName: string;
}

function parseOptions(args: string[]): PlayCliOptions {
  let seed = 1;
  let stockPileSize = 5;
  let humanName = "You";
  let botName = "Bot";

  for (let index = 0; index < args.length; index++) {
    const argument = args[index]!;
    if (argument === "--seed") {
      seed = parseInteger(args[++index], "--seed");
    } else if (argument === "--stock") {
      stockPileSize = parsePositiveInteger(args[++index], "--stock");
    } else if (argument === "--name") {
      humanName = requireValue(args[++index], "--name");
    } else if (argument === "--bot-name") {
      botName = requireValue(args[++index], "--bot-name");
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }

  return { seed, stockPileSize, humanName, botName };
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

function requireValue(value: string | undefined, option: string): string {
  if (!value?.trim()) {
    throw new Error(`${option} requires a value`);
  }
  return value.trim();
}

async function main(): Promise<void> {
  const options = parseOptions(Bun.argv.slice(2));
  const terminal = createInterface({ input: stdin, output: stdout });
  const lines = terminal[Symbol.asyncIterator]();

  try {
    await playLocalGame({
      playerNames: [options.humanName, options.botName],
      stockPileSize: options.stockPileSize,
      random: createSeededRandom(options.seed),
      readLine: async () => {
        const line = await lines.next();
        return line.done ? "q" : line.value;
      },
      writeLine: (line) => console.log(line),
    });
  } finally {
    terminal.close();
  }
}

await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
