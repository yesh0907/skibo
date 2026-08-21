import { expect, test } from "@playwright/test";

import {
  ApiErrorSchema,
  PlayerViewSchema,
  type TransportCommand,
} from "../../shared/transport";

test("serves the React client alongside the legacy integration surface", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Skibo Table");
  await expect(
    page.getByRole("heading", { name: "Create a game" }),
  ).toBeVisible();

  await page.goto("/react/");

  await expect(page).toHaveTitle("Skibo Table");
  await expect(
    page.getByRole("heading", { name: "Pull up a seat." }),
  ).toBeVisible();
});

test("keeps the legacy bearer surface live without polling", async ({ browser }) => {
  const aliceContext = await browser.newContext();
  const bobContext = await browser.newContext();
  const alice = await aliceContext.newPage();
  const bob = await bobContext.newPage();
  let aliceSnapshots = 0;
  alice.on("request", (request) => {
    if (request.url().endsWith("/state")) aliceSnapshots += 1;
  });

  await alice.goto("/");
  const createForm = alice.locator("#create-form");
  await createForm.getByLabel("Your name").fill("Alice");
  await createForm.getByRole("button", { name: "Create table" }).click();
  await expect(alice.locator("#connection-state")).toHaveText("Connected");
  await expect.poll(() => aliceSnapshots).toBe(1);
  const gameId = await alice.evaluate(() => {
    const saved = sessionStorage.getItem("skibo-session");
    return saved === null ? null : JSON.parse(saved).gameId;
  });
  if (typeof gameId !== "string") throw new Error("Expected legacy game id");

  await bob.goto("/");
  const joinForm = bob.locator("#join-form");
  await joinForm.getByLabel("Game code").fill(gameId);
  await joinForm.getByLabel("Your name").fill("Bob");
  await joinForm.getByRole("button", { name: "Join table" }).click();

  await expect(alice.locator("#waiting-roster")).toContainText("Bob");
  expect(aliceSnapshots).toBe(1);
  await aliceContext.close();
  await bobContext.close();
});

async function createTable(page: import("@playwright/test").Page, playerName: string) {
  await page.goto("/react/");
  const form = page.locator("form").filter({
    has: page.getByRole("heading", { name: "Create a game" }),
  });
  await form.getByLabel("Your name").fill(playerName);
  await form.getByRole("button", { name: "Create table" }).click();
  await expect(page.getByRole("heading", { name: "The table is open." })).toBeVisible();
  const gameId = await page.evaluate(() => localStorage.getItem("skibo.currentGameId"));
  expect(gameId).toMatch(/^game_[a-f0-9]+$/);
  if (gameId === null) throw new Error("Expected the created game id");
  return gameId;
}

async function joinTable(page: import("@playwright/test").Page, gameId: string, playerName: string) {
  await page.goto("/react/");
  const form = page.locator("form").filter({
    has: page.getByRole("heading", { name: "Join a game" }),
  });
  await form.getByLabel("Game code").fill(gameId);
  await form.getByLabel("Your name").fill(playerName);
  await form.getByRole("button", { name: "Join table" }).click();
  await expect(page.getByRole("heading", { name: "The table is open." })).toBeVisible();
}

function sourceLabel(command: TransportCommand): RegExp {
  const source = command.source;
  const value = command.cardValue === 0 ? "Skip-Bo wild" : `card ${command.cardValue}`;
  if (source.type === "stockPile") return new RegExp(`${value} from stock pile`);
  if (source.type === "discardPile") return new RegExp(`${value} from discard pile ${source.index + 1}`);
  return new RegExp(`${value} from hand position ${source.index + 1}`);
}

