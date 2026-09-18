# Bend Mobile

Write mobile UI and app logic in [Bend](https://github.com/bendlang/bend).
Render native controls on iOS and Android.

**Experimental.** The counter app works on both platforms. Supported controls:
text, buttons, rows, and columns. Bend compiles to JavaScript, running through
JavaScriptCore on iOS and a headless WebView on Android.

## Get started

Requires [Bun](https://bun.sh) and Git.

```sh
git clone https://github.com/iagocavalcante/bend-mobile.git
cd bend-mobile
bun run setup
bun run build
bun run test
```

See the [getting-started guide](docs/getting-started.md) for iOS/Android setup
and the app API. Start with the [counter example](examples/counter.bend).

## Status

State is in memory; views are rebuilt after each action. Navigation, persistence,
text input, and native CPU/GPU parallelism are not implemented yet.

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md), or
[open an issue](https://github.com/iagocavalcante/bend-mobile/issues).

## License

[Apache-2.0](LICENSE). See [NOTICE](NOTICE) for upstream attribution.
An independent project, not an official Bend mobile SDK.
