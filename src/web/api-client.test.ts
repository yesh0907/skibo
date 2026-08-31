import { afterEach, describe, expect, mock, test } from "bun:test";

import { playingPlayerViewFixture } from "../tests/fixtures/transport";
import { GameApiError, gameApi } from "./api-client";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("gameApi", () => {
  test("uses same-origin cookies and sends no JavaScript credential", async () => {
    const fetchMock = mock(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json(playingPlayerViewFixture));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await gameApi.command("game/id", {
      expectedRevision: 3,
      command: playingPlayerViewFixture.legalCommands[0]!,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [path, init] = fetchMock.mock.calls[0]!;
    if (init === undefined) throw new Error("Expected fetch options");
    expect(path).toBe("/api/games/game%2Fid/commands");
    expect(init.credentials).toBe("same-origin");
    expect(init.headers).toEqual({ "content-type": "application/json" });
    expect(JSON.stringify(init)).not.toContain("authorization");
    expect(JSON.stringify(init)).not.toContain("playerToken");
  });

  test("rejects malformed success payloads with a safe error", async () => {
    globalThis.fetch = mock(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({ playerToken: "secret" })) as unknown as typeof fetch;

    await expect(gameApi.read("game_1")).rejects.toMatchObject({
      payload: { error: { code: "internal_error", message: "The game server returned an invalid response." } },
    });
  });

  test("preserves structured API errors", async () => {
    globalThis.fetch = mock(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json(
      { error: { code: "stale_revision", message: "Refresh required", currentRevision: 4 } },
      { status: 409 },
    )) as unknown as typeof fetch;

    try {
      await gameApi.read("game_1");
      throw new Error("Expected request to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(GameApiError);
      expect((error as GameApiError).payload.error.currentRevision).toBe(4);
    }
  });

  test("leaves a waiting room with the current revision and cookie session", async () => {
    const fetchMock = mock(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({ revision: 3 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await gameApi.leave("game/id", { expectedRevision: 2 });

    const [path, init] = fetchMock.mock.calls[0]!;
    expect(path).toBe("/api/games/game%2Fid/players/me");
    expect(init).toMatchObject({
      method: "DELETE",
      credentials: "same-origin",
      body: JSON.stringify({ expectedRevision: 2 }),
    });
    expect(JSON.stringify(init)).not.toContain("authorization");
    expect(JSON.stringify(init)).not.toContain("playerToken");
  });
});
