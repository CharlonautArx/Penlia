# 朋聊 Liquid Glass 独立体验版

原版基线为 codex/penlia-official-stickers 的 002ea5514cdc56f87865bd2d4d38e3af447836fd。备份分支与标签 backup/pre-liquid-glass-pilot-2026-11-27 均指向原版，标签对象为 09859e0f48a0923e9638884e7983bceddfab138c。此前 GitHub 拒绝配置仅限该标签的防更新和删除规则。默认分支 main 在开工时为 90e654c37a93c0304cbdcfbd2049d2bcea59c3e2。[原版备份标签](https://github.com/CharlonautArx/Penlia/tree/refs/tags/backup/pre-liquid-glass-pilot-2026-11-27) · [现有原版 APK](https://github.com/CharlonautArx/Penlia/raw/78f8799a6b1ba85f9b40c46446d921696a4431dd/Penlia-0.1.11-arm64-v8a.apk)

原版 APK 的 SHA-256 为 ddb116666c83267e6f3a54772a6b09d8e0958f7cf069097014efe83b781ceebe，本次用已有制品重新核对。体验版以 app.penlia.mobile.liquidglass 安装，使用已有本机演示账号及种子数据。打开「我的 → 体验入口」可直接访问已有示例内容。

## 材质与架构

沿用已认可单页稿的白色会话底、原五栏和搜索胶囊。背景中的照片和文字仅由 Android 取样，前景文字、未读点和图标绘制在光学层之上。参考视频长 18.91 秒，实看了起始字体被曲面折射、滑动过程的反光迁移、亮暗状态下的弧肩。背景品牌粉与浅青退到肩、边缘和选中泡泡。正文、联系人、聊天记录、照片和设置用原有阅读层。[已认可的单页视觉稿](https://github.com/CharlonautArx/Penlia/blob/3ed54a727dfb7db4ad3788172013f947e52208ee/docs/qa/liquid-glass-inbox-study/liquid-glass.png)

Android 12+ 用原 expo-blur BlurTargetView 采样当前五栏页面，导航背景独立覆盖在其上。Android 13+ 的局部 AGSL RuntimeShader 只重新取样模糊层，在弧肩弯曲坐标，RGB 通道的偏移量不足 1dp。光学运算限于底部窄条。控件使用方向高光和浅接触阴影，避免每条会话叠加效果。Android 11、系统高对比和受限设备使用不透明曲面材质。减少动效设置保留选中与按压反馈，跳过滑动弹簧。[Android AGSL](https://developer.android.com/develop/ui/views/graphics/agsl) · [Expo BlurView](https://docs.expo.dev/versions/latest/sdk/blur-view/) · [Apple HIG Materials](https://developer.apple.com/design/human-interface-guidelines/materials)

本轮使用 Frontend Design 确认视觉重心，使用 Awesome DESIGN.md 的 Apple 章节检视浮层与内容的分工，从 UI/UX Pro Max 查询 Android 触区、对比度与减少动效规范，使用 Impeccable 对照原图和实际运行实图检查材料主次。客户端和配置均只提交至独立分支。

## 运行边界

验证以离线演示、系统键盘和 Android 模拟器为主。生产登录与注册、通话连线、在线消息投递、外部定位和服务端审核需要对应获授权的环境。已有的原生系统窗口和权限弹窗沿用 Android。拍摄、图片查看、全屏裁剪及个人空间的已定稿按钮保留原有表现。
