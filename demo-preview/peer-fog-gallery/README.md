# 朋聊 v11 好友单聊顶部与选图

基于 v10 验收提交 `fdf19f6`，本轮分支为 `codex/penlia-peer-fog-gallery`，交付的预览包源自 `4b27fe3d3493a6277ab4c8f330c85a7e058af695`。

[下载 v11 ARM64 APK](https://github.com/CharlonautArx/Penlia/blob/penlia-peer-fog-v11-verified-apk/demo-preview/penlia-peer-fog-arm64.apk)。包大小 41,241,463 字节（39.3 MiB），最低 Android 7.0（API 24），包名 `app.penlia.mobile.preview`。内部版本号为 11，沿用 v10 演示签名。

SHA-256 为 `352acb0b08e75dad35805f8462e47cb00d8e1e052c59c0a34be6c1d62172b663`。交付包基于已验证的 v10 原生 Release 容器，重建 v11 Hermes 字节码并重新签名。ARM64 与 x86_64 测试包共有 1,379 项相同的清单、DEX、Hermes 和资源文件。

## 改动

- `src/app/chat/[id].tsx` 将导航叠放在滚动消息上方。移除顶部好友头像，保留返回、可点击且单行截断的昵称、宠物和状态栏安全区。倒序列表保留视觉顶部留白，最早的消息仍可完整滚到可读位置。
- `src/features/chat/PeerChatFog.tsx` 将中性雾层限制在导航附近，并将下沿渐隐到透明。网页使用实时 CSS 背景模糊，iOS 代码复用已有 Expo 原生模糊及遮罩，尚未运行 iOS 真机验证。
- Android 试验过带硬件遮罩和单层取样两种实时模糊路径。两种候选均在进入单聊时遇到 Android 15 模拟器进程退出，最终预览包采用滚动内容上方的中性渐隐。Android 实时模糊仍需在真机上验证。
- 原生图库继续负责打开和关闭。保留图片读取、缩放、压缩和本地准备，选中后让界面先恢复一帧；去掉占用列表高度的处理提示。处理超过 450 ms 时，进度只占原图片图标的位置。失败后提供「重试选图」操作。
- `src/features/chat/ui.tsx` 与 `src/components/ui.tsx` 缩小两个图标的视觉距离，两个 Android 触控区各为 48 dp。表情、发送和共享组件的群聊默认外观沿用原版。
- `app.config.js` 将离线安装包内部版本升至 11。

## 自动化验证

TypeScript、Expo SDK 依赖检查、Expo Doctor 20/20、16 项前端单元测试和 8 项隔离 PostgreSQL P0 测试通过。320 和 390 像素 Chromium 运行版验证实时背景模糊和渐隐、无头像导航、资料与宠物跳转、独立图标触控、带草稿取消、坏图片错误与重试、正常选图和发送、深色模式及群聊输入回归。浏览器确认正常操作前后输入框范围一致。

## Android 15 Release 实测

- Android x86_64 模拟器以 720 × 1,600 像素运行签名 Release。导航测试通过五次冷启动、昵称和宠物跳转、聊天历史滚动以及加号入口。实测顶部的昵称按钮内已无头像。
- 实际系统相册通过键盘开启时进入、取消、再次开启、选图确认、预览、发送和原图查看。取消或返回聊天后，输入框坐标与打开相册前的无键盘状态一致，草稿保留且键盘保持关闭。中途界面未显示旧的处理提示。键盘打开时可正常输入，发送后输入框清空。
- 浏览器实测加号和图片图标中心距为 30 dp，两个独立触控区各为 48 dp。Android 截图中两枚图标实际笔画的边缘间距约 15 dp。
- 模拟器关闭了系统动画以便稳定自动化录制，转场帧率及 ARM64 手机实装仍待真机验证。iOS 的 Hermes 导出也已通过。 [原始运行日志和截图](https://github.com/CharlonautArx/Penlia/actions/runs/45025798610)

[Android 单聊](conversation.jpg) · [滚动时的渐隐](fog-scrolled.jpg) · [昵称打开好友资料](profile.jpg) · [Android 系统相册](picker.jpg) · [取消后保留草稿](canceled.jpg) · [图片预览](photo-preview.jpg)

[网页实时背景模糊](web-conversation.jpg) · [图片错误与重试](web-retry.jpg)
