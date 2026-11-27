# 朋聊 · 消息首页 Liquid Glass 试点

[同尺寸对照](comparison.png) · [原版 Android 实图](original.png) · [新版静态视觉稿](liquid-glass.png) · [材质局部放大](details.png)

两版正视图均为 540 × 1200。原图来自朋聊 0.1.11 的 Android 15 模拟器，使用原版 Release 的演示账号。CI 当时构建的是 `f78d89295d78762259b2862ee5bdc799a14d1ab6`，核对过相关源码、资产、依赖和应用配置在它与正式基线之间一致。会话正文区域、状态栏和系统导航栏逐像素保留。新版为隔离环境中对截图的光学视觉渲染。[原版 Android 运行记录](https://github.com/CharlonautArx/Penlia/actions/runs/45998981394)

## 材质

- 参考 1 的人像和糖衣胶囊，把暖色集中在左肩；参考 2 的日光底色，让会话留在明亮、平静的平面上；参考 3 的局部光学聚色，让暖冷过渡集中在边缘，保留截图中已确认的白色阅读区。
- 参考 4 的材质分层分别处理形状、染色、折射和光影。参考 5 的玻璃球体和色带，对背景逐像素位移采样，颜色通道的微小分离限于边缘。参考 6 的控件弧面给底栏方向性反光和柔和接触阴影。参考 7 的泡泡浮雕只用在原有「聊天」选中区，保留图标及未读点。
- 搜索和底栏仍在原处。先用 Frontend Design 明确主次，查阅 Awesome DESIGN.md 的 Apple 空间和材料说明，再用 UI/UX Pro Max 核对移动触区与文字对比。Impeccable 的定向复查压短了连续白亮边，减轻了导航框的重影，并将高光集中在胶囊肩部。这些参考用于视觉判断，图中的技术推测不作为 Apple 实现依据。

## Android 可行性

- 原项目已安装 expo-blur。Android 12 起可先用 `RenderEffect` 路径在两个控件附近模糊已捕获的背景，避免全屏和逐会话模糊。真正的边缘形变需采样背景坐标。Android 13 起可用 `RuntimeShader` / AGSL 在隔离渲染层实现；它需要显式输入采样区域，不能直接读全屏。仅边缘窄带做 RGB 偏移，光线和阴影限在同一材质层合成。[Expo BlurView](https://docs.expo.dev/versions/latest/sdk/blur-view/) · [Android AGSL](https://developer.android.com/develop/ui/views/graphics/agsl) · [RenderEffect](https://developer.android.com/reference/android/graphics/RenderEffect)
- 旧系统、省电或高对比需求使用固定的浅色实底、方向高光和轻阴影。计划中的按压只改变曲面局部体积、反光和阴影，松手短回弹。底部选中胶囊沿原五栏移动，浮层以触发控件为起点过渡。开启减少动态效果时禁用形变和弹性。滚动采样、旧设备 GPU 成本、纹理复用及深色可读性仍需将来原型验证。[Apple HIG Materials](https://developer.apple.com/design/human-interface-guidelines/materials)

## 隔离与回滚

- 原版唯一基线为 `codex/penlia-official-stickers` 的 `002ea5514cdc56f87865bd2d4d38e3af447836fd`。试点开始时本地工作树干净，同远端一致。GitHub 默认分支 `main` 为 `90e654c37a93c0304cbdcfbd2049d2bcea59c3e2`。
- 备份标签和备份分支均为 `backup/pre-liquid-glass-pilot-2026-11-27`，都指向同一原版提交。标签对象为 `09859e0f48a0923e9638884e7983bceddfab138c`。标签保留作回滚锚点。GitHub 拒绝当前集成设置仅限该标签的防更新与删除规则（HTTP 403）。
- 试点分支 `codex/liquid-glass-inbox-study` 只新增本目录中的视觉材料。原版工作区保持在正式基线。否决本稿时直接继续使用原版分支；原版 APK 和校验值可继续使用。[原版 APK](https://github.com/CharlonautArx/Penlia/raw/78f8799a6b1ba85f9b40c46446d921696a4431dd/Penlia-0.1.11-arm64-v8a.apk) · [原版 APK 校验值](../official-stickers/SHA256SUMS.txt)
