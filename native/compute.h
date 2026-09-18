#pragma once
#include <stddef.h>
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif
// Zero on failure (message in error); otherwise the actual CPU worker count.
unsigned bend_cpu(const uint32_t* input, uint32_t* output, size_t count,
                  unsigned threads, char* error, size_t error_size);
#ifdef __cplusplus
}
#endif
