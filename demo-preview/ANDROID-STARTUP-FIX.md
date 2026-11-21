# 朋聊 Android 启动修复核验

## 故障定位

- 故障包是 `e99f649` 的 ARM64 Release，包名为 `app.penlia.mobile.preview`，版本号 2。APK 的 ARM64 库、Hermes JS、启动 Activity 和 16 KB ZIP 对齐均通过静态检查。
- 原 Android 自动链接生成的 `PackageList.java` 实例化 `com.chatsdk.ChatSdkPackage`。该类的静态初始化会执行 `System.loadLibrary("ext_sdk")`，早于应用内演示模式的 JS 环信开关。
- `libext_sdk.so` 的 `JNI_OnLoad` 调用 `ExtSdkApiJava::initJni`，通过 JNI `FindClass` 查找 `com/chatsdk/dispatch/ExtSdkDispatch`。基线 APK 的所有 DEX 缺少该类，R8 的 `usage.txt` 明确记录删除了它。原保留规则覆盖 `com.hyphenate.**`，这个类位于 `com.chatsdk.dispatch`。
- 基线 ARM64 A 与仅关闭 R8 的 ARM64 B 中，内嵌 JS bundle、Hermes、Worklets 和抽查的环信原生库逐字节相同。B 的 DEX 恢复了 `ExtSdkDispatch`。

## 代码与构建

`react-native.config.js` 仅在 `EXPO_PUBLIC_PENLIA_UI_DEMO=1` 时禁用环信 Android 自动链接。正式构建的自动链接保持原配置。修复包继续使用 Release、R8、Hermes、Reanimated 和原应用 UI。版本号提升至 3，沿用原包名和签名以覆盖安装。

[模拟器 A/B 对照](https://github.com/CharlonautArx/Penlia/actions/runs/44884856660) · [修复版模拟器验收](https://github.com/CharlonautArx/Penlia/actions/runs/44885014123)

## ARM64 APK

[打开 APK 文件页](penlia-startup-fixed-arm64.apk)，在手机浏览器登录有仓库权限的 GitHub 账号，点 **Download raw file**。安装时保留旧演示版即可，同签名且版本号更高。打开「朋聊演示」，点「直接进入演示」。

Android 7.0+（API 24），ARM64，40,336,259 字节。APK Release 签名和 16 KB 对齐均通过。包内包含离线 JS、资源、Hermes、Worklets 和 Reanimated，未打包环信原生库。尚无 ARM64 真机日志。x86_64 模拟器的实际结果见上面的工作流。

ARM64 APK SHA-256 `c2fe617689e2d8b98d984f5efb70dbdaa38fb995026ad84b4ba636a17b98e39a`。
