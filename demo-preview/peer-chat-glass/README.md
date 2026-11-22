# 朋聊 v10 好友单聊

源码分支 `codex/penlia-peer-chat-glass`，APK 源自 `9cc85cf31eb05e683713d711c4b6e444561ec163`，基线为已验收的 v9 提交 `b6b2210`。

[下载 ARM64 离线 APK](https://github.com/CharlonautArx/Penlia/blob/penlia-peer-chat-v10-apk/demo-preview/penlia-peer-chat-arm64.apk)。文件大小 41,237,367 字节（39.3 MiB），支持 Android 7.0（API 24）以上 ARM64 设备。包名 `app.penlia.mobile.preview`，内部版本号 10，沿用 v9 的签名，可覆盖更新同签名版本。

下载件 SHA-256 为 `5e5b1abf4932bd7328c5c2e693cc5c53904ba05a2540b603dbce36b50c8389f4`，已从 GitHub 重新取回核对。交付包沿用 v9 验过的原生容器，重新编译并签署 v10 的 Hermes Release。交付 ARM64 与 x86_64 测试包的 1,379 项 DEX、清单、Hermes 和资源逐字节一致，二者原生库依各自架构打包。

## 改动

- `src/app/chat/[id].tsx` 移除独立顶栏的背景、边线、演示标签和三点菜单。保留返回、头像、昵称和头像进入好友资料的路径。顶部用中性渐隐模拟柔白光影。
- `src/features/chat/ui.tsx` 的共享输入组件增加仅单聊启用的悬浮外观。浅色胶囊以纯白、细高光及中性阴影呈现，暗色采用中性深灰。加号和图库按钮移入胶囊，空输入无占位文字。表情按钮保留，发送按钮的可见圆面为 36 dp，触控仍为 Android 48 dp。
- `src/features/chat/Viewport.android.tsx` 与 `Viewport.tsx` 让单聊的状态栏安全区延续聊天底色，沿用已有系统 IME Insets 与 iOS 键盘避让机制。
- `src/features/pet/mark.tsx` 只显示圆形宠物，保留使用现有宠物页面的路径。聊天列表里的宠物状态与群聊输入界面沿用原样。
- 「添加」通过 `src/components/ui.tsx` 的原有底部弹层显示语音、视频和位置。正常通信模式保留安静送达、只是分享、短视频和既有状态。演示包中的语音、视频仍标注为「演示」。

## 浏览器及自动测试

- TypeScript、Expo SDK 依赖一致性、Expo Doctor 20/20 项与 16 项前端单元测试通过。
- 隔离 PostgreSQL 的 8 项 P0 集成回归通过，包括好友同意、群聊权限、消息、媒体授权与撤回。
- Chromium 的 390 与 320 像素运行版验证白色胶囊、图标顺序、暗色、文字发送、草稿、表情、语音与视频演示、受控位置的确认发送、相册图片发送和原图预览、宠物、好友资料以及群聊原有输入区。浏览器运行期间无外部服务请求。

## Android Release

GitHub Actions 从同一源代码完整编译 ARM64 Release，`minifyReleaseWithR8`、签名、ABI 与 16 KiB ZIP 对齐检查均通过。 [完整编译记录](https://github.com/CharlonautArx/Penlia/actions/runs/44994489935)

Android 15 Pixel 6 x86_64 模拟器用签名 Release 通过 5 次冷启动。系统键盘上沿为 y=1432 px，三行和达到高度上限时，输入框底边分别为 y=1410 与 y=1411 px，发送键也完整可见。连续三次开合键盘后，布局恢复，草稿保留。通过系统无障碍测试工具向已聚焦的输入框写入中文、英文和 Emoji，随后使用发送键发送并检查草稿清空。

模拟器还实际完成历史滚动、宠物与好友资料跳转、语音及视频演示、位置入口、系统相册选图、发送、原图预览和重启后的本地图片读取。日志未发现致命崩溃。专项验收仍需覆盖华为鸿蒙、卓易通及真机中文候选栏。 [Android 原始截图与日志](https://github.com/CharlonautArx/Penlia/actions/runs/44995314123)

- [正常单聊](conversation.jpg) · [键盘弹出与中文输入](keyboard-unicode.jpg) · [「添加」菜单](add.jpg)
- [三行输入](multiline.jpg) · [达到高度上限](multiline-capped.jpg) · [发送后原图预览](photo.jpg)
