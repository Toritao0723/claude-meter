// Claude adaptation of Claude Meter. Original UI © 2026 Bon Yeung.
import Cocoa
import WebKit
import ServiceManagement
import UserNotifications

let prefs = UserDefaults.standard

final class DragWebView: WKWebView {
    var dragAllowed = true
    var onMoved: (() -> Void)?
    var onRightClick: ((NSEvent) -> Void)?
    private var startMouse = NSPoint.zero, startOrigin = NSPoint.zero, moved = false

    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

    override func mouseDown(with e: NSEvent) {
        startMouse = NSEvent.mouseLocation
        startOrigin = window?.frame.origin ?? .zero
        moved = false
        dragAllowed = true
        super.mouseDown(with: e)
    }

    override func mouseDragged(with e: NSEvent) {
        let p = NSEvent.mouseLocation
        let dx = p.x - startMouse.x, dy = p.y - startMouse.y
        if dragAllowed && (moved || abs(dx) + abs(dy) > 3) {
            moved = true
            window?.setFrameOrigin(NSPoint(x: startOrigin.x + dx, y: startOrigin.y + dy))
        } else {
            super.mouseDragged(with: e)
        }
    }

    override func mouseUp(with e: NSEvent) {
        super.mouseUp(with: e)
        if moved { onMoved?() }
    }

    override func rightMouseDown(with e: NSEvent) { onRightClick?(e) }
}

final class AppDelegate: NSObject, NSApplicationDelegate, WKScriptMessageHandler, WKNavigationDelegate, UNUserNotificationCenterDelegate {
    var panel: NSPanel!
    var web: DragWebView!
    var helper: Process?
    var input: Pipe?
    var output: Pipe?
    var timer: Timer?
    var lastPayload: [String: Any] = [:]
    var lastReceived = Date.distantPast
    var seenEvents = Set<String>()
    var celebrations: [[String: Any]] = []
    var activeCelebration: [String: Any]?
    var celebrateUntil = Date.distantPast
    var activityKey = ""
    var taskNav: [String: Any] = [:]
    var activityState = "idle"
    var sceneOffset = 0
    var theme: String {
        get { prefs.string(forKey: "theme") ?? "auto" }
        set { prefs.set(newValue, forKey: "theme"); push() }
    }
    var mini: Bool {
        get { prefs.bool(forKey: "mini") }
        set { prefs.set(newValue, forKey: "mini"); push() }
    }
    var minimized: Bool {
        get { prefs.bool(forKey: "minimized") }
        set { prefs.set(newValue, forKey: "minimized"); push() }
    }
    var lang: String {
        get { prefs.string(forKey: "lang") ?? "zh" }
        set { prefs.set(newValue, forKey: "lang"); activityKey = ""; updateActivity(); push() }
    }
    func L(_ zh: String, _ en: String) -> String { lang == "en" ? en : zh }
    var notifications: Bool { prefs.object(forKey: "notifications") == nil || prefs.bool(forKey: "notifications") }

