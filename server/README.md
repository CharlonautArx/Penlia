# Penlia-api 部署手册

这份手册针对上海地域现有的 `Penlia-api` Web 函数和 `penlia_dev` 数据库。从第一步开始，确认每一步的结果再继续。手机或平板可用浏览器打开控制台，表单显示不全时切换到桌面网站。

## 1. 确认现有 Web 函数的网络

进入 **阿里云控制台 → 函数计算 → 上海 → 函数 → Penlia-api → 配置 → 网络配置**。先查看现有设置。需要修改时，选择手动配置并使用已有资源。

| 设置 | 值 |
| --- | --- |
| 访问专有网络 VPC | 开启，选 RDS 所在的 VPC 和你已有的交换机 |
| 安全组 | 选现有安全组，出站规则允许访问 RDS 内网地址的 TCP 5432，并保留 FC 所需的 ICMP |
| 允许默认网卡访问公网 | 开启，用于访问环信的 HTTPS REST 地址 |
| 静态公网 IP | 关闭 |

确认交换机的 **IPv4 网段**（形如 `10.x.x.0/24`）。在 **RDS 控制台 → 上海 → 实例 → 数据安全 → 白名单设置**，为已有 FC 交换机添加该网段。使用 RDS 内网域名，白名单中无需添加手机 IP。若环信控制台对 REST 请求配置了固定来源白名单，FC 的默认动态公网出口无法保证固定 IP，此时先核对现有出口和环信限制再继续。[FC 网络配置](https://www.alibabacloud.com/help/zh/functioncompute/configure-network-settings) · [RDS 白名单](https://www.alibabacloud.com/help/zh/functioncompute/how-to-configure-an-ip-address-whitelist-when-i-access-a-database)

## 2. 确认数据库连接方式并执行迁移

1. 支持 TLS 的实例，在 **RDS → 实例 → 数据安全性 → SSL** 中核对证书保护的内网域名，下载适用的 CA 证书。对不支持 TLS 的普通 RDS PostgreSQL Serverless 实例，开发联调可在同一 VPC、限定白名单下使用现有内网地址，并在 FC 显式设置 `PG_TLS=disable`。这一模式下 FC 到 RDS 的数据库流量没有 TLS 加密，仅用于测试数据。手机到 FC 仍使用 HTTPS。[RDS PostgreSQL SSL 支持范围](https://www.alibabacloud.com/help/zh/rds/apsaradb-rds-for-postgresql/configure-ssl-encryption-for-an-apsaradb-rds-for-postgresql-instance)
2. 从 RDS 实例的 **登录数据库** 进入已有 DMS，选 `penlia_dev`，用已有数据库管理员或有建表权限的迁移账号登录。打开 **SQL 窗口**，从 GitHub 下载 [`penlia-dms.sql`](deploy/penlia-dms.sql)，整份作为一个脚本执行。新版脚本使用 SQL 窗口可按分号拆分的普通 PostgreSQL 语句。脚本在同一个会话的 `BEGIN;` 和 `COMMIT;` 之间执行，完成建表、建索引和既有授权后记录版本，可重复执行。若已有 DMS 安全规则拦截 DDL，按同一实例的结构变更审批流程执行该脚本，或在已有可访问内网的环境用管理员身份运行下方命令。
3. 确认脚本成功提交。函数用普通账号 `penlia_app` 在运行时访问数据库。管理员凭证留在管理端，迁移脚本不会在每次函数启动时运行。

修改迁移或运行权限后，从仓库根目录运行 `node server/deploy/dms-migration.mjs > server/deploy/penlia-dms.sql` 更新这份下载文件。

已有内网终端等效做法是在 `server` 目录运行 `npm ci`、`npm run migrate`，再由迁移身份执行 `deploy/runtime-grants.sql`。在受控终端注入 `PGHOST`、`PGPORT`、`PGDATABASE`、`PGUSER`、`PGPASSWORD` 和证书配置。代码默认验证 TLS 证书及域名。本机测试或上述 Serverless 内网联调可显式使用 `PG_TLS=disable`。[RDS SSL 验证方式](https://www.alibabacloud.com/help/en/rds/apsaradb-rds-for-postgresql/connect-to-an-apsaradb-rds-for-postgresql-instance-over-ssl-connections)

### 从旧版 DMS 解析错误恢复

1. 如果旧 SQL 窗口仍开着，在原来的会话中只执行 `ROLLBACK;`，释放旧事务和迁移锁。若提示没有活动事务，继续检查即可。若旧会话已断开，用 `penlia_migrator` 重新登录目标数据库。
2. 在 `penlia_dev` 执行下面的只读查询。结果中的 `database_name` 应为 `penlia_dev`，`migration_user` 应为 `penlia_migrator`。不存在的对象显示为 `NULL`。

   ```sql
   SELECT current_database() AS database_name, current_user AS migration_user,
          to_regclass('public.schema_migrations') AS migration_table,
          to_regclass('public.users') AS users_table,
          to_regclass('public.sessions') AS sessions_table,
          to_regclass('public.friendships') AS friendships_table,
          to_regclass('public.rate_limits') AS rate_limits_table;
   ```

3. 五项都为空、只留下 `schema_migrations`，或已确认其余对象来自同一份 Penlia 初始迁移时，可一次执行完整新版 SQL。已有同结构的表和索引会保留，缺少的对象由脚本补齐。如果出现来源不明的同名业务对象，先核对表结构。若收到解析、授权或锁超时错误，停在当前页面查看第一条报错。
4. 迁移后，在同一个数据库运行以下只读核对。四列都应返回 `true`。

   ```sql
   SELECT current_database() = 'penlia_dev' AS correct_database,
          EXISTS (
            SELECT FROM public.schema_migrations WHERE name = '001_initial.sql'
          ) AS migration_recorded,
          has_database_privilege('penlia_app', 'penlia_dev', 'CONNECT')
            AND has_schema_privilege('penlia_app', 'public', 'USAGE') AS app_can_connect,
          (
            SELECT bool_and(has_table_privilege('penlia_app', table_name, permission))
            FROM (VALUES
              ('public.users', ARRAY['SELECT', 'INSERT', 'UPDATE']),
              ('public.sessions', ARRAY['SELECT', 'INSERT', 'DELETE']),
              ('public.friendships', ARRAY['SELECT', 'INSERT', 'UPDATE']),
              ('public.rate_limits', ARRAY['SELECT', 'INSERT', 'UPDATE'])
            ) AS expected(table_name, permissions)
            CROSS JOIN LATERAL unnest(permissions) AS privileges(permission)
          ) AS app_has_required_permissions;
   ```

## 3. 配置环信现有应用

在环信控制台选择与你现有 App Key 对应的应用。在 **即时通讯 → 基础功能 → 用户** 中确认采用授权注册，并打开 **好友关系检查**。记录应用显示的 REST API 地址、App Key 和 Client ID。首次登录聊天时，FC 为该朋聊账号获取环信用户 Token。业务好友申请获接受后，首次发消息前由 FC 同步双向好友关系。消息漫游和保留期限取决于现有应用的套餐及配置，请在控制台核对；同一部手机重启时也可读取 SDK 的本机消息。[环信 User Token](https://doc.easemob.com/document/server-side/easemob_user_token.html) · [好友检查](https://doc.easemob.com/product/message_single_chat) · [消息漫游](https://doc.easemob.com/document/react-native/message_retrieve.html)

## 4. 更新现有 FC 代码

准备上传 `Penlia-api.zip`。已有 CA 证书时可重新打包带入 CA 文件，尤其是 PEM 链超过 FC 环境变量大小上限时。只使用 RDS 服务端 CA 文件，私钥留在其原有位置。电脑或自己的 Codespace 在本分支执行：

```sh
bash server/deploy/package-fc.sh
# 若需将 RDS 公共 CA 装入包
PENLIA_RDS_CA_FILE=/path/to/ApsaraDB-CA-Chain.pem bash server/deploy/package-fc.sh
```

脚本在 `dist/penlia-fc/` 产生 ZIP 和 SQL。ZIP 根目录含 `package.json`、`index.mjs` 和运行依赖。运行同一个包可使用 Node.js 22 和下列配置：

| 控制台位置 | 参数 |
| --- | --- |
| **Penlia-api → 代码 → 上传 ZIP 包** | 选择 `Penlia-api.zip` 并部署 |
| **配置 → 基础配置** | Web 函数，保留所选 Node.js 22 / Debian 11 层。启动命令 `npm run start`，监听端口 `9000`。若表单分开填，命令填 `npm`，参数依次为 `run`、`start` |
| **配置 → 高级配置** | 函数超时建议 30 秒。若已有日志项目，沿用；也可先在函数控制台查看测试调用日志 |
| **触发器 → 现有 HTTP 触发器** | HTTPS 公网访问，允许 GET、POST、PATCH。移动端注册和登录使用应用层认证，触发器认证选择匿名，之后业务接口使用朋聊会话。使用已有触发地址或已绑定域名 |

Node.js 22 由 FC 环境提供，启动时在 `/code` 执行 `npm run start`，HTTP 服务监听 `0.0.0.0:9000`。若控制台启动报 `npm` 未找到，检查原有 Node.js 22 层及其 `PATH` 配置。[Web 函数运行机制](https://www.alibabacloud.com/help/zh/functioncompute/web-functions) · [HTTP 触发器](https://www.alibabacloud.com/help/zh/functioncompute/configure-an-http-trigger-for-a-function-and-invoke-the-function-by-using-http-requests)

在 **配置 → 高级配置 → 环境变量** 中输入下表。数据库密码和环信 Client Secret 直接填在 FC 控制台，FC 会静态加密环境变量。限制能够读取函数配置的 RAM 身份。不要将密码、Secret 或检查口令复制到聊天、截图、Expo、GitHub 或代码包。[FC 环境变量](https://www.alibabacloud.com/help/zh/functioncompute/environment-variables)

| 环境变量 | 值 |
| --- | --- |
| `PGHOST` / `PGPORT` | RDS 内网域名 / `5432`。使用 TLS 时填写证书保护的域名 |
| `PGDATABASE` / `PGUSER` | `penlia_dev` / `penlia_app` |
| `PGPASSWORD` | 普通数据库账号的密码 |
| `PG_TLS` | 默认留空并验证 TLS。上述 Serverless 内网联调填 `disable`，CA 变量留空 |
| `PGSSLROOTCERT` | ZIP 包内置 CA 时填 `/code/rds-ca.pem` |
| `PG_CA_PEM` | 如用环境变量传递 CA，填完整 PEM 内容，并留空 `PGSSLROOTCERT` |
| `EASEMOB_APP_KEY` | 环信的 App Key |
| `EASEMOB_REST_URL` | 环信控制台显示的 HTTPS REST 源地址，不含组织、应用路径 |
| `EASEMOB_CLIENT_ID` / `EASEMOB_CLIENT_SECRET` | 环信控制台中的服务端凭证 |
| `PENLIA_DIAGNOSTIC_TOKEN` | 使用密码管理器生成至少 32 个随机字符，仅验收时使用 |

## 5. 验证云端

1. 用手机浏览器打开触发器的 **HTTPS 公网地址**加 `/health`。预期 HTTP 200 和 `{"ok":true}`。这一步只检查 HTTP 进程和触发器。
2. 使用 FC 的 HTTP 测试界面（GET、路径 `/ops/readiness`、请求头 `Authorization: Bearer <检查口令>`），或在自己的终端按提示输入口令。终端示例：

   ```sh
   read -rsp "检查口令: " PENLIA_CHECK_TOKEN; echo
   curl -sS -i -H "Authorization: Bearer $PENLIA_CHECK_TOKEN" https://你的函数域名/ops/readiness
   unset PENLIA_CHECK_TOKEN
   ```

3. 预期 HTTP 200，且 `ok`、`database` 和 `easemob` 均为 `true`。数据库检查核对实际连接模式以及所需表和运行账号权限。启用 TLS 时 `databaseTls` 为 `true`，显式关闭 TLS 的 Serverless 联调中为 `false`，数据库检查无法完成时为 `null`。环信检查会重新申请 App Token，以验证公网出口及凭证。HTTP 503 时，查看哪个字段为 `false`，再到函数的 **日志/测试结果** 查看 `Database readiness failed` 或 `Easemob readiness failed`。优先核对白名单、TLS CA、迁移或环信 REST 地址与凭证。后端只记录错误类别和可用的 FC 请求 ID。测试后可移除诊断口令以关闭此接口。
4. 使用 APK 注册两个账号并收发一次，以实际验证用户 Token、好友同步与环信原生连接。检查通过的 App Token 与数据库探测无法覆盖这一整条流程。

## 6. 构建 APK 和双手机验收

使用自己的 Expo 账号。在浏览器中为本分支打开 Codespace，执行 `npm ci`。如果项目尚未关联 Expo，在自己的 Codespace 执行 `npx --yes eas-cli@27.10.0 login` 和 `npx --yes eas-cli@27.10.0 init`，按 Expo 提示授权或选择自己的项目。保留已有 Android 签名密钥，以便覆盖升级此前安装的同包名 APK。

在 **Expo 项目 → Environment variables → preview** 配置两个公开值 `EXPO_PUBLIC_API_URL`（步骤 5 已验证的 HTTPS 源地址）和 `EXPO_PUBLIC_EASEMOB_APP_KEY`。然后执行 `npx --yes eas-cli@27.10.0 build --platform android --profile preview`，使用已有可用额度。也可在已关联仓库的 EAS 项目中从 GitHub 选当前分支和 `preview` 配置手动构建。两部手机从 Expo 构建详情下载同一个 APK。[EAS 安装 APK](https://docs.expo.dev/build-reference/apk/) · [从 GitHub 构建](https://docs.expo.dev/build/building-from-github/)

1. 甲、乙分别注册不同账号。甲在好友页输入乙的完整账号，乙刷新好友页后接受申请。
2. 甲发一条新文字，乙确认即时收到并回复，甲确认收到。再返回会话列表检查未读标记。
3. 两部手机分别结束应用进程或重启，再打开应用。从聊天列表或好友页进入会话，确认登录状态和旧消息恢复。随后再各发一条消息，确认重连可正常收发。
