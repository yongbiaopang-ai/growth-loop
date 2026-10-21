# 发布到 GitHub：操作手册（含 push 前置命令）

## 一、网络：先自检，已知可用配方是「代理 + OpenSSL 后端」

本机出网有两个坑，**都能绕过**：

1. **直连被墙**：不设代理时 HTTPS 请求会超时。
2. **沙箱里默认的 TLS 后端（schannel）不可用**：表现为 `schannel: AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS`。**不是 DNS 问题**（`github.com` 能解析、443 能连），也别去改 hosts。

### 已知可用配方（workbuddy 已验证）

```powershell
$env:HTTPS_PROXY="http://127.0.0.1:7897"
$env:HTTP_PROXY="http://127.0.0.1:7897"
git -c http.sslBackend=openssl ls-remote --heads https://github.com/git/git.git
```

建议再设一次仓库级配置，免得每次都要带 `-c`：

```powershell
git config http.sslBackend openssl
```

### 出网自检（跑这个，别靠猜）

逐条试，哪条返回 `EXIT=0` 就用哪条继续（结果会随代理/全局模式变化，以当场输出为准）：

```powershell
# A. 直连 + openssl
cmd /c "set HTTPS_PROXY=&& set HTTP_PROXY=&& git -c http.sslBackend=openssl ls-remote --heads https://github.com/git/git.git >nul 2>&1 & echo EXIT=%errorlevel%"

# B. 代理 + openssl（已知可用配方）
$env:HTTPS_PROXY="http://127.0.0.1:7897"; $env:HTTP_PROXY="http://127.0.0.1:7897"
cmd /c "git -c http.sslBackend=openssl ls-remote --heads https://github.com/git/git.git >nul 2>&1 & echo EXIT=%errorlevel%"
```

> 记录（2026-10-21 实测）：A、B 两种都能返回 `EXIT=0`（用户可能开了全局模式）。而 workbuddy 早前的验证是"直连超时、schannel 失败、代理 + openssl 成功"。所以**以自检输出为准**；若遇到 `schannel` 报错，就加 `http.sslBackend=openssl`。

### 发布顺序（别抢跑）

1. 用户开代理 / 全局模式。
2. **workbuddy 先验证连通**（上面的自检）。
3. 连通确认后，才向用户要**单仓库权限的 fine-grained token**，由 workbuddy 转交。
4. 拿到 token 后才执行 push。

> 约束：**在 workbuddy 告知 token 状态之前，不要 push，也不要自己向用户要凭据。**

---

## 二、推送命令（PowerShell，可直接复制）

把 `<你的用户名>` 换成实际值。**顺序不要换**：先推分支，再推 tag。

```powershell
cd growth-loop

# 0) 网络：用已知可用配方（见第一节的自检结果）
$env:HTTPS_PROXY="http://127.0.0.1:7897"
$env:HTTP_PROXY="http://127.0.0.1:7897"
git config http.sslBackend openssl

# 1) 本地必须干净、分支与 tag 齐全
git status --porcelain                 # 期望：空
git branch --show-current              # 期望：main（不是就 git checkout main）
git log --oneline -1                   # 记下要发布的提交
git tag -l                             # 期望：v0.2 … v0.6

# 2) 接上远端（只做一次；已存在 origin 就先 git remote remove origin）
git remote add origin https://github.com/<你的用户名>/growth-loop.git
git remote -v                          # 期望：origin 的 fetch/push 两行

# 3) 先推 main，再推所有 tag（顺序不能反：tag 指向的提交必须先到远端）
git push -u origin main
git push origin --tags

# 4) 核对远端
git ls-remote --heads origin main      # 哈希应与本地 git rev-parse main 一致
git ls-remote --tags origin            # 应能看到 v0.2 ~ v0.6
```

### 建仓注意

- 仓库名建议 **`growth-loop`**；可见性 **Public**（GitHub Pages 免费额度只对公开仓库开放；仓库里没有任何个人数据，本地红线扫描已自动验证）。
- **不要**勾选 "Add a README / .gitignore / license"——本地已有，勾了会多一次冲突提交。

### 用 workbuddy 转交的 token 时

只把第 2 步换成带 token 的 URL，其余完全相同：

```powershell
git remote add origin https://<token>@github.com/<你的用户名>/growth-loop.git
```

推完**立刻**做两件事：撤销 token（GitHub → Settings → Developer settings → Personal access tokens），并把 token 从远端地址里去掉：

```powershell
git remote set-url origin https://github.com/<你的用户名>/growth-loop.git
```

---

## 三、开 GitHub Pages

仓库 → Settings → Pages → Source 选 `Deploy from a branch` → 分支 `main`、目录 `/ (root)` → Save。
等约一分钟，地址：

```text
https://<你的用户名>.github.io/growth-loop/
```

---

## 四、推送前的检查清单

```powershell
python tools/check_all.py          # 期望：全部通过
git status --porcelain             # 期望：空
git log --oneline main..HEAD       # 期望：空（里程碑分支已全部合入 main）
```

已核过的项：

- [x] `check_all` 全绿：导入器 29 项、冒烟 109 项、评测规则自证 27 项、存档重放 138 项
- [x] 在 `main` 上跑过：工作流守卫真的执行并 PASS（`main 直系历史只有合并与文档/杂项提交`）
- [x] 红线：追踪文本文件无盘符绝对路径、无类 Unix 家目录前缀、无本机用户名、无个人值
- [x] `seed.local.js` 已被 `.gitignore` 忽略（个人数字不会上传）
- [x] 二进制清单与磁盘一致（5 张：3 张 UI 截图 + 2 张图标），截图时间戳晚于 `app.js` / `app.css`
- [x] 仓库里没有 APK / 构建产物
- [x] annotated tag `v0.6` → `main` 当前提交

**需要用户决定的一项**：APK 如要进 Release，需先出 release 签名版（现在 debug 签名只适合自己装）；不做不影响发布。

---

## 五、推送后的验证清单（6 条）

1. 打开 `https://<你的用户名>.github.io/growth-loop/`：页面正常、无报错。
2. 手机上打开这个地址 → 分享/菜单 → 添加到主屏幕；从主屏图标打开应**全屏、无地址栏**。
3. 打卡一项 → 完全关掉应用 → 重新打开：数据还在（`localStorage`）。
4. 深色模式跟随系统。
5. 断网打开一次：`sw.js` 的缓存能让应用照常打开（https 下 Service Worker 才生效）。
6. 公网打开仓库页面，抽查源码里没有任何个人数据（本地红线已自动验证，这里再抽查一次）。

第 2、3 条无法自证，需要用户亲手确认——这也是发布清单把"人工看图 / 真机安装"单列成人工项的原因。

---

## 六、常见问题

- **页面 404**：Pages 的 Source 没选对，或还没构建完（等 1–2 分钟，看仓库 Actions 里的 `pages build and deployment`）。
- **打开是空白**：多半是浏览器缓存了旧 `app.js`；强刷（手机浏览器里清缓存或换隐私模式）。
- **加主屏后还是带地址栏**：iOS 必须用 **Safari** 加主屏（微信/QQ 内置浏览器不行）；Android 用 Chrome 菜单里的"添加到主屏幕"或"安装应用"。
- **push 报 `schannel`**：加 `http.sslBackend=openssl`（见第一节）。
- **push 超时**：设 `HTTPS_PROXY` / `HTTP_PROXY`，或让用户开全局模式；先跑第一节自检。
- **想换搜索链接的搜索源**：改 `seed.js` 里的 `SEARCH_URL` 即可（默认百度）。
