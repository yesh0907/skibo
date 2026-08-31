import { describe, expect, test } from "bun:test";

const webRoot = new URL("../web/", import.meta.url);

describe("browser UI artifacts", () => {
  test("builds the React client as the root application", async () => {
    const build = await Bun.file(new URL("build.ts", webRoot)).text();

    expect(build).toContain("outdir: outputDirectory.pathname");
    expect(build).not.toContain("reactOutputDirectory");
    expect(build).not.toContain("cp(publicDirectory");
  });

  test("keeps the established game-table visual contract", async () => {
    const css = await Bun.file(new URL("styles.css", webRoot)).text();

    expect(css).toContain("--paper: #f4f6f2");
    expect(css).toContain(".brand-cards");
    expect(css).toContain(".entry-grid");
    expect(css).toContain(".opponents-zone");
    expect(css).toContain(".table-zone");
    expect(css).toContain(".player-zone");
    expect(css).toContain(".drop-allowed");
    expect(css).toContain(".winner-overlay");
  });

  test("keeps card controls and mobile layouts stable", async () => {
    const css = await Bun.file(new URL("styles.css", webRoot)).text();

    expect(css).toContain("aspect-ratio: 5 / 7");
    expect(css).toContain("@media (max-width: 700px)");
    expect(css).toContain(".drag-overlay");
    expect(css).toContain(".drop-allowed");
    expect(css).toContain(".winner-overlay");
    expect(css).toContain(".opponent-stock .card");
  });

  test("shows an assigned build value for a played wild card", async () => {
    const card = await Bun.file(new URL("components/card.tsx", webRoot)).text();

    expect(card).toContain("assignedValue");
    expect(card).toContain('className="wild-label"');
  });
});
