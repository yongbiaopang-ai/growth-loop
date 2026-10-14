/* Growth Loop · 冒烟测试（Node，无依赖）
 * 用最小 DOM 桩把 app.js 跑起来，验证四个页面在四种情况下都正确渲染：
 *   A 空数据（用户现在的真实状态）
 *   B 有数据 + 深色主题 + 计划尚未开始
 *   C 计划进行中（PLAN_START 前移，验证周数、热力格、连续打卡）
 *   D 走到 W4 检查点周（验证 60% 起步周 / 减量周 / ★W4 基线 标记）
 * 用法：node tools/smoke_test.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
let failed = 0;

function check(name, ok, extra) {
  console.log((ok ? "PASS  " : "FAIL  ") + name + (extra ? "  " + extra : ""));
  if (!ok) failed++;
}

function mkEl(sel) {
  const el = {
    sel, innerHTML: "", value: "", files: [], style: {}, _attrs: {},
    classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
    addEventListener() {}, querySelectorAll() { return []; }, querySelector(sel) { return mkEl(sel + " *"); },
    setAttribute(k, v) { el._attrs[k] = String(v); },
    getAttribute(k) { return el._attrs[k] != null ? el._attrs[k] : null; },
    focus() {}, click() {}, appendChild() {}, remove() {}
  };
  return el;
}

/* 在干净的沙箱里跑一次完整渲染；mutateSeed 在 seed 之后、app 之前改计划数据
 * opts.withLocal 先载入 seed.local.js；opts.search 模拟 ?local=0 */
function render(seedState, mutateSeed, opts) {
  opts = opts || {};
  const els = {};
  const store = new Map();
  if (seedState) store.set("growthloop.v1", JSON.stringify(seedState));

  const document = {
    documentElement: mkEl("html"),
    querySelector(sel) { if (!els[sel]) els[sel] = mkEl(sel); return els[sel]; },
    querySelectorAll() { return []; },
    addEventListener(ev, fn) { if (ev === "DOMContentLoaded") document._ready = fn; },
    createElement() { return mkEl("tmp"); },
    body: { appendChild() {} }
  };

  const sandbox = {
    window: {}, document,
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k)
    },
    navigator: {}, location: { hash: "", search: opts.search || "", protocol: "http:" },
    console, alert() {}, confirm() { return true; }, setTimeout,
    Blob: function () {}, URL: { createObjectURL: () => "" }, FileReader: function () {},
    scrollTo() {}, Date, JSON, Math, Object, Array, String, Number, Boolean, parseInt, parseFloat, isNaN,
    URLSearchParams
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);

  if (opts.withLocal) {
    const localPath = path.join(ROOT, "seed.local.js");
    if (fs.existsSync(localPath)) vm.runInContext(fs.readFileSync(localPath, "utf8"), sandbox);
  }
  vm.runInContext(fs.readFileSync(path.join(ROOT, "seed.js"), "utf8"), sandbox);
  const SEED = sandbox.window.SEED;
  if (mutateSeed) mutateSeed(SEED);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "app.js"), "utf8"), sandbox);
  if (typeof document._ready !== "function") throw new Error("app.js 没有注册 DOMContentLoaded");

  const out = { SEED };
  for (const tab of ["today", "plan", "trend", "mine"]) {
    sandbox.location.hash = tab;
    document._ready();
    out[tab] = els["#view-" + tab].innerHTML;
  }
  out.theme = document.documentElement._attrs["data-theme"] || "";
  out.style = document.documentElement._attrs["data-style"] || "";
  out.sheet = els["#modal"] ? els["#modal"].innerHTML : "";
  out.__gl = sandbox.__gl || null;
  out.store = store;
  return out;
}

const pad = (n) => String(n).padStart(2, "0");
const d2s = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const shift = (offset) => { const t = new Date(); return d2s(new Date(t.getFullYear(), t.getMonth(), t.getDate() + offset)); };

