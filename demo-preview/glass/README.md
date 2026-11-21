# 朋聊玻璃材质与玩乐入口

## 全局规范

- 品牌端点沿用 **#FF768D、#EAC8D5、#AEFFF8**。`src/material.ts` 定义浅色、深色基底、四级渐变强度、边缘和高光。正文和常规内容卡使用实体中性色，文字仍沿用 400/500 的系统字体层级。
- `GlassLayer` 为导航、已选控件、主操作、分段、演示标签与抽屉提供共享表面。凡涉及照片、头像、视频，保留媒体本身的颜色。危险操作保留独立的前景和背景色。
- `UnreadMark` 使用鲜亮的粉色渐变、高光边缘和对比清楚的深色数字。聊天列表和聊天 Tab 使用已有私聊计数，读过会话后随数据更新。当前群聊接口只提供成员数，群聊未读计数待有真实数据来源后接入同一控件。
- Android 12（API 31）及以上在「一起」入口的一小块装饰区域使用 Expo Blur 的 SDK31+ 渲染方式。iOS 使用同范围的系统模糊。旧 Android 和 Web 使用同一构图的静态渐变，主要控件和导航也采用静态玻璃表面。离开「玩乐」后卸载实时模糊层。
- 导航保留五个位置和安全区。按压使用低幅度透明度反馈，系统减少动画设置继续约束页面切换、抽屉和「一起」入口的按压缩放。
- 材质做法参考 Apple 的[材质](https://developer.apple.com/design/human-interface-guidelines/materials)、[标签栏](https://developer.apple.com/design/human-interface-guidelines/tab-bars)和[动效](https://developer.apple.com/design/human-interface-guidelines/motion)指南。Android 模糊范围和版本门槛依据 [Expo BlurView](https://docs.expo.dev/versions/latest/sdk/blur-view/)。

## 入口迁移

| 原入口 | 新位置 |
| --- | --- |
| 一起生活 | 玩乐顶部「一起」，沿用 `/life` |
| 线下去处 | 玩乐首页，包含城市、分类、推荐、地点详情和「想去的地方」 |
| 为你推荐 | 地点推荐并入玩乐首页，聚会提议仍可进入，原有游戏全部进入小游戏列表 |
| 小游戏 | 一起 → 约朋友一起玩 → 小游戏 |
| 原有约局、心愿与邀请 | 一起 → 约朋友一起玩 → 活动 |
| 共享日程、共同旅行、共同愿望地图、瞬间共鸣、共同日记、共同回忆、时光胶囊、共同世界、共同清单、我的收藏与好友推荐、生活提醒 | 一起的分组列表 |

小游戏继续使用同一套路由和规则。小游戏包括石头剪刀布、反应力挑战和聚会话题卡，支持原有的单人或同机体验。地点发现仍通过现有演示与授权目录筛选，保留虚构推荐及赞助样式标识。

## Android 实际运行截图

前后对照左侧为字体版 v4，右侧为本轮 v5。均来自 Android 15 Pixel 6 模拟器，保留采集时的实际状态栏及窗口高度。

- [聊天对照](compare-chat.jpg)、[玩乐对照](compare-play.jpg)、[好友对照](compare-friends.jpg)、[动态对照](compare-moments.jpg)、[我的对照](compare-profile.jpg)、[登录对照](compare-login.jpg)
- [新玩乐首页](play.jpg)、[城市选择](cities.jpg)、[地点详情](place.jpg)
- [一起](together.jpg)、[活动](activities.jpg)、[小游戏](games.jpg)、[反应力挑战](game.jpg)
- [隐私与安全](privacy.jpg)、[深色聊天](dark-chat.jpg)、[深色玩乐](dark-play.jpg)、[360dp 宽／135% 字号](large-play.jpg)、[大字号一起](large-together.jpg)

## 测试与安装

- TypeScript、Expo Doctor 20/20、Expo SDK 依赖检查及 22 项自动化测试全部通过。亮粉数字和玻璃主题文字的各个渐变端点均检查了普通文字 AA 对比度。
- 离线 Web 交互通过城市和分类筛选、地点收藏、12 个一起入口、小游戏、未读更新以及 P0–P3 既有路径。反应力挑战实际完成一局。
- R8 开启的 Android 15 x86_64 Release 运行通过 5 次冷启动、五栏、城市及分类筛选、地点详情及收藏、一起、活动、小游戏和深色／135% 字号。模拟器 APK 与 ARM64 手机包的 1,379 个 Bundle、DEX、清单及资源条目逐项一致。27 个 ARM64 动态库与上一版逐字节相同，模拟器复用同一基线的 x86_64 动态库与本次 Release 应用代码。 [Android 运行记录](https://github.com/CharlonautArx/Penlia/actions/runs/44912148753)
- ARM64 安装包已完成本机 Gradle Release 编译、签名和 16 KB ZIP 对齐校验。华为／卓易通及其他 ARM64 真机的安装与帧率仍待实机验收。

从 [私有仓库下载 ARM64 APK](https://github.com/CharlonautArx/Penlia/blob/penlia-glass-v5-apk/demo-preview/penlia-glass-arm64.apk)。登录 GitHub 后点 **Download raw file**，用系统安装器打开，启动桌面的「朋聊演示」后点「直接进入演示」。包名和签名沿用 v4，可覆盖安装。

- Android 7.0 或以上，ARM64，40,369,628 字节（约 38.5 MiB），演示版本号 5。
- 构建源码为 `4c7262d`，独立分支 `codex/penlia-glass-and-play`。
- SHA-256 `c1328bf6e06041125fb8df0019729dfc7de295c66d9e6256dc329309754598f4`。
