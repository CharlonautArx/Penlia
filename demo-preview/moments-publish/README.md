# 朋聊 v8 动态首页发布入口

基线为已验收的 v7 提交 `5f48608`。本轮分支为 `codex/penlia-moments-publish-bar`，构建提交为 `9d7f289664f67edd9b907747a5f2dc2b4eef4048`。

## 变更范围

- `src/features/moments/Feed.tsx` 移除动态首页的白色标题栏、首页演示徽标、三点按钮和右上角圆形发布按钮。封面卡片放在既有状态栏安全区之后。
- 「动态」栏目只保留一行首页操作。左侧盾牌直达既有空间隐私页，右侧胶囊打开「选择发布方式」，可进入原普通发布页或共创创建页。浅色模式使用纯白填充和轻微阴影，深色模式使用现有深色表面。图标都有独立的无障碍标签。
- 首页的「瞬间共鸣」入口移除。「玩乐 → 一起 → 瞬间共鸣」仍可打开原内容，已用实际界面验证。独立个人时间线、同页栏目、封面、内容列表、互动和可见范围沿用 v7。
- `app.config.js` 将离线预览版本号升至 8。此次没有新增依赖，未修改生产服务、数据库或 main。

## 已执行的检查

- TypeScript、Expo SDK 依赖检查和 Expo Doctor 20/20 通过。
- 真实离线 Web 流程验证无标题栏、唯一发布入口、白色胶囊与盾牌同排、空间隐私修改和恢复、普通动态的范围确认及实际发布、共创创建。继续验证同页栏目、头像、置顶、图片预览、点赞取消、留言、转发和深色模式。运行过程中没有对外部服务发请求。
- 隔离 PostgreSQL 的 4 项动态回归通过，覆盖互动权限、媒体撤权、23 条置顶分页排序及长期状态访问控制。

## Android 15 实际运行

在 Pixel 6 模拟器的 Android Release 上完成 5 次冷启动、五栏导航、空间隐私、两种发布、同页栏目、独立时间线及深色模式。首页无原标题栏、旧菜单和重复发布按钮。原生无障碍树中盾牌和发布框的上下边界均为 y=932–1073 px，两者水平分开。系统状态栏保持可见，应用日志未见致命崩溃。安装启动验证在 x86_64 模拟器完成，未实装 ARM64 手机。 [原始日志和截图](https://github.com/CharlonautArx/Penlia/actions/runs/44945676404)

- [新版动态首页](moments.jpg) · [发布方式](publish-options.jpg) · [空间隐私](privacy.jpg)
- [普通发布](ordinary.jpg) · [创建共创](collaboration.jpg)
- [同页日志](journals.jpg) · [同页相册](albums.jpg) · [个人时间线](timeline.jpg) · [深色首页](dark.jpg)

## ARM64 离线 APK

[登录 GitHub 下载 v8 APK](https://github.com/CharlonautArx/Penlia/blob/penlia-moments-publish-v8-apk/demo-preview/penlia-moments-publish-arm64.apk)。点击 **Download raw file**，用系统安装器打开。预览包沿用 v7 的包名和签名，可覆盖安装，启动后选择「直接进入演示」。

- Android 7.0（API 24）或以上，ARM64。包名 `app.penlia.mobile.preview`，构建号 8。已从私有仓库重新取回 APK 并校验 SHA-256 一致。
- 大小 40,388,580 字节（约 38.5 MiB）。SHA-256 `9b66f122f37d3572121cd57916019c2b456b8d1b2d26f0db8a89c52a996be5d2`。
- Gradle Release、R8、签名和 16 KB ZIP 对齐通过。与模拟器 x86_64 包的 1,379 项 Hermes Bundle、DEX、清单和资源相同。27 个 ARM64 原生库与 v7 逐字节一致，模拟器使用同一基线的 x86_64 原生库。