/* 把某一天的任务全部标为完成 */
function fill(checkins, SEED, dateStr) {
  const d = new Date(+dateStr.slice(0, 4), +dateStr.slice(5, 7) - 1, +dateStr.slice(8, 10));
  const tpl = SEED.WEEK_TEMPLATE[d.getDay()] || [];
  checkins[dateStr] = {};
  tpl.forEach((t) => { checkins[dateStr][t.id] = { s: "done", ts: 1760000000000 }; });
  return tpl.length;
}

/* ---------- 红线：个人数据不得进仓库（词表自动派生，不靠人记） ---------- *
 * 1) 个人值自动派生：从 seed.local.js 解析出所有值及其中的「数字+单位」片段，
 *    扣掉中性词汇后，剩下的 token 不得出现在任何仓库文本文件里。
 *    —— 新字段加进 seed.local.js 就自动纳入红线，词表不可能过期。
 * 2) 单位数字白名单：仓库文本文件里的 kg/cm/万/元 数字必须在中性词汇里。
 *    —— 这条不依赖"谁记得哪个数字算个人数据"，能抓住 seed.local.js 之外的漏网值。
 * 中性词汇 = seed.js（中性模板）+ seed.local.example.js + tools/neutral-vocabulary.txt。
 */
console.log("— 红线检查：开源仓库清洁度（自动派生）—");
const UNIT_RE = /\d+(?:\.\d+)?\s*\/?\s*(?:kg|cm|万|元|%|月|年|小时)/g;
const STRICT_UNIT_RE = /\d+(?:\.\d+)?\s*\/?\s*(?:kg|cm|万|元)/g;
const norm = (s) => String(s).replace(/\s+/g, "");
const tok = (text, re) => (text.match(re) || []).map(norm);

const vocab = new Set();
["seed.js", "seed.local.example.js"].forEach((f) => {
  tok(fs.readFileSync(path.join(ROOT, f), "utf8"), UNIT_RE).forEach((t) => vocab.add(t));
});
const vocabPath = path.join(ROOT, "tools", "neutral-vocabulary.txt");
if (fs.existsSync(vocabPath)) {
  fs.readFileSync(vocabPath, "utf8").split("\n").map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#")).forEach((l) => vocab.add(norm(l)));
}

const localPath = path.join(ROOT, "seed.local.js");
let personal = [];
if (fs.existsSync(localPath)) {
  const box = {}; box.window = box; vm.createContext(box);
  vm.runInContext(fs.readFileSync(localPath, "utf8"), box);
  const set = new Set();
  Object.values(box.SEED_LOCAL || {}).filter((v) => typeof v === "string").forEach((v) => {
    tok(v, UNIT_RE).forEach((t) => set.add(t));
    (v.match(/\d+(?:[–—-]\d+)+/g) || []).forEach((t) => set.add(norm(t)));
    if (v.length >= 4) set.add(norm(v));
  });
  personal = [...set].filter((t) => t.length >= 3 && !vocab.has(t));
}

const SCAN_EXT = [".js", ".html", ".md", ".json", ".py", ".txt", ".webmanifest"];
const SCAN_SKIP = ["seed.local.js", "neutral-vocabulary.txt"];
const scan = fs.readdirSync(ROOT, { recursive: true })
  .map((p) => String(p).replace(/\\/g, "/"))
  .filter((p) => !p.startsWith(".git/") && !p.startsWith("node_modules/"))
  .filter((p) => SCAN_EXT.includes(path.extname(p)) && !SCAN_SKIP.includes(path.basename(p)))
  .map((p) => ({ p, text: fs.readFileSync(path.join(ROOT, p), "utf8") }));

const leakA = [];
personal.forEach((t) => scan.forEach(({ p, text }) => { if (norm(text).includes(t)) leakA.push(p + " ← " + t); }));
check("个人值未进仓库（自动派生 " + personal.length + " 个 token）", leakA.length === 0, [...new Set(leakA)].slice(0, 5).join("; "));

const leakB = [];
scan.forEach(({ p, text }) => tok(text, STRICT_UNIT_RE).forEach((t) => { if (!vocab.has(t)) leakB.push(p + " ← " + t); }));
check("单位数字都在中性词汇表内", leakB.length === 0, [...new Set(leakB)].slice(0, 6).join("; "));

