# 界面覆盖清单

原版有 58 个可渲染路由文件和 6 个布局文件。下表按原路由登记，以现有共享组件、定制界面及运行验证区分覆盖。体验入口是本轮新增的内部入口，关联已有演示对象，仍经原有访问检查。动态路由的参数分支共享相同材质组件。

| 区域 | 原版路由 | 本轮材料覆盖 |
| --- | --- | --- |
| 一级页 | `(tabs)/index`、`friends`、`play`、`moments`、`me` | 五页均用浮动导航，原有标签、提醒、手势与导航路径保留。会话用原行样式；搜索沿用认可稿的粉青边缘与透明主体，动态发布操作与共用面板采用同一材质。 |
| 单聊、群聊与搜索 | `chat/[id]`、`group/[id]`、`chat-search/[id]`、`chat-settings/[id]`、`group-settings/[id]`、`groups` | 共用导航、发送、搜索、分段、管理操作和浮层升级。保留壁纸、聊天气泡、原生表情、位置与附件格式。 |
| 通话、背景与媒体 | `peer-call`、`chat-background`，以及相机、定位、附件、全屏预览与裁剪 | 通话与预览控制增加局部光学边缘。黑色视频区域、摄像头画面、照片与裁剪坐标保留。应用内媒体入口和权限说明沿用共用浮层；系统选择器、相机和权限框沿用 Android。 |
| 好友和邀请 | `person/[id]`、`friend-requests/index`、`friend-requests/[id]`、`friend-invite`、`my-qr` | 共用导航、按钮、分段、标签和底部浮层；保留申请排序、验证、二维码和非好友权限。 |
| 动态与空间 | `life/timeline/[id]`、`life/moment/[id]`、`life/moment-share/[id]`、`life/moment-notifications`、`space/[id]`、`space/album/[id]`、`space/compose`、`space/post/[id]`、`space/privacy`、`private-moment` | 共用导航、发布、操作菜单和选择器；图片与文字仍为阅读面。沉浸封面、无底板的个人空间图标和发布媒体网格保留。 |
| 玩乐与邀约 | `playground/with-friends`、`playground/place/[id]`、`playground/game/[id]`、`social`、`gathering/[id]` | 既有去处、玩法和邀约数据继续工作。真实资产、日期选择、邀约状态独立、候选确认和卡片比例留在原有结构；共用控制、顶部操作和浮层升级。 |
| 一起与生活 | `life/index`、`life/calendar`、`life/capsule-drafts`、`life/chat-record/[id]`、`life/items`、`life/memories`、`life/project/[id]`、`life/projects`、`life/reminders`、`life/status`、`collection/[id]`、`contributions`、`journal-entry/[id]` | 共享日程、旅行、地图、清单、时间胶囊、收藏与推荐、共同回忆和共同日记的导航、局部控制和面板统一材质。保留「一起」已有渐变、临时作用域和真模糊，局部加入新弧肩。 |
| 共同世界 | `world/index`、`world/[id]`、`world/own`、`pet/[id]` | 共用控件及世界中已有摆件的浅浮雕。保留动物、动画、摆位、成员逻辑、宠物阶段及背景主题。 |
| 资料与安全 | `profile`、`profile-field/[field]`、`privacy`、`font-size`、`boundary`、`boundary/[id]`、`review/[id]`、`auth` | 共用顶栏、表单控制、开关、分段、底部浮层与字体滑块。保留启动资源。真实注册与登录、生产审核状态、传输与凭证不在离线功能验证内。 |
| 布局 | 根布局、五栏布局及 `life`、`playground`、`space`、`world` 的布局 | 五栏浮动及顶部／底部安全区适配。原版权限守卫不变，内部示例入口限于独立包的本机演示会话。 |

共享组件的加载、错误、禁用、空状态保留既有反馈。列表正文及系统表面仅部分覆盖，按上表保留确认过的布局和外观。上述清单是源码／组件覆盖，不能解读为每条路由的每个业务分支都在原生设备实际点过。联网接口、管理员路径、系统授权互动和罕见错误需要对应的测试条件。
