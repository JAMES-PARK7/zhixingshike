import SwiftUI
import WebKit
import UniformTypeIdentifiers
import UIKit

@main
struct ZhixingApp: App {
    @StateObject private var model = AppModel()
    var body: some Scene {
        WindowGroup {
            LearningWebView(model: model)
                .ignoresSafeArea()
                .fileImporter(isPresented: $model.showImporter,
                              allowedContentTypes: [.json, .plainText, UTType(importedAs: "app.zhixingshike.course")],
                              allowsMultipleSelection: false) { result in
                    switch result {
                    case .success(let urls): if let url = urls.first { model.importFile(url) }
                    case .failure(let error): model.showMessage("未导入文件：" + error.localizedDescription)
                    }
                }
                .sheet(item: $model.shareItem) { item in
                    ShareSheet(url: item.url) {
                        model.shareItem = nil
                        try? FileManager.default.removeItem(at: item.url.deletingLastPathComponent())
                    }
                }
                .onOpenURL { model.importFile($0) }
        }
    }
}

struct ShareItem: Identifiable { let id = UUID(); let url: URL }

final class AppModel: ObservableObject {
    @Published var showImporter = false
    @Published var shareItem: ShareItem?
    weak var webView: WKWebView?
    private var ready = false
    private var queuedFiles: [[String: String]] = []
    private let io = DispatchQueue(label: "app.zhixingshike.storage")
    private let maximumBytes = 40 * 1024 * 1024
    private let dataURL: URL
    let initialText: String?
    let webRoot: URL

    init() {
        let manager = FileManager.default
        let support = manager.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Zhixing", isDirectory: true)
        try? manager.createDirectory(at: support, withIntermediateDirectories: true)
        dataURL = support.appendingPathComponent("learning-store.json")
        initialText = try? String(contentsOf: dataURL, encoding: .utf8)
        webRoot = Bundle.main.bundleURL.appendingPathComponent("Web", isDirectory: true)
    }

    func loaded(_ view: WKWebView) {
        webView = view
        ready = true
        let files = queuedFiles
        queuedFiles.removeAll()
        files.forEach(deliver)
    }

    func importFile(_ url: URL) {
        let hasAccess = url.startAccessingSecurityScopedResource()
        defer { if hasAccess { url.stopAccessingSecurityScopedResource() } }
        do {
            let values = try url.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
            guard values.isRegularFile != false else { throw LocalError.message("请选择课程文件") }
            guard (values.fileSize ?? 0) <= maximumBytes else { throw LocalError.message("文件超过 40 MiB") }
            let data = try Data(contentsOf: url)
            guard data.count <= maximumBytes, let text = String(data: data, encoding: .utf8) else {
                throw LocalError.message("课程须为 40 MiB 以内的 UTF-8 JSON 文件")
            }
            let file = ["name": url.lastPathComponent, "text": text]
            if ready { deliver(file) } else { queuedFiles.append(file) }
        } catch { showMessage(error.localizedDescription) }
    }

    private func deliver(_ file: [String: String]) {
        webView?.callAsyncJavaScript("window.Zhixing.receiveFile(file)", arguments: ["file": file], in: nil, in: .page) { result in
            if case .failure(let error) = result { self.showMessage("导入未完成：" + error.localizedDescription) }
        }
    }

