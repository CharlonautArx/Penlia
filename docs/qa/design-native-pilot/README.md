# 朋聊 · Android 四方案试用

本分支以官方表情版 `002ea5514cdc56f87865bd2d4d38e3af447836fd` 为共同起点。四个方案使用朋聊现有的本机演示账号、相册、宠物、消息和约局。安装名称为「朋聊 · 设计试用」，Android 标识为 `app.penlia.mobile.designpilot`。原正式包和此前预览包各自拥有独立的数据目录。

[下载 ARM64 安装包](https://github.com/CharlonautArx/Penlia/releases/download/penlia-design-preview-46044871021-46046972479-46046972479-r2/Penlia-design-pilot-arm64.apk) · [原生截图、四段录屏、构建和性能验收](android.md)

## 在手机上比较

首次启动会进入「切换设计方案」。选 A、B、C、D 或「原版对照」，再点一个体验页面。在各方案的聊天首页点「方案」可以再次选择；五种外观也都可以从「我的 → 偏好设置 → 切换设计方案」进入。再次打开时恢复上次的选择。选择只改变当前设备的外观，同一个账号的测试内容继续保留。

| 体验入口 | 可实际尝试的操作 |
| --- | --- |
| 聊天 | 搜索「小满」，清空，再左滑一条会话查看操作 |
| 与小满聊天 | 上下滚动，在输入框打字或从官方面板选表情，发送后返回列表查看摘要 |
| 好友动态 | 看同一张夜景照片、打开预览，切换日志与相册，检查互动和可见范围 |
| 共同世界 | 打开窗边的灯、点空位、轻触宠物，查看摆件与纪念物 |
| 约局详情 | 选择候选时间，查看私密选择、空闲参考或留言；可退回保留原状态 |

比较原始种子内容时，先观察五个页面再修改内容。亲自确认键盘是否挡住输入、深色复杂照片上的控件对比、小字号和大字号下的长姓名，以及连续滚动时手指与画面的跟随感。

[全局诊断、保护清单、设计依据与八项比较](design.md) · [逐轮截图与修改记录](iterations/README.md)

## 实现和隔离

- `src/features/design-pilot/` 管理内部选择器的状态、两套明暗色值、衬线字形范围，以及动态、世界与约局的试点布局。字体是 Noto Serif CJK SC 的 SIL OFL 子集，安装包内即可使用。包含未收录字形的短标题整句交给系统显示。
- `src/features/chat/PilotInbox.tsx`、`PilotThread.tsx` 使用原会话检索、备注、置顶、未读和发送状态。试点接入现有的浮层、长按行为、宠物及表情协议。
- 真实路由继续使用原会话、动态、世界和约局模型。动态的两种来源分别在 `PostCard`、`EntryCard` 接入展示；私密读写仍走原处理函数。约局候选行调用原本的选时状态，正式提议与朋友确认仍为两个动作。
- `app.config.js` 设置独立包名和 `penliapilot` scheme。`tooling/public-config.cjs` 在构建时拒绝在线 API、即时通信应用标识以及非演示的构建配置。根导航只给已进入本机演示的试用包开放切换页面。
- `.github/workflows/design-native-pilot.yml` 使用隔离的托管 Android 构建环境。普通试用交付编译两个 ABI 的 Release，手机安装件采用 ARM64，模拟器安装件采用 x86_64。签名检查、16 KB ZIP 对齐、ABI 检查、制品扫描和模拟器运行各有独立步骤。
- 撤回试点可卸载「朋聊 · 设计试用」。源码对照以起点提交或任一后续独立试点提交为准。本轮无需生产部署或数据迁移。

## 本地重现

使用项目规定的 Node 24 和 Java 17，在隔离检出中运行：

```sh
npm ci
npm run typecheck
node --test --test-isolation=none tests/*.test.mjs server/security.test.mjs
export EAS_BUILD_PROFILE=ui-demo
export EXPO_PUBLIC_PENLIA_UI_DEMO=1
export EXPO_PUBLIC_PENLIA_DESIGN_PILOT=1
npx expo prebuild --platform android --no-install
cd android
./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a -Pandroid.enableMinifyInReleaseBuilds=true
```

Android SDK、NDK、Gradle 工具链和预装 Java 的精确配置见[可复现构建工作流](../../../.github/workflows/design-native-pilot.yml)。在安装了试用版的设备上，可用相同内部路由直接对照某页：

```sh
adb shell 'am start -a android.intent.action.VIEW -d "penliapilot://design-pilot?variant=C&screen=gathering" app.penlia.mobile.designpilot'
```

`variant` 取 `original`、`A`、`B`、`C` 或 `D`。`screen` 取 `inbox`、`chat`、`moments`、`world` 或 `gathering`。
