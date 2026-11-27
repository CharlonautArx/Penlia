# Penlia 0.1.11 官方内置表情验收

本轮基于 `6f26d50`，Android 应用源码与构建提交为 `f78d89295d78762259b2862ee5bdc799a14d1ab6`。素材来自 `Assets/penlia-emoji` 分支的 `1795779161342.jpg`，原图提交为 `0395dfbefcdd54a642366ab9e5c543ecce4ee234`。从 Git 读取该文件，没有将素材分支或原始 JPG 并入开发分支。

## 素材与数据

- 原图共有 84 枚表情。67 枚小黄脸及同系列脸部表情排在前面，17 枚动物、手势及物品排在后面。每组保留原图的逐行相对顺序，外观相似的表情均独立保留。
- `scripts/extract-official-stickers.py` 将素材裁成 112 × 112 的 RGBA PNG。透明处理保留眼睛、牙齿等白色区域以及半透明边缘。重复提取与提交资源逐字节一致。84 枚 PNG 共 1,044,380 字节。
- 表情用 `penlia-classic` 与原图位置标识组成稳定 ID。面板顺序变动时，历史记录仍由原 ID 查找安装包资源。聊天与评论继续使用各自已有的消息记录和本地存储。发送时传 ID，普通文字与输入法 Emoji 保留原字符。未知的内置资源可回退显示为 `[表情]`。
- 单聊、群聊和动态评论共用表情面板。会话摘要、聊天记录检索、引用、收藏和转发沿用原入口。离线预览实际写入本机数据。本轮没有连接线上环信或部署后端。

## 检查

- TypeScript 与 54 项自动化测试通过，`git diff --check` 与仓库凭证扫描通过。项目没有单独的 lint 脚本。
- Chromium 手机尺寸预览覆盖面板首尾、单独发送、多枚表情与普通文字及输入法 Emoji 混排、重开后的持久化、单聊与群聊、动态评论、搜索、收藏、引用、多选转发、撤回和深色显示。
- 320 px 和 390 px 宽度分别显示七列和八列，行高为 44 px。放大触控区域或压缩显示图的变化不会影响资源画布或稳定 ID。

## Android 实际运行与交付

- 以 Android 15 x86_64 模拟器（540 × 1200、240 dpi）安装 `f78d892` 的 Release 包。冷启动、面板紧凑行距与滚动到末尾、单发、文字与多枚表情混排、强制停止后重开、评论重进及系统深色模式均通过。第 1–4 页为实际 Android 截图，第 5–8 页为手机尺寸的 Web 截图，第 9 页是资源合成检查。
- ARM64 Release 构建提交为 `2fb1b9aee857cdbdfede986b62e19a6a737b30c8`。它与模拟器构建的应用代码和依赖完全一致，仅将 ARM64 CI 改为使用预装 Java 17，解决 Gradle Plugin Portal 无法解析的下载插件问题。ARM64 上进行了完整的 Expo prebuild、Gradle Release 和 R8 构建。
- APK 通过签名验证、16 KB ZIP 对齐和制品凭证扫描。下载回来的文件与 CI SHA-256 相符，包内只有 `arm64-v8a` 原生库，84 枚 PNG 的可见像素与透明度均与提交资源一致，签名证书与上一版预览相同。实体 ARM64 手机、线上双端收发和长时间内存压测尚未验证。

[直接下载 ARM64 APK](https://github.com/CharlonautArx/Penlia/raw/78f8799a6b1ba85f9b40c46446d921696a4431dd/Penlia-0.1.11-arm64-v8a.apk) · [SHA-256](SHA256SUMS.txt) · [ARM64 构建](https://github.com/CharlonautArx/Penlia/actions/runs/45999763845) · [Android 模拟器与录屏](https://github.com/CharlonautArx/Penlia/actions/runs/45998981394)

[表情面板截图](android-panel.png) · [完整截图 PDF](screens.pdf) · [实际 Android 检查](android-checks.txt) · [Web 检查](web-checks.txt) · [APK 核查](arm64-package-checks.txt) · [修改文件](changed-files.tsv)
