import XCTest

final class CounterTests: XCTestCase {
    private func capture(_ name: String, app: XCUIApplication) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    func testStateInputNavigationAndNativeCompute() {
        let app = XCUIApplication()
        app.launch()
        if app.buttons["Back"].waitForExistence(timeout: 2) { app.buttons["Back"].tap() }
        XCTAssertTrue(app.buttons["reset"].waitForExistence(timeout: 10))
        app.buttons["reset"].tap()
        XCTAssertTrue(app.staticTexts["Count: 0"].waitForExistence(timeout: 5))
        let field = app.textFields["input:name"]
        field.tap()
        let old = (field.value as? String) ?? ""
        if old != "Your name" { field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: old.count)) }
        field.typeText("Iago")
        XCTAssertEqual(field.value as? String, "Iago")
        app.buttons["increment"].tap()
        XCTAssertTrue(app.staticTexts["Count: 1"].waitForExistence(timeout: 5))
        capture("01-home", app: app)
        app.buttons["details"].tap()
        XCTAssertTrue(app.staticTexts["Hello, Iago"].waitForExistence(timeout: 5))
        app.terminate()
        app.launch()
        XCTAssertTrue(app.staticTexts["Hello, Iago"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Count: 1"].exists)
        capture("02-restored-details", app: app)
        for backend in ["cpu", "gpu"] {
            app.buttons[backend].tap()
            XCTAssertTrue(app.staticTexts["\(backend.uppercased()) complete"].waitForExistence(timeout: 20))
            XCTAssertTrue(app.staticTexts["Result: [1,2,5,10,4294967295]"].exists)
            capture(backend == "cpu" ? "03-cpu" : "04-metal", app: app)
        }
        app.buttons["Back"].tap()
        XCTAssertEqual(app.textFields["input:name"].value as? String, "Iago")
    }
}
