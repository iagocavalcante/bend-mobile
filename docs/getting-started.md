# Getting started

## Create an app

On macOS or Linux, install Bun, Git, `clang++`, and the Android NDK shader compiler, then:

```sh
bun create iagocavalcante/bend-mobile my-app
cd my-app
```

[Bun's GitHub template command](https://bun.com/docs/runtime/templating/create)
downloads the published source and creates a new Git repository. Choose a new
folder; do not use `--force` on an existing project. The template's setup hook
runs `bun run bootstrap`: check asset-build tools, fetch the pinned Bend
compiler, and generate the counter assets. Network access is required.
If setup fails, fix the reported issue and run `bun run bootstrap` inside the
created folder. Do not treat the template download alone as a successful build.

Edit `examples/counter.bend` for UI/app logic and `examples/kernel.bend` for
native numeric computation. Run `bun run build` after changes. Follow the iOS
or Android steps below to compile and launch the native app; `bootstrap` builds
assets, not an IPA or APK. The starter retains the demo's native app identifiers
and `BendMobile` scheme. Set your own identifiers in `ios/project.yml` and
`android/app/build.gradle` before distributing it.

`bun run doctor` checks Git, the C++ compiler, and the same Vulkan shader
compiler used by the build. Platform SDKs, signing and device readiness are
checked by the native build tools in the steps below.

## Work on the framework

Run commands from the repository root. Requires Bun, Git, `clang++` for the native CPU smoke check, and an Android NDK
shader compiler (`glslc`). Set `ANDROID_HOME` to your SDK or `GLSLC` to the compiler
binary. The build discovers NDKs under the standard macOS/Linux SDK paths too.

```sh
bun run setup
bun run build
bun run test
```

Setup fetches the pinned upstream Bend compiler into `.cache/bend`. Build checks
the app and numeric kernel, emits the JavaScript app plus C++/Metal/Vulkan kernels,
and copies assets to the native projects. No npm dependencies are required.

To build a different app and kernel:

```sh
bun run build ./path/app.bend ./path/kernel.bend
```

Rerun this command after changing Bend code, before rebuilding a native app.
Generated files are ignored by Git. The compiler is pinned to revision
`0b7e2b11c1054f5d0f4eb955cadb47997ef1115d` (Bend 2.0.5).

## iOS

Requires macOS, Xcode, XcodeGen, and the Xcode Metal toolchain. Minimum iOS: 16.
If Xcode reports a missing Metal compiler, install it with
`xcodebuild -downloadComponent MetalToolchain`.

```sh
xcodegen generate --spec ios/project.yml
open ios/BendMobile.xcodeproj
```

Run the BendMobile scheme on an iPhone/iPad simulator. For a physical device,
select your development team in Xcode. Metal shaders are compiled into the app;
there is no downloaded code or runtime shader source compilation.

```sh
xcodebuild -project ios/BendMobile.xcodeproj -scheme BendMobile \
  -destination 'platform=iOS Simulator,id=YOUR_SIMULATOR_ID' \
  -derivedDataPath ios/build CODE_SIGNING_ALLOWED=NO test
```

## Android

Requires JDK 17, SDK 36, NDK `27.1.12297006`, CMake, and a current Android System
WebView. Minimum Android API: 26. Set `ANDROID_HOME` or use
`android/local.properties` with `sdk.dir`. Vulkan execution requires a device
with a Vulkan compute queue and host-visible coherent storage memory; CPU
execution remains available when GPU execution is unsupported.

```sh
cd android
./gradlew :app:assembleDebug :app:assembleDebugAndroidTest
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
adb shell am start -n dev.bendmobile.counter/dev.bendmobile.BendActivity
adb shell am instrument -w dev.bendmobile.counter.test/dev.bendmobile.ComputeInstrumentation
cd ..
python3 tests/android-smoke.py
```

The smoke test **clears this demo app's data**, then checks input, navigation,
process restoration, and CPU/GPU execution. It requires a Vulkan-capable emulator
or device. The instrumentation test checks native outputs across 4,099 values.

## Physical-device validation

Connect and unlock each phone. Enable Developer Mode and trust the Mac on iOS;
enable USB debugging and accept the computer's key on Android. List connected
devices with `xcrun xctrace list devices` and `adb devices -l`.

For iOS, configure your signing team for both targets in Xcode, then run:

```sh
xcodebuild -project ios/BendMobile.xcodeproj -scheme BendMobile \
  -destination 'platform=iOS,id=YOUR_DEVICE_ID' \
  -derivedDataPath ios/build test
```

For Android, run the installation and instrumentation commands above with
`adb -s YOUR_DEVICE_SERIAL`, then run:

```sh
ANDROID_SERIAL=YOUR_DEVICE_SERIAL python3 tests/android-smoke.py
adb -s YOUR_DEVICE_SERIAL logcat -d -s BendCompute
```

Record the phone model, OS version, GPU reported in the Android log, and test
results. These checks verify correctness; they are not performance benchmarks.
Verified on September 18, 2026: iPhone 17, iOS 26.6.2, Apple A19 GPU.
Both XCTest suites passed: text input, navigation, restart persistence,
UI-triggered CPU/Metal dispatch, and CPU/Metal correctness across 4,099 inputs
(including the 65,535 saturation boundary and a partial workgroup), empty input,
and input bounds. The v0.1.0 conditional kernel and both UI-triggered backends
passed on this device. The release walkthrough uses captured test screens.
Physical Android validation remains pending; Android execution has been tested
with software Vulkan on an emulator.

## App API

See [counter.bend](../examples/counter.bend) for a complete app. Export:

| Definition | Purpose |
| --- | --- |
| `init() -> Model` | Initial reusable (`Data`) state |
| `routes() -> List<String>` | Unique route names; first is the root |
| `view(route: String, model: Model) -> UI.Node` | Current native view tree |
| `update(action: String, value: String, model: Model) -> Model` | Button/input/compute result handling |
| `schema() -> U32` | Persistence format version |
| `save(model: Model) -> String` | Encode durable state |
| `restore(saved: String) -> Maybe<Model>` | Validate and decode durable state |

This extends the initial three-definition API; existing apps must adopt these
signatures. Button actions receive an empty value. Inputs receive their current
text. Compute actions receive a JSON array of unsigned integers.

| Node | Fields |
| --- | --- |
| `Text` | `text` |
| `Button` | `label, action` |
| `Input` | `key, label, value, action` |
| `Link` | `label, route` |
| `Back` | `label` |
| `Compute` | `label, action, backend, input` |
| `Column`, `Row` | `children: List<UI.Node>` |

Native controls retain identity across updates. Input keys must be unique within
a screen. Focused fields keep their local text, selection, and composing spans;
model-side replacements apply when the field is no longer focused. Input values
must stay below 16,384 characters. Rows divide width equally; columns stack
vertically inside a scroll view. Text follows platform font scaling.

Links push a registered route; Back pops it. Android system Back also pops the
stack and exits at the root. The iOS example uses a native Back button. There are
no deep links, tabs, native navigation transitions or swipe-back gestures yet.
The stack is capped at 32 entries.

## Persistence

The model and route stack are stored together after every accepted event. The
bridge prepares a candidate; the host saves its snapshot, then commits and
renders it. Failed saves abort the candidate. iOS uses an atomic file in
Application Support; Android uses a synchronous private preferences commit.

`save` selects durable fields. The example stores the name and counter, and
intentionally treats compute results as transient. State survives process
restarts and controller/activity recreation. A changed schema, malformed data,
or rejected restore displays an error and preserves the original snapshot.
Automatic schema migration is not implemented; keep the format compatible or
explicitly migrate stored data before changing the schema version.

Snapshots are capped at 256K characters. This synchronous approach suits small
app state, not documents or databases. Storage is local and not a credential
vault; do not store secrets through this API.

## Native execution

See [native-compute.md](native-compute.md) for the supported kernel language,
CPU/Metal/Vulkan backends, bounds and tests. General app logic still runs as
JavaScript, with native controls on screen. Android's headless WebView only runs
bundled code and cannot access files or the network.