/* 结构性规则（不靠词表）：绝对路径与本机用户名。
 * 用户名从 os.homedir() 现场推导，所以仓库里既没有个人数据，也没有"该防谁"的线索。
 * 正则要排除网址协议那一串（https 后面的斜杠不是盘符）。
 * 注意：注释里也不能写出会被这条规则命中的字面例子——本仓库已被这个坑绊过两次。 */
const os = require("os");
const homeName = path.basename(os.homedir());
const ABS_RE = /(^|[^A-Za-z])[A-Za-z]:[\\/]|\/Users\/|\/home\//;
const leakC = [];
scan.forEach(({ p, text }) => {
  text.split("\n").forEach((ln, i) => {
    if (ABS_RE.test(ln)) leakC.push(p + ":" + (i + 1) + " ← 绝对路径");
    if (homeName && homeName.length >= 2 && ln.includes(homeName)) leakC.push(p + ":" + (i + 1) + " ← 本机用户名");
  });
});
check("不含绝对路径与本机用户名", leakC.length === 0, [...new Set(leakC)].slice(0, 5).join("; "));
// 规则自检：能命中盘符路径，且不会把网址协议误判为盘符
check("路径规则自检", ABS_RE.test("D:" + String.fromCharCode(92) + "dir") && !ABS_RE.test("https://example.com"));

/* 二进制产物清单：文本规则对二进制双向失效（会漏也会误报），所以显式分层。
 * 清单由人工看图，机器只保证「清单 == 磁盘」不漂移。 */
const binListPath = path.join(ROOT, "docs", "binary-artifacts.txt");
const binList = fs.existsSync(binListPath)
  ? fs.readFileSync(binListPath, "utf8").split("\n").map((s) => s.trim())
      .filter((s) => s && !s.startsWith("#"))
  : [];
const BIN_EXT = /\.(png|jpe?g|gif|webp|ico)$/i;
const diskBins = [];
["design", "icons"].forEach((dir) => {
  const d = path.join(ROOT, dir);
  if (!fs.existsSync(d)) return;
  fs.readdirSync(d).forEach((f) => { if (BIN_EXT.test(f)) diskBins.push(dir + "/" + f); });
});
const listedNotOnDisk = binList.filter((f) => !diskBins.includes(f));
const onDiskNotListed = diskBins.filter((f) => !binList.includes(f));
check("二进制清单与磁盘一致", listedNotOnDisk.length === 0 && onDiskNotListed.length === 0,
  [listedNotOnDisk.length ? "清单有磁盘没有：" + listedNotOnDisk.join("、") : "",
   onDiskNotListed.length ? "磁盘有清单没列：" + onDiskNotListed.join("、") : ""].filter(Boolean).join("；")
  || (binList.length + " 个待人工看图"));
check("文本扫描显式跳过二进制", scan.every(({ p }) => !BIN_EXT.test(p)));

