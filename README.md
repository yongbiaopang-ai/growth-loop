# Growth Loop · 成长打卡

本地优先、单人使用、可开源的个人成长打卡与复盘工具。覆盖四条线：**健身 · 英语 · 理财 · AI**。

为一份真实的半年计划而写（2026-10-19 ~ 2027-04-18，26 周），目标只有一个：**每天 22:45 花 30 秒完成打卡**，其余交给自动统计。

## 特性

- **三套活力风格**：活力（靛蓝→亮蓝）/ 运动（珊瑚→洋红）/ 霓虹（薄荷→电蓝，深色最好看），在「我的 → 外观」里切换，浅色深色各自配色。
- **今日**：七天条带（可点已过的日期补卡）、环形进度、按星期几自动生成的任务卡。每张卡两个按钮：`完成`（一次点击，带时间戳与撤销）/ `降级 · 跳过`（MVB 或选择加班 / 生病 / 临时有事）。
- **计划**：当前阶段与本周重点、26 周进度条、四条线 M6 验收标准、里程碑时间轴、每周三种日子。
- **趋势**：6 个指标可切换折线图（带目标虚线）、26 周完成热力格、周复盘记录。
- **我的**：基线录入、提醒设置、浅色/深色/跟随系统、JSON 导出与导入、清空数据。
- **状态齐全**：计划未开始、连续断卡 2 天、空数据、离线，都有明确呈现。
- **离线可用**：Service Worker 缓存外壳，装到手机主屏后断网也能打卡。
- **零依赖**：纯 HTML + CSS + JavaScript，没有构建步骤，没有 npm install。
- **数据只在本地**：存在浏览器 localStorage，不上传任何服务器，无账号、无统计、无广告。

## 在手机上安装（推荐）

PWA 要跑在 https 上离线能力才完整。最省事的方式是用 GitHub Pages：

1. 把这个目录推到你的 GitHub 仓库（Public）。
2. 仓库 Settings → Pages → Source 选 `main` 分支 `/ (root)`，保存。
3. 等一分钟，访问 `https://<你的用户名>.github.io/<仓库名>/`。
4. 手机浏览器打开这个地址 → 分享/菜单 → **添加到主屏幕**。
5. 主屏出现「成长打卡」图标，点开是全屏的，像原生应用。

> 数据存在手机浏览器里，换手机或清理浏览器数据会丢。请每周日在「我的」页导出一次备份。

## 本地开发

```bash
python serve.py            # 默认 8787 端口，会打印手机可访问的局域网地址
python serve.py 9000       # 指定端口
```

- 电脑上看：<http://127.0.0.1:8787/>
- 手机上看：手机和电脑连同一个 Wi-Fi，打开终端里打印的 `http://192.168.x.x:8787/`
- 注意：局域网 http 下 Service Worker 不会注册（浏览器要求安全上下文），本机 `127.0.0.1` 可以。

其他命令：

```bash
node tools/smoke_test.js        # 47 项渲染与逻辑断言（五个场景 + 红线清洁度检查）
python tools/make_icons.py      # 重新生成 PWA 图标
```

## 设计与文档

| 文件 | 内容 |
| --- | --- |
| `design/mockup.html` | 前端设计稿：9 屏（两种今日页方案、计划、趋势、复盘、我的、上手、状态、深色） |
| `design/UI设计规范.md` | 设计规范：信息架构、组件规则、交互、视觉 token、状态、实现顺序 |
| `design/tokens.css` | 基础设计 token（字号、间距、形状、中性色） |
| `design/themes.css` | 三套活力风格包，覆盖颜色变量；`<html data-style="…">` 切换 |
| `design/preview-app.html` | 风格对照页（`?style=` / `?theme=` 参数预览），用于截图自查 |
| `design/preview-four.html` | 四页 iframe 预览，仓库截图由它出（`local=0` 中性模板） |

## 改计划 = 改 `seed.js`

**两个文件分工**：

- `seed.js` —— 中性模板，**不含任何个人数据**，可以公开。跑起来用的是它里面的通用示例数字。
- `seed.local.js` —— 你的真实数字（体重目标、本金量级、现金流换算），**已被 `.gitignore` 忽略**。第一次使用：`cp seed.local.example.js seed.local.js` 然后改成你自己的。不建也能跑。
- 想看不带本地覆盖的纯模板效果：打开 `index.html?local=0`（截图与演示用这个）。

`seed.js` 里的全部计划数据：`WEEK_TEMPLATE`（每周任务）、`STAGES`（阶段）、`MONTH_FOCUS`（每月重点）、`GOALS`（M6 验收）、`MILESTONES`、`W1`、`RULES`。

- 改任务：编辑对应的 `WEEK_TEMPLATE[星期几]`，`minutes` 用于估算投入小时，`mvb` 是降级版本的说明。
- 改个人数字：只改 `seed.local.js`，别改 `seed.js`——否则就把自己的数字写进开源仓库了。
- **改 `seed.js` 或任何静态文件后，把 `sw.js` 里的 `VERSION` 加一**，否则手机还在用旧缓存。
- 改数据模型：同时改 `app.js` 的 `KEY` 版本号与 `load()` 里的迁移逻辑。

