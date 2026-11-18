# 朋聊 Penlia

朋聊是用 React Native、Expo SDK 58、TypeScript 和 Expo Router 开发的 Android 与 iOS 应用。首次打开可用账号和密码注册或登录。

| 页面 | 功能 |
| --- | --- |
| 聊天 | 查看本机最近会话和未读标记。进入好友会话后收发文字，并分页加载环信历史消息 |
| 好友 | 通过完整账号查找用户、发送和处理好友申请、打开单聊 |
| 动态 | 发布动态、点赞和评论。按账号保存在当前设备 |
| 玩乐 | 随机抽取话题卡、和电脑玩石头剪刀布 |
| 我的 | 编辑服务端昵称与签名、退出登录 |

## 开发和服务配置

`src/app` 管理页面路由，`src/services` 连接业务 API 和环信原生 SDK。`server` 是阿里云 FC HTTP API，`server/migrations` 存放 PostgreSQL 迁移。

```sh
npm ci
cp .env.example .env.local
npm run android
# 在配有 Xcode 的 Mac 上构建 iOS
npm run ios
# 再次启动 Metro 时使用开发客户端
npx expo start --dev-client
```

填写 `.env.local` 中的 HTTPS API 地址和环信 App Key。使用 EAS 时，在对应构建环境中配置同名变量。这两个值会打进客户端 bundle。服务端部署、内网连接和凭证配置见 [FC 后端说明](server/README.md)。

Expo SDK 58 对应 React Native 0.88 和 React 19.3。仓库将环信原生 SDK 锁定在 `react-native-chat-sdk@5.0.0`。环信发布记录将该版本标为开发版，其集成示例使用 React Native 0.83.10 新架构。使用包含原生模块的开发构建或独立安装包。仅更新 Metro bundle 无法加入环信原生模块，Expo Go 无法运行这部分功能。[Expo SDK 版本](https://docs.expo.dev/versions/latest/) · [Expo 开发构建](https://docs.expo.dev/develop/development-builds/introduction/) · [环信原生集成](https://doc.easemob.com/document/react-native/integration.html) · [环信版本记录](https://doc.easemob.com/document/react-native/releasenote.html)

## 用手机或平板生成独立 Android APK

1. 审核并合并 Pull Request 后，使用浏览器进入 GitHub 仓库的 **Code → Codespaces → Create codespace on main**。平板横屏更方便。Codespaces 的可用性和用量取决于 GitHub 帐号，也可以用任何有 Node.js 和 npm 的终端替代。 [GitHub Codespaces 快速入门](https://docs.github.com/en/codespaces/getting-started/quickstart)
2. 在 Codespaces 的终端执行下列命令。使用自己的 Expo 帐号登录。先配置上述构建环境变量。首次配置项目时，Expo 会提示选择帐号并创建或关联 EAS 项目。 [EAS Build 入门](https://docs.expo.dev/build/setup/)

   ```sh
   nvm install 24
   nvm use 24
   npm ci
   npx --yes eas-cli@27.10.0 login
   npx --yes eas-cli@27.10.0 init
   npx --yes eas-cli@27.10.0 build --platform android --profile preview
   ```

3. 首次构建时，如果这个应用标识从未发布过，可以按提示让 EAS 创建并管理 Android 签名密钥。后续版本应复用同一把签名密钥，才能覆盖安装。EAS 关联会将该项目的 ID 写入应用配置。可以把应用配置中新增的项目 ID 提交回仓库，签名密钥和帐号凭据应留在官方流程中。 [Android 签名凭据](https://docs.expo.dev/app-signing/app-credentials/)
4. 构建成功后，用 Android 手机或平板打开 EAS 的构建详情链接，下载并打开 `.apk`。如果系统提示，请允许当前浏览器或文件管理器安装这个 APK。安装后从系统桌面打开「朋聊」，无需 Expo Go。 [安装 APK](https://docs.expo.dev/build-reference/apk/)

`preview` 使用 EAS 内部分发，`android.buildType` 为 `apk`。如需限制谁能打开下载链接，可在 EAS 项目设置中关闭未登录访问，再按需分享。iOS 使用 Apple 签名，实体设备内测可走 EAS 内部分发（登记设备）或 TestFlight，需要相应的 Apple Developer 帐号和权限。 [EAS 内部分发](https://docs.expo.dev/build/internal-distribution/)

## 开发检查

```sh
npm ci
npm run typecheck
npm run doctor
npx expo install --check
npx expo export --platform all
```

最后一条命令会为已配置的 Android 和 iOS 导出生产 bundle。EAS 会从应用配置生成原生工程并进行签名构建。项目中的 `app.penlia.mobile` 是应用使用的 Android 应用标识和 iOS bundle identifier。
