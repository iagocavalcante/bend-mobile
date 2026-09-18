import App from "bend-app";

const MAX_SNAPSHOT = 262144;
const routes = list(App.routes());
if (!routes.length || routes.some(route => typeof route !== "string") || new Set(routes).size !== routes.length) {
  throw new Error("routes() must return a nonempty list of unique route names");
}
let current: any = null;
let pending: any = null;

function list(value: any): any[] {
  const result = [];
  while (value?.$ === "Con" && result.length < 1000) {
    result.push(value.head);
    value = value.tail;
  }
  if (value?.$ !== "Nil") throw new Error("Invalid or oversized Bend list");
  return result;
}

function text(value: unknown): string {
  if (typeof value !== "string" || value.length > 16384) throw new Error("Invalid UI text");
  return value;
}

function prepare(state: any, stack: string[]) {
  let remaining = 1000;
  const allowed = new Map<string, number>();
  const keys = new Set<string>();
  function node(value: any, path = "root", depth = 0): any {
    if (!value || --remaining < 0 || depth > 64) throw new Error("UI tree is too large");
    const kind = value.$?.split(".").at(-1);
    const id = kind === "Input" ? `input:${text(value.key)}` : path;
    if (keys.has(id)) throw new Error(`Duplicate view key: ${id}`);
    keys.add(id);
    switch (kind) {
      case "Text": return { id, kind, text: text(value.text) };
      case "Input":
      case "Button":
      case "Compute": {
        const action = text(value.action);
        const event = kind === "Input" ? "input" : kind === "Compute" ? "result" : "action";
        const input = kind === "Compute" ? list(value.input) : [];
        if (input.some(x => !Number.isInteger(x) || x < 0 || x > 0xffffffff)) throw new Error("Invalid U32 input");
        if (kind === "Compute" && !["cpu", "gpu"].includes(value.backend)) throw new Error("Invalid compute backend");
        allowed.set(JSON.stringify([event, action]), input.length);
        return { id, kind, text: text(value.label), action, event,
          ...(kind === "Input" ? { value: text(value.value) } : {}),
          ...(kind === "Compute" ? { input, backend: value.backend } : {}) };
      }
      case "Link": {
        const route = text(value.route);
        if (!routes.includes(route)) throw new Error(`Unknown route: ${route}`);
        allowed.set(JSON.stringify(["navigate", route]), 0);
        return { id, kind: "Button", text: text(value.label), event: "navigate", action: route };
      }
      case "Back": return { id, kind: "Button", text: text(value.label), event: "back", action: "", disabled: stack.length === 1 };
      case "Column":
      case "Row": return { id, kind, children: list(value.children).map((child, i) => node(child, `${path}.${i}`, depth + 1)) };
      default: throw new Error(`Unsupported UI node: ${kind}`);
    }
  }
  const tree = node(App.view(stack.at(-1), state));
  const saved = App.save(state);
  if (typeof saved !== "string") throw new Error("save() must return a String");
  const snapshot = JSON.stringify({ version: App.schema(), state: saved, stack });
  if (snapshot.length > MAX_SNAPSHOT) throw new Error("Snapshot exceeds 256K characters");
  pending = { state, stack, allowed };
  return { tree, snapshot, canGoBack: stack.length > 1, route: stack.at(-1) };
}

function attempt(operation: () => any) {
  try {
    if (pending) throw new Error("Commit or abort the pending frame first");
    return JSON.stringify(operation());
  } catch (error) { return JSON.stringify({ error: String(error) }); }
}

globalThis.BendMobile = {
  start(snapshot: unknown = null) {
    return attempt(() => {
      if (snapshot === null) return prepare(App.init(), [routes[0]]);
      if (typeof snapshot !== "string" || snapshot.length > MAX_SNAPSHOT) throw new Error("Invalid saved state");
      const saved = JSON.parse(snapshot);
      if (saved?.version !== App.schema() || typeof saved.state !== "string"
        || !Array.isArray(saved.stack) || !saved.stack.length || saved.stack.length > 32
        || saved.stack[0] !== routes[0] || saved.stack.some((route: any) => !routes.includes(route))) {
        throw new Error("Saved state has an incompatible schema or route stack; original data was preserved");
      }
      const restored = App.restore(saved.state);
      if (restored?.$ !== "Some") throw new Error("App rejected saved state; original data was preserved");
      return prepare(restored.value, saved.stack);
    });
  },
  send(event: unknown, action: unknown = "", value: unknown = "") {
    return attempt(() => {
      if (!current) throw new Error("Start the app first");
      if (event === "back") return prepare(current.state, current.stack.length > 1 ? current.stack.slice(0, -1) : current.stack);
      const key = JSON.stringify([event, action]);
      if (!current.allowed.has(key)) throw new Error("Unknown event or action");
      if (event === "navigate") {
        if (current.stack.length >= 32) throw new Error("Navigation stack is full");
        return prepare(current.state, [...current.stack, action]);
      }
      const payload = text(value);
      if (event === "result") {
        const result = JSON.parse(payload);
        if (!Array.isArray(result) || result.length !== current.allowed.get(key)
          || result.some(x => !Number.isInteger(x) || x < 0 || x > 0xffffffff)) throw new Error("Invalid native result");
      }
      return prepare(App.update(action, payload, current.state), current.stack);
    });
  },
  // Hosts durably save the snapshot before committing or displaying a new frame.
  commit() {
    if (!pending) throw new Error("No pending frame");
    current = pending;
    pending = null;
  },
  abort() { pending = null; },
};
