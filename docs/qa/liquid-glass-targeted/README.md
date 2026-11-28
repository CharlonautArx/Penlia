# 朋聊 Liquid Glass 定向体验

开发基线为 `codex/liquid-glass-depth` 的 `90e8f8a552515bec577c521dae99404e6c6fc714`。其应用代码与上一版 APK 的 `1ce66b7c7f87e5498c77db2f64279a2fff1a23eb` 一致。原版分支为 `codex/penlia-official-stickers`，SHA 为 `002ea5514cdc56f87865bd2d4d38e3af447836fd`。本轮的独立应用标识为 `app.penlia.mobile.liquidglass.targeted`。

| 保留版本 | 备份 | APK SHA-256 |
| --- | --- | --- |
| 原版 | [备份标签](https://github.com/CharlonautArx/Penlia/tree/refs/tags/backup/pre-liquid-glass-pilot-2026-11-27) · [旧 APK](https://github.com/CharlonautArx/Penlia/raw/78f8799a6b1ba85f9b40c46446d921696a4431dd/Penlia-0.1.11-arm64-v8a.apk) | `ddb116666c83267e6f3a54772a6b09d8e0958f7cf069097014efe83b781ceebe` |
| 深度体验版 | [备份标签](https://github.com/CharlonautArx/Penlia/tree/refs/tags/backup/pre-liquid-glass-targeted-2026-11-28) · [旧 APK](https://github.com/CharlonautArx/Penlia/releases/download/penlia-liquid-glass-depth-preview-46125310818-qa-46127111829/Penlia-Liquid-Glass-Depth-arm64.apk) | `130cf6472cc169d1c4502440121735a07bc2fe63d3e9682f45b2eb8f0e148535` |

发送栏和动态评论栏各有同屏滚动背板、浮动前景以及测量所得的底部留白，适配现有键盘 Insets。发布方式浮层采样当前动态页。Android 12 以上使用实时采样，Android 13 以上的胶囊可在局部背景上复用原光学着色器。低版本、系统高对比、低内存或省电条件使用强调边缘的稳定材质。原底栏渲染、着色器、主题和开关均沿用基线。未读红点是独立图层，`#FF6B70` 涵盖会话列表和底栏聊天提醒。

沿用 Figma 现有胶囊和弹窗 315° 方向高光、现有圆角和控件触区。Starter 调用限额限制了在线读取，本轮使用上次已核对并保存在工作区的样式参数。好友动态复用自己的动态封面、阻尼下拉、渐隐和图片材质，封面资源权限及动态内容规则沿用基线。

单聊在线通话在现有代码中没有启用，本轮保留原有生产服务和权限。试点将本机模拟状态事件接入记录模型，持久化前以登录账号隔离，按会话和通话 ID 去重，时长从进入已接通状态计时。接听设备迁移仅保留文案兼容能力。服务端投递、真实双方、多设备抢接未接入，录像中的通话记录会显示「本机模拟」。
