import { describe, expect, test } from "bun:test";

const publicRoot = new URL("../../public/", import.meta.url);

describe("browser UI artifacts", () => {
  test("ships the playable create, join, waiting, and game-table views", async () => {
    const html = await Bun.file(new URL("index.html", publicRoot)).text();

    expect(html).toContain('id="create-form"');
    expect(html).toContain('id="join-form"');
    expect(html).toContain('id="waiting-view"');
    expect(html).toContain('id="build-piles"');
    expect(html).toContain('id="your-hand"');
    expect(html).toContain('id="action-tray"');
  });

  test("uses bearer headers and exact server commands without URL tokens", async () => {
    const script = await Bun.file(new URL("app.js", publicRoot)).text();

    expect(script).toContain("authorization: `Bearer ${state.playerToken}`");
    expect(script).toContain("state.view.legalCommands.filter");
    expect(script).toContain("if (extraClass) card.classList.add(extraClass)");
    expect(script).toContain('sessionStorage.setItem(');
    expect(script).not.toContain("localStorage");
    expect(script).not.toContain("?playerToken=");
  });

  test("keeps card controls and mobile layouts stable", async () => {
    const css = await Bun.file(new URL("styles.css", publicRoot)).text();

    expect(css).toContain("aspect-ratio: 5 / 7");
    expect(css).toContain("@media (max-width: 700px)");
    expect(css).toContain(".action-tray");
  });
});
