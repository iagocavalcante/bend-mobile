import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { compiler, revision } from "./setup";

const root = resolve(import.meta.dir, "..");
const app = resolve(process.argv[2] ?? `${root}/examples/counter.bend`);
if (execFileSync("git", ["-C", compiler, "rev-parse", "HEAD"], { encoding: "utf8" }).trim() !== revision) {
  throw new Error("Unexpected Bend version. Run bun run setup.");
}
const { default: bend } = await import(pathToFileURL(`${compiler}/bend2/main.ts`).href);
const result = await Bun.build({
  entrypoints: [`${root}/runtime/bridge.ts`],
  target: "browser",
  format: "iife",
  plugins: [{ name: "app", setup(build) {
    build.onResolve({ filter: /^bend-app$/ }, () => ({ path: app }));
  } }, bend],
});
if (!result.success) throw new AggregateError(result.logs, "Bend mobile build failed");
const code = await result.outputs[0].text();
for (const directory of ["dist", "ios/Resources", "android/app/src/main/assets"]) {
  mkdirSync(`${root}/${directory}`, { recursive: true });
  await Bun.write(`${root}/${directory}/app.js`, code);
  await Bun.write(`${root}/${directory}/Bend-LICENSE.txt`, Bun.file(`${compiler}/LICENSE`));
}
console.log(`Built ${app} for iOS and Android (${code.length} bytes).`);
