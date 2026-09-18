# Native CPU and GPU computation

Bend Mobile has a small native **batch map** backend. One Bend kernel is compiled
for native CPU threads, iOS Metal and Android Vulkan. Each input is processed
independently; results retain input order.

```python
import Base

def square(+x: U32) -> U32:
  (x * x : U32)

def compute(x: U32) -> U32:
  squared = square(x)
  (squared + 1 : U32)
```

Use it from a Bend view:

```python
UI.Compute{"Run on GPU", "computed", "gpu", [0, 1, 2, 3]}
```

The host runs it off the UI thread, then calls
`update("computed", "[1,2,5,10]", model)`. Use `"cpu"` to choose the CPU backend.
A GPU error is reported explicitly; there is no silent CPU fallback.

## Compiler boundary

The upstream Bend checker validates the kernel first. Our emitter consumes its
core term and generates the same unsigned expression in C++, Metal and GLSL;
Android's `glslc` compiles GLSL into packaged SPIR-V. Bend proofs do not cover
this emitter or the native host code.

Supported today:

- One safe `compute(x: U32) -> U32` definition; `+x` allows reuse.
- U32 literals and the input parameter.
- `U32.add`, `sub`, `mul`, `and`, `or`, `xor` and their operator syntax.
- Nested expressions and type annotations; arithmetic wraps modulo 2^32.
- Local bindings, including reused (`+name`) bindings and variable shadowing.
- Fully applied, safe helper functions with U32 parameters and a U32 result.
  Helpers may call other helpers; recursive calls are rejected.

Other constructs fail the build. This includes division, shifts, conditionals,
recursion, arrays, floats, closures, IO and unsafe definitions.
Helpers and bindings are inlined; the emitter caps traversal at 1,024 nodes and
expanded expressions at 65,536 characters. It does not embed BendRT or
implement Bend's general recursive fork/join GPU scheduler. The app UI and
reducer continue to use the JavaScript backend.

## Backends

| Platform | CPU | GPU |
| --- | --- | --- |
| iOS | C++ worker threads | Metal compute pipeline |
| Android | C++ worker threads through JNI | Vulkan compute pipeline through JNI |

CPU dispatch partitions the input across up to eight threads. GPU dispatch uses
up to 64 invocations per workgroup with a bounds guard for the final group. Both
validate their input, return ordered U32 values, and release per-job resources.
Native APIs accept up to 65,536 values; the current declarative UI bridge caps
Bend lists at 1,000 entries.

The Vulkan implementation needs a compute queue and host-visible coherent
storage buffers. Devices without those capabilities receive an error. Vulkan
on an emulator can use a software device; successful emulator execution proves
the API path, not physical GPU performance. Metal testing likewise needs an
available Metal device. Real-device performance and battery measurements remain
necessary before making speed claims.

Pipelines and CPU threads are created per job. Cache them when workloads justify
it. These small, straight-line kernels are bounded; cancellation, scheduling
priorities, shared mutable buffers and cross-element reductions are not exposed.

## Verify

```sh
bun run test
```

This compares helper calls and local bindings against Bend's JavaScript output
across 4,106 inputs, compiles the Vulkan shader (and Metal on macOS), and checks
the compiler's type and expansion limits. Shader compilation alone does not
verify GPU execution.

The platform interaction tests cover actual CPU and GPU dispatch, input,
navigation and restart restoration. iOS's compute XCTest and Android's native
instrumentation compare their CPU and GPU outputs across 4,099 values, including
unsigned overflow and a partial final workgroup. iOS passed on a physical
iPhone 17 (Apple A19 GPU); physical Android validation is pending.
See [getting started](getting-started.md) for commands and device results.