    func receive(_ body: Any) {
        guard let message = body as? [String: Any], let id = message["id"] as? String,
              let command = message["command"] as? String else { return }
        switch command {
        case "save", "reset":
            guard let text = message["text"] as? String, let data = text.data(using: .utf8), data.count <= maximumBytes,
                  let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any], object["state"] != nil else {
                reply(id, error: "本机学习数据无效或超过 40 MiB"); return
            }
            io.async {
                do {
                    let manager = FileManager.default
                    let previous = self.dataURL.deletingLastPathComponent().appendingPathComponent("learning-store.previous.json")
                    if command != "reset" && manager.fileExists(atPath: self.dataURL.path) {
                        try? manager.removeItem(at: previous)
                        try manager.copyItem(at: self.dataURL, to: previous)
                    }
                    try data.write(to: self.dataURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
                    if command == "reset" {
                        try? manager.removeItem(at: previous)
                        try? manager.removeItem(at: manager.temporaryDirectory.appendingPathComponent("ZhixingExports", isDirectory: true))
                    }
                    DispatchQueue.main.async { self.reply(id, value: true) }
                } catch { DispatchQueue.main.async { self.reply(id, error: "保存失败，原记录保留：" + error.localizedDescription) } }
            }
        case "importFile": showImporter = true; reply(id, value: true)
        case "copy":
            guard let text = message["text"] as? String, text.utf8.count < maximumBytes else { reply(id, error: "文本无效"); return }
            UIPasteboard.general.string = text
            reply(id, value: true)
        case "exportFile":
            guard let text = message["text"] as? String, let name = message["name"] as? String,
                  let data = text.data(using: .utf8), data.count <= maximumBytes else { reply(id, error: "导出内容无效或过大"); return }
            do {
                let folder = FileManager.default.temporaryDirectory.appendingPathComponent("ZhixingExports", isDirectory: true).appendingPathComponent(UUID().uuidString, isDirectory: true)
                try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
                let safeName = URL(fileURLWithPath: name).lastPathComponent
                guard !safeName.isEmpty, ["json", "txt"].contains((safeName as NSString).pathExtension.lowercased()) else {
                    throw LocalError.message("只导出 JSON / TXT 文件")
                }
                let url = folder.appendingPathComponent(safeName)
                try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
                shareItem = ShareItem(url: url)
                reply(id, value: true)
            } catch { reply(id, error: error.localizedDescription) }
        default: reply(id, error: "不支持的设备操作")
        }
    }

    private func reply(_ id: String, value: Any = NSNull(), error: String? = nil) {
        webView?.callAsyncJavaScript("window.Zhixing.resolve(id, value, error)",
            arguments: ["id": id, "value": value, "error": error as Any? ?? NSNull()], in: nil, in: .page, completionHandler: nil)
    }
    func showMessage(_ text: String) {
        webView?.callAsyncJavaScript("window.Zhixing.nativeError(message)", arguments: ["message": text], in: nil, in: .page, completionHandler: nil)
    }
    enum LocalError: LocalizedError {
        case message(String)
        var errorDescription: String? { if case .message(let value) = self { return value }; return nil }
    }
}

struct LearningWebView: UIViewRepresentable {
    @ObservedObject var model: AppModel
    func makeCoordinator() -> Coordinator { Coordinator(model: model) }
    func makeUIView(context: Context) -> WKWebView {
        let controller = WKUserContentController()
        controller.add(context.coordinator, name: "zhixing")
        // Serialize the initial file as a string, never execute imported file text.
        let value: Any = model.initialText as Any? ?? NSNull()
        let encoded = (try? JSONSerialization.data(withJSONObject: [value])).flatMap { String(data: $0, encoding: .utf8) } ?? "[null]"
        controller.addUserScript(WKUserScript(source: "window.__ZHIXING_INITIAL__ = (" + encoded + ")[0];", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        let config = WKWebViewConfiguration()
        config.userContentController = controller
        config.websiteDataStore = .default()
        let view = WKWebView(frame: .zero, configuration: config)
        view.navigationDelegate = context.coordinator
        view.isOpaque = false
        view.backgroundColor = .systemBackground
        view.scrollView.backgroundColor = .systemBackground
        view.scrollView.contentInsetAdjustmentBehavior = .never
        view.scrollView.keyboardDismissMode = .interactive
        view.allowsBackForwardNavigationGestures = false
        model.webView = view
        view.loadFileURL(model.webRoot.appendingPathComponent("index.html"), allowingReadAccessTo: model.webRoot)
        return view
    }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
    static func dismantleUIView(_ uiView: WKWebView, coordinator: Coordinator) {
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "zhixing")
        uiView.navigationDelegate = nil
    }
    final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
        let model: AppModel
        init(model: AppModel) { self.model = model }
        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.frameInfo.isMainFrame, message.frameInfo.request.url?.isFileURL == true else { return }
            model.receive(message.body)
        }
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { model.loaded(webView) }
        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = action.request.url, url.isFileURL,
                  url.standardizedFileURL.path.hasPrefix(model.webRoot.standardizedFileURL.path + "/") else {
                decisionHandler(.cancel); return
            }
            decisionHandler(.allow)
        }
    }
}

struct ShareSheet: UIViewControllerRepresentable {
    let url: URL
    let onFinish: () -> Void
    func makeUIViewController(context: Context) -> UIActivityViewController {
        let controller = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        controller.completionWithItemsHandler = { _, _, _, _ in DispatchQueue.main.async { onFinish() } }
        return controller
    }
    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
