# 朋聊「一起」收尾验收

功能与 Web 验证完成。Android 完整 ARM64 Release 和两版模拟器检查通过，ARM64 实机原生体验待验收。

[Android 截图（含十二项入口）](android-screens.pdf) · [Android 15 原生录屏](android-recording.mp4) · [Android 11 深色大字录屏](android11-recording.mp4) · [外部页面 Web 对照](protected-web.pdf) · [ARM64 安装包制品](https://github.com/CharlonautArx/Penlia/actions/runs/45821648571/artifacts/15119603777)

## 源码和构建

开发分支为 `codex/together-invitations`。GitHub 可以从 `038bdc9` 遍历到 `c357262` 及本轮提交。客户端构建点为 `1f735f6762dc12a585ed82a82ad4b9693ecf2a19`。服务端在私密投票后锁定受邀名单。最终客户端补上创建页的 Android 输入避让及聚合收件箱空状态。代码和工作流差异见 [文件清单](changed-files.tsv)。本目录为额外的验收材料。

原构建的首个终止异常是 worklets 配置阶段无法写入 prefab_publication.json/debug。原工作区 node_modules 中的部分 Android build 目录是指向已消失的 /dev/shm/project-life-preview 的符号链接。已将这些断链替换为普通的本地构建目录，并验证 worklets 的中间目录可以写入。最终构建的 ARM64 首次尝试在下载 Foojay 1.0.0 插件标记时提前结束。核对官方 POM 成功返回 HTTP 200；x86_64 从相同源顺利完整编译。随后在同一提交上只重试 ARM64 作业。云端使用 npm ci、干净检出、Expo prebuild、Java 17 和 Gradle :app:assembleRelease，开启 R8，各架构独立完整编译。依赖锁定为 Expo 58.0.26、React Native 0.88.1、Worklets 0.13.0、Reanimated 4.7.1。首次推送时安全工作流漏装服务端锁文件中的 pg，补上安装步骤后远端安全作业通过。

[完整构建与模拟器作业](https://github.com/CharlonautArx/Penlia/actions/runs/45821648571)。ARM64 APK 的 SHA-256 为 `fde233d316e47c8511714e5c633d66293d2c6fd65975c2614d7edcd1ce6382d4`。预览包使用 ui-demo 的账号与原生包名 app.penlia.mobile.preview。

## 站内功能

| 功能 | 实现与验证 |
| --- | --- |
| 活动临近提醒 | 由服务器按本人有效确认、当前候选时间和提醒窗口求值，仅在打开相关页面时定时拉取。测试覆盖提前八分钟时默认关闭、提前十五分钟时可见及其他账号不可见。 |
| 用户提醒偏好 | 每场可选择关闭、提前 15 分钟、1 小时或 1 天，保存于本人活动成员行。同时应用本人的时区、安静时段、临时及长期静音。真实 HTTP 测试切换 30 分钟静音与关闭静音，核对列表消失及恢复。 |
| 改期与取消 | 改期清除旧确认、提醒和关联日程，旧版候选 ID 无法继续确认。取消清空持久化的提醒分钟数。撤回参加、被移除或拉黑后，请求重新检查对应状态与权限。 |
| 「一起」内部聚合 | 从这里进入「邀请与消息」会同时读取账号的邀请、活动更新、临近活动、共同回忆和胶囊提醒。点开进入原内容并复核访问权。共享页面的其他入口继续使用原外观。 |
| 活动通知与留言 | 详情内的通知来自本账号的邀请和活动变更事件。活动文字留言需要另行自愿加入。发送时冻结阅读范围，加入者不补发旧留言，重复发送使用请求 ID，作者可撤回，退出时清理其作品和个人授权。浏览器跑通加入、发送、撤回、退出；HTTP 另测越权、幂等与晚加入。现场照片仍由共同日记与相册管理。 |
| 通用决策 | 可配置一个轻量问题和 2–5 个选项。本人私下改选或清除，选择与报名分开。正式提议时间时，非小群且至少三位受邀者选择同一项才产生共同建议。服务端禁止收到私密回答后更换投票成员。没有公开的个人明细或实时票数。 |

服务端使用隔离 PostgreSQL、多账号和真实 HTTP。Together 5/5、原 P1/P2/P3 分别 8/8、12/12、8/8；基础与安全 49/49。TypeScript 检查通过。单账号预览可单独操作本人设置。本次没有生产部署和跨设备系统推送。

[活动状态、讨论和提醒](https://github.com/CharlonautArx/Penlia/blob/c6214ac82dedc99a998eca2221af174ae9c01cbe/server/p1/gatherings.mjs) · [真实接口测试](https://github.com/CharlonautArx/Penlia/blob/c6214ac82dedc99a998eca2221af174ae9c01cbe/server/p1/together.test.mjs) · [聚合入口](https://github.com/CharlonautArx/Penlia/blob/c6214ac82dedc99a998eca2221af174ae9c01cbe/src/app/social.tsx) · [提醒展示](https://github.com/CharlonautArx/Penlia/blob/c6214ac82dedc99a998eca2221af174ae9c01cbe/src/features/together/ReminderRows.tsx) · [讨论界面](https://github.com/CharlonautArx/Penlia/blob/c6214ac82dedc99a998eca2221af174ae9c01cbe/src/features/together/ActivityDiscussion.tsx)

## 材质和作用域

所有「一起」子页面可共用 Screen 的滚动正文、BlurTargetView 和覆盖在正文上方的 BlurView。API 31 及以上使用 dimezisBlurViewSdk31Plus，早期 Android 或开启高对比度时使用不透明底色。页面顶部与启用局部变体的浮层有采样模糊。主按钮使用局部渐变和边缘光，分段控件用实底和选中层；正文、日历格和列表内容没有逐行模糊。不能把每个控件都视为实时折射玻璃。活动封面和标题的连续性来自共用构图。未对设备 GPU 帧率作定量保证。

完整 diff 见清单。共享 Sheet 多了可选 surface，其他调用保持原默认。受保护的全局导航、主题、头像素材、宠物和聊天渲染无本轮实现差异。10 条外部路径比较了可见文字、按钮名称与几何、图片 URI、尺寸及解码状态。对照图册及 [控件和像素测量](protected-web-metrics.json) 记录比较结果。聊天列表两枚头像和动态头像的首轮差异均可在同一旧基线的不同运行中找到。私聊宠物原先的两种像素形态也都在同一旧基线复现。最终客户端四个取样区的原始像素均精确对应旧基线的一次独立运行结果。在固定减弱动效、图像已解码的同一页面上重复截图，像素稳定；跨次运行出现了图像栅格化差异。详见 [像素取样](avatar-pixels.json)，其中每个值均为原始 RGB 像素 SHA-256 的前 12 位。未能从截图区分浏览器内部解码、缩放和合成的具体子阶段。最终十个页面中六个逐像素一致。好友、动态、私聊及个人空间的单通道最大差分别为 4、7、5、7（满值 255）。将所有已解码图片的实际矩形从差异图中遮去，三页不再有差异；私聊剩余像素全部落在宠物矢量图标范围内。结合调用链，未发现外部视觉实现、几何布局或图片源变化。Android 上的基线与最终版尚未逐像素对照。

## ARM64 真机检查清单

1. 安装预览包，强停再打开，从「玩乐 → 一起」进入，检查返回和恢复。
2. 在有照片和无封面的详情连续滑动，比较复杂背景、浅深色、高对比度及大字号下的文字和玻璃边缘。
3. 创建活动，长标题输入时弹出、收起键盘。去系统图库选图，再取消一次，检查表单和焦点。
4. 导出邀请卡，检查相册；打开系统分享并取消，确认回到当前活动。
5. 用隔离服务端账号分别测试确认、静音、取消和留言授权。APK 的单机演示不构成多人联机证据。

## Android 原生验收

运行设备为 GitHub 托管的 Pixel 6 配置模拟器，Android 15（API 35），x86_64 Release，540 × 1200，240 dpi。安装的是从提交 `1f735f6762dc12a585ed82a82ad4b9693ecf2a19` 完整编译的预览客户端。ARM64 APK 单独从同一提交完整编译和验证签名、ABI、16 KB ZIP 对齐及归档完整性。ARM64 实体手机及 iOS 仍待验收。模拟器使用宿主软件图形后端，整机帧率、耗电、不同厂商键盘及低端 GPU 表现另需真机测量。

录屏为 Android 系统合成器直接采集的 H.264 画面，114.3 秒；封面素材来自演示图库。交付 MP4 只保留视频轨，已校验重封装前后解码帧哈希一致。录屏保留系统选图和分享界面往返。PDF 内附完整十二项入口索引与参考编号。各页面顶部使用同一套滚动采样导航，活动操作、私密选择、分享预览和成员弹层使用 Together 专用材质。日程、清单和留言正文保留清晰底色；日记、回忆、世界照片照常按独立权限读取。

**运行观察**　系统选择器返回后保留了活动标题和选中的封面。无封面邀请的标题可自然换行。照片滚入导航后，街景细节在导航区域内柔化。打开系统增强对比度后，同一位置变为实底。导航远离文字和边缘的一块区域（像素坐标 263,146 至 450,168）的平均 RGB 在滚动前、滚动后、高对比度时依次为 243/244/244, 144/145/144, 255/255/255。此测量针对导航；对弹层的观察以分享预览录屏为准。系统分享只包含活动标题。邀请卡从 Android MediaStore 重新读取，文件格式 PNG，尺寸 600 × 760。真机上的模糊强度和瞬时掉帧仍待核验。

**站内验证**　真实 Web 操作创建距开始八分钟的活动，自愿开启提前十五分钟提醒，刷新收件箱后点击同一活动并关闭提醒，收件箱回到空状态。隔离 HTTP 请求确认收件箱事件和活动详情使用相同通知 ID，未受邀账号没有对应事件，也无法读取详情。活动通知当前覆盖邀请和活动状态更新，活动留言为独立的自愿参加区。预览账号不能代表其他人的邀请送达或投票。

**低版本实测**　Android 11（API 30）同一 x86_64 APK 在系统深色、字号 1.30 条件下打开首页、详情及创建页，并通过滚动和输入检查。导航使用实底降级。详见图册的 Android 11 页面。


## 复现入口

此次构建的 GitHub Actions 制品保留 30 天，下载可能需要登录 GitHub。图册、验收记录和录屏随开发分支保存。从上述构建的 ARM64 作业下载制品，解压 APK，核对 SHA-256 后安装。应用包名为 `app.penlia.mobile.preview`。选择「直接进入」，打开「玩乐 → 一起」。同名应用若使用不同签名，Android 会拒绝覆盖安装；可使用单独的测试用户或设备。

从全新检出执行仓库已锁定版本的 `npm ci`、Expo Android prebuild，并按 [完整构建工作流](../../../.github/workflows/together-native.yml) 执行 Release 编译和校验。模拟器验证脚本使用隔离演示账号，分别检查系统窗口、MediaStore 的 PNG 内容与最终界面。真实 HTTP 集成测试要求隔离的回环 PostgreSQL 测试库和最低权限角色。

[Android 15 操作记录](android-checks.txt) · [Android 11 操作记录](android11-checks.txt) · [安装包核验](arm64-checks.txt) · [HTTP 与权限](http-checks.txt) · [基础和安全回归](regression-checks.txt) · [P1](P1.txt) · [P2](P2.txt) · [P3](P3.txt) · [Web 提醒操作](reminder-web.txt)
