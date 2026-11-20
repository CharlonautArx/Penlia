# P0 验收与接入说明

阶段基线为 `905ca84`，开发分支为 `codex/penlia-p0-privacy`。本阶段只修改基础通信与隐私边界。四阶段依赖和 P1 至 P3 的验收计划见 [开发路线图](penlia-roadmap.md)。

## 功能状态

| 编号 | 已运行的实现 | 交付仍需验证或配置 |
| --- | --- | --- |
| 1 | 朋聊号及二维码查找、验证消息、双方确认、拒绝、删除、拉黑和防骚扰限额。群创建、受邀者确认、权限校验、文字和多图群聊。邀请二维码绑定受邀账号，有效期 48 小时。 | 环信发送前回调需要实际启用，随后验收原有私聊。二维码相机需真机验收。好友申请显示已有可用头像或默认字母头像，上传头像的跨设备同步仍待存储方案。 |
| 2 | 精确手机号查找使用已有验证身份 HMAC。默认关闭，未开启、不存在和已阻挡返回一致数据结构。请求受账号和连接来源限额约束。 | 已验证手机号真实注册和换绑仍依赖验证码、短信适配器与已批准的环境配置。 |
| 3 | 「我的」首屏的隐私入口，含社交限制、黑名单、受限联系人、关系组、内容默认范围、登录设备、撤销登录、修改密码和数据申请。支持自助导出限量资料。 | 完整数据导出和注销需要身份复核与受控的运营处理。撤销 Penlia 会话即时生效，厂商 IM 已发 Token 的即时下线需真机验证。 |
| 4 | 支持按日安静时间、跨午夜、时区、临时静默和重要联系人。状态只向被授权的好友显示「正在休息」。服务端计算收件人的策略并用于环信文本回调。 | 手机厂商实际离线提醒及锁屏、非文本消息、极长回调负载和跨设备推送还需联调。群聊目前打开页面后按间隔同步，后台推送待接入。 |
| 5 | 服务端动态支持纯文字、纯照片、图文、多个照片、标准 MP4、五种权限、关系组、编辑范围及删除。附件请求按当前权限重新鉴权。 | 完整多人共创按授权安排留到 P1。短视频已在浏览器播放，原生全屏和弱网需真机覆盖。 |
| 6 | 环信消息携带 `em_ignore_notification` 及朋聊小月亮属性。群聊在数据库持久化安静送达，双方可见。静默属性与消息内容和顺序保持独立。 | 环信与厂商后台通知的行为须配置并实测。 |
| 7 | 私聊输入区加号旁的图库快捷按钮，最多选择六张，预览、压缩、断线保留及发送失败重试。群聊可发送多张受保护图片。 | 两部 Android 设备间的真实环信图片收发、重试和历史恢复待实际联调。 |
| 8 | 非群成员无法访问群详情、消息或附件。好友列表、内容、资料和邀请 API 只返回可访问的当前账户关系，无共同好友或共同群组查询。 | 真机和环信控制台配置需要联合验收。 |
| 9 | App 保持无输入提示和无输入事件。服务端对环信发送前回调的常规消息类型使用允许列表，拒绝透传输入状态。 | 环信回调覆盖的消息类型清单需在已获授权的环境核对。 |

## 主要变更

- `server/p0/access.mjs`、`groups.mjs`、`moments.mjs` 和 `routes.mjs` 实现权限、群聊、数据生命周期和媒体鉴权。复用现有 `server/api.mjs` 登录与好友端点，扩展 `/v1/privacy`、`/v1/people`、`/v1/friends`、`/v1/groups`、`/v1/group-invites`、`/v1/relationship-groups`、`/v1/moments` 和 `/v1/moment-media`。环信服务端入口为 `POST /callbacks/easemob/<path-key>`。
- `server/migrations/003_privacy_p0.sql` 新增设置、限制名单、关系组、设备和数据申请、群消息、动态及受保护附件。独立的 [DMS 增量脚本](../server/deploy/penlia-p0-dms.sql) 可重复执行。现有 `001_initial.sql` 与历史 DMS 文件保持原内容。
- `src/app/privacy.tsx`、`groups.tsx`、`group/[id].tsx`、`private-moment.tsx` 及 `src/features/privacy`、`src/features/moments` 接通真实 API。私聊继续使用环信 SDK。小宠物、语音与视频入口继续沿用基线。
- `src/palette.json` 和 `plugins/with-penlia-colors.js` 为 Android 和 iOS 增加跟随系统的主题颜色。浏览器预览保持浅色。
- P0 小规模媒体采用已经存在的 PostgreSQL，附件单文件上限 4 MB、每账号总容量 32 MB。视频核验 MP4 结构和 30 秒上限。发布前无需引入付费云资源。媒体按用户私有授权提供，URL 需要登录，每次请求复核权限。访问被撤销后将阻止新的读取，接收者此前已保存的副本由设备控制。大规模上线前应评估容量、流量和私有对象存储接入。
- 旧本机动态仍可从「本机空间」打开。用户选择重新发布才会同步到服务器。完整共创依赖活动与共同日志阶段的作者授权设计。

