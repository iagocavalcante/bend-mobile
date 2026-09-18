# Contributing

This is an early prototype. Open an issue before starting a large feature so we
can agree on its scope. Small fixes and documentation improvements can go
straight to a pull request.

## Development

Follow the [setup guide](docs/getting-started.md), then run:

```sh
bun run test
```

The test command includes native CPU checks. For native changes, build the
affected platform and run its interaction test;
both commands are in the guide. In your PR, describe what changed and what you
tested. State when you could not test a platform.

Keep changes focused. Reuse the upstream Bend compiler rather than editing
`.cache/bend`. Do not commit generated bundles, build outputs, signing material,
or local SDK paths.

By submitting a contribution, you agree to license it under the project's
[Apache-2.0 license](LICENSE).