test("delivers private live opponent updates without polling and recovers a reconnect snapshot", async ({ browser }) => {
  const aliceContext = await browser.newContext();
  const bobContext = await browser.newContext();
  const alice = await aliceContext.newPage();
  const bob = await bobContext.newPage();
  let aliceSnapshotRequests = 0;
  let bobSnapshotRequests = 0;
  alice.on("request", (request) => {
    if (request.url().endsWith("/state")) aliceSnapshotRequests += 1;
  });
  bob.on("request", (request) => {
    if (request.url().endsWith("/state")) bobSnapshotRequests += 1;
  });
  const gameId = await createTable(alice, "Alice");
  await expect(alice.getByText("Live updates connected.")).toBeVisible();
  await expect.poll(() => aliceSnapshotRequests).toBe(1);
  await joinTable(bob, gameId, "Bob");
  await expect(bob.getByText("Live updates connected.")).toBeVisible();
  await expect.poll(() => bobSnapshotRequests).toBe(1);

  await expect(alice.getByText("Bob")).toBeVisible();
  expect(aliceSnapshotRequests).toBe(1);

  await bobContext.setOffline(true);
  await bob.evaluate(() => window.dispatchEvent(new Event("offline")));
  await expect(bob.getByText(/Reconnecting live updates/)).toBeVisible();
  await alice.getByLabel("Game length").selectOption("5");
  await alice.getByRole("button", { name: "Start game" }).click();
  await expect(alice.getByText(/Your turn · revision 3/)).toBeVisible();
  await bobContext.setOffline(false);
  await bob.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(bob.getByText("Live updates connected.")).toBeVisible({
    timeout: 15_000,
  });
  await expect.poll(() => bobSnapshotRequests, { timeout: 15_000 }).toBe(2);
  await expect(bob.getByText(/revision 3/)).toBeVisible();

  const aliceStateResponse = await alice.request.get(
    `/api/games/${gameId}/state`,
  );
  const aliceView = PlayerViewSchema.parse(await aliceStateResponse.json());
  expect(aliceStateResponse.status()).toBe(200);
  if (aliceView.status !== "playing") throw new Error("Expected a playing view");
  expect(
    aliceView.players.find((player) => player.name === "Alice")?.cardsInHand,
  ).toHaveLength(5);
  expect(
    aliceView.players.find((player) => player.name === "Bob")?.cardsInHand,
  ).toBeNull();
  expect(JSON.stringify(aliceView)).not.toContain("playerToken");
  expect(JSON.stringify(aliceView)).not.toContain('"token"');

  const command = aliceView.legalCommands.find(
    (candidate) => candidate.type === "discardCard",
  );
  if (command?.type !== "discardCard") throw new Error("Expected a legal discard");
  await alice.getByRole("button", { name: sourceLabel(command) }).click();
  await alice.getByRole("button", {
    name: `Play selected card on Discard pile ${command.discardPileIndex + 1}`,
  }).click();
  await expect(alice.getByText(/revision 4/)).toBeVisible();
  await expect(bob.getByText(/Your turn · revision 4/)).toBeVisible();
  expect(bobSnapshotRequests).toBe(2);

  const staleResponse = await alice.request.post(
    `/api/games/${gameId}/commands`,
    { data: { expectedRevision: aliceView.revision, command } },
  );
  expect(staleResponse.status()).toBe(409);
  expect(ApiErrorSchema.parse(await staleResponse.json())).toEqual({
    error: {
      code: "stale_revision",
      message: "The room changed; refresh and try again",
      currentRevision: 4,
    },
  });

  const bobStateResponse = await bob.request.get(`/api/games/${gameId}/state`);
  const bobView = PlayerViewSchema.parse(await bobStateResponse.json());
  if (bobView.status !== "playing") throw new Error("Expected a playing view");
  expect(
    bobView.players.find((player) => player.name === "Alice")?.cardsInHand,
  ).toBeNull();
  const bobHand = bobView.players.find(
    (player) => player.name === "Bob",
  )?.cardsInHand;
  expect(bobHand).toHaveLength(5);
  const bobCard = bobHand?.[0];
  if (bobCard === undefined) throw new Error("Expected Bob's private hand");
  const illegalCommand: TransportCommand = {
    type: "discardCard",
    cardValue: bobCard === 12 ? 11 : bobCard + 1,
    source: { type: "hand", index: 0 },
    discardPileIndex: 0,
  };
  const illegalResponse = await bob.request.post(
    `/api/games/${gameId}/commands`,
    { data: { expectedRevision: bobView.revision, command: illegalCommand } },
  );
  expect(illegalResponse.status()).toBe(409);
  expect(ApiErrorSchema.parse(await illegalResponse.json())).toEqual({
    error: {
      code: "room_conflict",
      message: "Command is not legal in the current game state",
    },
  });
  const unchangedView = PlayerViewSchema.parse(
    await (await bob.request.get(`/api/games/${gameId}/state`)).json(),
  );
  expect(unchangedView.revision).toBe(4);
  await aliceContext.close();
  await bobContext.close();
});

test("leaves a waiting room through the server and clears restoration state", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await createTable(page, "Leaver");
  await page.getByRole("button", { name: "Leave waiting room" }).click();
  await expect(page.getByRole("heading", { name: "Pull up a seat." })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("skibo.currentGameId"))).toBeNull();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Pull up a seat." })).toBeVisible();
  await context.close();
});
