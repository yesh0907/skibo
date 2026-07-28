import { describe, expect, test } from "bun:test";

describe("simulation CLI", () => {
  test("prints a reproducible whole-game summary", async () => {
    const result = await runSimulationCli(
      [
        "--seed",
        "42",
        "--stock",
        "5",
        "Ada",
        "Grace",
      ],
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).not.toContain("Stopped:");
    expect(result.stdout).toContain("Winner:");
    expect(result.stdout).toContain("Seed: 42");
    expect(result.stdout).toContain("Commands:");
    expect(result.stdout).toContain("Turns:");
  });

  test("reports the command limit through the documented entrypoint", async () => {
    const result = await runSimulationCli([
      "--seed",
      "42",
      "--stock",
      "5",
      "--max",
      "1",
      "Ada",
      "Grace",
    ]);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toContain("Commands: 1");
    expect(result.stderr).toContain(
      "Stopped: command limit of 1 reached without a winner",
    );
  });
});

async function runSimulationCli(args: string[]): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  const process = Bun.spawn(["bun", "run", "simulate", "--", ...args], {
    cwd: import.meta.dir + "/../..",
    stdout: "pipe",
    stderr: "pipe",
  });

  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);

  return { exitCode, stdout, stderr };
}
