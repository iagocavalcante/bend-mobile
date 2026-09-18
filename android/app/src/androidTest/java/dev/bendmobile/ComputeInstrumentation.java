package dev.bendmobile;

import android.app.Instrumentation;
import android.os.Bundle;

public final class ComputeInstrumentation extends Instrumentation {
    @Override public void onCreate(Bundle arguments) { super.onCreate(arguments); start(); }
    @Override public void onStart() {
        Bundle result = new Bundle();
        try {
            long[] input = new long[4099];
            for (int i = 0; i < input.length; i++) input[i] = (i * 2654435761L) & 0xffffffffL;
            input[1] = 1; input[2] = 65534; input[3] = 65535; input[4] = 65536;
            input[input.length - 1] = 0xffffffffL;
            for (boolean gpu : new boolean[]{false, true}) {
                long[] output = NativeCompute.run(input, gpu, getTargetContext().getAssets());
                if (output.length != input.length) throw new AssertionError("Result length");
                for (int i = 0; i < input.length; i++) {
                    long expected = input[i] > 65535 ? 0xffffffffL : input[i] * input[i] + 1;
                    if (output[i] != expected) throw new AssertionError("Backend " + gpu + " index " + i);
                }
                if (NativeCompute.run(new long[0], gpu, getTargetContext().getAssets()).length != 0)
                    throw new AssertionError("Empty input");
                try {
                    NativeCompute.run(new long[]{0x100000000L}, gpu, getTargetContext().getAssets());
                    throw new AssertionError("Invalid U32 accepted");
                } catch (IllegalStateException expected) { }
            }
            result.putString("stream", "PASS: CPU and Vulkan agree on 4099 overflow/boundary inputs, empty input and rejection.\n");
            finish(-1, result);
        } catch (Throwable error) {
            result.putString("stream", "FAIL: " + android.util.Log.getStackTraceString(error));
            finish(0, result);
        }
    }
}
