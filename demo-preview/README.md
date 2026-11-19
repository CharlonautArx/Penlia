# 朋聊 UI 审查

截图由 Expo 导出的 React Native 网页版在 Chromium 中实际运行后抓取。每张原图为 824 × 1782，无需在拼图里放大。Android 系统安全区、字体和键盘效果留到真机阶段验证。

## 核心页面

- [登录](screenshots/01-login.png)
- [注册](screenshots/08-registration.png)
- [聊天列表](screenshots/02-chats.png)
- [好友通讯录](screenshots/03-friends.png)
- [动态](screenshots/04-moments.png)
- [玩乐首页](screenshots/05-play.png)
- [我的](screenshots/06-profile.png)
- [聊天详情](screenshots/07-conversation.png)

## 玩乐详情

- [小游戏分类](screenshots/09-games.png)
- [双人同机石头剪刀布](screenshots/10-game.png)
- [反应力挑战](screenshots/13-reflex.png)
- [聚会话题卡](screenshots/14-prompts.png)
- [线下去处与赞助样式](screenshots/11-discovery.png)
- [去处详情](screenshots/12-place.png)

## 界面与功能说明

聊天、通讯录和动态使用紧凑行式布局。粉蓝渐变用于品牌、主操作和少量特色区域。正式账号继续使用朋聊号与密码。用户协议和隐私政策入口目前展示预览说明，正式内容待发布。

小游戏可以在一部手机上完成。聚会提议进入好友聊天草稿，用户可以确认、修改或放弃。动态和去处收藏保存在当前设备。示例头像、动态图片和线下场所图由生成工具制作，示例场所没有团购、评分或预订承诺。正式构建的推荐目录当前为空。

源码使用独立的 `codex/penlia-product-ui` 分支。演示构建使用 `ui-demo` 和独立包名，Metro 在正式构建中排除虚构账号、商家和示例图片。这一轮交付截图和构建验证，Android APK 待设计确认。

## 后续需要单独确认的服务

- **跨设备游戏及共同选址**　需要邀请权限、短时房间、服务端回合状态与断线恢复。新增 API 和数据模型前先确认产品范围。
- **真实推荐及付费合作**　需要拿到数据、图片和跳转授权。导入时核实来源、价格、优惠有效期及合作身份。合作方预订由允许域名和用户确认控制，并在玩乐中保留付费披露。跳转统计、归因和转化涉及个人数据时，另行设计同意、最少采集和保留期限。
