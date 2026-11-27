# Android 体验版验收

[下载 ARM64 APK][apk] · [底栏同条件对照][comparison] · [全部原生截图][screens] · [导航与滚动录屏][optics] · [开关、键盘及浮层录屏][controls]

发布的 APK 对应源码 `f5e005cdb798a65781b0ed2a42d1b8af7d305fcf`，大小 46,576,938 字节。APK 签名、16 KB ZIP 对齐、单 ARM64 ABI、原版启动图和制品凭证扫描均通过。APK 的实际应用名为「朋聊 · Liquid Glass 体验版」，包名为 `app.penlia.mobile.liquidglass`，版本 0.1.11（23），Android 清单中关闭了备份。原版与体验版在两台模拟器上均确认拥有不同 UID 及独立的私有数据目录。[原生 R8 构建][build] · [下载校验值][checksums]

```text
00b68c9638530fad3ed17d39e54ebff1547641b52e8fc659d1b2b18e052506fd
```

| 项目 | Android 15 | Android 11 |
| --- | --- | --- |
| 环境 | x86_64 模拟器，540 × 1200、240 dpi，浅色、字号 100% | x86_64 模拟器，540 × 1200、240 dpi，深色、字号 130% |
| 背景材质路径 | 实时采样，AGSL 启用 | 实色降级，AGSL 未启用 |
| 并存、五栏、滚动、搜索及键盘 | 通过 | 通过 |
| 开关及控件 | 两次直接点按原生开关并验证选中状态反转，打开官方表情、输入法与活动操作面板 | 同左 |
| 子页面取样 | 单聊、群聊、聊天设置、个人资料、隐私、邀约、一起、边界计划、好友申请、日程、旅行、收藏、二维码、发布动态、共同世界、视频通话模拟、去处、共同日记 | 同左 |
| 六次动态滚动的 HWUI 采样 | 123 帧，61.79% 标记为延迟帧，P95 73 ms | 324 帧，92.28% 标记为延迟帧，P95 38 ms |
| 完整记录 | [Android 15][api35] | [Android 11][api30] |

TypeScript 和 54 项自动化测试通过。模拟器两组各 24 项断言通过。最初的开关脚本命中了设置行文字，修正后对同一 x86_64 APK（SHA-256 `e19a22a1e3f89f87a6d87b651ee8f5197938cf1dec5a78b5000ecb60a8666b3c`）重新验证。个别子页取样测试核验打开路径与截图，功能动作以脚本报告列出的实际操作为准。[最终设备复测][device] · [界面覆盖][coverage]

软件渲染模拟器的滚动样本存在明显延迟帧。实体 ARM64 手机上尚未验证持续帧率、长时间耗电、触感和发热。Android 12 的实时模糊路径有版本守卫，本轮未单独跑 API 31。高对比、设备内存等级和省电设置有回退逻辑，实体设备上的组合效果还需检查。线上 IM、真实通话、生产认证和审核未参与离线验收。

原版分支始终为 `002ea5514cdc56f87865bd2d4d38e3af447836fd`，远端默认分支仍为 `90e654c37a93c0304cbdcfbd2049d2bcea59c3e2`。原版和实验版工作树独立。回滚时保留原版安装，卸载体验版即可。[原版与备份记录](README.md)

[apk]: https://github.com/CharlonautArx/Penlia/releases/download/penlia-liquid-glass-preview-46060098594-qa-46062552307/Penlia-Liquid-Glass-arm64.apk
[comparison]: https://github.com/CharlonautArx/Penlia/releases/download/penlia-liquid-glass-preview-46060098594-qa-46062552307/android-inbox-comparison.png
[screens]: https://github.com/CharlonautArx/Penlia/releases/download/penlia-liquid-glass-preview-46060098594-qa-46062552307/Penlia-native-screens.zip
[optics]: https://github.com/CharlonautArx/Penlia/releases/download/penlia-liquid-glass-preview-46060098594-qa-46062552307/optics-navigation.mp4
[controls]: https://github.com/CharlonautArx/Penlia/releases/download/penlia-liquid-glass-preview-46060098594-qa-46062552307/controls.mp4
[checksums]: https://github.com/CharlonautArx/Penlia/releases/download/penlia-liquid-glass-preview-46060098594-qa-46062552307/SHA256SUMS.txt
[api35]: https://github.com/CharlonautArx/Penlia/releases/download/penlia-liquid-glass-preview-46060098594-qa-46062552307/android-15.txt
[api30]: https://github.com/CharlonautArx/Penlia/releases/download/penlia-liquid-glass-preview-46060098594-qa-46062552307/android-11.txt
[build]: https://github.com/CharlonautArx/Penlia/actions/runs/46060098594
[device]: https://github.com/CharlonautArx/Penlia/actions/runs/46062552307
[coverage]: coverage.md
