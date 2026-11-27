# Android 试点验收

交付对应客户端提交 [37c33f979](https://github.com/CharlonautArx/Penlia/commit/37c33f979b28e772ff188792c1d687eb7d9fdb98)。独立包名 `app.penlia.mobile.designpilot`，标签「朋聊 · 设计试用」，版本 0.1.11（23）。初次打开即可使用离线演示账号。不需输入私人聊天记录或联系人。试用包和现有正式包可以并存。[直接下载 ARM64 APK](https://github.com/CharlonautArx/Penlia/releases/download/penlia-design-preview-46044871021-46046972479-46046972479-r2/Penlia-design-pilot-arm64.apk) · [GitHub 预发布](https://github.com/CharlonautArx/Penlia/releases/tag/penlia-design-preview-46044871021-46046972479-46046972479-r2)

安装包大小 46,881,642 字节，SHA-256 为 `c96d9128080604101b817c9b349656f526cba5b57d8ae646b72e086be6962642`。工作流分别编译 ARM64 和 x86_64 的 R8 Release，校验 APK 签名、单 ABI、16 KB ZIP 对齐与原有启动图，对 APK 扫描敏感凭证。Android 设置中的最低支持级别为 24，target 为 36。实际测试版本为 11 和 15。[构建与校验](https://github.com/CharlonautArx/Penlia/actions/runs/46044871021) · [制品校验清单](https://github.com/CharlonautArx/Penlia/releases/download/penlia-design-preview-46044871021-46046972479-46046972479-r2/SHA256SUMS.txt)

首个构建工作流中的两个编译作业均成功，设备作业因持续活动的共同世界无法稳定读取视图树而标红。验收脚本在 `44584e0` 补入前台画面交叉核验，重新安装同一份 x86_64 APK（SHA-256 `07d74ae75b001317b4763271fb20dd5351b9312142104a5e06151a01f9482aa6`），两次系统配置均通过。随后从公开下载链接取回 ARM64 文件，核对了上面的字节数和哈希。PDF 已实读，共十页。[ARM64 编译作业](https://github.com/CharlonautArx/Penlia/actions/runs/46044871021/job/140661497784) · [最终设备复测](https://github.com/CharlonautArx/Penlia/actions/runs/46046972479) · [发布工作流](https://github.com/CharlonautArx/Penlia/actions/runs/46048651539)

## 同一场景的五种外观

下列为 Android 15 模拟器原生 PNG。PDF 含 Android 15 浅色与 Android 11 深色、大字两组各五页；原始截图包内有 50 张。五种外观按相同尺寸、时间、账号重置，保留同一头像和照片。五个页面分别打开同一条真实路由。[十页横向对照 PDF](https://github.com/CharlonautArx/Penlia/releases/download/penlia-design-preview-46044871021-46046972479-46046972479-r2/Penlia-design-comparison.pdf) · [50 张无损原图](https://github.com/CharlonautArx/Penlia/releases/download/penlia-design-preview-46044871021-46046972479-46046972479-r2/Penlia-native-screens.zip)

| 页面 | 原版 | A | B | C | D |
| --- | --- | --- | --- | --- | --- |
| 聊天列表 | [原版](https://github.com/CharlonautArx/Penlia/releases/download/penlia-design-preview-46044871021-46046972479-46046972479-r2/native-original-inbox.png) | [A 温润生活主义](https://github.com/CharlonautArx/Penlia/releases/download/penlia-design-preview-46044871021-46046972479-46046972479-r2/native-A-inbox.png) | [B 现代原生极简](https://github.com/CharlonautArx/Penlia/releases/download/penlia-design-preview-46044871021-46046972479-46046972479-r2/native-B-inbox.png) | [C Apple 风格](https://github.com/CharlonautArx/Penlia/releases/download/penlia-design-preview-46044871021-46046972479-46046972479-r2/native-C-inbox.png) | [D Claude 风格](https://github.com/CharlonautArx/Penlia/releases/download/penlia-design-preview-46044871021-46046972479-46046972479-r2/native-D-inbox.png) |
| 小满单聊 | [原版](https://github.com/CharlonautArx/Penlia/releases/download/penlia-design-preview-46044871021-46046972479-46046972479-r2/native-original-chat.png) | [A 温润生活主义](https://github.com/CharlonautArx/Penlia/releases/download/penlia-design-preview-46044871021-46046972479-46046972479-r2/native-A-chat.png) | [B 现代原生极简](https://github.com/CharlonautArx/Penlia/releases/download/penlia-design-preview-46044871021-46046972479-46046972479-r2/native-B-chat.png) | [C Apple 风格](https://github.com/CharlonautArx/Penlia/releases/download/penlia-design-preview-46044871021-46046972479-46046972479-r2/native-C-chat.png) | [D Claude 风格](https://github.com/CharlonautArx/Penlia/releases/download/penlia-design-preview-46044871021-46046972479-46046972479-r2/native-D-chat.png) |
| 好友动态 | [原版](https://github.com/CharlonautArx/Penlia/releases/download/penlia-design-preview-46044871021-46046972479-46046972479-r2/native-original-moments.png) | [A 温润生活主义](https://github.com/CharlonautArx/Penlia/releases/download/penlia-design-preview-46044871021-46046972479-46046972479-r2/native-A-moments.png) | [B 现代原生极简](https://github.com/CharlonautArx/Penlia/releases/download/penlia-design-preview-46044871021-46046972479-46046972479-r2/native-B-moments.png) | [C Apple 风格](https://github.com/CharlonautArx/Penlia/releases/download/penlia-design-preview-46044871021-46046972479-46046972479-r2/native-C-moments.png) | [D Claude 风格](https://github.com/CharlonautArx/Penlia/releases/download/penlia-design-preview-46044871021-46046972479-46046972479-r2/native-D-moments.png) |
| 晚风小院 | [原版](https://github.com/CharlonautArx/Penlia/releases/download/penlia-design-preview-46044871021-46046972479-46046972479-r2/native-original-world.png) | [A 温润生活主义](https://github.com/CharlonautArx/Penlia/releases/download/penlia-design-preview-46044871021-46046972479-46046972479-r2/native-A-world.png) | [B 现代原生极简](https://github.com/CharlonautArx/Penlia/releases/download/penlia-design-preview-46044871021-46046972479-46046972479-r2/native-B-world.png) | [C Apple 风格](https://github.com/CharlonautArx/Penlia/releases/download/penlia-design-preview-46044871021-46046972479-46046972479-r2/native-C-world.png) | [D Claude 风格](https://github.com/CharlonautArx/Penlia/releases/download/penlia-design-preview-46044871021-46046972479-46046972479-r2/native-D-world.png) |
| 约局详情 | [原版](https://github.com/CharlonautArx/Penlia/releases/download/penlia-design-preview-46044871021-46046972479-46046972479-r2/native-original-gathering.png) | [A 温润生活主义](https://github.com/CharlonautArx/Penlia/releases/download/penlia-design-preview-46044871021-46046972479-46046972479-r2/native-A-gathering.png) | [B 现代原生极简](https://github.com/CharlonautArx/Penlia/releases/download/penlia-design-preview-46044871021-46046972479-46046972479-r2/native-B-gathering.png) | [C Apple 风格](https://github.com/CharlonautArx/Penlia/releases/download/penlia-design-preview-46044871021-46046972479-46046972479-r2/native-C-gathering.png) | [D Claude 风格](https://github.com/CharlonautArx/Penlia/releases/download/penlia-design-preview-46044871021-46046972479-46046972479-r2/native-D-gathering.png) |

**原生操作录屏**　[A 温润生活主义](https://github.com/CharlonautArx/Penlia/releases/download/penlia-design-preview-46044871021-46046972479-46046972479-r2/A-interaction.mp4) · [B 现代原生极简](https://github.com/CharlonautArx/Penlia/releases/download/penlia-design-preview-46044871021-46046972479-46046972479-r2/B-interaction.mp4) · [C Apple 风格](https://github.com/CharlonautArx/Penlia/releases/download/penlia-design-preview-46044871021-46046972479-46046972479-r2/C-interaction.mp4) · [D Claude 风格](https://github.com/CharlonautArx/Penlia/releases/download/penlia-design-preview-46044871021-46046972479-46046972479-r2/D-interaction.mp4)

四段视频均为 720 × 1600 的 H.264，A 70.3 秒、B 69.9 秒、C 69.7 秒、D 68.8 秒。逐段检查通过列表、单聊、动态、共同世界、约局详情，包含表情、系统键盘与活动菜单的实际操作。

## 环境与结果

| 项目 | Android 15 · API 35 | Android 11 · API 30 |
| --- | --- | --- |
| 设备 | x86_64 模拟器，720 × 1600，300 dpi，约 384dp 宽 | x86_64 模拟器，540 × 1080，270 dpi，约 320dp 宽 |
| 外观 | 浅色，系统 100% 字号 | 深色，系统 130% 字号 |
| 页面检查 | 25/25 | 25/25 |
| 运行断言 | 40 项通过 | 35 项通过 |
| 冷启动时间 | 978、779、841、762、666 ms | 523、437、445、428、424 ms |
| 原始记录 | [系统输出](https://github.com/CharlonautArx/Penlia/releases/download/penlia-design-preview-46044871021-46046972479-46046972479-r2/Android-15.txt) · [验收作业](https://github.com/CharlonautArx/Penlia/actions/runs/46046972479) | [系统输出](https://github.com/CharlonautArx/Penlia/releases/download/penlia-design-preview-46044871021-46046972479-46046972479-r2/Android-11.txt) · [验收作业](https://github.com/CharlonautArx/Penlia/actions/runs/46046972479) |

- 冷启动时间取自每次清空同一试用包数据后的 Android Activity 启动，随后才选择外观。这五次测量衡量同一包的新数据启动，不代表各方案独立的启动速度。
- 断网并开启系统动画。在浅色设备实际点选 A 至 D，从聊天列表进入小满会话，打开内置表情、调起系统键盘、发送测试消息，回到列表核对摘要，再进会话读取新消息。随后打开动态、共同世界、约局与活动操作；强停重开恢复上次方案。
- 在小屏深色设备分别验证四种输入栏、系统键盘、贴纸面板、系统返回，以及 C 收件页滚动后搜索与清空。视觉对照检查名称、照片及世界标题，持续活动画面用模拟器专用工具读取当前可见控件。检测先尝试可见控件；宠物活动时如系统读不到视图树，则在应用前台两次独立匹配「晚风小院」标题和房间摆件格。匹配后重新截取交付 PNG。详见[参考区域与误判检验](../../../scripts/design-pilot-probe/README.md)。
- TypeScript 通过，55 项本地自动化测试通过。服务端契约、授权和后端代码沿用开发基线。另在 Expo Web 上运行个人资料、好友列表、隐私与安全的同条件回归；精确的像素测量和测试边界见[范围记录](iterations/README.md)。

## 连续滚动实测

Android 15 模拟器在同一动态页面执行六次相同方向与距离的滚动。复位本应用 HWUI 统计后开始，不在样本中录屏或读取辅助功能树。下表时间与帧统计取自每次独立采样。C 本次记录的卡顿占比高于原版，四案均有延迟帧；达到稳定 60 fps 仍需实体设备测量。渲染使用托管机软件 OpenGL，虚拟 GPU 与宿主负载会影响结果；一轮数据不足以推断手机长时间运行的帧率、续航或方案排名。

| 外观 | 耗时 s | 渲染帧 | Android 标记掉帧 | P90 | P95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 原版 | 4.42 | 155 | 83 (53.55%) | 73ms | 77ms |
| A 温润生活主义 | 4.43 | 178 | 83 (46.63%) | 57ms | 61ms |
| B 现代原生极简 | 4.33 | 143 | 65 (45.45%) | 57ms | 61ms |
| C Apple 风格 | 4.47 | 144 | 82 (56.94%) | 69ms | 73ms |
| D Claude 风格 | 4.35 | 173 | 82 (47.40%) | 61ms | 65ms |

## 真机验收

本轮尚无 ARM64 实体手机、实际长时发热和续航数据。可在同一台手机上依次体验原版和 A 至 D，用同一会话试单手搜索、发消息再返回、连滚六次动态照片、触摸世界格位和约局操作。再将系统切深色、大字体，检查输入法收起、手势导航与个人壁纸上的文字。初始比较建议先浏览、后发送；各方案共用本机演示数据，修改会在其余方案可见。
