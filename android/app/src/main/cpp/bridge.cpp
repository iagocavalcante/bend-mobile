#include <jni.h>
#include <android/asset_manager_jni.h>
#include <memory>
#include <stdexcept>
#include <vector>
#include "compute.h"
#include "vulkan.h"

extern "C" JNIEXPORT jlongArray JNICALL
Java_dev_bendmobile_NativeCompute_run(JNIEnv* env, jclass, jlongArray values, jboolean gpu, jobject assets) {
    try {
        if (!values) throw std::runtime_error("Missing compute input");
        jsize count = env->GetArrayLength(values);
        if (count > 65536) throw std::runtime_error("Compute input exceeds 65536 values");
        std::vector<jlong> raw(count);
        env->GetLongArrayRegion(values, 0, count, raw.data());
        if (env->ExceptionCheck()) return nullptr;
        std::vector<uint32_t> input, output(count);
        input.reserve(count);
        for (auto value : raw) {
            if (value < 0 || value > 0xffffffffLL) throw std::runtime_error("Expected U32 input");
            input.push_back(static_cast<uint32_t>(value));
        }
        if (gpu) {
            auto manager = AAssetManager_fromJava(env, assets);
            if (!manager) throw std::runtime_error("Missing assets");
            std::unique_ptr<AAsset, decltype(&AAsset_close)> asset(
                AAssetManager_open(manager, "kernel.spv", AASSET_MODE_BUFFER), AAsset_close);
            if (!asset) throw std::runtime_error("Missing compiled Vulkan shader");
            auto size = AAsset_getLength(asset.get());
            if (size <= 0 || size > 1048576 || size % 4) throw std::runtime_error("Invalid Vulkan shader");
            std::vector<uint32_t> code(size / 4);
            if (AAsset_read(asset.get(), code.data(), size) != size) throw std::runtime_error("Cannot read Vulkan shader");
            output = bend_vulkan(input, code);
        } else {
            char error[256]{};
            if (!bend_cpu(input.data(), output.data(), input.size(), 0, error, sizeof(error))) throw std::runtime_error(error);
        }
        for (jsize i = 0; i < count; ++i) raw[i] = output[i];
        auto result = env->NewLongArray(count);
        if (result) env->SetLongArrayRegion(result, 0, count, raw.data());
        return result;
    } catch (const std::exception& error) {
        env->ThrowNew(env->FindClass("java/lang/IllegalStateException"), error.what());
        return nullptr;
    }
}
