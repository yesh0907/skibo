import { expect, test } from "@playwright/test";

import {
  ApiErrorSchema,
  PlayerViewSchema,
  type TransportCommand,
} from "../../shared/transport";

test("serves the parity React client at root and redirects the migration path", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Skibo Table");
  await expect(
    page.getByRole("heading", { name: "Pull up a seat." }),
  ).toBeVisible();
  await expect(page.locator(".brand-cards")).toContainText("1S3");
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(244, 246, 242)",
  );

  await page.goto("/react/");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Pull up a seat." })).toBeVisible();
});

test("keeps the entry, waiting room, and game table responsive at the legacy mobile breakpoint", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const opponentContext = await browser.newContext();
  const page = await context.newPage();
  const opponent = await opponentContext.newPage();
  await page.goto("/");

  await expect(page.locator(".entry-grid")).toHaveCSS(
    "grid-template-columns",
    "358px",
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

  const gameId = await createTable(page, "Mobile Alice");
  await expect(page.locator(".waiting-controls")).toHaveCSS(
    "grid-template-columns",
    "358px",
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

  await joinTable(opponent, gameId, "Bob");
  await expect(page.getByText("Bob")).toBeVisible();
  await page.getByLabel("Game length").selectOption("5");
  await page.getByRole("button", { name: "Start game" }).click();
  await expect(page.locator(".game-view")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

  for (const zone of [".opponents-zone", ".table-zone", ".player-zone"]) {
    await page.locator(zone).scrollIntoViewIfNeeded();
    await expect(page.locator(zone)).toBeVisible();
  }
  const response = await page.request.get(`/api/games/${gameId}/state`);
  const view = PlayerViewSchema.parse(await response.json());
  if (view.status !== "playing") throw new Error("Expected a mobile playing view");
  const command = view.legalCommands.find(
    (candidate) => candidate.type === "discardCard",
  );
  if (command?.type !== "discardCard") {
    throw new Error("Expected a legal mobile discard");
  }
  const source = page.getByRole("button", { name: sourceLabel(command) });
  await source.scrollIntoViewIfNeeded();
  await source.click();
  await expect(
    page.getByRole("button", {
      name: `Play selected card on Discard pile ${command.discardPileIndex + 1}`,
    }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(source).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

  await context.close();
  await opponentContext.close();
});

async function createTable(page: import("@playwright/test").Page, playerName: string) {
  await page.goto("/");
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
  await page.goto("/");
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

async function dispatchTouch(
  target: import("@playwright/test").Locator,
  type: "touchstart" | "touchmove" | "touchend",
  point: { x: number; y: number },
) {
  await target.evaluate((element, event) => {
    const touch = new Touch({
      clientX: event.point.x,
      clientY: event.point.y,
      identifier: 1,
      target: element,
    });
    const activeTouches = event.type === "touchend" ? [] : [touch];
    element.dispatchEvent(
      new TouchEvent(event.type, {
        bubbles: true,
        cancelable: true,
        changedTouches: [touch],
        targetTouches: activeTouches,
        touches: activeTouches,
      }),
    );
  }, { point, type });
}

test("delivers private live opponent updates without polling and recovers a reconnect snapshot", async ({ browser }) => {
  const aliceContext = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
  });
  const bobContext = await browser.newContext({
    hasTouch: true,
    viewport: { width: 1440, height: 1100 },
  });
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
  await expect(alice.getByRole("status")).toContainText("Live updates connected.");
  await expect.poll(() => aliceSnapshotRequests).toBe(1);
  await joinTable(bob, gameId, "Bob");
  await expect(bob.getByRole("status")).toContainText("Live updates connected.");
  await expect.poll(() => bobSnapshotRequests).toBe(1);

  await expect(alice.getByText("Bob")).toBeVisible();
  expect(aliceSnapshotRequests).toBe(1);

  await bobContext.setOffline(true);
  await bob.evaluate(() => window.dispatchEvent(new Event("offline")));
  await expect(bob.getByRole("status")).toContainText("Reconnecting live updates");
  await alice.getByLabel("Game length").selectOption("5");
  await alice.getByRole("button", { name: "Start game" }).click();
  await expect(alice.locator(".game-view")).toHaveAttribute("data-revision", "3");
  await bobContext.setOffline(false);
  await bob.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(bob.getByRole("status")).toContainText("Live updates connected.", {
    timeout: 15_000,
  });
  await expect.poll(() => bobSnapshotRequests, { timeout: 15_000 }).toBe(2);
  await expect(bob.locator(".game-view")).toHaveAttribute("data-revision", "3");

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
  const sourceCard = alice.getByRole("button", { name: sourceLabel(command) });
  const destination = alice.getByRole("group", {
    name: `Discard pile ${command.discardPileIndex + 1}`,
  });
  await expect(sourceCard).toBeEnabled();
  await expect(sourceCard).toHaveClass(/actionable/);
  const sourceBox = await sourceCard.boundingBox();
  const destinationBox = await destination.boundingBox();
  if (sourceBox === null || destinationBox === null) {
    throw new Error("Expected visible drag source and destination");
  }
  await alice.mouse.move(
    sourceBox.x + sourceBox.width / 2,
    sourceBox.y + sourceBox.height / 2,
  );
  await alice.mouse.down();
  await alice.waitForTimeout(100);
  await alice.mouse.move(
    sourceBox.x + sourceBox.width / 2 + 12,
    sourceBox.y + sourceBox.height / 2,
    { steps: 3 },
  );
  await expect(destination).toHaveClass(/drop-allowed/);
  await alice.mouse.move(
    destinationBox.x + destinationBox.width / 2,
    destinationBox.y + destinationBox.height / 2,
    { steps: 12 },
  );
  await expect(destination).toHaveClass(/drop-hover/);
  await alice.mouse.up();
  await expect(alice.locator(".game-view")).toHaveAttribute("data-revision", "4");
  await expect(bob.locator(".game-view")).toHaveAttribute("data-revision", "4");
  await expect(bob.getByRole("heading", { level: 1, name: "Bob" })).toBeVisible();
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

  const bobCommand = bobView.legalCommands.find(
    (candidate) => candidate.type === "discardCard",
  );
  if (bobCommand?.type !== "discardCard") {
    throw new Error("Expected Bob to have a legal discard");
  }
  const bobSource = bob.getByRole("button", { name: sourceLabel(bobCommand) });
  const bobDestination = bob.getByRole("group", {
    name: `Discard pile ${bobCommand.discardPileIndex + 1}`,
  });
  await bobSource.scrollIntoViewIfNeeded();
  const bobSourceBox = await bobSource.boundingBox();
  const bobDestinationBox = await bobDestination.boundingBox();
  if (bobSourceBox === null || bobDestinationBox === null) {
    throw new Error("Expected visible touch source and destination");
  }
  const sourcePoint = {
    x: bobSourceBox.x + bobSourceBox.width / 2,
    y: bobSourceBox.y + bobSourceBox.height / 2,
  };
  const destinationPoint = {
    x: bobDestinationBox.x + bobDestinationBox.width / 2,
    y: bobDestinationBox.y + bobDestinationBox.height / 2,
  };
  await dispatchTouch(bobSource, "touchstart", sourcePoint);
  await dispatchTouch(bobSource, "touchmove", {
    x: sourcePoint.x + 8,
    y: sourcePoint.y,
  });
  await expect(bobDestination).toHaveClass(/drop-allowed/);
  await dispatchTouch(bobSource, "touchmove", destinationPoint);
  await expect(bobDestination).toHaveClass(/drop-hover/);
  await dispatchTouch(bobSource, "touchend", destinationPoint);
  await expect(alice.locator(".game-view")).toHaveAttribute("data-revision", "5");
  await expect(bob.locator(".game-view")).toHaveAttribute("data-revision", "5");
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
