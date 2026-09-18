import UIKit
import JavaScriptCore

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = BendViewController()
        window.makeKeyAndVisible()
        self.window = window
        return true
    }
}

private struct Node: Decodable {
    let kind: String
    let text: String?
    let action: String?
    let children: [Node]?
}

private struct Frame: Decodable {
    let tree: Node?
    let error: String?
}

final class BendViewController: UIViewController {
    private let context = JSContext()!
    private let content = UIStackView()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        let scroll = UIScrollView()
        scroll.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(scroll)
        content.axis = .vertical
        content.spacing = 16
        content.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(content)
        NSLayoutConstraint.activate([
            scroll.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            scroll.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            scroll.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            content.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: 24),
            content.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -24),
            content.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor, constant: 24),
            content.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor, constant: -24),
            content.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor, constant: -48)
        ])
        do {
            guard let url = Bundle.main.url(forResource: "app", withExtension: "js") else {
                throw Failure.message("Missing app.js. Run bun run build.")
            }
            context.evaluateScript(try String(contentsOf: url, encoding: .utf8))
            if let error = context.exception { throw Failure.message(error.toString()) }
            evaluate("BendMobile.render()")
        } catch { showError(error.localizedDescription) }
    }

    private func evaluate(_ script: String) {
        context.exception = nil
        let result = context.evaluateScript(script)
        do {
            if let error = context.exception { throw Failure.message(error.toString()) }
            guard let json = result?.toString(), let data = json.data(using: .utf8) else {
                throw Failure.message("Bend returned no frame")
            }
            let frame = try JSONDecoder().decode(Frame.self, from: data)
            if let error = frame.error { throw Failure.message(error) }
            guard let tree = frame.tree else { throw Failure.message("Missing view tree") }
            let rendered = try render(tree)
            clear()
            content.addArrangedSubview(rendered)
        } catch { showError(error.localizedDescription) }
    }

    private func render(_ node: Node) throws -> UIView {
        switch node.kind {
        case "Text":
            guard let text = node.text else { throw Failure.message("Missing text") }
            let label = UILabel()
            label.text = text
            label.font = .preferredFont(forTextStyle: .body)
            label.adjustsFontForContentSizeCategory = true
            label.numberOfLines = 0
            return label
        case "Button":
            guard let text = node.text, let action = node.action else {
                throw Failure.message("Invalid button")
            }
            let encoded = try JSONSerialization.data(withJSONObject: action, options: [.fragmentsAllowed])
            let argument = String(decoding: encoded, as: UTF8.self)
            let button = UIButton(type: .system)
            button.configuration = .filled()
            button.configuration?.title = text
            button.titleLabel?.adjustsFontForContentSizeCategory = true
            button.titleLabel?.numberOfLines = 0
            button.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
            button.accessibilityIdentifier = action
            button.addAction(UIAction { [weak self] _ in
                self?.evaluate("BendMobile.dispatch(\(argument))")
            }, for: .touchUpInside)
            return button
        case "Column", "Row":
            guard let children = node.children else { throw Failure.message("Missing children") }
            let stack = UIStackView()
            stack.axis = node.kind == "Column" ? .vertical : .horizontal
            stack.spacing = 12
            if node.kind == "Row" { stack.distribution = .fillEqually }
            for child in children { stack.addArrangedSubview(try render(child)) }
            return stack
        default: throw Failure.message("Unknown view: \(node.kind)")
        }
    }

    private func clear() {
        for child in content.arrangedSubviews {
            content.removeArrangedSubview(child)
            child.removeFromSuperview()
        }
    }

    private func showError(_ message: String) {
        clear()
        let label = UILabel()
        label.text = "Unable to render app: \(message)"
        label.numberOfLines = 0
        label.textColor = .systemRed
        label.font = .preferredFont(forTextStyle: .body)
        label.adjustsFontForContentSizeCategory = true
        content.addArrangedSubview(label)
    }

    private enum Failure: LocalizedError {
        case message(String)
        var errorDescription: String? {
            switch self { case .message(let text): return text }
        }
    }
}
