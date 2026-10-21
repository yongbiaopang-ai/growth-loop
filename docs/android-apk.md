# 打包成 Android APK（离线版）

## 为什么有这个文档

PWA 走"加主屏"依赖一个 https 地址；而把网页**内置进 APK** 可以做到完全离线：不连 Wi-Fi、不连电脑、不依赖任何服务器。这份文档记录怎么从 `growth-loop/` 的网页源码打出一个 APK，以及在这台机器上必须绕过的四个坑。

**源码唯一真源仍然是 `growth-loop/`**（纯前端、零依赖）。APK 只是一个薄壳（Capacitor + WebView），把静态资源塞进 `assets/`。改网页之后要重新同步、重新打包。

## 环境要求

- JDK 17（本项目用 `gradlew` 8.2.1，要求 JDK 17）
- Android SDK：`platforms;android-34`、`build-tools;34.0.0`、`platform-tools`
- Node 18+（跑 Capacitor CLI）

本机工具链放在工作区的 `.toolchain/`（不在仓库里，也不提交）：

```
.toolchain/jdk17/                       # Microsoft OpenJDK 17.0.13
.toolchain/android-sdk/                 # cmdline-tools + platforms + build-tools
.toolchain/gradle-home/                 # GRADLE_USER_HOME（避免写用户目录）
.toolchain/fakehome/                        # 伪造的 HOME（debug 签名要写 ~/.android）
```

## 一次性准备

```powershell
# 1) 下载 JDK 与 Android 命令行工具（这台机器 curl 用不了 schannel，得用 Python 下载）
#    JDK: https://aka.ms/download-jdk/microsoft-jdk-17.0.13-windows-x64.zip
#    SDK: https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip
# 2) 解压 JDK 到 .toolchain/jdk17，解压 cmdline-tools 到 .toolchain/android-sdk/cmdline-tools/latest
# 3) 接受许可并装组件
sdkmanager.bat --sdk_root=$tc\android-sdk --licenses
sdkmanager.bat --sdk_root=$tc\android-sdk "platform-tools" "platforms;android-34" "build-tools;34.0.0"
```

## 打包工程

打包工程在工作区的 `growth-loop-android/`（**刻意放在仓库外**，不污染零依赖的网页仓库）：

```
growth-loop-android/
  package.json            # Capacitor 6 依赖
  capacitor.config.json   # appId=app.growthloop / appName=成长打卡 / webDir=www
  www/                    # 从 growth-loop/ 拷来的静态资源（含 prompts/）
  android/                # npx cap add android 生成的原生工程
```

`www/` 里的文件是**从 `growth-loop/` 拷过来的副本**，不是源。改完网页要重新拷：

```powershell
Copy-Item growth-loop\index.html,growth-loop\app.js,growth-loop\app.css,growth-loop\seed.js,growth-loop\manifest.webmanifest growth-loop-android\www -Force
Copy-Item growth-loop\design\tokens.css,growth-loop\design\themes.css growth-loop-android\www\design -Force
Copy-Item growth-loop\icons\icon-192.png,growth-loop\icons\icon-512.png growth-loop-android\www\icons -Force
Copy-Item growth-loop\prompts\weekly_report.v2.md growth-loop-android\www\prompts -Force
```

> `prompts/` 别漏：AI 周报是运行时 `fetch("prompts/weekly_report.v2.md")` 读进来的，不拷就用不了。

## 这台机器上必须绕过的四个坑

1. **`curl` 用不了**：沙箱里 schannel 拿不到证书（`SEC_E_NO_CREDENTIALS`）。改用 Python 的 `urllib` 下载。
2. **`.toolchain/gradle-home` 与 HOME**：默认 Gradle/SDK 会写 `%USERPROFILE%\`，沙箱拒绝。所以设 `GRADLE_USER_HOME`，并用 `-Duser.home=` 指向工作区里的假 HOME（debug 签名要写 `~/.android/debug.keystore`）。
   - 注意 `-Duser.home` 必须走**命令行参数**，不能写进 `gradle.properties`：Java 的 properties 按 ISO-8859-1 读，中文用户名会乱码。
3. **Gradle 发行包在 GitHub 上**：`services.gradle.org` 会 302 到 GitHub，而本机解析不了 GitHub。把 `android/gradle/wrapper/gradle-wrapper.properties` 的 `distributionUrl` 改成腾讯镜像：
   `https://mirrors.cloud.tencent.com/gradle/gradle-8.2.1-all.zip`
4. **项目路径含中文**：AGP 默认拒绝构建。本项目只做 WebView 包装、不用 NDK，所以在 `android/gradle.properties` 里加 `android.overridePathCheck=true` 是安全的。另外关掉 `org.gradle.vfs.watch`（受限环境里会报 `Couldn't open current thread`）。

## 构建

```powershell
$ws = "<工作区根目录>"   # 换成你自己的路径：包含 growth-loop/ 的那个目录
$tc = "$ws\.toolchain"
$env:JAVA_HOME="$tc\jdk17"; $env:ANDROID_HOME="$tc\android-sdk"; $env:ANDROID_SDK_ROOT="$tc\android-sdk"
$env:GRADLE_USER_HOME="$tc\gradle-home"
$env:PATH="$tc\jdk17\bin;$tc\android-sdk\platform-tools;$tc\android-sdk\build-tools\34.0.0;$env:PATH"

cd "$ws\growth-loop-android"
node node_modules\@capacitor\cli\bin\capacitor sync android
cd android
.\gradlew.bat "-Duser.home=$tc/fakehome" assembleDebug --no-daemon --console=plain
```

产物：`growth-loop-android\android\app\build\outputs\apk\debug\app-debug.apk`

## 已经做过的定制

- 应用名「成长打卡」、包名 `app.growthloop`、`versionName 1.0.0`
- 启动图标换成应用自己的图标（`mipmap-*` 各密度重生成，并删掉 `mipmap-anydpi-v26` 的自适应图标 XML，让系统用方形图标）
- `www/` 里带上了 `prompts/`，AI 周报在 APK 里可用
- 验证：`apksigner verify` 退出码 0；`aapt2 dump badging` 显示 minSdk 22 / targetSdk 34 / label 成长打卡

## 已知限制

- 现在是 **debug 签名**：个人安装够用，但以后要长期用/升级，建议换成自己的 release keystore（keystore 是凭据，别进仓库）。
- APK 里的数据存在应用自己的 WebView 存储里，**卸载会清空**；换机也不会自动带走。请按周导出 JSON 备份（我的 → 导出备份）。
- AI 周报的**真模型**模式需要联网并在「我的 → AI 周报配置」填接口和 Key；不填就退化为标注 `mode=stub` 的本地桩报告。
- APK 不含 Service Worker 离线缓存的意义（资源已全在包里），但仍会尝试注册 `sw.js` 失败并被忽略——无影响。