## 导入你现有的 Excel 打卡表

```bash
python tools/xlsx_to_json.py "半年计划打卡表_26周.xlsx" -o import.json
python tools/xlsx_to_json.py --sample -o data/sample.json     # 合成示例数据（不含任何真实信息）
python tools/test_xlsx_import.py                              # 29 项导入器测试
```

然后在应用「我的 → 从文件导入」里选生成的 JSON。

- **导入器只取应用能显示的字段**（指标 + 基线）。周记录、里程碑、资金配置、书单会留在 JSON 里备查，不塞进状态变成死数据——这是刻意的边界，不是没做完。
- **按表头名取值，不按列号**：缺列、多列、列序变化都不影响结果；工作表按名字前缀模糊匹配（表名带空格、括号、后缀都能认）。
- 数值宽容解析：`≤82` → 82、`150h` → 150；`1800-1900`、`25→15` 这类区间保留原文。
- `data/sample.json` 是合成数据（12 个月指标 + 26 周记录），可以直接导入看有数据的样子。
- 指标表的 `M1…M12` 会按计划开始月换算成 `2026-10 … 2027-09`；已经是 `YYYY-MM` 的原样保留。

## 数据结构

localStorage 键：`growthloop.v1`

```json
{
  "v": 1,
  "settings": { "start": "2026-10-19", "reminder": "22:45", "reviewReminder": "21:15", "theme": "auto" },
  "baseline": { "height": "175cm", "weight": "70kg", "bodyfat": "22%", "english": "A2" },
  "checkins": {
    "2026-10-19": {
      "strength_a": { "s": "done", "ts": 1760000000000 },
      "ai_block":   { "s": "mvb",  "ts": 1760000000000 },
      "en_listen":  { "s": "skip", "reason": "加班", "ts": 1760000000000 }
    }
  },
  "metrics": { "2026-10": { "bodyfat": 22, "weight": 69, "sleep": 7.2 } },
  "reviews": { "2026-10-19": { "fitness": "…", "text": "…", "ts": 1760000000000 } }
}
```

`s` 取值：`done` / `mvb` / `skip`。`theme` 取值：`auto` / `light` / `dark`。

## 路线图

| 里程碑 | 内容 | 状态 |
| --- | --- | --- |
| M0 | 骨架、数据模型、打卡能存 | ✅ |
| M1 | 今日页 + 七天条带补卡 + 计划页 + 我的页 + 空/未开始状态 + 深色模式 | ✅ v0.2 |
| M1.5 | 对照真实表的导入器（`tools/xlsx_to_json.py`）+ 合成示例数据 | ✅ v0.4 |
| M2 | 指标趋势图与录入、周复盘表单、备份往返 | ✅ v0.3 |
| M3 | AI 周报 + prompt 版本管理 + 20 条评测集 | ⬜ |
| M4 | 提醒引导、安装引导、开源发布 v1.0 | ⬜ |

## 刻意不做

不做社交 / 排行 / 打卡分享；不做账号与云同步；不接券商、不做行情与 K 线、**不给任何投资建议**；不做医学判断；不做干扰主流程的游戏化。

## Contributing

欢迎 Issue / PR。约定：

- 提交信息用英文，一个改动一个 commit。
- 不要引入依赖，除非在 PR 里说明为什么更轻的方案不行。
- **不要提交任何个人数据**：体重、资产金额、真实姓名、本机绝对路径、API Key。个人数字一律写进 `seed.local.js`。
- **红线自检是全自动的**：`node tools/smoke_test.js` 会从 `seed.local.js` **派生**个人 token 扫描全仓库（加字段即自动纳入），并用 `tools/neutral-vocabulary.txt` 做单位数字白名单——后者能抓住 `seed.local.js` 之外的漏网值。命中即 FAIL。
- 边界判定写在 [`docs/adr/0004`](docs/adr/0004-个人数据边界与红线自检.md)：哪些算个人信息、哪些（如 `A2`、`高中水平`）已判定为可公开。
- 改 `sw.js` 缓存列表时记得升 `VERSION`；改完跑一次 `node tools/smoke_test.js`。

## License

MIT，见 [LICENSE](LICENSE)。

---

## English

**Growth Loop** is a local-first, single-user habit tracker for a 26-week self-improvement plan covering fitness, English, finance, and AI.

- Four tabs: Today (check-in), Plan (goals & milestones), Trend (charts & heatmap), Mine (baseline, backup, theme).
- Zero dependencies, no build step: plain HTML/CSS/JS. Design tokens live in `design/tokens.css`.
- All data lives in the browser's `localStorage`; nothing is uploaded, no accounts, no analytics.
- Installable as a PWA (mobile: "Add to Home Screen"), works offline via a service worker. Dark mode included.
- Edit `seed.js` to change the plan; bump `VERSION` in `sw.js` after changing any static file.
- Local dev: `python serve.py`, then open the printed LAN URL on your phone. Tests: `node tools/smoke_test.js`.

MIT licensed. Contributions welcome — please never commit personal data.
