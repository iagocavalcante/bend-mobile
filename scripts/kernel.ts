import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { compiler } from "./setup";

// A deliberately bounded backend: type-check with Bend, lower its typed core,
// then emit identical unsigned scalar expressions for C++, Metal and Vulkan.
export async function kernelExpression(file: string): Promise<string> {
  const B = await import(pathToFileURL(`${compiler}/bend2/bend.ts`).href);
  const book = B.book_nil();
  await B.book_load(book, resolve(file), "", new Map());
  B.book_valid(book);
  if (book.hols || book.open) throw new Error("Kernel contains unproved holes");
  const def = book.tlds.compute;
  if (def?.$ !== "Def" || !def.v || def.u || !/^@\+?[^:]+:U32 -> U32$/.test(B.term_show(B.term_lower(def.T)))) {
    throw new Error("Native kernel must define safe compute(x: U32) -> U32");
  }
  const lambda = B.term_lower(def.v);
  if (lambda.$ !== "Lam") throw new Error("Expected a scalar kernel");
  const operators: Record<string, string> = {
    "U32.add": "+", "U32.sub": "-", "U32.mul": "*",
    "U32.and": "&", "U32.or": "|", "U32.xor": "^",
  };
  let budget = 1024;
  function emit(term: any): string {
    if (--budget < 0) throw new Error("Kernel expression is too large");
    if (term.$ === "Ann") return emit(term.x);
    if (term.$ === "Var" && term.i === lambda.i) return "x";
    if (term.$ === "Ctr" && term.k === "U32") {
      const value = B.term_show(term);
      if (/^\d+$/.test(value) && BigInt(value) <= 0xffffffffn) return `${value}u`;
    }
    if (term.$ === "App") {
      const [fn, args] = B.term_unapply(term);
      if (fn.$ === "Ref" && operators[fn.k] && args.length === 2) {
        return `(${emit(args[0])} ${operators[fn.k]} ${emit(args[1])})`;
      }
    }
    throw new Error("Unsupported native kernel construct. Supported: U32 literals, parameter, add/sub/mul/and/or/xor.");
  }
  return emit(lambda.f);
}

export async function buildKernel(root: string, file: string) {
  const expression = await kernelExpression(file);
  const dir = `${root}/native/generated`;
  mkdirSync(dir, { recursive: true });
  await Bun.write(`${dir}/kernel.h`, `// Generated from ${file.split("/").at(-1)}; do not edit.\n#pragma once\n#include <stdint.h>\nstatic inline uint32_t bend_kernel(uint32_t x) { return ${expression}; }\n`);
  await Bun.write(`${dir}/kernel.metal`, `#include <metal_stdlib>\nusing namespace metal;\nkernel void bend_map(device const uint* src [[buffer(0)]], device uint* dst [[buffer(1)]], constant uint& count [[buffer(2)]], uint i [[thread_position_in_grid]]) {\n  if (i < count) { uint x = src[i]; dst[i] = ${expression}; }\n}\n`);
  await Bun.write(`${dir}/kernel.comp`, `#version 450\nlayout(local_size_x=64) in;\nlayout(set=0,binding=0,std430) readonly buffer Input { uint src[]; };\nlayout(set=0,binding=1,std430) writeonly buffer Output { uint dst[]; };\nlayout(push_constant) uniform Size { uint count; };\nvoid main() { uint i=gl_GlobalInvocationID.x; if(i<count) { uint x=src[i]; dst[i]=${expression}; } }\n`);
  const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? `${homedir()}/${process.platform === "darwin" ? "Library/Android/sdk" : "Android/Sdk"}`;
  const host = process.platform === "darwin" ? "darwin-x86_64" : "linux-x86_64";
  const ndks = existsSync(`${sdk}/ndk`) ? readdirSync(`${sdk}/ndk`).sort((a,b) => b.localeCompare(a, undefined, { numeric: true })) : [];
  const glslc = process.env.GLSLC ?? ndks.map(n => `${sdk}/ndk/${n}/shader-tools/${host}/glslc`).find(existsSync);
  if (!glslc) throw new Error("Install the Android NDK or set GLSLC to its shader compiler to build the Vulkan backend.");
  const assets = `${root}/android/app/src/main/assets`;
  mkdirSync(assets, { recursive: true });
  execFileSync(glslc, ["--target-env=vulkan1.0", `${dir}/kernel.comp`, "-o", `${assets}/kernel.spv`], { stdio: "inherit" });
}
