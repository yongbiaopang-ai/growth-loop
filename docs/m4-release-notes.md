# M4 发布说明（v1.0 候选）

- 分支：`m4-release`（基于 `main` 的 v0.5）
- 状态：**发布包可交付**；实际推送到公网需要一个动作由用户本人完成（见 [`github-publish-user-steps.md`](github-publish-user-steps.md)）

## 一、相对 v2 需求的范围变更（必须显式记账）

v2 需求（`WorkBuddy_需求提示词_v2.md`）的形态是 **PWA**：手机浏览器打开、加主屏。下面这些是后来在用户明确要求下追加的，不在 v2 原文里：

| 新增 | 为什么加 | 属于谁的决策 | 代价 / 维护面 |
| --- | --- | --- | --- |
| **离线 APK 原生壳**（Capacitor + WebView，资源全部打进包） | 用户明确说"不想被 Wi-Fi 限制，想作为 APK 下载"。PWA 加主屏依赖一个 https 地址与网络 | 用户提出、用户选定路线 | 多一套打包工程（在仓库外 `growth-loop-android/`）：JDK 17 + Android SDK + Gradle；改网页后要重新同步、重打包；apk 本身不进仓库；debug 签名仅适合个人使用 |
| **APK 里的适配**（不再提示"加主屏"、我的页标"独立离线版"） | 装成 App 后再提示加主屏是错的 | 实现必然 | 一处 `isNativePlatform()` 分支，已进冒烟测试 |
| **本周重点做成可点开的搜索链接** | 用户要求"本周重点列举出来的内容都可以做成超链接" | 用户提出、用户选定"搜索词条"方案 | 极小：一个 `SEARCH_URL` 配置 + 渲染改动；搜索地址可在 `seed.js` 里换 |
| **到点提醒 + 安装引导**（M4 原计划内） | M4 里程碑本身的内容 | 计划内 | 已在 v0.5 之后完成 |

**PWA 那条路完整保留**：`index.html` + `app.js` 仍是纯前端零依赖，`serve.py` 本地、GitHub Pages 或任何静态托管都能跑；APK 只是其中一种分发方式，删掉 `growth-loop-android/` 不影响 PWA。这一点是刻意保住的——**网页仍是唯一真源，APK 是产物**。

## 二、真机验证的准确口径

- 用户已在自己的 Android 手机上**下载并安装成功，确认"可以使用"**。
- **未逐项确认**的两件事（不能说已验）：加主屏/APK 打开后是否全屏无地址栏、深色模式是否跟随系统。
- 因此发布说明里只能写"用户确认可安装、可用；全屏与深色跟随系统未逐项确认"，不能写成"真机已验证"。

## 三、发布包清单（做到"可发布"即止）

| 项 | 状态 |
| --- | --- |
| `README.md`（含中文主体 + English 摘要） | ✅ 已有；M4 的新能力与范围变更已写入 |
| `LICENSE`（MIT） | ✅ 已有 |
| `docs/`：ADR、M3 评测报告、M4 holdout 报告、APK 打包说明 | ✅ 齐全 |
| `docs/binary-artifacts.txt` 二进制清单（人工看图） | ✅ 5 张（3 张 UI 截图 + 2 张图标）；`smoke_test.js` 校验清单与磁盘一致；本轮已按固定集合重出 |
| 发布前检查清单（`README.md` 内） | ✅ 已含"main 上跑完整 check_all""人工看图""真机安装路径" |
| 冒烟 / 导入器 / 裁判自证 / 存档重放 | ✅ 109 / 29 / 27 / 138 项全过 |
| 红线（追踪文本文件无本机路径、无个人值） | ✅ 自动扫描通过 |

## 四、截图集合（定死，不随每次 UI 改动重出）

为了避免"UI 一动就重出截图"的无底洞，展示集合固定为 **3 张 UI 截图 + 2 张图标**，内容全部来自真实应用（不是设计稿），且都用 `index.html?local=0`（中性模板）渲染，确保图里没有个人数字：

| 文件 | 内容 | 源 |
| --- | --- | --- |
| `design/preview-app.png` | 四个 tab 实际渲染（今日 / 计划 / 趋势 / 我的） | `design/preview-four.html` |
| `design/preview-styles.png` | 三套风格 × 明暗对照 | `design/preview-app.html` |
| `design/preview-ai.png` | AI 周报面板 + AI 配置 | `design/preview-ai.html` |
| `icons/icon-192.png`、`icon-512.png` | 应用图标 | — |

本轮已重出这 3 张（时间戳晚于 `app.js` / `app.css`）。**删掉了旧的 `design/preview-v1.png`**：那是第一版手写设计稿（`design/mockup.html`）的截图，不是当前应用，留着会让人以为它是现状；设计稿源码仍保留作历史记录。以后**只在发布节点**重出（v1.0、v2.0），不跟每个 UI 改动。

## 五、已知缺口（写清楚，不藏）

1. **截图与当前 UI 一致性靠时间戳**：判定标准是"截图文件时间戳晚于 `app.js` / `app.css`"，已写进发布前 checklist；人工看图仍由作者之外的人做（文本扫描对图片无效，这是 `docs/adr/0004` 定的边界）。
2. **APK 是 debug 签名**——这是有意的，不是没做完。v1 定位是自用 + 开源，debug 签名足够自己装；对外分发应让使用者自己按 `docs/android-apk.md` 构建。**自建 release keystore 会引入一套新的凭据管理面，且 keystore 一旦丢失、同包名以后无法升级**——这个代价只在"决定对外分发 APK"时才值得付。backlog，触发条件：决定把 APK 作为对外分发物时再做。
3. **holdout 只是 10 条、单温度**，且 v2 是在同一套 21 条上调过参的；M5 要换新 holdout 并至少再跑一个模型（见 `docs/m4-holdout-report.md`）。
4. **本机 Android 模拟器未完成，但不属于 M4，也不为它申请扩权**：SDK / AVD / WHPX 全部就绪（emulator 日志确认 "Windows Hypervisor Platform accelerator is operational"），但进程在启用加速后**静默退出**，5554/5555 从未监听、adb 看不到设备；与 headless Chrome 那次属同一类受限沙箱边界（本地套接字/管道），不是配置错误。用户真机已验证可用，所以不阻塞发布。这是"用户新需求 2"的可选后续，值不值得做由用户定；要绕过要么一次性更宽权限重试，要么在 Android Studio 里跑 AVD。
5. **本机出网不可达（系统代理 `127.0.0.1:7897` 未运行）**：表现为 HTTPS 超时、`git` 报 `schannel` 凭据失败。**不是 DNS 问题**（`github.com` 能解析、443 能连），也不是 TLS 配置错误——代理没开时不必重试 push。恢复顺序：用户开代理 → workbuddy 先验证连通 → 再向用户要**单仓库权限的 fine-grained token** 转交 → 之后才执行 push。完整顺序、可复制命令与推送后 6 条验证见 [`github-publish-user-steps.md`](github-publish-user-steps.md)。

## 六、发布后要验证什么

1. 公网地址能在手机上打开，加主屏后是全屏、无地址栏。
2. 首次打开不报错；打卡一条 → 关掉应用 → 重新打开数据还在。
3. 深色模式跟随系统。
4. 页面源码在公网可读，但里面**没有任何个人数据**（红线在本地已自动验证过；公网再抽查一次）。
