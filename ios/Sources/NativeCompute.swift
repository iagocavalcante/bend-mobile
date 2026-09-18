import Foundation
import Metal

// Both backends are synchronous here; the UI host calls them on its compute queue.
enum NativeCompute {
    static func run(_ input: [UInt32], backend: String) throws -> [UInt32] {
        guard input.count <= 65536 else { throw Failure.message("Compute input exceeds 65536 values") }
        guard backend == "cpu" || backend == "gpu" else { throw Failure.message("Unknown compute backend") }
        if input.isEmpty { return [] }
        if backend == "cpu" {
            var output = [UInt32](repeating: 0, count: input.count)
            var error = [CChar](repeating: 0, count: 256)
            let workers = input.withUnsafeBufferPointer { src in
                output.withUnsafeMutableBufferPointer { dst in
                    bend_cpu(src.baseAddress, dst.baseAddress, src.count, 0, &error, error.count)
                }
            }
            guard workers > 0 else { throw Failure.message(String(cString: error)) }
            return output
        }
        guard let device = MTLCreateSystemDefaultDevice(),
              let library = device.makeDefaultLibrary(),
              let function = library.makeFunction(name: "bend_map"),
              let queue = device.makeCommandQueue() else {
            throw Failure.message("Metal compute is unavailable or the compiled kernel is missing")
        }
        // ponytail: compile a pipeline per job; cache it when dispatch startup is measurable.
        let pipeline = try device.makeComputePipelineState(function: function)
        let bytes = input.count * MemoryLayout<UInt32>.stride
        let source = input.withUnsafeBytes { device.makeBuffer(bytes: $0.baseAddress!, length: bytes, options: .storageModeShared) }
        guard let source, let output = device.makeBuffer(length: bytes, options: .storageModeShared),
              let command = queue.makeCommandBuffer(), let encoder = command.makeComputeCommandEncoder() else {
            throw Failure.message("Metal buffer or command allocation failed")
        }
        var count = UInt32(input.count)
        encoder.setComputePipelineState(pipeline)
        encoder.setBuffer(source, offset: 0, index: 0)
        encoder.setBuffer(output, offset: 0, index: 1)
        encoder.setBytes(&count, length: MemoryLayout<UInt32>.size, index: 2)
        let width = min(64, pipeline.maxTotalThreadsPerThreadgroup)
        encoder.dispatchThreadgroups(MTLSize(width: (input.count + width - 1) / width, height: 1, depth: 1),
                                     threadsPerThreadgroup: MTLSize(width: width, height: 1, depth: 1))
        encoder.endEncoding()
        command.commit()
        command.waitUntilCompleted()
        if let error = command.error { throw error }
        guard command.status == .completed else { throw Failure.message("Metal dispatch did not complete") }
        return Array(UnsafeBufferPointer(start: output.contents().assumingMemoryBound(to: UInt32.self), count: input.count))
    }

    private enum Failure: LocalizedError {
        case message(String)
        var errorDescription: String? { switch self { case .message(let text): return text } }
    }
}
