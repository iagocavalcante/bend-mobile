import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import bend from "../.cache/bend/bend2/main";

Bun.plugin(bend);
const { default: counter } = await import("../examples/counter.bend");
assert.equal(counter.update("increment", 4294967295), 4294967295);
assert.equal(counter.update("reset", 4294967295), 0);
assert.equal(counter.update("missing", 7), 7);

const context = vm.createContext({});
vm.runInContext(readFileSync(new URL("../dist/app.js", import.meta.url), "utf8"), context);
const app = context.BendMobile;
const count = (result: string) => JSON.parse(result).tree.children[2].text;
assert.equal(count(app.render()), "Count: 0");
for (let n = 1; n <= 20; n++) assert.equal(count(app.dispatch("increment")), `Count: ${n}`);
for (const action of ["missing", "increment'); throw new Error('injected", null, {}, 1]) {
  assert.match(JSON.parse(app.dispatch(action)).error, /Unknown action/);
  assert.equal(count(app.render()), "Count: 20");
}
assert.equal(count(app.dispatch("reset")), "Count: 0");
assert.equal(count(app.dispatch("increment")), "Count: 1");
console.log("PASS: compiled Bend renders, dispatches, resets, and rejects invalid actions.");
