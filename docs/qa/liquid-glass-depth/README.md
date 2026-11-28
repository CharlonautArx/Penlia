# 朋聊 Liquid Glass 深度体验

## 回退基线

| 版本 | 正常开发分支与完整分支 SHA | 独立备份 | 已核验旧安装包 SHA-256 |
| --- | --- | --- | --- |
| 原版 | `codex/penlia-official-stickers` · `002ea5514cdc56f87865bd2d4d38e3af447836fd` | [原版标签／同名分支](https://github.com/CharlonautArx/Penlia/tree/refs/tags/backup/pre-liquid-glass-pilot-2026-11-27) | `ddb116666c83267e6f3a54772a6b09d8e0958f7cf069097014efe83b781ceebe` |
| 已认可体验版 | `codex/liquid-glass-native` · `f07e87ff989511668768c8dce2e584be5ee7b1a2`，APK 代码 `f5e005cdb798a65781b0ed2a42d1b8af7d305fcf` | [体验版标签／同名分支](https://github.com/CharlonautArx/Penlia/tree/refs/tags/backup/pre-liquid-glass-depth-2026-11-28) | `00b68c9638530fad3ed17d39e54ebff1547641b52e8fc659d1b2b18e052506fd` |

[原版 ARM64 APK](https://github.com/CharlonautArx/Penlia/raw/78f8799a6b1ba85f9b40c46446d921696a4431dd/Penlia-0.1.11-arm64-v8a.apk) · [已认可的 Liquid Glass ARM64 APK](https://github.com/CharlonautArx/Penlia/releases/download/penlia-liquid-glass-preview-46060098594-qa-46062552307/Penlia-Liquid-Glass-arm64.apk)

新工作树 `/workspace/Penlia-liquid-glass-depth`、分支 `codex/liquid-glass-depth` 从体验版备份标签建立。新版构建配置使用 `app.penlia.mobile.liquidglass.depth`、`penlia-liquid-depth`，仅启用隔离演示数据，关闭 Android 备份。实际清单与安装 UID 由构建和模拟器分别核验。回退时保留任一旧包的安装及其数据，卸载独立的新包。

## 锁定渲染

- 五栏导航使用原路由布局、`liquid-dock.tsx`、`liquid-surface.tsx`、`UnreadMark`、`Glint` 和原 Android shader。材质等级新增在单独的 `depth-glass.tsx`，原 dock 配色、形变、背景目标和设置回退仍使用原控制逻辑。
- 原药丸开关 `liquid-switch.tsx` 在聊天设置、隐私、群管理和审核复用。轨道、状态颜色、圆形滑块、弹簧系数、Android 原生交互层不动。字体滑块、收藏滑动分段、好友分类切换及「一起」入口的原材质亦保留。
- 对照采集同分辨率、同字体、同屏幕色彩模式的原生截图。原底栏实际取样依赖列表滚过时的像素；对照选用同一状态的初始聊天页，另外单独验证真实滚动路径。开关比较原生控件截图裁切。通过源码零差异和设备对照分别记录结果。

## Figma → Android

已用 Figma MCP 读取[原设计系统](https://www.figma.com/design/tnQ0rarKFe67ZCy7jMDsBm/Penlia-Liquid-Glass-Design-System?node-id=5-37)的 6 个组件、38 个变量、5 套 GLASS 样式。Starter 限额拒绝了实验页写入。下列映射使用实际回读的原生 Glass 数据。

| Figma 来源 | Android 材质和用途 | 光学转译 |
| --- | --- | --- |
| Dock · Clear · 折射 .32／深度 11／色散 .026 | 已锁定的 `LiquidDock` | 未改动，仍用原实时合成路径 |
| Thumb · Bevel · .28／7／.020 | 已锁定的 `LiquidSwitch` | 未改动，仍用原开关和原状态 |
| Search · Soft rim · .23／8／.021 | `SearchField` · 中等，焦点轮廓独立 | 原粉青作为边缘环境色，普通浅背景采用轻弧肩 |
| Control · Capsule · .18／6／.015 | `Button`、`IconButton`、输入栏 · 强／中 | 强材质半径边缘形成方向高光，输入文字与触控元素在采样层上方 |
| Reading · Frost · .09／5／.008 | `SettingGroup`、聊天气泡 · 轻；弹窗可见面 · 强 | 阅读面保留原基础色和文字对比。消息列表不逐条采样、不加动画。强材质限制为范围小、背后确有内容的浮层 |

Figma 折射等系数与 Android AGSL 值没有一比一单位关系。Android 13+ 在允许的小面积胶囊使用上一版 shader 对真实背景取样，Android 12 仅实时模糊。低内存、省电、高对比或 Android 11 使用实体明暗材质和曲面边缘。系统照片选择器、权限弹窗和第三方通话区保留系统渲染。未接入跨窗口样本的通用弹窗采用独立光边与实体前景，以保证对比度。

## 原生试点审查

试点安装包代码 `a75abea81c6e6bd435887ef080540fe566693580`。Android 15 模拟器 540×1200，240 dpi，系统字号 100%，与已认可版在同一设备对照。试点按两轮采集，底栏和开关指定裁切区各为 0 像素差异。该比较针对同状态聊天页与「消息免打扰」，其他背景下的实时底栏会跟随原生采样。

试点发现胶囊搜索弧边变平，正式深度预览保留其上版完整轮廓；普通搜索和其他字段采用中等级。聊天输入、约局顶部和操作弹层用真实模拟器核验，扩大至功能卡片、日期与时间、空间工具栏和生活场景。软件渲染模拟器六次滚动两轮分别采得 P95 69 ms、77 ms。已有版本同平台历史数值为 P95 73 ms，测量条件与宿主负载可能不同。该样本并未证明实体手机性能。

[试点原生材质对照](core/native-material-comparison.jpg) · [试点测量与断言](core/android-15.txt) · [Android 15 原生试点运行](https://github.com/CharlonautArx/Penlia/actions/runs/46124875611)

## 深度版设备验证

ARM64 Release 代码 `1ce66b7c7f87e5498c77db2f64279a2fff1a23eb`，实际清单包名 `app.penlia.mobile.liquidglass.depth`，版本 0.1.12（24），ABI `arm64-v8a`。安装包签名、原启动资源、16 KB ZIP 对齐、凭证扫描及关闭系统备份核验通过。SHA-256 为 `130cf6472cc169d1c4502440121735a07bc2fe63d3e9682f45b2eb8f0e148535`。[原生 Release 构建与 Android 11 证据](https://github.com/CharlonautArx/Penlia/actions/runs/46125310818)

同构建的 x86_64 版在 Android 11 深色、系统字号 130%，以及 Android 15 浅色、系统字号 100% 上运行。在两台模拟器上用实际 UID、私有数据目录验证原版、已认可版、深度版三者并存。两组均通过冷启动、切换和滚动、键盘、开关状态、表情面板与约局操作。底栏指定裁切区域、消息免打扰开关指定裁切区域，两组均与已认可版本 0 像素差异。最初的 Android 15 测试被系统 Quickstep 无响应窗口拦截，经处理测试环境后使用原二进制复测通过。[Android 15 复测](https://github.com/CharlonautArx/Penlia/actions/runs/46127111829)

同一实验版本在两次通过验收的设备上自动确认了 54／59 个路由。动画中的共同小宠物可从两台设备截图确认页面已渲染，读屏树断言未通过，因此原生已看见页面共 55／59，自动确认仍为 54／59。剩余四条包含举报详情、聊天收藏记录详情、受授权的转发票据、审核工作台。它们需要实际数据动作、有效授权票据或管理员角色，本次记录为未确认。测试没有穷举所有动态路由状态和外部服务。

六次滚动的 HWUI 采样，Android 15 共 116 帧，标记延迟 67.24%，P95 73 ms。Android 11 共 307 帧，标记延迟 88.93%，P95 42 ms。虚拟设备依然有明显延迟帧。实体 ARM64 手机上的帧率、温度和耗电待验收。
