# 发布到 GitHub：用户操作清单

这一步**只能由你本人完成**，原因有两个，先说清楚：

1. **本机到 GitHub 的 TLS 握手失败**。实测：`github.com` 能解析（A 记录可达）、`TCP 443` 能连，但 TLS 层报 `schannel: AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS`。所以无论谁来做，我这里都推不上去——**注意这是 TLS 失败、不是 DNS 失败**，别去改 hosts / DNS，那条路是错的。所以无论谁来做，我这里都推不上去。
2. **凭据不能由我造、也不能代持**。开源的推送权限是你的账号权利，不是项目资产。

下面两条路，选一条即可。

---

## 路线 A：你自己推（推荐，最省事也最安全）

### 1. 建仓库

- 名字建议：**`growth-loop`**
- 可见性：**Public**（GitHub Pages 免费额度只对公开仓库开放；仓库里没有任何个人数据，本地红线扫描已自动验证）
- **不要**勾选"Add a README / .gitignore / license"——本地已经有，勾了会多一次冲突

### 2. 本地加远程并推送

把 `<你的用户名>` 换成你的 GitHub 用户名，在项目目录里执行：

```bash
git remote add origin https://github.com/<你的用户名>/growth-loop.git
git push -u origin main
git push origin --tags
```

> 推送时会弹出 GitHub 登录/授权窗口，按提示授权即可。如果提示密码认证失败，用 **Personal Access Token** 代替密码（GitHub 已经不支持账号密码推送）。

### 3. 开 GitHub Pages

仓库 → Settings → Pages → Source 选 `Deploy from a branch` → 分支 `main`、目录 `/ (root)` → Save。
等约一分钟，地址是：

```text
https://<你的用户名>.github.io/growth-loop/
```

---

## 路线 B：你把推送权限交给我一次（我给操作步骤，你来给凭据）

如果你不想在自己机器上敲命令，可以：

1. 在 GitHub 建一个 **fine-grained Personal Access Token**：只给这一个仓库、只给 `Contents: Read and write` 权限、有效期设最短（7 天）。
2. 通过我这边的**安全卡片**把令牌给我（我看不到明文，只进环境变量，不会写进任何文件）。
3. 我用它：`git remote add` + `git push`（推 `main` 与全部 tag）。
4. **推完你立刻去 GitHub 撤销这个 token**（Settings → Developer settings → Personal access tokens）。
5. 然后你自己按路线 A 的第 3 步开 Pages（这一步需要账号界面操作，token 权限不够；或者你把 Pages 也授权给我，但我不建议扩大权限）。

> 同样因为**本机 TLS 握手失败**，路线 B 在这台机器上实际也推不上去。它是留给"网络环境变化之后"的备用方案——**现在先按路线 A 做，最稳。**

---

## 推送前的检查清单（本地已全部通过，可复核）

在项目目录执行：

```bash
python tools/check_all.py          # 期望：全部通过
git status --porcelain             # 期望：空
git log --oneline main..HEAD       # 期望：空（里程碑分支已全部合入 main）
```

已核过的项：

- [x] `check_all` 全绿：导入器 29 项、冒烟 109 项、评测规则自证 27 项、存档重放 138 项
- [x] 红线：追踪文本文件无盘符绝对路径、无类 Unix 家目录前缀、无本机用户名、无个人值
- [x] `seed.local.js` 已被 `.gitignore` 忽略（个人数字不会上传）
- [x] 二进制清单与磁盘一致（`docs/binary-artifacts.txt`）
- [x] 仓库里没有 APK / 构建产物

**需要你决定的两项**（做了再推更完整，不做也能推）：

- [ ] 截图与当前 UI 一致（本轮 UI 变了，旧截图需要重出；重出请用 `index.html?local=0` 中性模板，并让作者之外的人看一眼）
- [ ] APK 如要放进 Release，需要先出 release 签名版（现在的 debug 签名只适合自己装）

---

## 推送后的验证清单

1. 打开 `https://<你的用户名>.github.io/growth-loop/`：页面正常、无报错。
2. 手机上打开这个地址 → 分享/菜单 → 添加到主屏幕；从主屏图标打开应**全屏、无地址栏**。
3. 打卡一项 → 完全关掉应用 → 重新打开：数据还在（`localStorage`）。
4. 深色模式跟随系统。
5. 断网打开一次：`sw.js` 的缓存能让应用照常打开（https 下 Service Worker 才生效）。
6. 公网打开仓库页面，抽查源码里没有任何个人数据。

前两条无法由我自证，需要你亲手确认——这就是为什么发布清单里把"人工看图 / 真机安装"单列成人工项。

---

## 常见问题

- **页面 404**：Pages 的 Source 没选对，或还没构建完（等 1–2 分钟，看仓库 Actions 里的 `pages build and deployment`）。
- **打开是空白**：多半是浏览器缓存了旧 `app.js`；强刷（手机浏览器里清缓存或换隐私模式）。
- **加主屏后还是带地址栏**：iOS 必须用 **Safari** 加主屏（微信/QQ 内置浏览器不行）；Android 用 Chrome 菜单里的"添加到主屏幕"或"安装应用"。
- **想换搜索链接的搜索源**：改 `seed.js` 里的 `SEARCH_URL` 即可（默认百度）。
