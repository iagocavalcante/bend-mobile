import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const dir = mkdtempSync(`${tmpdir()}/bend-bootstrap-`);
try {
  const result = spawnSync(process.execPath, ["run", "bootstrap"], {
    cwd: resolve(import.meta.dir, ".."),
    env: { ...process.env, GLSLC: `${dir}/missing-glslc` }, encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Missing or unusable Vulkan shader compiler/);
  assert.doesNotMatch(result.stderr, /\$ bun scripts\/(setup|build)\.ts/);
  // Exercise Bun's actual hook dispatch without downloading Bend in every test.
  const template = `${dir}/templates/starter`;
  mkdirSync(template, { recursive: true });
  const pkg = JSON.parse(readFileSync(resolve(import.meta.dir, "../package.json"), "utf8"));
  // Generated projects no longer have bun-create; keep their tests runnable too.
  const hook = pkg["bun-create"] ?? { postinstall: "/usr/bin/env bun run bootstrap" };
  writeFileSync(`${template}/package.json`, JSON.stringify({ name: "starter", "bun-create": hook, scripts: { bootstrap: "bun ready.ts" } }));
  writeFileSync(`${template}/ready.ts`, 'await Bun.write("ready", "yes");');
  const created = spawnSync(process.execPath, ["create", "starter", `${dir}/my-app`, "--no-git"], {
    env: { ...process.env, BUN_CREATE_DIR: `${dir}/templates` }, encoding: "utf8",
  });
  assert.equal(created.status, 0, created.stderr);
  assert.ok(existsSync(`${dir}/my-app/ready`), "Bun must execute the setup hook, not merely copy the template");
  console.log("PASS: template setup hook executes; missing compiler stops bootstrap before fetching or building.");
} finally { rmSync(dir, { recursive: true, force: true }); }
