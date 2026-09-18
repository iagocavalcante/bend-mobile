import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import vm from "node:vm";
import bend from "../.cache/bend/bend2/main";
import { kernelExpression } from "../scripts/kernel";

Bun.plugin(bend);
const { default: counter } = await import("../examples/counter.bend");
const model = (count = 0, name = "") => ({ $: "Model", count, name, result: "" });
assert.equal(counter.update("increment", "", model(4294967295)).count, 4294967295);
assert.equal(counter.update("reset", "", model(4294967295)).count, 0);
assert.equal(counter.restore("invalid").$, "None");
const unicode = 'Iago 👋 漢字\n"quotes"';
assert.equal(counter.restore(counter.save(model(42, unicode))).value.name, unicode);

const code = readFileSync(new URL("../dist/app.js", import.meta.url), "utf8");
function runtime() {
  const context = vm.createContext({});
  vm.runInContext(code, context);
  return context.BendMobile;
}
function accept(app: any, raw: string) {
  const frame = JSON.parse(raw);
  assert.equal(frame.error, undefined);
  app.commit();
  return frame;
}
const count = (frame: any) => frame.tree.children[2].text;
let app = runtime();
assert.equal(count(accept(app, app.start())), "Count: 0");
for (let n = 1; n <= 20; n++) assert.equal(count(accept(app, app.send("action", "increment"))), `Count: ${n}`);
assert.match(JSON.parse(app.send("action", "missing")).error, /Unknown/);
assert.match(JSON.parse(app.send("input", "name", "x".repeat(16385))).error, /Invalid UI text/);
// Simulated storage failure: abort must retain the last committed model.
assert.equal(count(JSON.parse(app.send("action", "increment"))), "Count: 21");
app.abort();
assert.equal(count(accept(app, app.send("action", "increment"))), "Count: 21");
accept(app, app.send("input", "name", unicode));
const details = accept(app, app.send("navigate", "details"));
assert.equal(details.route, "details");
assert.equal(details.canGoBack, true);
assert.equal(details.tree.children[1].text, `Hello, ${unicode}`);
assert.match(JSON.parse(app.send("input", "name", "stale")).error, /Unknown/);
assert.match(JSON.parse(app.send("result", "computed", "[1]")).error, /Invalid native result/);
accept(app, app.send("result", "computed", "[1,2,5,10,2]"));
app = runtime();
const restored = accept(app, app.start(details.snapshot));
assert.equal(restored.route, "details");
assert.equal(restored.tree.children[1].text, `Hello, ${unicode}`);
assert.equal(count(restored), "Count: 21");
assert.equal(accept(app, app.send("back")).route, "home");
assert.equal(accept(app, app.send("back")).canGoBack, false);
assert.equal(count(accept(app, app.send("action", "reset"))), "Count: 0");
for (const bad of ["{", JSON.stringify({ version: 99, state: "0\n", stack: ["home"] }),
  JSON.stringify({ version: 1, state: "bad", stack: ["home"] }),
  JSON.stringify({ version: 1, state: "0\n", stack: ["unknown"] })]) {
  assert.ok(JSON.parse(runtime().start(bad)).error);
}
const dir = mkdtempSync(`${tmpdir()}/bend-kernel-test-`);
try {
  const file = `${dir}/kernel.bend`;
  writeFileSync(file, "import Base\ndef compute(+x: U32) -> U32:\n  (x / 2 : U32)\n");
  await assert.rejects(() => kernelExpression(file), /Unsupported native kernel/);
} finally { rmSync(dir, { recursive: true }); }
assert.equal(await kernelExpression(new URL("../examples/kernel.bend", import.meta.url).pathname), "((x * x) + 1u)");
console.log("PASS: navigation, text, restore, failed-save rollback, native result validation and kernel rejection.");
