import XCTest
import Metal
@testable import BendMobile

final class ComputeTests: XCTestCase {
    func testCPUAndMetalParity() throws {
        var input = (0..<4099).map { UInt32($0) &* 2654435761 }
        input[input.count - 1] = UInt32.max
        let expected = input.map { ($0 &* $0) &+ 1 }
        print("Native compute device: \(MTLCreateSystemDefaultDevice()?.name ?? "unavailable")")
        for backend in ["cpu", "gpu"] {
            XCTAssertEqual(try NativeCompute.run(input, backend: backend), expected)
            XCTAssertEqual(try NativeCompute.run([], backend: backend), [])
            XCTAssertThrowsError(try NativeCompute.run([UInt32](repeating: 0, count: 65537), backend: backend))
        }
        XCTAssertThrowsError(try NativeCompute.run([1], backend: "unknown"))
    }
}
