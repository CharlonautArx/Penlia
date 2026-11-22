# 朋聊 Android 离线预览 v9

[下载 ARM64 APK](https://github.com/CharlonautArx/Penlia/raw/refs/tags/penlia-chat-home-v9-apk/demo-preview/penlia-chat-home-arm64.apk)

Android 7.0（API 24）或以上，支持 ARM64，文件大小 41,237,367 字节（约 39.3 MiB）。包名为 `app.penlia.mobile.preview`，内部版本号为 9。使用与 v8 相同的演示签名，可覆盖更新同签名的演示版并保留其本地数据。

源代码分支为 `codex/penlia-chat-search-groups`，安装包对应提交 `8a59de0a0acd6063ab2c324b22295dfbce928156`。基线为 v8 发布入口验收提交 `5aa5503`。

APK SHA-256 为 `93317cae876589a62e477d19bfe4299b31b3708d767cdbf2ce2a852292060f20`，已从 GitHub 重新取回核对。

## 页面改动

- 聊天首页去除独立标题栏和「发起会话」弹层。系统状态栏下方直接显示搜索。支持搜索现有会话的联系人名称、朋聊号及最近一条消息的摘要。
- 聊天搜索复用品牌玻璃组件。乳白胶囊、粉色与冰青色边缘彩光和阴影采用静态渐变与阴影，聚焦时调整高光强度。Android 复用已验证的系统 IME Insets 处理。
- 好友页在「新的朋友」与「我的好友」之间增加「群聊」，只显示名称和右箭头，沿用现有群管理页面。接受、拒绝、创建、成员权限及好友发起单聊沿用现有逻辑。

## 验收

TypeScript、Expo 依赖一致性、`expo-doctor` 20 项全部通过。隔离 PostgreSQL 的 P0–P3 与动态、状态回归共 40 项通过，覆盖好友确认、群邀请和权限隔离。5 个前端测试文件通过。320 和 390 像素视口中的浏览器运行版验证了搜索、清空、单聊发送后查询最新消息、好友列表入口排布、群邀请接受与拒绝、建群、五栏导航和暗色主题。

本次从已验收的 v8 Release 复用原生容器并重新编译 v9 Hermes bundle。离线 Gradle 完整重编因本机缺少 Gradle 插件缓存而中止。包签名、16 KiB ZIP 对齐、最低系统版本及 ABI 已核验。与 v8 相比，除签名元数据外，只替换了 Hermes bundle 并递增了 manifest 与 Expo 内嵌配置的版本号。ARM64 与 x86_64 包有 1,379 项完全一致的运行文件，包括 manifest、DEX、Hermes bundle 和资源。本轮没有可用的华为或卓易通真机。

## Android 15 运行截图

Pixel 6 x86_64 模拟器已安装签名 Release 包，连续 5 次冷启动通过，未发现致命崩溃。系统键盘上沿位于 y=1,432 像素，搜索输入框位于 y=102–233 像素，已验证输入、结果筛选、清空及收起键盘。原生界面验证了五栏导航、好友发起单聊、群聊入口、接受群邀请及打开建群表单。ARM64 手机实装仍待验证。 [运行日志和原始截图](https://github.com/CharlonautArx/Penlia/actions/runs/44990673572)

- [聊天首页](chats.jpg) · [原生键盘与搜索结果](search.jpg)
- [好友页群聊入口](friends.jpg) · [群聊管理](groups.jpg) · [创建群聊](group-create.jpg)
