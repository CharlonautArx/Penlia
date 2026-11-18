# Penlia
朋聊penlia app

## 原生应用演示

朋聊（Penlia）是用 React Native、Expo SDK 58、TypeScript 和 Expo Router 开发的 Android 与 iOS 原生应用。界面为简体中文，应用图标为当前演示版占位图。

| 页面 | 可体验的操作 |
| --- | --- |
| 聊天 | 打开会话、查看未读状态、发送本机演示消息 |
| 好友 | 搜索联系人、接受演示好友请求、打开会话 |
| 动态 | 发布本机动态、点赞和评论 |
| 玩乐 | 随机抽取话题卡、和电脑玩石头剪刀布 |
| 我的 | 编辑昵称与签名、恢复初始演示数据 |

联系人和初始内容都是虚构的。消息、好友、动态和个人资料存放在本机，不会发给其他设备。恢复初始数据会清除这部分本机修改。

## 用手机或平板生成独立 Android APK

1. 审核并合并 Pull Request 后，使用浏览器进入 GitHub 仓库的 **Code → Codespaces → Create codespace on main**。平板横屏更方便。Codespaces 的可用性和用量取决于 GitHub 帐号，也可以用任何有 Node.js 和 npm 的终端替代。 [GitHub Codespaces 快速入门](https://docs.github.com/en/codespaces/getting-started/quickstart)
2. 在 Codespaces 的终端执行下列命令。使用自己的 Expo 帐号登录。首次配置项目时，Expo 会提示选择帐号并创建或关联 EAS 项目。 [EAS Build 入门](https://docs.expo.dev/build/setup/)

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

最后一条命令会为已配置的 Android 和 iOS 导出生产 bundle。EAS 会从应用配置生成原生工程并进行签名构建。项目中的 `app.penlia.mobile` 是本次演示使用的 Android 应用标识和 iOS bundle identifier。
