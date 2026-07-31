import { expect, test } from "bun:test";

test("play CLI renders a game and accepts quit", async () => {
  const process = Bun.spawn(
    ["bun", "run", "play", "--", "--seed", "42", "--stock", "5"],
    {
      cwd: import.meta.dir + "/../..",
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  process.stdin.write("q\n");
  process.stdin.end();

  const [exitCode, stdout] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
  ]);

  expect(exitCode).toBe(0);
  expect(stdout).toContain("Skip-Bo local game");
  expect(stdout).toContain("Build piles:");
  expect(stdout).toContain("Choose a command number or q to quit:");
  expect(stdout).toContain("Game ended by player.");
}, 5_000);

test("play CLI treats closed input as quit instead of hanging", async () => {
  const process = Bun.spawn(
    ["bun", "run", "play", "--", "--seed", "42", "--stock", "5"],
    {
      cwd: import.meta.dir + "/../..",
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  const [exitCode, stdout] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
  ]);

  expect(exitCode).toBe(0);
  expect(stdout).toContain("Game ended by player.");
}, 5_000);
