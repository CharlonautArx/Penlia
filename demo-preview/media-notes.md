# 朋聊 · 媒体消息和共同小宠物

## 代码位置

| 功能 | 主要文件 | 实现范围 |
| --- | --- | --- |
| 宠物 | `src/features/pet/Orb.tsx`、`src/app/pet/[id].tsx` | 原创圆球、呼吸、眨眼、六种表情、轻触和投喂反馈。尊重减少动态效果，切到后台时暂停动画。沿用原有命名、能量和投喂规则。 |
| 头像 | `src/features/media/AvatarEditor.tsx`、`src/features/media/picker.ts`、`src/services/session.tsx` | 注册和资料编辑共用系统图库、圆形预览、缩放和裁剪。头像按账号存储在设备上，立即刷新本机已登录用户的头像。正式跨设备使用需要头像服务。 |
| 图片 | `src/features/media/protocol.ts`、`src/features/media/messages.ts`、`src/app/chat/[id].tsx` | 图片缩至最长边 1800 像素，输出 JPEG 最高 2 MB。正式客户端调用环信单聊图片 API，显示上传进度，并支持 SDK 明确报错后的重试。不确定是否已发送时提示先查看会话。 |
| 位置 | `src/features/media/LocationCard.tsx`、`src/features/media/protocol.ts` | 获取一次前台定位，由用户补充地点名或地址并确认。正式客户端发送环信单聊位置消息，查看卡片时可主动交给地图应用。 |
| 通话 | `src/features/calls/model.ts`、`src/demo/calls.tsx` | 定义信令、RTC 适配接口及会话状态。演示版可模拟来电、接听、拒绝、挂断与重连，检查系统权限并预览本机相机。正式版显示服务未启用。 |

## 正式媒体消息

环信 React Native SDK 5.0.0 提供 `createImageMessage`、`createLocationMessage`、`resendMessage`、`downloadAttachment` 和按类型拉取历史。图片接收和历史恢复依赖 SDK 授权下载及应用沙箱缓存。客户端只接受目录校验通过的本机文件，远端附件须通过 HTTPS 环信域名校验，图片组件读取本地文件。正式联调应核对现有应用实际返回的附件域名、接收下载 Token、历史保留期、过期后的表现和套餐流量。需要新增 CDN 域名时，逐个核实域名归属并调整允许列表。[环信多类型消息与 SDK 接口](https://doc.easemob.com/document/react-native/message_send_receive.html)

位置消息附带 WGS84 经纬度及用户确认的地点信息。当前方案使用系统定位及地图应用交接，无内嵌地图或反查地址的付费 API。面向中国大陆正式发布时，需验证系统地图交接、坐标系转换及不同厂商的定位行为。如果以后接入高德地图或 POI 查询，按官方 URI 坐标参数选择 WGS84，并确认商业应用的授权、月配额和服务费用。[高德地图 URI API](https://lbs.amap.com/api/uri-api/gettingstarted) [高德开放平台服务许可](https://lbs.amap.com/upgrade)

## 头像上传接入方案

建议使用现有 `Penlia-api` 签发短期上传授权，将头像存入上海 OSS 私有桶。客户端不保存访问密钥。API 校验会话和目标归属，只签发当前账号的随机对象键和一次上传许可，限制体积、格式及频率。上传完成后，由服务端核验文件、去除元数据、提供固定尺寸衍生图，再原子切换当前头像。旧对象延迟回收。个人资料和好友接口返回头像版本，已授权客户端通过短期可缓存的读取地址获取图片。

建议采用独立增量表 `user_avatar`，包含 `user_id` 主外键、`object_key`、`version` 和 `updated_at`。原账号、好友和环信标识均可沿用。无头像记录的账号继续用默认头像。迁移使用单独事务和现有迁移账本，最小化授予业务账号访问权限。删除账号、替换头像和清理废弃临时对象需要对应策略。本轮没有执行迁移，也未开通 OSS。

费用主要由存储、公网下载及请求组成。阿里云标准本地冗余公开示例为每 GB 月 ¥0.12，上海帮助文档中的公网忙时单价示例为每 GB ¥0.50。按平均每张头像 100 KB 估算，1,000 张约 0.1 GB，存储约 ¥0.012/月。10 GB 公网下载按 ¥0.50 估算约 ¥5，另计请求费、图片处理费及实际计价。开通前以控制台上海地域报价确认。[OSS 计费组成](https://help.aliyun.com/zh/oss/billing/) [上海地域示例](https://help.aliyun.com/zh/sls/import-data-from-oss-to-log-service)

## 语音与视频正式接入方案

现有 `react-native-chat-sdk` 提供即时通信，环信 CallKit 需要另接实时音视频服务与本机 RTC SDK。候选是环信 CallKit 加声网 RTC，沿用已有 IM 信令渠道与用户映射。也可选独立的声网 React Native RTC SDK，使用朋聊现有认证和服务端信令，以保留现有通话页面。两条路线都需要先验证 Expo SDK 58、React Native 0.88.1、新架构和原生混淆后的端到端通话。安装原生 RTC 依赖后必须重新原生构建。[环信 React Native 演示说明](https://doc.easemob.com/document/react-native/demo.html) [环信 CallKit Android 集成及开通要求](https://doc.easemob.com/callkit/android/product_activation.html)

信令建议由现有 FC 校验会话、已通过好友关系、屏蔽状态和邀请限额。服务端为每次呼叫分配随机通话 ID 及有过期时间的一次邀请，用幂等状态迁移处理接听、拒绝、挂断和过期，再为两位会话成员签发绑定房间和身份的短期 RTC Token。拒绝第三方入房。真正网络恢复以 RTC SDK 实际事件驱动。正式后台来电另接 FCM/Android 厂商推送或 APNs/CallKit，核实 Android 全屏通知资格、前台服务和 iOS 后台要求，记录失败原因时避免采集通话内容。初期可以先联调双端前台，然后做后台唤醒、蓝牙切换、退到后台挂断、重连与短期 Token 续期。

按参与者分钟作预算，双人通话 1,000 个实际分钟约等于 2,000 个参与者分钟。以公开旧标准音频 ¥7/千分钟与高清视频 ¥28/千分钟作量级参考，分别约 ¥14 与 ¥56。新项目采用标准时长折算，实际费用还取决于套餐、分辨率、超量费及增值服务。开通前须确认项目真实费率与可设置的用量上限。评估阶段按不含免费额度计算。[声网新版计费规则](https://doc.shengwang.cn/doc/rtc/android/billing/billing-strategy) [声网旧版参考单价](https://doc.shengwang.cn/doc/rtc/rn/billing/old/billing-strategy-old)

## 获得授权后的阿里云验证顺序

1. 沿用现有 `Penlia-api`、已执行的 PostgreSQL 迁移、环信应用和 HTTPS 正式 API 地址。验证 FC 健康检查、数据库、环信 Token 登录及两位有效好友。核对附件域名及历史保留期。
2. 用正式模式的原生包在两部手机上双向发送文字、图片和位置。重启，清除适用的附件缓存后验证历史加载。涵盖权限拒绝、断网重试、重复发送和非好友限制。
3. 若批准头像 OSS，先在隔离环境部署签名与确认接口并测试迁移、授权、错误回滚、旧头像回收。验证好友看到头像变化，以及账号在新手机恢复头像。
4. 若批准 RTC 方案及费用，再完善服务端签发、信令与推送。先验证前台语音和视频，再完成原生权限、后台来电及网络切换验收。
