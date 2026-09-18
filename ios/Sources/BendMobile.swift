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
    let id: String
    let kind: String
    let text: String?
    let value: String?
    let action: String?
    let event: String?
    let backend: String?
    let input: [UInt32]?
    let disabled: Bool?
    let children: [Node]?
}

private struct Frame: Decodable {
    let tree: Node?
    let snapshot: String?
    let error: String?
}

final class BendViewController: UIViewController {
    private let context = JSContext()!
    private let content = UIStackView()
    private let status = UILabel()
    private var views: [String: UIView] = [:]
    private var nodes: [String: Node] = [:]
    private var seen = Set<String>()
    private var queued: [() -> Void] = []
    private var computing = false
    private let worker = DispatchQueue(label: "bend.compute", qos: .userInitiated)
    private var storage: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("bend-state.json")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        let scroll = UIScrollView()
        scroll.translatesAutoresizingMaskIntoConstraints = false
        scroll.keyboardDismissMode = .interactive
        view.addSubview(scroll)
        content.axis = .vertical
        content.spacing = 16
        content.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(content)
        status.numberOfLines = 0
        status.font = .preferredFont(forTextStyle: .footnote)
        status.adjustsFontForContentSizeCategory = true
        status.accessibilityIdentifier = "compute-status"
        NSLayoutConstraint.activate([
            scroll.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            scroll.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor),
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
            var saved: String? = nil
            if FileManager.default.fileExists(atPath: storage.path) {
                let data = try Data(contentsOf: storage)
                guard data.count <= 1048576, let value = String(data: data, encoding: .utf8) else {
                    throw Failure.message("Saved data is invalid; original file was preserved")
                }
                saved = value
            }
            evaluate("BendMobile.start(\(try json(saved as Any? ?? NSNull())))")
        } catch { showError(error.localizedDescription) }
    }

    private func json(_ value: Any) throws -> String {
        String(decoding: try JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed]), as: UTF8.self)
    }

    private func send(_ event: String, _ action: String, _ value: String = "") {
        enqueue { [weak self] in
            guard let self else { return }
            do {
                self.evaluate("BendMobile.send(\(try self.json(event)),\(try self.json(action)),\(try self.json(value)))")
            } catch { self.showError(error.localizedDescription) }
        }
    }

    private func enqueue(_ action: @escaping () -> Void) {
        if computing { queued.append(action) } else { action() }
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
            guard let tree = frame.tree, let snapshot = frame.snapshot else { throw Failure.message("Missing frame data") }
            // Small snapshots are synchronous: do not acknowledge edits before durable storage.
            try FileManager.default.createDirectory(at: storage.deletingLastPathComponent(), withIntermediateDirectories: true)
            try Data(snapshot.utf8).write(to: storage, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            context.evaluateScript("BendMobile.commit()")
            if let error = context.exception { throw Failure.message(error.toString()) }
            seen = []
            let rendered = try render(tree)
            views = views.filter { seen.contains($0.key) }
            nodes = nodes.filter { seen.contains($0.key) }
            reconcile(content, [rendered, status])
        } catch {
            context.exception = nil
            context.evaluateScript("BendMobile.abort()")
            showError(error.localizedDescription)
        }
    }

    private func reconcile(_ stack: UIStackView, _ children: [UIView]) {
        for old in stack.arrangedSubviews where !children.contains(where: { $0 === old }) {
            stack.removeArrangedSubview(old)
            old.removeFromSuperview()
        }
        for (index, child) in children.enumerated() {
            if index >= stack.arrangedSubviews.count || stack.arrangedSubviews[index] !== child {
                stack.removeArrangedSubview(child)
                stack.insertArrangedSubview(child, at: index)
            }
        }
    }

    private func render(_ node: Node) throws -> UIView {
        seen.insert(node.id)
        nodes[node.id] = node
        let rendered: UIView
        switch node.kind {
        case "Text":
            let label = views[node.id] as? UILabel ?? UILabel()
            label.text = node.text
            label.font = .preferredFont(forTextStyle: .body)
            label.adjustsFontForContentSizeCategory = true
            label.numberOfLines = 0
            rendered = label
        case "Input":
            let field: UITextField
            if let existing = views[node.id] as? UITextField { field = existing }
            else {
                field = UITextField()
                field.borderStyle = .roundedRect
                field.font = .preferredFont(forTextStyle: .body)
                field.adjustsFontForContentSizeCategory = true
                field.addTarget(self, action: #selector(edited(_:)), for: [.editingChanged, .editingDidEnd])
                field.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
            }
            field.accessibilityIdentifier = node.id
            field.accessibilityLabel = node.text
            field.placeholder = node.text
            // Do not replace local text/selection or IME composition with an older frame.
            if !field.isFirstResponder && field.markedTextRange == nil && field.text != node.value { field.text = node.value }
            rendered = field
        case "Button", "Compute":
            let button = views[node.id] as? UIButton ?? UIButton(type: .system)
            if button.configuration == nil {
                button.configuration = .filled()
                button.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
            }
            button.configuration?.title = node.text
            button.titleLabel?.adjustsFontForContentSizeCategory = true
            button.titleLabel?.numberOfLines = 0
            button.isEnabled = !(node.disabled ?? false)
            button.accessibilityIdentifier = node.kind == "Compute" ? node.backend : node.action
            button.removeAction(identifiedBy: UIAction.Identifier("bend"), for: .touchUpInside)
            button.addAction(UIAction(identifier: UIAction.Identifier("bend")) { [weak self] _ in
                self?.activate(node.id)
            }, for: .touchUpInside)
            rendered = button
        case "Column", "Row":
            let stack = views[node.id] as? UIStackView ?? UIStackView()
            stack.axis = node.kind == "Column" ? .vertical : .horizontal
            stack.distribution = node.kind == "Row" ? .fillEqually : .fill
            stack.spacing = 12
            reconcile(stack, try (node.children ?? []).map(render))
            rendered = stack
        default: throw Failure.message("Unknown view: \(node.kind)")
        }
        views[node.id] = rendered
        return rendered
    }

    @objc private func edited(_ field: UITextField) {
        guard let id = field.accessibilityIdentifier, let node = nodes[id], let action = node.action else { return }
        send("input", action, field.text ?? "")
    }

    private func activate(_ id: String) {
        guard let node = nodes[id] else { return }
        view.endEditing(true)
        if node.kind != "Compute" { send(node.event ?? "action", node.action ?? ""); return }
        enqueue { [weak self] in
            guard let self, let input = node.input, let backend = node.backend else { return }
            self.computing = true
            self.status.text = "Running \(backend.uppercased())…"
            self.worker.async {
                let result = Result { try NativeCompute.run(input, backend: backend) }
                DispatchQueue.main.async {
                    self.computing = false
                    do {
                        let values = try result.get()
                        self.send("result", node.action ?? "", try self.json(values))
                        self.status.text = "\(backend.uppercased()) complete"
                    } catch { self.showError(error.localizedDescription) }
                    while !self.computing && !self.queued.isEmpty { self.queued.removeFirst()() }
                }
            }
        }
    }

    private func showError(_ message: String) {
        status.text = message
        status.textColor = .systemRed
        if status.superview == nil { content.addArrangedSubview(status) }
    }

    private enum Failure: LocalizedError {
        case message(String)
        var errorDescription: String? { switch self { case .message(let text): return text } }
    }
}
