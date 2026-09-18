# Getting started

Experimental framework for writing mobile UI and app logic in Bend, with native
iOS and Android controls. The counter is the first vertical slice, not a
production-ready framework.

```text
counter.bend → upstream Bend compiler → bundled JavaScript
                                          ↓
                              init / update / view
                                          ↓
                       UIKit              Android Views
                       JavaScriptCore     headless WebView JS
```

The visible UI is native on both platforms. The Android WebView only executes
bundled code; it renders no UI, has no JavaScript-to-Java interface, blocks network
loads, and has file/content access disabled. The app requests no Internet permission.
Neither platform downloads code at runtime.

## Build

Run these commands from the repository root.

Requires Bun and Git. The compiler is pinned to Bend 2.0.5, revision
`0b7e2b11c1054f5d0f4eb955cadb47997ef1115d`; it is downloaded into `.cache/bend`.
No npm packages are needed.

```sh
bun run setup
bun run build
bun run test
```

`build` compiles the counter and copies the bundle to both platform projects.
To compile another app, run `bun run build ./path/to/app.bend`.
Build errors stop packaging; there is no handwritten replacement for Bend logic.

### iOS

Requires macOS, Xcode and XcodeGen. Minimum deployment target: iOS 16.

```sh
xcodegen generate --spec ios/project.yml
open ios/BendMobile.xcodeproj
```

Select the BendMobile scheme and an iPhone/iPad simulator, then Run. For a physical
device, select your development team in Xcode. After editing Bend, rerun
`bun run build` before rebuilding the native app.

Run the native interaction test with an available simulator ID:

```sh
xcodebuild -project ios/BendMobile.xcodeproj -scheme BendMobile \
  -destination 'platform=iOS Simulator,id=YOUR_SIMULATOR_ID' \
  -derivedDataPath ios/build CODE_SIGNING_ALLOWED=NO test
```

### Android

Requires JDK 17, Android SDK 36 and a current Android System WebView. Minimum
Android API: 26. Set `ANDROID_HOME` to the SDK directory or configure
`android/local.properties` with `sdk.dir`.

```sh
cd android
./gradlew :app:assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n dev.bendmobile.counter/dev.bendmobile.BendActivity
cd ..
python3 tests/android-smoke.py
```

## Write an app

Import `mobile.bend` and export three pure definitions:

```python
import Base
import ../mobile.bend as UI

def init() -> U32:
  0

def update(action: String, count: U32) -> U32:
  (count + 1 : U32)

def view(count: U32) -> UI.Node:
  UI.Column{[
    UI.Text{U32.show(count)},
    UI.Button{"Add one", "increment"}
  ]}
```

The `init`, `update` and `view` state types must agree and be reusable (`Data`).
The bridge retains state, sends button action strings to `update`, then renders
the new `view`. Native hosts never implement app-specific state transitions.

Available nodes: `Text{text}`, `Button{label, action}`, `Column{children}` and
`Row{children}`. Rows share width equally. Columns and rows use native spacing;
the root scrolls vertically. Text uses platform font scaling and native buttons
expose their labels to accessibility services.

Only actions in the current rendered tree are accepted. The bridge validates
node kinds, limits trees to 1,000 nodes / 64 nesting levels and text to 16,384
characters. Host failures display an error rather than leaving a blank screen.

## Current limits

- Sequential JavaScript backend; no Bend native CPU parallelism or GPU execution.
- Entire view tree is replaced per event. This is suitable for the initial
  stateless controls; inputs need stable identity, focus and selection handling.
- State is in memory and resets when the activity/controller is recreated or the
  process restarts. No persistence, navigation, async effects or device APIs yet.
- No styling API, hot reload, package publishing or release signing workflow.
- Bend checks the Bend code. The JS bridge and native renderers are outside its
  proof boundary; this project does not claim end-to-end formal correctness.

Next useful milestone: stable view identity plus text input, then explicit
effects and lifecycle-aware state storage. Native C embedding is a separate
runtime milestone; measure before replacing the working JS backend.

## Upstream

[Bend](https://github.com/bendlang/bend) provides the compiler and generated
runtime, under Apache-2.0, copyright 2026 HigherOrderCO. Builds copy its license
into both application resource directories. No upstream compiler changes are
required. See its [language guide](https://github.com/bendlang/bend/blob/main/guide/GUIDE.md).
