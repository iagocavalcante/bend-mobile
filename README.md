# Bend Mobile

Write mobile UI and app logic in [Bend](https://github.com/bendlang/bend).
Render native controls on iOS and Android.

**Experimental.** Includes text input, route navigation, local state persistence,
and a native numeric kernel backend: CPU threads, iOS Metal, and Android Vulkan.
General app logic runs as compiled JavaScript. Native kernels currently support
a small U32 expression subset, not Bend's full parallel runtime.

## Get started

Requires macOS or Linux with Bun, Git, `clang++`, and the Android NDK shader
compiler. Platform builds also require Xcode or the Android SDK.

```sh
bun create iagocavalcante/bend-mobile my-app
cd my-app
bun run test
```

Bun downloads the starter and runs `bootstrap`: check asset-build tools, fetch
the pinned Bend compiler, and build counter assets for both platforms.
Then follow the setup guide to launch an iOS or Android app.
Run `bun run doctor` to check the tools again.

- [Setup and app API](docs/getting-started.md)
- [Native compute scope and tests](docs/native-compute.md)
- [Counter app](examples/counter.bend) and [numeric kernel](examples/kernel.bend)
- [Contributing](CONTRIBUTING.md)

The project is early: no automatic data migrations, deep links, rich styling,
or general-purpose native Bend execution yet.

## License

[Apache-2.0](LICENSE). See [NOTICE](NOTICE) for upstream attribution.
An independent project, not an official Bend mobile SDK.
