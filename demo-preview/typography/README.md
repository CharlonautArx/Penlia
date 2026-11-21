# 朋聊字体精修

## 排版规范

使用系统默认无衬线字体和系统中文回退。字号与行高使用 React Native 的逻辑单位，并随用户的字体设置缩放。圆形头像内的首字是装饰标记，继续按头像尺寸绘制，完整昵称由列表行和个人资料呈现。

| 文字用途 | 字号 / 行高 | 字重 |
| --- | --- | --- |
| 普通正文 | 16 / 24 | 400 |
| 说明、聊天预览 | 14 / 21 | 400 |
| 时间、次要注记 | 12 / 17 | 400 |
| 联系人昵称、功能入口 | 16 / 23 | 500 |
| 分区及二级页标题 | 18 / 26 | 500 |
| 五栏主页面标题 | 25 / 34 | 500 |
| 按钮、标签 | 14 / 21 或 12 / 17 | 500 |

欢迎页的朋聊字标用 600，反应小游戏的大号即时分数用 700。全局角色定义在 [typography.ts](../../src/typography.ts)，现有页面通过 [theme.ts](../../src/theme.ts) 复用。此次字体排查也覆盖了登录、设置、弹窗、聊天详情、小游戏、动态与空间、共享日程与愿望地图、共同世界和小宠物。

## Android 运行截图

对照图左侧为启动修复版，右侧为本次字体版。两次均在 Android 15 Pixel 6 模拟器用中文区域设置运行。浅色标准对照为 400dp 宽、系统字体 100%；大字号测试为 360dp 宽、系统字体 135%。两次采集的系统状态栏高度有差异，截图保留了实际运行画面。

- [聊天](compare-chat.jpg)、[好友](compare-friends.jpg)、[玩乐](compare-play.jpg)、[动态](compare-moments.jpg)、[我的](compare-me.jpg)
- [登录](compare-login.jpg)、[共享日程](compare-calendar.jpg)、[隐私与安全](privacy.jpg)、[共同世界](world.jpg)
- [深色聊天](dark-chat.jpg)、[深色玩乐](dark-play.jpg)、[大字聊天](large-chat.jpg)、[大字玩乐](large-play.jpg)、[大字设置入口](large-me.jpg)、[深色大字聊天](large-dark-chat.jpg)

首轮截图发现 135% 字号下底栏标签底部被裁切。Android 放大字号时会为标签增加垂直空间，仍按系统字号缩放。聊天预览的单行省略规则用于保护消息列表密度。

## 验证

- `npm run typecheck` 通过，Expo Doctor 20/20，`expo install --check` 通过。
- 前端及 DMS 生成器回归测试 21/21。独立离线 Web 回归覆盖演示入口、聊天恢复、群聊、好友、隐私、头像图片选择、动态及 P1–P3 主要流程。
- Android 运行覆盖冷启动、进入演示、五栏切换、共享日程、隐私与安全、共同世界、会话恢复和主题切换。首轮与最终复测日志分别见 [原始对照](https://github.com/CharlonautArx/Penlia/actions/runs/44894641965) 和 [大字号修复复测](https://github.com/CharlonautArx/Penlia/actions/runs/44895294662)。
- 手机包和 x86_64 验收包的 1,378 项 Hermes Bundle、DEX、Manifest 与资源内容逐项一致。华为／卓易通及其他 ARM64 真机的渲染与安装待实机复验。

## 离线演示 APK

[获取 ARM64 APK](https://github.com/CharlonautArx/Penlia/blob/penlia-typography-v4-apk/demo-preview/penlia-typography-arm64.apk)。登录可用的 GitHub 账号，在文件页点 **Download raw file**，然后用手机系统安装器打开。签名与上一版一致，版本号为 4，可覆盖安装上一版演示包。

- ARM64、Android 7.0 或以上，40,337,215 字节（38.5 MiB）。
- 应用包名 `app.penlia.mobile.preview`，源码提交 `d8d096a`。
- SHA-256 `b23b90f69d7f2c2acec0ad4068fcbf00c0f154bb078c5ac66100917f4af2e800`。
