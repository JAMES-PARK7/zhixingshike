# 知行拾课 · iOS

导入一份课程文件，在 iPhone / iPad 离线阅读、练习与复习。由原微信小程序迁移，当前开发分支为 `ios-app`。

## 应用功能

- iOS 原生“文件”导入与“打开方式”入口，支持课程 JSON、分卷文件和进度备份。
- 课程目录、逐点讲解、例题步骤、易错点与 LaTeX 公式。数学库及字体随包提供，长公式单独滚动。
- 单选、多选、判断自动判分；简答、证明、推导参考答案与要点自评。
- 错题与 1/3/7/14/30 天间隔复习。回看知识点后返回原题，保留选择、输入、解析和滚动位置。
- 适配 iPhone 安全区、44px 以上触控目标、16–24px 阅读字号、三档行距、暖纸与系统暗色、横竖屏及 iPad 双列。
- 本机原生文件存储，写入失败不更新内存状态；主动导出、分享及恢复备份。无登录、无广告、无分析 SDK，学习功能无需联网。
- v2 覆盖检查：锁定来源/大纲、双向知识点引用、逐点题型和题量、章节综合题、完整解析；缺项阻止导入。旧版 v1 课程可导入，但标记为未声明完整范围。

## 获取 IPA

在本仓库对应 PR 的 **Checks** 或 **Actions → iOS IPA Build** 查看构建结果。macOS 构建成功后，在运行详情的 **Artifacts** 下载 `ZhixingShike-iOS-unsigned`，解压得到 `ZhixingShike-unsigned.ipa` 和 SHA-256 校验文件。

该产物是由 Xcode 编译的 arm64 真机应用，**尚未签名**。它不能仅靠“文件”App 点击安装；需要用你自己的合法签名/安装流程重新签名。已签名的设备分发还涉及 Apple Team、证书与描述文件；不要把 Apple ID 密码、私钥、p12 或描述文件提交到公开仓库。当前项目没有配置 App Store/TestFlight 上传，也不会自动发布。

如果 Actions 尚未成功运行，就尚未有经过 Xcode 编译验证的 IPA；源码或网页预览不等于设备构建通过。

## 在 Mac 编译

安装完整 Xcode（包含 iOS 16 或更新 SDK），选择其 Command Line Tools。项目没有第三方原生包，不需要 CocoaPods、Capacitor 或 XcodeGen。

```bash
open Zhixing.xcodeproj
# 无签名设备构建与 IPA 打包
bash scripts/build-ios.sh unsigned
```

在 Xcode 选择 `Zhixing` target → Signing & Capabilities，选择自己的 Team，并设置可用的唯一 Bundle Identifier，即可在自己授权的设备上测试。

签名归档使用本机钥匙串和你自己的导出配置：

```bash
DEVELOPMENT_TEAM=你的TeamID EXPORT_OPTIONS_PLIST=/绝对路径/ExportOptions.plist bash scripts/build-ios.sh signed
```

不在公开代码或示例中放置真实签名凭据。

## 生成并导入完整课程

1. 复制 [完整课程生成提示词](docs/完整课程生成提示词.txt)，连同教材或大纲交给内容生成工具。
2. 先锁定完整范围及来源清单，再生成讲解、例题与题库；范围不明确时先确认范围。
3. 每个知识点至少五道独立题（基础两道、应用/迁移/易错各一道），每章另外两道综合题；重要分支需要更多题。
4. 课程大时按协议分卷。应用暂存未收齐的卷，收齐并校验后才导入。
5. 通过“我的 → 导出完整示例课程”获取协议示例；或参考 `examples/`。

完整性只能针对已确认的资料和大纲。程序能检查结构与对应，不能证明教材没有遗漏或答案必然正确；必须审校原资料和题目。示例仅六个直流电路知识点，含 36 题，并非完整大学电路课程。

## 本地检查

需要 Node.js 20 或更新版本，无需安装 npm 依赖：

```bash
npm test
node scripts/validate-course.cjs examples/电路基础_完整覆盖示例.zhixing.json
node scripts/validate-course.cjs examples/分卷示例_1-3.zhixing.json examples/分卷示例_2-3.zhixing.json examples/分卷示例_3-3.zhixing.json
```

`Web/` 是离线应用界面和学习逻辑，`Sources/` 是 SwiftUI / WKWebView 原生文件接口，`Resources/` 含原生图标、隐私清单与 Info.plist。`docs/` 说明协议及完备生成提示词，`tests/` 覆盖导入、题库、分卷、更新、备份和错误拒绝。

手机浏览器检查不能代替 iOS 真机测试。签名后的首次安装仍须核对文件导入、锁屏后保存、键盘、VoiceOver、刘海/手势区、iCloud 文件选择、分享备份与恢复。
