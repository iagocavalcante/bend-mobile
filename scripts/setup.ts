import { existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

export const revision = "0b7e2b11c1054f5d0f4eb955cadb47997ef1115d";
export const compiler = resolve(import.meta.dir, "../.cache/bend");

if (import.meta.main) {
  if (!existsSync(compiler)) {
    mkdirSync(compiler, { recursive: true });
    execFileSync("git", ["init", compiler], { stdio: "inherit" });
    execFileSync("git", ["-C", compiler, "remote", "add", "origin", "https://github.com/bendlang/bend.git"]);
  }
  execFileSync("git", ["-C", compiler, "fetch", "--depth", "1", "origin", revision], { stdio: "inherit" });
  execFileSync("git", ["-C", compiler, "checkout", "--detach", revision], { stdio: "inherit" });
}