## 阿里云与环信接入顺序

1. 使用隔离的测试应用和有备份的测试数据库，确认初始迁移存在。经批准后，运行独立 DMS 增量脚本，业务账号使用脚本内的独立授权。已有数据库初始迁移不需要重跑。
2. 本机执行 `server/deploy/package-fc.sh` 生成 FC Web ZIP 和两个 DMS 文件。用现有 `Penlia-api` 的 Web 运行时和 HTTPS 地址验收。应用构建仍需要 `EXPO_PUBLIC_API_URL` 与公开客户端 `EXPO_PUBLIC_EASEMOB_APP_KEY`。
3. 在环信设置好友关系检查和单聊的发送前回调，涵盖 App 支持的所有消息类型，默认失败策略设为拒绝。回调必须使用 HTTPS。把供应商签发的回调 Secret 和随机高熵路径密钥分别放在 FC 的 `PENLIA_IM_CALLBACK_SECRET` 与 `PENLIA_IM_CALLBACK_PATH_KEY`。路径密钥同样应避免写入日志。在隔离测试应用确认回调默认拒绝后，在测试 FC 设置 `PENLIA_IM_PRIVACY_READY=1`，使用测试账号验证接受、拒绝、删除、拉黑和回调超时。生产启用需要审批及这套验收结果。 [环信发送前回调](https://doc.easemob.com/document/server-side/callback_presending.html) [环信好友关系检查](https://doc.easemob.com/document/react-native/user_relationship.html)
4. 确认账号有离线推送权限，安装实际 Android/iOS 通道凭证，检查 OS 权限、后台、跨时区和安静送达。文字回调仅在供应商负载大小允许时改写，媒体回调改写需供应商确认后显式启用 `PENLIA_IM_REWRITE_MEDIA=1`。未完成全链路验收时，勿在发布说明中承诺厂商系统通知静默。 [环信静默推送扩展](https://doc.easemob.com/document/react-native/push/push_extension.html) [环信免打扰配置](https://doc.easemob.com/document/react-native/push/push_notification_mode_dnd.html)
5. 若需要手机号查找，对应手机号必须经身份验证并写入 002 的身份表。`PENLIA_PHONE_LOOKUP_SECRET` 与手机号验证服务使用完全一致的 HMAC 密钥及编码，保持在 FC。真实短信、滑块及其费用控制继续沿用上一轮方案。
6. 保持原有数据库 TLS 和安全组配置。生产环境的静默、会话设备撤销、短信和附件权限须用测试账号在两部手机复核。完整注销和完整数据交付上线前要确定人工核验、保留与审计流程。

本阶段未购买新服务、部署 FC 或执行阿里云数据库迁移。

## 本地验收

- TypeScript、Expo SDK 依赖版本检查、Android ARM64 Release 构建及 APK 签名校验。
- P0 的八个测试通过。使用临时 PostgreSQL 17、现有 `penlia_app` 最小权限及真实 HTTP。覆盖两次执行增量、好友双向确认、防越权、群邀请和多图同步、时区、静默策略、设备撤销、媒体超时长及撤销访问。环信回调通过本机签名夹具验证。
- 既有消息协议与空间模型共九个测试通过，手机号认证八个回归测试通过，原始 DMS 脚本回归通过。FC ZIP 本机构建通过。校验了生成的 P0 SQL、ZIP 压缩内容和解压启动后的回环 `/health`。
- 实际运行界面完成两个账号的登录、好友和群邀请、文字和多图群聊、私密动态发布、视频播放和撤权。[12 张运行截图](../demo-preview/p0/README.md)

运行集成测试时使用名称为 `penlia_p0_test` 的独立回环 PostgreSQL，准备现有初始迁移、002 手机身份、003 P0 增量和对应业务授权。测试进程使用 `penlia_app` 及随机测试凭证，设置 `PGHOST=127.0.0.1`、`PGPORT` 为单独的 55xxx 端口、`PGDATABASE=penlia_p0_test`。准备不超过 30 秒的测试 MP4，设置 `PENLIA_P0_VIDEO_FIXTURE`，以及临时的 `PENLIA_P0_TEST_ADMIN_PASSWORD`、手机号摘要密钥和环信回调密钥，再运行 `node server/p0/p0.test.mjs`。真实短信、付费 RTC、华为/FCM/APNs 及生产数据均不参与此验收。
