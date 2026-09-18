#pragma once
#include <cstdint>
#include <vector>
// Throws on unsupported devices or Vulkan errors. Never silently runs on CPU.
std::vector<uint32_t> bend_vulkan(const std::vector<uint32_t>& input,
                                 const std::vector<uint32_t>& shader);
