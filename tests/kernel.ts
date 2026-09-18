import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import bend from "../.cache/bend/bend2/main";
import { buildKernel, kernelExpression } from "../scripts/kernel";

Bun.plugin(bend);
const dir = mkdtempSync(`${tmpdir()}/bend-native-`);
try {
  const sources = [`import Base

def mix(+x: U32, y: U32) -> U32:
  shifted = (x * 33 : U32)
  (U32.xor(shifted, y) + x : U32)

def compute(+x: U32) -> U32:
  +y = mix(x, 4294967295)
  x = (x + 1 : U32)
  mix(mix(y, x), y)
`, `import Base
def select(c: Bool, yes: U32, no: U32) -> U32:
  match c:
    case False{}:
      no
    case True{}:
      yes
def compute(+x: U32) -> U32:
  a = select(U32.is_eq(x, 2147483648), 1, 0)
  b = select(U32.is_ne(x, 2147483648), 2, 0)
  c = select(U32.is_lt(x, 2147483648), 4, 0)
  d = select(U32.is_le(x, 2147483648), 8, 0)
  e = select(U32.is_gt(x, 2147483648), 16, 0)
  f = select(U32.is_ge(x, 2147483648), 32, 0)
  (a + b + c + d + e + f : U32)
`, `import Base
def choose(c: Bool, x: U32, y: U32) -> U32:
  match c:
    case True{}:
      x
    case _:
      y
def nested(a: Bool, b: Bool, x: U32) -> U32:
  match a b:
    case True{} False{}:
      x
    case True{} True{}:
      42
    case False{} b:
      choose(b, 0, 4294967295)
def even(x: U32) -> Bool:
  U32.is_eq(U32.and(x, 1), 0)
def compute(+x: U32) -> U32:
  high = Bool.or(False{}, Bool.xor(False{}, Bool.and(True{}, Bool.not(U32.is_le(x, 2147483647)))))
  nested(even(x), high, x)
`, readFileSync(new URL("../examples/kernel.bend", import.meta.url), "utf8")];
  const inputs = [0, 1, 2, 65534, 65535, 65536, 0x7fffffff, 0x80000000, 0xfffffffe, 0xffffffff];
  for (let i = 0; i < 4099; i++) inputs.push(Math.imul(i, 2654435761) >>> 0);
  for (const [index, source] of sources.entries()) {
    const file = `${dir}/kernel${index}.bend`;
    writeFileSync(file, source);
    await buildKernel(dir, file); // Also compiles the generated Vulkan shader.
    const reference = (await import(file)).default;
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
  }
  const file = `${dir}/rejected.bend`;
  // Inlining must stop before repeated bindings produce unbounded shader text.
  writeFileSync(file, `import Base\ndef compute(+x: U32) -> U32:\n` +
    Array.from({ length: 20 }, (_, i) => `  +x${i} = (${i ? `x${i-1}` : "x"} + ${i ? `x${i-1}` : "x"} : U32)\n`).join("") + "  x19\n");
  await assert.rejects(() => kernelExpression(file), /too large/);
  // Non-scalar helper signatures remain outside the supported boundary.
  writeFileSync(file, "import Base\ndef helper(x: Nat) -> U32:\n  1\ndef compute(x: U32) -> U32:\n  helper(0n)\n");
  await assert.rejects(() => kernelExpression(file), /Unsupported native kernel helper/);
  writeFileSync(file, "import Base\ndef helper(c: Bool, x: U32) -> U32:\n  match c:\n    case True{}:\n      x\n    case False{}:\n      (x / 2 : U32)\ndef compute(x: U32) -> U32:\n  helper(True{}, x)\n");
  await assert.rejects(() => kernelExpression(file), /Unsupported native kernel/);
  assert.ok(readFileSync(`${dir}/android/app/src/main/assets/kernel.spv`).length > 0);
  console.log(`PASS: helpers, comparisons and nested/default Bool matches agree with Bend across ${inputs.length} inputs per kernel; shaders compile and limits hold.`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