check("seed.local.js 已被 gitignore", fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8").includes("seed.local.js"));
check("提供了本地覆盖模板", fs.existsSync(path.join(ROOT, "seed.local.example.js")));

/* 目标值不许在 app.js 里硬编码——否则个人目标会绕过上面两条扫描（它们只认"数字+单位"） */
const appSrc = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
check("app.js 不硬编码指标目标", !/target:\s*\d/.test(appSrc));
check("app.js 的目标取自 seed", /var METRICS = S\.METRICS/.test(appSrc));
check("seed 导出 METRICS", /METRICS:\s*METRICS/.test(fs.readFileSync(path.join(ROOT, "seed.js"), "utf8")));

/* ---------- A：空数据 ---------- */
console.log("\n— A 空数据（现在的真实状态）—");
const A = render(null);
check("计划页显示中性模板数字", A.plan.includes("22% → 15%") && A.plan.includes("50 万防御型配置"));
check("今日页七天条带", (A.today.match(/data-day=/g) || []).length === 7);
check("今日页有任务卡", (A.today.match(/class="task/g) || []).length >= 2);
check("今日页有环形进度", A.today.includes('class="ring"'));
check("计划未开始提示", A.today.includes("计划未开始") && A.today.includes("距开跑还有"));
check("今日页有规则卡", A.today.includes("三条不许破"));
// 今天还没过完，不该被标成漏卡；只有早于今天的空白才算漏
const todayCell = (A.today.match(/class="d[^"]*today[^"]*"/) || [""])[0];
check("今天不被标成漏卡", todayCell.length > 0 && !/miss/.test(todayCell), todayCell || "未找到今天");
check("条带里只有已过日期才标漏卡", (A.today.match(/class="d[^"]*miss[^"]*"/g) || []).length <= 6);
check("计划页 26 周进度条", (A.plan.match(/<i class="[^"]*"><\/i>/g) || []).length === 26);
check("计划页有目标与里程碑", A.plan.includes("四条线") && A.plan.includes("里程碑"));
check("趋势页 6 个指标切换", (A.trend.match(/data-metric=/g) || []).length === 6);
check("趋势页空数据不画图", A.trend.includes("还没有记录") && !A.trend.includes("<polyline"));
check("趋势页热力格 26 个", (A.trend.match(/gcell/g) || []).length >= 26);
check("我的页基线待填", A.mine.includes("基线") && A.mine.includes("待填"));
check("我的页有备份与外观", A.mine.includes("导出备份") && A.mine.includes("跟随系统"));
check("默认浅色主题", A.theme === "light", A.theme);
check("默认活力风格", A.style === "energy", A.style);
check("我的页可切三套风格", A.mine.includes("活力") && A.mine.includes("运动") && A.mine.includes("霓虹"));
check("渲染不写 localStorage", A.store.size === 0, "键数 " + A.store.size);

/* ---------- B：有数据 + 深色 + 计划未开始 ---------- */
console.log("\n— B 有数据 + 深色主题 —");
const B = render({
  v: 1,
  settings: { start: "2026-10-19", theme: "dark", style: "neon", reminder: "22:45", reviewReminder: "21:15" },
  baseline: { height: "175cm", weight: "70kg", bodyfat: "22%", waist: "88cm", english: "A2", capital: "50万", emergency: "3.0万" },
  checkins: {
    "2026-10-19": { strength_a: { s: "done", ts: 1760000000000 }, en_listen: { s: "done", ts: 1760000000000 }, ai_block: { s: "mvb", ts: 1760000000000 } },
    "2026-10-20": { cardio: { s: "done", ts: 1760000000000 }, en_deep: { s: "skip", reason: "加班", ts: 1760000000000 } }
  },
  metrics: { "2026-10": { bodyfat: 25, weight: 67 }, "2026-11": { bodyfat: 23, weight: 65.5 } },
  reviews: { "2026-10-19": { text: "健身 5/5；英语只精听 2 天", ts: 1760000000000 } }
});
check("趋势页画出折线", B.trend.includes("<polyline"));
check("趋势页有目标虚线", B.trend.includes("stroke-dasharray"));
check("趋势页显示最新值", B.trend.includes("最新 23%"));
check("趋势页显示周复盘记录", B.trend.includes("健身 5/5"));
check("未开始的周不误判为低完成率", !/gcell l[1-4]/.test(B.trend));
check("我的页基线已填", B.mine.includes("已填") && B.mine.includes("175cm"));
check("我的页统计打卡天数", B.mine.includes("打卡 2 天"));
check("深色主题已套用", B.theme === "dark", B.theme);
check("风格可切换为霓虹", B.style === "neon", B.style);

/* ---------- C：计划进行中 ---------- */
console.log("\n— C 计划进行中（PLAN_START 前移 9 周）—");
const cSeed = { v: 1, settings: { theme: "auto" }, checkins: {}, metrics: {}, reviews: {}, baseline: {} };
const cProbe = render(null, (S) => { S.PLAN_START = "2026-08-17"; });
for (let i = 0; i < 7; i++) fill(cSeed.checkins, cProbe.SEED, d2s(new Date(2026, 7, 17 + i)));   // 第 1 周打满
fill(cSeed.checkins, cProbe.SEED, shift(-1));                                                    // 昨天
fill(cSeed.checkins, cProbe.SEED, shift(-2));                                                    // 前天
fill(cSeed.checkins, cProbe.SEED, shift(-3));                                                    // 大前天
const C = render(cSeed, (S) => { S.PLAN_START = "2026-08-17"; });
check("周数计算正确（第 9 周）", /第 9 \/ 26 周/.test(C.today), (C.today.match(/第 \d+ \/ \d+ 周/) || [""])[0]);
check("阶段为 M2", C.today.includes("M2 地基期"));
check("不再显示计划未开始", !C.today.includes("计划未开始"));
check("热力格出现满档", /gcell l4/.test(C.trend));
check("连续打卡天数已计算", C.today.includes("连续 3 天</div>"), (C.today.match(/连续 \d+ 天<\/div>/) || [""])[0]);
check("今天未打卡时提示还差项", /还差 \d+ 项/.test(C.today));

/* ---------- D：W4 检查点周 ---------- */
console.log("\n— D 走到 W4 检查点周 —");
const D = render(null, (S) => { S.PLAN_START = "2026-09-21"; });
check("周数计算正确（第 4 周）", /第 4 \/ 26 周/.test(D.today), (D.today.match(/第 \d+ \/ \d+ 周/) || [""])[0]);
check("60% 起步周标记", D.today.includes("60% 起步周"));
check("减量周标记", D.today.includes("减量周 60%"));
check("★W4 基线检查点", D.today.includes("W4 基线"));
check("阶段为 M1 体检月", D.today.includes("M1 体检月"));
check("计划页显示 60% 起步", D.plan.includes("60% 起步"));

/* ---------- E：本机覆盖是否生效 ---------- */
console.log("\n— E 本机覆盖（seed.local.js）—");
if (!fs.existsSync(path.join(ROOT, "seed.local.js"))) {
  check("无 seed.local.js 时回落到模板", true, "本机没有覆盖文件，跳过");
} else {
  const E1 = render(null, null, { withLocal: true });
  check("本机覆盖已生效", E1.SEED.isLocal === true && !E1.plan.includes("50 万防御型配置"));
  const E2 = render(null, null, { withLocal: true, search: "?local=0" });
  check("?local=0 强制用中性模板", E2.plan.includes("50 万防御型配置"));
}

/* ---------- F：周复盘面板 ---------- */
console.log("\n— F 周复盘面板 —");
const F = render(cSeed, (S) => { S.PLAN_START = "2026-08-17"; }, { search: "?open=review" });
check("带本周实际统计", F.sheet.includes("已打卡天") && F.sheet.includes("本周投入") && F.sheet.includes("/7"));
check("四条线都在表单里", ["健身：", "英语：", "理财：", "AI："].every((s) => F.sheet.includes(s)));
check("有下周最重要的一件事", F.sheet.includes("下周最重要的一件事"));
check("有参考提示不靠记忆", F.sheet.includes("照着它写比凭记忆准"));

/* ---------- G：指标录入面板 ---------- */
console.log("\n— G 指标录入面板 —");
const G = render(null, null, { search: "?open=metrics" });
check("指标面板显示目标", G.sheet.includes("目标 15%"));
check("指标面板标注未录过", G.sheet.includes("还没录过"));
check("输入框是数字类型", G.sheet.includes('type="number"') && G.sheet.includes('inputmode="decimal"'));
check("有月份选择", G.sheet.includes('type="month"'));
check("提示留空不等于 0", G.sheet.includes("留空表示当月没有这一项"));
const G2 = render({ v: 1, settings: {}, baseline: {}, checkins: {}, reviews: {}, metrics: { "2026-10": { bodyfat: 25 }, "2026-11": { bodyfat: 23 } } }, null, { search: "?open=metrics" });
check("显示上一次的值与月份", G2.sheet.includes("上次 23%") && G2.sheet.includes("2026-11"));
check("显示目标与上次的按钮", render(null, null, {}).trend.includes("填入「"));

/* ---------- H：导入 xlsx 载荷（M1.5） ---------- */
console.log("\n— H 导入 xlsx 载荷 —");
const H = render(null, null, { search: "?test=1" });
check("测试钩子已挂载", !!H.__gl && typeof H.__gl.applyImport === "function");
if (H.__gl) {
  check("M1 → 2026-10", H.__gl.monthKeyOf("M1") === "2026-10", H.__gl.monthKeyOf("M1"));
  check("M12 → 2027-09", H.__gl.monthKeyOf("M12") === "2027-09", H.__gl.monthKeyOf("M12"));
  check("已是 YYYY-MM 的原样返回", H.__gl.monthKeyOf("2026-12") === "2026-12");
  H.__gl.applyImport({
    schema: "growth-loop.import.v1",
    metrics: { M1: { bodyfat: 25, weight: 70 }, "2026-12": { bodyfat: 20 } },
    baseline: { "英语水平": "A2" }
  });
  let st = JSON.parse(H.__gl.dump());
  check("指标按月落位", st.metrics["2026-10"] && st.metrics["2026-10"].bodyfat === 25 && st.metrics["2026-12"].bodyfat === 20);
  check("基线补空字段", st.baseline["英语水平"] === "A2");
  H.__gl.applyImport({ schema: "growth-loop.import.v1", metrics: { M1: { bodyfat: 19 } }, baseline: { "英语水平": "C1" } });
  st = JSON.parse(H.__gl.dump());
  check("重复导入不覆盖已有基线", st.baseline["英语水平"] === "A2");
  check("重复导入合并同月指标", st.metrics["2026-10"].weight === 70 && st.metrics["2026-10"].bodyfat === 19);
}

/* ---------- I：AI 周报（负载 / 本地桩 / 界面） ---------- */
console.log("\n— I AI 周报 —");
const I = render(cSeed, (S) => { S.PLAN_START = "2026-08-17"; }, { search: "?test=1" });
check("趋势页有 AI 周报卡", I.trend.includes("AI 周报") && I.trend.includes("btn-report"));
check("未配 Key 时明确标注", I.trend.includes("未配 Key"));
check("我的页有 AI 配置", I.mine.includes("AI 周报配置") && I.mine.includes("btn-ai-save"));
check("Key 输入是密码框且不在页面明文回显结构外", I.mine.includes('id="ai-key" type="password"'));
if (I.__gl) {
  const p = I.__gl.weeklyPayload("2026-10-13");
  check("负载字段固定不漂移",
    Object.keys(p).sort().join(",") === "byDomain,checkinDays,hours,metrics,note,plans,totalDays,week",
    Object.keys(p).sort().join(","));
  check("负载数字来自真实状态", typeof p.checkinDays === "number" && typeof p.hours === "number" && p.totalDays === 7,
    JSON.stringify({ days: p.checkinDays, hours: p.hours }));
  const stub = I.__gl.localStubReport({ week: 9, checkinDays: 3, totalDays: 7, hours: 11.5,
    byDomain: { fitness: 2, english: 1, ai: 3 }, metrics: {}, plans: {} });
  check("桩报告标了 mode=stub", stub.includes("mode=stub"));
  check("桩报告有数据来源与样本期", stub.includes("数据来源") && stub.includes("样本期"));
  const allow = new Set(["9", "3", "7", "11.5", "2", "1"]);
  const badNums = (stub.match(/\d+(?:\.\d+)?/g) || []).map((n) => String(Number(n))).filter((n) => !allow.has(n));
  check("桩报告只用输入里出现过的数字", badNums.length === 0, badNums.join(","));
  const cfg = I.__gl.aiConfig();
  check("默认没有 Key（不会把 Key 塞进仓库）", cfg.key === "");
}

/* ---------- 备份往返 ---------- */
console.log("\n— 备份往返 —");
const sample = { v: 1, settings: { theme: "dark" }, baseline: { weight: "70kg" }, checkins: { "2026-10-19": { strength_a: { s: "done" } } }, metrics: { "2026-10": { bodyfat: 22 } }, reviews: {} };
const back = JSON.parse(JSON.stringify(sample));
check("导出/导入结构自洽", back.checkins["2026-10-19"].strength_a.s === "done" && back.metrics["2026-10"].bodyfat === 22);

console.log(failed === 0 ? "\n全部通过" : "\n失败 " + failed + " 项");
process.exit(failed === 0 ? 0 : 1);
