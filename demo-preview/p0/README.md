# 朋聊 P0 · 实际操作预览

截图来自实际运行的 React Native Web 页面，尺寸为 824 × 1782。页面使用回环 HTTPS、真实 P0 API 和独立 PostgreSQL 17。使用两个独立浏览器会话及测试账号，照片和短视频来自无私人数据的测试素材。

## 隐私与好友

- [隐私与安全入口内页，手机号查找默认关闭](01-privacy.png)
- [跨午夜的每周安静时间，保存后显示结果](02-quiet-hours.png)
- [动态生成的好友二维码](03-friend-qr.png)
- [第二个测试账号看到带验证消息的好友申请](04-friend-request.png)

## 群聊与消息

- [第二个测试账号收到群邀请，确认前可见群名、人数及邀请发起人](05-group-invite.png)
- [接受邀请后实际收到第一位测试账号的安静消息](06-group-received.png)
- [第二位账号实际收到由第一位账号上传的两张群图片](12-group-photos.png)
- [私聊输入区的多图预览与安静送达。环信未连通时保留预览，发送按钮暂停。](07-quick-photos.png)

## 私密动态

- [发布前指定好友并确认可见范围](08-moment-audience.png)
- [授权好友在第二个会话中看到图文动态](09-moment-received.png)
- [发布者改为仅自己可见后，接收方刷新，动态消失](10-moment-revoked.png)
- [实际上传的短视频在播放器中播放](11-moment-video.png)

[完整 P0 验收说明](../../docs/penlia-p0.md) · [四阶段路线图](../../docs/penlia-roadmap.md)
