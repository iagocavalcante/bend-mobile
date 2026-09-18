import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";

export const androidSDK = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ??
  `${homedir()}/${process.platform === "darwin" ? "Library/Android/sdk" : "Android/Sdk"}`;

export function shaderCompiler(): string {
  const host = process.platform === "darwin" ? "darwin-x86_64" : "linux-x86_64";
  const ndks = existsSync(`${androidSDK}/ndk`) ? readdirSync(`${androidSDK}/ndk`).sort((a, b) => b.localeCompare(a, undefined, { numeric: true })) : [];
  const command = process.env.GLSLC ?? ndks.map(n => `${androidSDK}/ndk/${n}/shader-tools/${host}/glslc`).find(existsSync);
  if (!command) throw new Error("Install the Android NDK or set GLSLC to its shader compiler to build the Vulkan backend.");
  return command;
}

export function doctor() {
  let failed = false;
  for (const [label, command] of [["Git", () => "git"], ["C++ compiler", () => "clang++"], ["Vulkan shader compiler", shaderCompiler]] as const) {
    try {
      execFileSync(command(), ["--version"], { stdio: "pipe" });
      console.log(`OK: ${label}`);
    } catch (error) {
      failed = true;
      console.error(`Missing or unusable ${label}: ${error instanceof Error ? error.message : error}`);
    }
  }
  console.log(`Bun ${Bun.version}; Android SDK: ${androidSDK}`);
  console.log("Native app builds additionally need Xcode + XcodeGen on macOS, or JDK 17 + Android SDK 36/NDK 27.1.12297006. See docs/getting-started.md.");
  if (failed) throw new Error("Fix the prerequisites above, then run bun run doctor again.");
}

if (import.meta.main) {
  try { doctor(); } catch (error) { console.error((error as Error).message); process.exitCode = 1; }
}
