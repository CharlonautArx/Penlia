# Penlia-api

FC 内置 Node.js 22 运行时，HTTP 触发器将请求转换为事件交给 `index.handler`。`dev.mjs` 使用同一套路由在本地提供 HTTP 服务。PostgreSQL 存储账号、会话、好友申请和限流。环信负责单聊消息传输及历史。接受好友申请后，首次发送前，后端为双方开通环信账号并同步双向好友关系。同步失败时，可再次发送以重试同步。[FC Node.js 处理程序](https://www.alibabacloud.com/help/en/functioncompute/request-handlers) · [环信添加好友](https://doc.easemob.com/document/server-side/user_friend_add.html)

## 迁移 PostgreSQL 17

在能访问 RDS 内网的环境，使用可在目标数据库创建表的迁移身份执行：

```sh
cd server
npm ci
npm run migrate
```

连接环境变量使用 `PGHOST`、`PGPORT`、`PGDATABASE=penlia_dev`、`PGUSER`、`PGPASSWORD`。默认验证服务端 TLS 证书。需要阿里云 RDS CA 时，通过 `PG_CA_PEM` 注入 PEM 文件内容。仅在本机临时数据库测试时可使用 `PG_TLS=disable`。迁移使用事务和 advisory lock，并在 `schema_migrations` 中记录版本。

迁移完成后，由迁移用户或数据库管理员给运行时账号授权。以下 SQL 假设目标 schema 为 `public`。

```sql
GRANT CONNECT ON DATABASE penlia_dev TO penlia_app;
GRANT USAGE ON SCHEMA public TO penlia_app;
GRANT SELECT, INSERT, UPDATE ON public.users TO penlia_app;
GRANT SELECT, INSERT, DELETE ON public.sessions TO penlia_app;
GRANT SELECT, INSERT, UPDATE ON public.friendships TO penlia_app;
GRANT SELECT, INSERT, UPDATE ON public.rate_limits TO penlia_app;
```

数据库管理员可定期清理已过期的登录会话和超过一小时的限流记录。

```sql
DELETE FROM public.sessions WHERE expires_at <= now();
DELETE FROM public.rate_limits WHERE window_start <= now() - interval '1 hour';
```

## 配置已有 FC 和环信应用

1. 将现有 `cn-shanghai` 函数 `Penlia-api` 的代码包根目录指向 `server` 内容。打包前运行 `npm ci --omit=dev`，将运行依赖 `node_modules` 一并打包。设置 Node.js 22、入口 `index.handler`，使用同步 HTTP 触发器并允许 GET、POST、PATCH。移动端通过 HTTPS 访问触发器，接口在应用层验证 Bearer 会话。匿名触发器有公开注册和登录入口，部署时应确认该 URL 的开放范围。
2. 在 FC 上配置已有 VPC、vSwitch 和安全组，使函数可访问 RDS 内网地址与 PostgreSQL 端口。若 RDS 启用了访问白名单，将对应的函数访问来源加入白名单。函数还需通过已有网络路径访问环信 REST 域名的 HTTPS 端口。
3. 在环信控制台启用授权注册和**好友关系检查**。客户端使用与服务端相同的 App Key。历史消息跨设备恢复依赖环信应用的消息漫游能力与保留期限。确认后再做双设备验收。[环信单聊规则](https://doc.easemob.com/product/message_single_chat) · [环信历史消息](https://doc.easemob.com/document/react-native/message_retrieve.html)
4. 在 FC 控制台的「配置 → 高级配置 → 环境变量」中设置以下变量。FC 对环境变量做静态加密，并在函数启动时注入。限制能读取函数配置的 RAM 身份，数据库密码和环信 Client Secret 仅由服务端读取。不要将它们放进聊天、`EXPO_PUBLIC_*`、代码包或 GitHub。[FC 环境变量](https://www.alibabacloud.com/help/en/functioncompute/environment-variables)

| 环境变量 | 内容 |
| --- | --- |
| `PGHOST` / `PGPORT` | RDS 内网地址和端口 |
| `PGDATABASE` / `PGUSER` | `penlia_dev` / `penlia_app` |
| `PGPASSWORD` | 运行时账号密码，通过安全渠道注入 |
| `PG_CA_PEM` | RDS CA PEM 内容，系统信任链足够时可省略 |
| `EASEMOB_APP_KEY` | 环信 App Key |
| `EASEMOB_REST_URL` | 环信控制台显示的 REST HTTPS 源地址，不含组织和应用路径 |
| `EASEMOB_CLIENT_ID` / `EASEMOB_CLIENT_SECRET` | 服务端凭证，通过安全渠道注入 |

默认每个 FC 实例使用最多 4 条数据库连接。建议函数超时设为 30 秒，以便在上游连接超时时返回可重试错误。HTTP `GET /health` 可检查函数入口。注册或登录流程同时检查数据库连接。

## 验收步骤

1. 安装 Android 和 iOS 开发构建，分别注册账号 A 和 B。确认重启后能恢复会话，退出后需要重新登录。
2. A 用完整账号找到 B，发送好友申请。B 打开好友页或点刷新，接受申请。验证 A 刷新后看到 B，双方均可进入会话。
3. A 和 B 分别发送文字，验证对方在前台即时收到。退出会话后查看未读标记，再进入会话并确认未读已清除。断开网络、恢复网络后继续收发。
4. 使用同一账号在另一台设备重新登录，从好友页打开会话，确认已配置的历史漫游可加载。用第三个账号验证未接受好友申请前不能进入单聊。
5. 检查五个页面都能打开。动态在同设备同账号下可恢复，切换账号后各自可见自己的本机动态。
