import App from "bend-app";

// ponytail: sequential JS and full view replacement; use a native Bend runtime
// and keyed updates when measured workloads or stateful controls require them.
let state = App.init();
let actions = new Set<string>();

function render(value: any) {
  const nextActions = new Set<string>();
  let remaining = 1000;
  function text(value: unknown): string {
    if (typeof value !== "string" || value.length > 16384) throw new Error("Invalid UI text");
    return value;
  }
  function node(value: any, depth = 0): object {
    if (!value || --remaining < 0 || depth > 64) throw new Error("UI tree is too large");
    // Imported Bend constructors may have a module-qualified name.
    const kind = value.$?.split(".").at(-1);
    switch (kind) {
      case "Text": return { kind, text: text(value.text) };
      case "Button": {
        const action = text(value.action);
        nextActions.add(action);
        return { kind, text: text(value.label), action };
      }
      case "Column":
      case "Row": {
        const children = [];
        let list = value.children;
        while (list?.$ === "Con") {
          children.push(node(list.head, depth + 1));
          list = list.tail;
        }
        if (list?.$ !== "Nil") throw new Error("Invalid UI children");
        return { kind, children };
      }
      default: throw new Error(`Unsupported UI node: ${kind}`);
    }
  }
  const tree = node(App.view(value));
  actions = nextActions;
  return tree;
}

globalThis.BendMobile = {
  render() {
    try { return JSON.stringify({ tree: render(state) }); }
    catch (error) { return JSON.stringify({ error: String(error) }); }
  },
  dispatch(action: unknown) {
    try {
      if (typeof action !== "string" || !actions.has(action)) throw new Error("Unknown action");
      const next = App.update(action, state);
      const tree = render(next);
      state = next;
      return JSON.stringify({ tree });
    } catch (error) { return JSON.stringify({ error: String(error) }); }
  },
};
