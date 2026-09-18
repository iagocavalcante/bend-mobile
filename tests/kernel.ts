import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import bend from "../.cache/bend/bend2/main";
import { buildKernel, kernelExpression } from "../scripts/kernel";

Bun.plugin(bend);
const dir = mkdtempSync(`${tmpdir()}/bend-native-`);
try {
  const file = `${dir}/helpers.bend`;
  writeFileSync(file, `import Base

def mix(+x: U32, y: U32) -> U32:
  shifted = (x * 33 : U32)
  (U32.xor(shifted, y) + x : U32)

def compute(+x: U32) -> U32:
  +y = mix(x, 4294967295)
  x = (x + 1 : U32)
  mix(mix(y, x), y)
`);
  await buildKernel(dir, file); // Also compiles the generated Vulkan shader.
  const reference = (await import(file)).default;
  const inputs = [0, 1, 2, 0x7fffffff, 0x80000000, 0xfffffffe, 0xffffffff];
  for (let i = 0; i < 4099; i++) inputs.push(Math.imul(i, 2654435761) >>> 0);
  writeFileSync(`${dir}/check.cpp`, `#include "native/generated/kernel.h"
#include <cstdio>
#include <initializer_list>
int main() { for (uint32_t x : {${inputs.map(x => `${x}u`).join(",")}}) printf("%u\\n", bend_kernel(x)); }
`);
  execFileSync("clang++", ["-std=c++17", `${dir}/check.cpp`, "-o", `${dir}/check`]);
  const actual = execFileSync(`${dir}/check`, { encoding: "utf8" }).trim().split("\n").map(Number);
  assert.deepEqual(actual, inputs.map(x => reference.compute(x)));
  if (process.platform === "darwin") {
    execFileSync("xcrun", ["-sdk", "iphoneos", "metal", "-c", `${dir}/native/generated/kernel.metal`, "-o", `${dir}/kernel.air`]);
  }
  // Inlining must stop before repeated bindings produce unbounded shader text.
  writeFileSync(file, `import Base\ndef compute(+x: U32) -> U32:\n` +
    Array.from({ length: 20 }, (_, i) => `  +x${i} = (${i ? `x${i-1}` : "x"} + ${i ? `x${i-1}` : "x"} : U32)\n`).join("") + "  x19\n");
  await assert.rejects(() => kernelExpression(file), /too large/);
  // Non-U32 helper signatures remain outside the supported boundary.
  writeFileSync(file, "import Base\ndef helper(x: Bool) -> U32:\n  1\ndef compute(x: U32) -> U32:\n  helper(True{})\n");
  await assert.rejects(() => kernelExpression(file), /Unsupported native kernel helper/);
  assert.ok(readFileSync(`${dir}/android/app/src/main/assets/kernel.spv`).length > 0);
  console.log("PASS: helper/local-binding CPU parity with Bend across 4,106 inputs, shader compilation, type and expansion limits.");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
