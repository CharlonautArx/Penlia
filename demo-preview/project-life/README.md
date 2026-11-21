# PROJECT LIFE 运行截图

每张图均来自当前分支的 React Native Web 实际页面。正式路径连接本机隔离 API 和 PostgreSQL 17，使用虚构测试账号和仓库已有照片。聊天演示与手机号滑块使用独立演示构建。截图保留单页手机比例，可单独打开。

| 页面 | 截图 | 环境 |
| --- | --- | --- |
| 消息首页 | [查看](01-inbox.jpg) | 360 CSS px，独立演示 |
| 一对一聊天 | [查看](02-direct.jpg) | 360 CSS px，独立演示 |
| 群聊 | [查看](03-group.jpg) | 390 CSS px，真实本地群聊 |
| 生活动态 | [查看](04-feed.jpg) | 390 CSS px，正式路径 |
| 好友资料 | [查看](05-profile.jpg) | 390 CSS px，正式路径 |
| 好友 | [查看](06-friends.jpg) | 390 CSS px，正式路径 |
| 共同日记 | [查看](07-journal.jpg) · [条目详情](15-journal-entry.jpg) | 390 CSS px，正式路径 |
| 共享日程 | [查看](08-calendar.jpg) | 390 CSS px，正式路径 |
| 共同世界 | [浅色](09-world.jpg) · [深色](12-dark.jpg) | 浅色 390、深色 430 CSS px，正式路径 |
| 登录和注册 | [登录](10-sign-in.jpg) · [注册](11-register.jpg) | 390 CSS px，正式路径 |
| 动态影像 | [全屏查看](13-photo-viewer.jpg) · [发布](14-compose.jpg) | 390 CSS px，正式路径 |
| 隐私与安全 | [查看](16-privacy.jpg) | 390 CSS px，正式路径 |
| 手机号滑块 | [查看](17-slider.jpg) | 360 CSS px，独立演示 |
| 玩乐和我的 | [一起生活](18-play-life.jpg) · [我的](19-my.jpg) | 390 与 430 CSS px，正式路径 |
| 圆形头像裁剪 | [查看](20-avatar.jpg) | 430 CSS px，正式路径 |

## 改造前后

以下改造前的图来自仓库已有验收记录，样例数据或视口可能不同，可对照布局和信息层次。

| 场景 | 改造前 | 改造后 |
| --- | --- | --- |
| 会话和聊天 | [消息首页](../iteration/01-chats.png) · [一对一聊天](../refinements/06-chat.png) | [消息首页](01-inbox.jpg) · [一对一聊天](02-direct.jpg) |
| 群聊 | [原群聊](../p0/06-group-received.png) | [改造后](03-group.jpg) |
| 生活日程 | [原共享日程](../p2/02-calendar.png) | [改造后](08-calendar.jpg) |
| 共同世界 | [原共同世界](../p3/03-world.png) | [改造后](09-world.jpg) |
