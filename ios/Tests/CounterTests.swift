import XCTest

final class CounterTests: XCTestCase {
    func testBendDrivesNativeControls() {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.staticTexts["Count: 0"].waitForExistence(timeout: 10))
        app.buttons["increment"].tap()
        XCTAssertTrue(app.staticTexts["Count: 1"].waitForExistence(timeout: 5))
        app.buttons["increment"].tap()
        XCTAssertTrue(app.staticTexts["Count: 2"].waitForExistence(timeout: 5))
        app.buttons["reset"].tap()
        XCTAssertTrue(app.staticTexts["Count: 0"].waitForExistence(timeout: 5))
    }
}
