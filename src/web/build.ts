import { copyFile, rm } from "node:fs/promises";

const projectRoot = new URL("../../", import.meta.url);
const outputDirectory = new URL("dist/", projectRoot);

await rm(outputDirectory, { force: true, recursive: true });

const result = await Bun.build({
  entrypoints: [new URL("index.html", import.meta.url).pathname],
  outdir: outputDirectory.pathname,
  minify: true,
  sourcemap: "linked",
  target: "browser",
});

if (!result.success) {
  for (const log of result.logs) {
    console.error(log);
  }
  throw new Error("React web build failed");
}

await copyFile(
  new URL("_redirects", import.meta.url),
  new URL("_redirects", outputDirectory),
);
