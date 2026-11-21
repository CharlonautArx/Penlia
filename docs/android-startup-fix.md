# Android 离线演示启动修复

## 原因与关键差异

原版 `e99f649` 的 Android `PackageList` 会实例化 `com.chatsdk.ChatSdkPackage`。该类的静态初始化调用 `System.loadLibrary("ext_sdk")`，发生在演示模式的 JS 环信开关之前。ELF 反汇编显示 `libext_sdk.so` 的 `JNI_OnLoad` 调用 `ExtSdkApiJava::initJni`，以 JNI `FindClass` 查找 `com/chatsdk/dispatch/ExtSdkDispatch`。原 ARM64 APK 的全部 DEX 都缺少这个类，R8 的 `usage.txt` 明确列出删除项。原 ProGuard 保留规则覆盖 `com.hyphenate.**`。

ARM64 A 与仅关闭 R8 的 ARM64 B 中，内嵌 JS bundle、Hermes、Worklets 和抽查的环信原生库逐字节相同。B 的 DEX 恢复了这个类。

修复提交 `fc418ea` 在 `react-native.config.js` 中仅为 Android 离线演示关闭环信原生自动链接。正式构建仍能解析环信。测试构建保持 R8 开启。包名 `app.penlia.mobile.preview` 和签名保持一致，演示 APK 的版本号升至 3，用于覆盖更新。应用页面和业务数据代码没有变更。

## Android 运行验收

- [同配置 Release 验收](https://github.com/CharlonautArx/Penlia/actions/runs/44888145465) 在 Android 35 x86_64 模拟器实际安装并清除测试设备的应用数据，首启进入演示、打开全部五栏、共享日程和共同世界，随后继续冷启动并验证已恢复演示会话。
- Logcat 共记录 5 次 `ReactNativeJS: Running "main"`。5 次冷启动耗时分别为 3435、2165、2770、2621、1926 毫秒，期间未发现目标包的致命崩溃或 ANR。
- [首次执行](https://github.com/CharlonautArx/Penlia/actions/runs/44887652928) 同样运行了 MainActivity 和 Hermes。模拟器桌面 `com.android.launcher3` 的 Quickstep ANR 遮挡登录页，测试脚本仅对模拟器中的该桌面进程做了隔离后重跑，APK 的字节未变。
- ARM64 交付包和 x86_64 受测包的 DEX 和 Hermes JS 逐字节相同。ARM64 做了原生 Release 编译、签名、16 KB ZIP 对齐和 GitHub 回下载校验，暂无 ARM64 真机启动日志。
- TypeScript、自动链接演示／正式两种配置以及 20 项单元与迁移静态检查通过。

### 原版运行对照

[原始源码的 R8 A/B 模拟器日志](https://github.com/CharlonautArx/Penlia/actions/runs/44890610899) 使用预编译的同源 x86_64 Release A 和 B。A 开启 R8，启动后出现目标应用原生崩溃。Logcat 记录：

```text
Pending exception java.lang.ClassNotFoundException: com.chatsdk.dispatch.ExtSdkDispatch
JNI DETECTED ERROR IN APPLICATION: java_class == null
Fatal signal 6 (SIGABRT)
base.apk!libext_sdk.so (JNI_OnLoad+82)
```

B 仅关闭 R8，完成 5 次冷启动、打开五栏、共享日程和共同世界。修复包重新保持 R8 开启，同样完成 5 次冷启动。

## 安装

[Android 7.0+ ARM64 安装包](https://github.com/CharlonautArx/Penlia/blob/penlia-project-life-startup-fix-v3-apk/demo-preview/penlia-startup-fixed-arm64.apk) 为 40,336,259 字节。登录私有 GitHub 仓库，在文件页点击 **Download raw file**。直接覆盖安装到已有的「朋聊演示」，打开后点「直接进入演示」。原签名匹配。

APK 的 SHA-256 为 `c2fe617689e2d8b98d984f5efb70dbdaa38fb995026ad84b4ba636a17b98e39a`。
