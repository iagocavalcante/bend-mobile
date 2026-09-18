#include "compute.h"
#include "generated/kernel.h"
#include <algorithm>
#include <cstdio>
#include <exception>
#include <thread>
#include <vector>

unsigned bend_cpu(const uint32_t* input, uint32_t* output, size_t count,
                  unsigned threads, char* error, size_t error_size) {
    if (count > 65536 || (count && (!input || !output))) {
        std::snprintf(error, error_size, "Expected at most 65536 U32 values");
        return 0;
    }
    unsigned workers = std::min<unsigned>(threads ? threads : std::max(1u, std::thread::hardware_concurrency()), 8);
    workers = std::min<size_t>(workers, std::max<size_t>(1, count));
    // ponytail: threads per job; use a persistent pool if dispatch overhead dominates.
    std::vector<std::thread> pool;
    try {
        pool.reserve(workers);
        for (unsigned w = 0; w < workers; ++w) {
            pool.emplace_back([=] {
                for (size_t i = count * w / workers; i < count * (w + 1) / workers; ++i)
                    output[i] = bend_kernel(input[i]);
            });
        }
    } catch (const std::exception& failure) {
        for (auto& thread : pool) thread.join();
        std::snprintf(error, error_size, "%s", failure.what());
        return 0;
    }
    for (auto& thread : pool) thread.join();
    return workers;
}