    func applicationDidFinishLaunching(_ notification: Notification) {
        let existing = NSRunningApplication.runningApplications(withBundleIdentifier: Bundle.main.bundleIdentifier ?? "local.tori.claude-meter")
        if existing.contains(where: { $0.processIdentifier != ProcessInfo.processInfo.processIdentifier }) { NSApp.terminate(nil); return }
        let config = WKWebViewConfiguration()
        config.userContentController.add(self, name: "meter")
        web = DragWebView(frame: NSRect(x: 0, y: 0, width: 360, height: 400), configuration: config)
        web.setValue(false, forKey: "drawsBackground")
        web.navigationDelegate = self
        web.onMoved = { [weak self] in self?.savePosition() }
        web.onRightClick = { [weak self] event in self?.showMenu(event) }
        panel = makePanel(size: NSSize(width: 360, height: 400))
        installGlass(in: panel, behind: web, cornerRadius: 22)
        let visible = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        let x = prefs.object(forKey: "x") == nil ? visible.maxX - 390 : prefs.double(forKey: "x")
        let y = prefs.object(forKey: "top") == nil ? visible.maxY - 30 : prefs.double(forKey: "top")
        panel.setFrameTopLeftPoint(NSPoint(x: min(max(x, visible.minX), visible.maxX - 360), y: min(max(y, visible.minY + 400), visible.maxY)))
        applyAppearance()
        let resources = Bundle.main.resourceURL!.appendingPathComponent("ui")
        web.loadFileURL(resources.appendingPathComponent("index.html"), allowingReadAccessTo: resources)
        panel.orderFrontRegardless()
        UNUserNotificationCenter.current().delegate = self
        if notifications { requestNotifications() }
        startHelper()
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            guard let self else { return }
            self.updateActivity()
            if self.helper?.isRunning != true { self.startHelper() }
            if Date().timeIntervalSince(self.lastReceived) > 10 { self.lastPayload["live"] = false; self.lastPayload["taskProblem"] = self.L("连接中，任务状态暂不可用", "Connecting; task status unavailable"); self.push() }
        }
    }

    func makePanel(size: NSSize) -> NSPanel {
        let panel = NSPanel(contentRect: NSRect(origin: .zero, size: size), styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        panel.isFloatingPanel = true
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.backgroundColor = .clear
        panel.isOpaque = false
        panel.hasShadow = true
        panel.hidesOnDeactivate = false
        panel.becomesKeyOnlyIfNeeded = true
        return panel
    }

    // Native material blurs the desktop behind the window, including other apps.
    // The web content stays transparent and supplies only the text and pixel art.
    func installGlass(in panel: NSPanel, behind content: WKWebView, cornerRadius: CGFloat) {
        let container = NSView(frame: NSRect(origin: .zero, size: panel.frame.size))
        container.wantsLayer = true
        container.layer?.cornerRadius = cornerRadius
        container.layer?.masksToBounds = true
        let glass = NSVisualEffectView(frame: container.bounds)
        glass.material = .popover
        glass.blendingMode = .behindWindow
        glass.state = .active
        glass.autoresizingMask = [.width, .height]
        content.frame = container.bounds
        content.autoresizingMask = [.width, .height]
        container.addSubview(glass)
        container.addSubview(content)
        panel.contentView = container
    }

    func applyAppearance() {
        let appearance: NSAppearance? = theme == "dark" ? NSAppearance(named: .darkAqua)
            : theme == "light" ? NSAppearance(named: .aqua) : nil
        panel?.appearance = appearance
    }

    func startHelper() {
        if helper?.isRunning == true { return }
        let process = Process(), inp = Pipe(), out = Pipe()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/python3")
        process.arguments = ["-u", Bundle.main.resourceURL!.appendingPathComponent("bridge.py").path]
        process.standardInput = inp
        process.standardOutput = out
        process.standardError = FileHandle.nullDevice
        var environment = ProcessInfo.processInfo.environment
        environment["PYTHONDONTWRITEBYTECODE"] = "1"
        process.environment = environment
        do { try process.run() } catch { lastPayload["liveProblem"] = "无法启动本地监控"; push(); return }
        helper = process; input = inp; output = out
        DispatchQueue.global(qos: .utility).async { [weak self] in
            var buffer = Data()
            while true {
                let data = out.fileHandleForReading.availableData
                if data.isEmpty { break }
                buffer.append(data)
                while let end = buffer.firstIndex(of: 10) {
                    let line = Data(buffer[..<end])
                    buffer.removeSubrange(...end)
                    guard let value = try? JSONSerialization.jsonObject(with: line) as? [String: Any] else { continue }
                    DispatchQueue.main.async { self?.receive(value) }
                }
            }
        }
    }

    func receive(_ payload: [String: Any]) {
        lastReceived = Date()
        lastPayload = payload
        for event in payload["events"] as? [[String: Any]] ?? [] {
            guard let key = event["key"] as? String, !seenEvents.contains(key) else { continue }
            seenEvents.insert(key)
            let state = event["state"] as? String ?? "done"
            if state != "waiting" { celebrations.append(event) }
            notify(title: state == "waiting" ? L("Claude 需要你回复", "Claude needs your reply") : state == "done" ? L("Claude 本轮已完成", "Claude finished a turn") : state == "error" ? L("Claude 任务出错", "Claude task error") : L("Claude 任务已中断", "Claude task interrupted"), body: event["label"] as? String ?? "Claude", id: key)
        }
        if (payload["live"] as? Bool) == true {
            for window in payload["windows"] as? [[String: Any]] ?? [] {
                guard let used = window["percentUsed"] as? Double, let reset = window["resetsAt"] as? Double else { continue }
                let bucket = Int(reset / 60000)
                let threshold = used >= 100 ? 100 : used >= 90 ? 90 : used >= 80 ? 80 : 0
                guard threshold > 0 else { continue }
                let key = "alert.\(window["id"] as? String ?? "primary").\(bucket)"
                if prefs.integer(forKey: key) < threshold {
                    prefs.set(threshold, forKey: key)
                    let id = window["id"] as? String ?? ""
                    let enName = ["five_hour": "5-hour limit", "seven_day": "Weekly limit", "seven_day_opus": "Weekly Opus limit", "seven_day_sonnet": "Weekly Sonnet limit"][id] ?? "Quota"
                    let label = lang == "en" ? "\(enName): \(Int(used))% used, \(max(0, 100 - Int(used)))% left" : "\(window["label"] as? String ?? "额度")已用 \(Int(used))%，剩余 \(max(0, 100 - Int(used)))%"
                    celebrations.append(["state": "warning", "label": label])
                    notify(title: L("Claude 用量提醒", "Claude usage alert"), body: label, id: key + ".\(threshold)")
                }
            }
        }
        updateActivity(); push()
    }

    func push() {
        applyAppearance()
        var payload = lastPayload
        payload["theme"] = theme; payload["lang"] = lang; payload["mini"] = mini; payload["minimized"] = minimized
        payload["taskNav"] = taskNav
        payload["activity"] = ["state": activityState]
        payload["sceneOffset"] = sceneOffset
        guard let data = try? JSONSerialization.data(withJSONObject: payload), let json = String(data: data, encoding: .utf8) else { return }
        web.evaluateJavaScript("window.meter && window.meter.update(\(json))")
    }

    func updateActivity() {
        if Date() > celebrateUntil {
            activeCelebration = nil
            if !celebrations.isEmpty { activeCelebration = celebrations.removeFirst(); celebrateUntil = Date().addingTimeInterval(8) }
        }
        let tasks = Date().timeIntervalSince(lastReceived) < 10 ? lastPayload["tasks"] as? [[String: Any]] ?? [] : []
        let active = tasks.filter { ["working", "waiting"].contains($0["state"] as? String ?? "") }.sorted {
            let leftWaiting = $0["attention"] as? String != nil || $0["state"] as? String == "waiting"
            let rightWaiting = $1["attention"] as? String != nil || $1["state"] as? String == "waiting"
            if leftWaiting != rightWaiting { return leftWaiting }
            return ($0["id"] as? String ?? "") < ($1["id"] as? String ?? "")
        }
        let waiting = active.filter { $0["attention"] as? String != nil || $0["state"] as? String == "waiting" }
        let state = !waiting.isEmpty ? "waiting" : activeCelebration?["state"] as? String ?? (active.isEmpty ? "idle" : "working")
        var items: [[String: Any]] = active.map { task in
            var item: [String: Any] = ["id": task["id"] as? String ?? "", "title": task["title"] as? String ?? L("Claude 任务", "Claude task"), "state": task["state"] as? String ?? "unknown"]
            if let attention = task["attention"] as? String { item["attention"] = attention }
            return item
        }
        if let event = activeCelebration, !items.contains(where: { ($0["id"] as? String) == (event["threadId"] as? String) }) {
            items.append(["id": event["threadId"] as? String ?? "", "title": event["label"] as? String ?? "Claude", "state": event["state"] as? String ?? "done"])
        }
        let heading = !waiting.isEmpty ? L("需要你回复 · \(waiting.count) 个任务", "Needs your reply · \(waiting.count)") : !active.isEmpty ? L("\(active.count) 个任务进行中", "\(active.count) working") : state == "done" ? L("任务本轮完成", "Turn finished") : state == "warning" ? L("额度提醒", "Quota alert") : L("任务提醒", "Tasks")
        let data: [String: Any] = ["state":state, "heading":heading, "items":items]
        guard let encoded = try? JSONSerialization.data(withJSONObject: data, options: [.sortedKeys]), let json = String(data: encoded, encoding: .utf8), json != activityKey else { return }
        activityKey = json
        activityState = state
        taskNav = data
        push()
    }

    func webView(_ view: WKWebView, didFinish navigation: WKNavigation!) { push(); activityKey = ""; updateActivity() }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        switch type {
        case "nodrag": web.dragAllowed = false
        case "lang": lang = (body["value"] as? String) == "en" ? "en" : "zh"
        case "sync": refreshNow()
        case "mini":
            prefs.set(false, forKey: "minimized")
            mini = body["value"] as? Bool ?? false
        case "minimized": minimized = body["value"] as? Bool ?? false
        case "petScene":
            sceneOffset = max(0, body["offset"] as? Int ?? 0)
            push()
        case "openTask":
            if let id = body["id"] as? String, UUID(uuidString: id) != nil, let url = URL(string: "claude://") { NSWorkspace.shared.open(url) }
        case "size":
            guard let width = body["w"] as? Double, let height = body["h"] as? Double else { return }
            let old = panel.frame, visible = (panel.screen ?? NSScreen.main)?.visibleFrame ?? panel.frame
            let w = min(max(width, 120), visible.width), h = min(max(height, 60), visible.height)
            var frame = NSRect(x: old.midX > visible.midX ? old.maxX - w : old.minX, y: old.midY < visible.midY ? old.minY : old.maxY - h, width: w, height: h)
            frame.origin.x = min(max(frame.minX, visible.minX), visible.maxX - w)
            frame.origin.y = min(max(frame.minY, visible.minY), visible.maxY - h)
            panel.setFrame(frame, display: true); savePosition()
        default: break
        }
    }

    func savePosition() { prefs.set(panel.frame.minX, forKey: "x"); prefs.set(panel.frame.maxY, forKey: "top") }
    func item(_ title: String, _ action: Selector) -> NSMenuItem { let i = NSMenuItem(title: title, action: action, keyEquivalent: ""); i.target = self; return i }
    func showMenu(_ event: NSEvent) {
        let menu = NSMenu()
        menu.addItem(item(L("立即刷新额度", "Refresh quota now"), #selector(refreshNow)))
        let notify = item(L("任务完成与额度通知", "Task and quota notifications"), #selector(toggleNotifications)); notify.state = notifications ? .on : .off; menu.addItem(notify)
        menu.addItem(item(L("测试提醒", "Test notification"), #selector(testNotification)))
        let login = item(L("登录 Mac 时自动启动", "Open at login"), #selector(toggleLogin)); login.state = SMAppService.mainApp.status == .enabled ? .on : .off; menu.addItem(login)
        menu.addItem(.separator())
        for (title, key) in [(L("深色", "Dark"), "dark"), (L("浅色", "Light"), "light"), (L("跟随系统", "Match system"), "auto")] { let i = item(title, #selector(pickTheme(_:))); i.representedObject = key; i.state = theme == key ? .on : .off; menu.addItem(i) }
        let size = item(L("迷你模式", "Compact mode"), #selector(toggleMini)); size.state = mini ? .on : .off; menu.addItem(size)
        menu.addItem(item(minimized ? L("恢复面板", "Restore panel") : L("最小化（仅小螃蟹）", "Minimize (crab only)"), #selector(toggleMinimized)))
        menu.addItem(item(lang == "en" ? "切换到中文" : "Switch to English", #selector(toggleLang)))
        menu.addItem(.separator())
        menu.addItem(item(L("关于 Claude Meter", "About Claude Meter"), #selector(about)))
        menu.addItem(item(L("退出 Claude Meter", "Quit Claude Meter"), #selector(quit)))
        NSMenu.popUpContextMenu(menu, with: event, for: web)
    }
    @objc func refreshNow() { if let input { try? input.fileHandleForWriting.write(contentsOf: Data("refresh\n".utf8)) } }
    @objc func pickTheme(_ item: NSMenuItem) { theme = item.representedObject as? String ?? "dark" }
    @objc func toggleMini() { prefs.set(false, forKey: "minimized"); mini.toggle() }
    @objc func toggleMinimized() { minimized.toggle() }
    @objc func toggleLang() { lang = lang == "en" ? "zh" : "en" }
    @objc func quit() { NSApp.terminate(nil) }
    @objc func toggleNotifications() { prefs.set(!notifications, forKey: "notifications"); if notifications { requestNotifications() } }
    @objc func testNotification() {
        celebrations.append(["state": "done", "label": L("测试提醒 · 小螃蟹已准备好", "Test · the crab is ready")])
        notify(title: L("Claude Meter 测试提醒", "Claude Meter test"), body: L("小螃蟹已准备好。任务本轮完成时会这样提醒你。", "The crab is ready. You'll get a notification like this when a turn finishes."), id: "claude-meter-test")
        updateActivity()
    }
    func requestNotifications() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { granted, error in
            prefs.set(granted, forKey: "notificationPermissionGranted")
            prefs.set(error?.localizedDescription ?? "", forKey: "notificationPermissionError")
        }
    }
    func notify(title: String, body: String, id: String) {
        guard notifications else { return }
        let content = UNMutableNotificationContent(); content.title = title; content.body = body; content.sound = .default
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: id, content: content, trigger: nil)) { error in
            prefs.set(error?.localizedDescription ?? "submitted", forKey: "lastNotificationResult")
        }
    }
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) { completionHandler([.banner, .sound]) }
    @objc func toggleLogin() {
        do { if SMAppService.mainApp.status == .enabled { try SMAppService.mainApp.unregister() } else { try SMAppService.mainApp.register() }
            if SMAppService.mainApp.status == .requiresApproval { SMAppService.openSystemSettingsLoginItems() }
        } catch { NSAlert(error: error).runModal() }
    }
    @objc func about() {
        let alert = NSAlert(); alert.messageText = L("Claude Meter · 小螃蟹桌面伴侣", "Claude Meter · desktop crab companion")
        alert.informativeText = lang == "en" ? "Local Claude adaptation; not an official Anthropic product.\nQuota syncs every 60 s; tasks are checked every 2 s.\nAlerts at 80%, 90% and 100% used.\n\"Done\" means the current response turn ended, not that the whole project is finished.\nQuota uses your Claude Code sign-in, read only on this Mac and sent only to Anthropic's official usage endpoint.\n\nNo model requests.\nTasks cover Claude Code sessions on this Mac from the last 3 days." : "本地 Claude 适配版，非 Anthropic 官方产品。\n额度每 60 秒同步；任务每 2 秒检查。\n提醒阈值：已用 80%、90%、100%。\n完成指当前一轮响应结束，不保证整个项目已完成。\n额度来自 Claude Code 的登录，仅在本机读取，只发往 Anthropic 官方用量接口。\n\n不发起模型任务。\n任务只覆盖这台 Mac 最近 3 天的 Claude Code 会话。"
        NSApp.activate(ignoringOtherApps: true); alert.runModal()
    }
    func applicationWillTerminate(_ notification: Notification) { timer?.invalidate(); try? input?.fileHandleForWriting.close(); helper?.terminate() }
}
let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
