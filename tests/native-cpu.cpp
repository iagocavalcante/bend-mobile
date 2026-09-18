#include "../native/compute.h"
#include <cassert>
#include <cstdint>
#include <cstdio>
#include <vector>

int main() {
    std::vector<uint32_t> input(4099), output(input.size());
    for (size_t i = 0; i < input.size(); ++i) input[i] = uint32_t(i * 2654435761u);
    input[1] = 1; input[2] = 65534; input[3] = 65535; input[4] = 65536;
    input.back() = UINT32_MAX;
    char error[256]{};
    for (unsigned workers : {1u, 4u}) {
        assert(bend_cpu(input.data(), output.data(), input.size(), workers, error, sizeof(error)) == workers);
        for (size_t i = 0; i < input.size(); ++i) assert(output[i] == (input[i] > 65535u ? UINT32_MAX : uint32_t(input[i] * input[i] + 1u)));
    }
    assert(bend_cpu(nullptr, nullptr, 0, 4, error, sizeof(error)) == 1);
    assert(bend_cpu(input.data(), output.data(), 65537, 4, error, sizeof(error)) == 0);
    puts("PASS: native CPU worker parity, overflow, bounds and empty input.");
}
