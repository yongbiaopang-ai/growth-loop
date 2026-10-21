# 发布到 GitHub：操作手册（含 push 前置命令）

本机目前**推不上去**，卡点只有一个，且与代码无关。

## 一、真实卡点：本机出网不可达（代理没开）

- 系统里配了代理 `127.0.0.1:7897`，但它**当前没在运行**。
- 表现：HTTPS 请求超时（`curl` 15 秒超时）、`git` 报 `schannel: AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS`。
- **不是 DNS 问题**：`github.com` 能解析（A 记录 20.205.243.166），`TCP 443` 也能连上，所以**不要去改 hosts / DNS**，方向是错的。
- 也不是 TLS 配置错误，而是出网链路不通之后，Windows 的 schannel 拿不到可用凭据。

### 恢复顺序（按这个来，别抢跑）

1. 用户开启代理（`127.0.0.1:7897`）。
2. **workbuddy 先验证连通**（见下面的"出网自检"），确认后再继续。
3. 连通确认后，才向用户要**单仓库权限的 fine-grained token**，并由 workbuddy 转交。
4. 拿到 token 后才执行 push。

> 约束：**在 workbuddy 说"通了"之前，不要尝试 push，也不要自己向用户要凭据。**

### 出网自检（任何时候都可先跑）

```bash
curl -sI https://github.com --max-time 10 | head -n 1     # 期望：HTTP/2 200 或 HTTP/1.1 200
git ls-remote https://github.com/git/git.git HEAD         # 期望：打印一行 hash，不报 schannel
```

两条都通过，才算"通了"。

---

## 二、推送命令（可直接复制）

把 `<你的用户名>` / `<仓库名>` 换成实际值。**顺序不要换**：先推分支，再推 tag。

```bash
cd growth-loop

# 0) 出网自检（见上），确认"通了"再做
curl -sI https://github.com --max-time 10 | head -n 1
git ls-remote https://github.com/git/git.git HEAD

# 1) 本地必须干净且分支齐全
git status --porcelain                 # 期望：空
git branch --show-current              # 期望：main（不是就 git checkout main）
git log --oneline -1                   # 记下要发布的提交
git tag -l                             # 期望：v0.2 v0.3 v0.4 v0.5 …

# 2) 接上远端（只做一次；已存在 origin 就先 git remote remove origin）
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git remote -v                          # 期望：origin 的 fetch/push 两行都对

# 3) 先推 main，再推所有 tag（顺序不能反：tag 指向的提交必须先到远端）
git push -u origin main
git push origin --tags

# 4) 核对远端
git ls-remote --heads origin main      # 哈希应与本地 git rev-parse main 一致
git ls-remote --tags origin            # 应能看到 v0.2 ~ v0.5
```

### 建仓时的两个注意

- 仓库名建议：**`growth-loop`**；可见性 **Public**（GitHub Pages 免费额度只对公开仓库开放；仓库里没有任何个人数据，本地红线扫描已自动验证）。
- **不要**勾选 "Add a README / .gitignore / license" —— 本地已有，勾了会产生一次冲突提交。

### 由 workbuddy 转交 token 时的差异

只把第 2 步换成带 token 的 URL，其余完全相同：

```bash
git remote add origin https://<token>@github.com/<你的用户名>/growth-loop.git
```

推完**立刻撤销该 token**（GitHub → Settings → Developer settings → Personal access tokens），并 `git remote set-url origin https://github.com/<你的用户名>/growth-loop.git` 把 token 从远端地址里去掉。

---

## 三、开 GitHub Pages

仓库 → Settings → Pages → Source 选 `Deploy from a branch` → 分支 `main`、目录 `/ (root)` → Save。
等约一分钟，地址：

```text
https://<你的用户名>.github.io/growth-loop/
```

---

## 四、推送前的检查清单

```bash
python tools/check_all.py          # 期望：全部通过
git status --porcelain             # 期望：空
git log --oneline main..HEAD       # 期望：空（里程碑分支已全部合入 main）
```

已核过的项：

- [x] `check_all` 全绿：导入器 29 项、冒烟 109 项、评测规则自证 27 项、存档重放 138 项
- [x] 红线：追踪文本文件无盘符绝对路径、无类 Unix 家目录前缀、无本机用户名、无个人值
- [x] `seed.local.js` 已被 `.gitignore` 忽略（个人数字不会上传）
- [x] 二进制清单与磁盘一致（`docs/binary-artifacts.txt`，5 张：3 张 UI 截图 + 2 张图标）
- [x] 截图时间戳晚于 `app.js` / `app.css`（本轮已按固定集合重出，见 `docs/m4-release-notes.md` 第四节）
- [x] 仓库里没有 APK / 构建产物

**需要用户决定的一项**：APK 如要放进 Release，需先出 release 签名版（现在的 debug 签名只适合自己装）；不做也不影响发布。

---

## 五、推送后的验证清单（6 条）

1. 打开 `https://<你的用户名>.github.io/growth-loop/`：页面正常、无报错。
2. 手机上打开这个地址 → 分享/菜单 → 添加到主屏幕；从主屏图标打开应**全屏、无地址栏**。
3. 打卡一项 → 完全关掉应用 → 重新打开：数据还在（`localStorage`）。
4. 深色模式跟随系统。
5. 断网打开一次：`sw.js` 的缓存能让应用照常打开（https 下 Service Worker 才生效）。
6. 公网打开仓库页面，抽查源码里没有任何个人数据（本地红线已自动验证，这里再抽查一次）。

第 2、3 条无法由我自证，需要用户亲手确认——这也是发布清单把"人工看图 / 真机安装"单列成人工项的原因。

---

## 六、常见问题

- **页面 404**：Pages 的 Source 没选对，或还没构建完（等 1–2 分钟，看仓库 Actions 里的 `pages build and deployment`）。
- **打开是空白**：多半是浏览器缓存了旧 `app.js`；强刷（手机浏览器里清缓存或换隐私模式）。
- **加主屏后还是带地址栏**：iOS 必须用 **Safari** 加主屏（微信/QQ 内置浏览器不行）；Android 用 Chrome 菜单里的"添加到主屏幕"或"安装应用"。
- **push 报 `schannel` / 超时**：先按第一节做"出网自检"；代理没开时不必重试 push。
- **想换搜索链接的搜索源**：改 `seed.js` 里的 `SEARCH_URL` 即可（默认百度）。
