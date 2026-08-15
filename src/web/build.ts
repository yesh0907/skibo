import { cp, mkdir, rm } from "node:fs/promises";

import tailwind from "bun-plugin-tailwind";

const projectRoot = new URL("../../", import.meta.url);
const publicDirectory = new URL("public/", projectRoot);
const outputDirectory = new URL("dist/", projectRoot);
const reactOutputDirectory = new URL("react/", outputDirectory);

await rm(outputDirectory, { force: true, recursive: true });
await mkdir(outputDirectory, { recursive: true });
await cp(publicDirectory, outputDirectory, { recursive: true });

const result = await Bun.build({
  entrypoints: [new URL("index.html", import.meta.url).pathname],
  outdir: reactOutputDirectory.pathname,
  minify: true,
  plugins: [tailwind],
  sourcemap: "linked",
  target: "browser",
});

if (!result.success) {
  for (const log of result.logs) {
    console.error(log);
  }
  throw new Error("React web build failed");
}
