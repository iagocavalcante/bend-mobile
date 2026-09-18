package dev.bendmobile;

import android.content.res.AssetManager;

final class NativeCompute {
    static { System.loadLibrary("bendmobile"); }
    static native long[] run(long[] input, boolean gpu, AssetManager assets);
}
