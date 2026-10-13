/* Growth Loop · 成长打卡
 * 纯前端、零依赖、数据只存本机。设计稿见 design/mockup.html，规范见 design/UI设计规范.md。
 * 改数据模型：同时改 KEY 版本号与 load()。
 */
(function () {
  "use strict";

  var S = window.SEED;
  var KEY = "growthloop.v1";
  var $ = function (sel) { return document.querySelector(sel); };

  var METRICS = [
    { key: "bodyfat",  label: "体脂 %",     unit: "%",  target: 15 },
    { key: "weight",   label: "体重 kg",    unit: "kg", target: 60 },
    { key: "waist",    label: "腰围 cm",    unit: "cm", target: 82 },
    { key: "enHours",  label: "英语累计 h", unit: "h",  target: 150 },
    { key: "investPct", label: "建仓 %",    unit: "%",  target: 65 },
    { key: "sleep",    label: "睡眠 h",     unit: "h",  target: 7.5 }
  ];

  /* ---------------- 日期 ---------------- */
  function pad(n) { return String(n).padStart(2, "0"); }
  function dstr(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function parseD(s) { var p = String(s).split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(s, n) { var d = parseD(s); d.setDate(d.getDate() + n); return dstr(d); }
  function today() { return dstr(new Date()); }
  function mondayOf(s) { var d = parseD(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return dstr(d); }
  function weekNo(s) { return Math.floor((parseD(mondayOf(s)) - parseD(S.PLAN_START)) / 604800000) + 1; }
  function wdName(d) { return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][d]; }
  function stageOf(w) {
    for (var i = 0; i < S.STAGES.length; i++) if (w >= S.STAGES[i].from && w <= S.STAGES[i].to) return S.STAGES[i].name;
    return "";
  }
  function monthOf(s) { return String(s).slice(0, 7); }

  /* ---------------- 状态 ---------------- */
  var state = load();
  var selDate = today();

  function blank() {
    return {
      v: 1,
      settings: { start: S.PLAN_START, reminder: "22:45", reviewReminder: "21:15", theme: "auto", style: "energy" },
      baseline: {}, checkins: {}, reviews: {}, metrics: {}
    };
  }
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return blank();
      var s = JSON.parse(raw);
      if (!s || typeof s !== "object") return blank();
      var b = blank();
      s.settings = Object.assign(b.settings, s.settings || {});
      s.baseline = s.baseline || {}; s.checkins = s.checkins || {};
      s.reviews = s.reviews || {}; s.metrics = s.metrics || {};
      return s;
    } catch (e) { console.warn("load failed", e); return blank(); }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { alert("保存失败：" + e.message); }
  }

  /* ---------------- 风格与主题 ---------------- */
  var STYLES = [
    { key: "energy", name: "活力", note: "靛蓝→亮蓝（默认）" },
    { key: "sport",  name: "运动", note: "珊瑚→洋红，冲一点" },
    { key: "neon",   name: "霓虹", note: "薄荷→电蓝，深色最好看" }
  ];

  /* 预览用：?style=neon&theme=dark 只在当前页面生效，不写进设置 */
  function param(name) {
    if (typeof URLSearchParams === "undefined") return null;
    try { return new URLSearchParams(location.search || "").get(name); } catch (e) { return null; }
  }

  function applyStyle() {
    var s = param("style") || state.settings.style || "energy";
    document.documentElement.setAttribute("data-style", s);
  }

  function applyTheme() {
    var t = param("theme") || state.settings.theme || "auto";
    var dark = t === "dark" || (t === "auto" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dark ? "#0F1120" : "#6C4CF1");
  }

  /* ---------------- 打卡核心 ---------------- */
  function tasksOf(dateStr) {
    return (S.WEEK_TEMPLATE[parseD(dateStr).getDay()] || []).map(function (t) { return Object.assign({}, t); });
  }
  function cell(dateStr, id) { var d = state.checkins[dateStr]; return (d && d[id]) || null; }
  function setCell(dateStr, id, val) {
    if (!state.checkins[dateStr]) state.checkins[dateStr] = {};
    if (val === null) delete state.checkins[dateStr][id];
    else state.checkins[dateStr][id] = val;
    if (!Object.keys(state.checkins[dateStr]).length) delete state.checkins[dateStr];
    save();
  }
  function isDecided(dateStr) {
    var ts = tasksOf(dateStr);
    return ts.length > 0 && ts.every(function (t) { return !!cell(dateStr, t.id); });
  }
  function doneMinutes(dateStr) {
    return tasksOf(dateStr).reduce(function (a, t) {
      var c = cell(dateStr, t.id);
      return a + (c ? (c.s === "mvb" ? Math.min(20, t.minutes) : t.minutes) : 0);
    }, 0);
  }
  function streak() {
    var n = 0, d = today();
    if (!isDecided(d)) d = addDays(d, -1);
    while (isDecided(d) && n < 400) { n++; d = addDays(d, -1); }
    return n;
  }

  /* ---------------- 今日 ---------------- */
  function renderToday() {
    var t0 = today();
    var isToday = selDate === t0;
    var w = weekNo(selDate);
    var stage = stageOf(w);
    var ts = tasksOf(selDate);
    var decided = ts.filter(function (t) { return !!cell(selDate, t.id); }).length;
    var done = doneMinutes(selDate);
    var planned = ts.reduce(function (a, t) { return a + t.minutes; }, 0);

    var badges = [];
    if (w < 1) badges.push('<span class="badge warn">计划未开始</span>');
    else {
      badges.push('<span class="badge">第 ' + w + ' / ' + S.PLAN_WEEKS + ' 周</span>');
      if (stage) badges.push('<span class="badge">' + stage + '</span>');
      if (S.RAMP_WEEKS.indexOf(w) > -1) badges.push('<span class="badge warn">60% 起步周</span>');
      if (S.DELOAD_WEEKS.indexOf(w) > -1) badges.push('<span class="badge warn">减量周 60%</span>');
      if (S.CHECKPOINTS[w]) badges.push('<span class="badge ok">★ ' + S.CHECKPOINTS[w] + '</span>');
    }

    var html = "";
    html += '<div class="day-head"><div class="day-date">' + selDate + " · " + wdName(parseD(selDate).getDay()) +
      (isToday ? "" : ' <span class="tag">补卡</span>') + '</div><div class="badges">' + badges.join("") + '</div></div>';

    html += weekStrip(selDate);

    if (w < 1) {
      var left = Math.round((parseD(S.PLAN_START) - parseD(t0)) / 86400000);
      html += '<div class="banner">距开跑还有 ' + left + ' 天（' + S.PLAN_START + '）。可以先把基线填了。</div>';
    }
    if (brokenStreak()) {
      html += '<div class="banner warn">已经断 2 天。今天恢复就算赢，别补课、别加量。</div>';
    }
    if (isSundayReviewDue(selDate)) {
      html += '<div class="banner">本周复盘还没写。<button class="chip on" id="btn-review-top" style="border:0">现在写</button></div>';
    }

    html += '<div class="card"><div class="prog"><div class="ring' +
      (ts.length && decided === ts.length ? " full" : "") + '" style="--p:' +
      (ts.length ? Math.round(decided / ts.length * 100) : 0) + '"><b>' + decided + "/" + ts.length + '</b></div>' +
      '<div class="txt"><b>' + (isToday ? "今天" : "那天") +
      (decided === ts.length && ts.length ? "已打卡完成" : "还差 " + (ts.length - decided) + " 项") + '</b>' +
      '<div class="sub" style="margin-top:2px">已投入 ' + done + " 分钟 / 计划 " + planned + ' 分钟</div>' +
      (streak() > 1 ? '<div class="sub">连续 ' + streak() + ' 天</div>' : "") + '</div></div></div>';

    var focus = S.MONTH_FOCUS[stage] || {};
    if (focus.ai) {
      html += '<div class="card"><div class="card-title">本周重点</div>' +
        '<div class="kv"><span><span class="dot" style="background:var(--ai)"></span> AI</span><b>' + focus.ai + '</b></div>' +
        '<div class="kv"><span><span class="dot" style="background:var(--finance)"></span> 理财</span><b>' + focus.finance + '</b></div>' +
        '<div class="kv"><span><span class="dot" style="background:var(--english)"></span> 读书</span><b>' + focus.book + '</b></div></div>';
    }

    if (!ts.length) html += '<div class="card sub">今天没有安排，休息日。</div>';
    else ts.forEach(function (t) { html += taskCard(selDate, t); });

    html += '<div class="card"><div class="card-title">三条不许破</div><ul class="sub" style="margin:0;padding-left:18px">' +
      S.RULES.map(function (r) { return "<li>" + r + "</li>"; }).join("") + '</ul></div>';

    $("#view-today").innerHTML = html;
    bindToday(selDate);
  }

  function weekStrip(sel) {
    var mon = mondayOf(sel);
    var t0 = today();
    var html = '<div class="weeknav"><div class="strip">';
    for (var i = 0; i < 7; i++) {
      var d = addDays(mon, i);
      var cls = "d";
      if (d === t0) cls += " today";
      if (d === sel) cls += " sel";
      if (d < t0) cls += isDecided(d) ? " done" : " miss";
      html += '<div class="' + cls + '" data-day="' + d + '"><i>' + wdName(parseD(d).getDay()).slice(1) + '</i><b>' + parseD(d).getDate() + '</b><s></s></div>';
    }
    return html + "</div></div>";
  }

  function taskCard(dateStr, t) {
    var dm = S.DOMAINS[t.domain] || { name: t.domain, color: "#666" };
    var c = cell(dateStr, t.id);
    var cls = "task" + (c ? " " + c.s : "");
    var html = '<div class="' + cls + '" data-id="' + t.id + '">';
    html += '<div class="row"><div class="name"><span class="dot" style="background:' + dm.color + '"></span>' + t.title + '</div>' +
      '<div class="meta">' + dm.name + " · " + t.minutes + "′</div></div>";
    html += '<div class="hint">' + t.hint + '</div>';
    html += '<div class="btns">';
    if (c) {
      var label = c.s === "done" ? "✓ 已完成" + (c.ts ? " " + timeOf(c.ts) : "") : (c.s === "mvb" ? "MVB 已记" : "已跳过");
      html += '<button class="btn on ' + c.s + '">' + label + '</button><button class="btn ghost" data-act="clear">撤销</button>';
    } else {
      html += '<button class="btn primary" data-act="done">完成</button>' +
        '<button class="btn ghost" data-act="more">降级 / 跳过</button>';
    }
    html += '</div>';
    if (c && c.s === "skip" && c.reason) html += '<div class="note">跳过原因：' + esc(c.reason) + '</div>';
    if (c && c.s === "mvb") html += '<div class="note">降级为 MVB：' + esc(t.mvb) + '</div>';
    if (t.id === "weekly_review") {
      var rv = state.reviews[mondayOf(dateStr)];
      if (rv) html += '<div class="note" style="color:var(--muted)">已写：' + esc(rv.text || "") + '</div>';
    }
    return html + "</div>";
  }

  function timeOf(ts) {
    var d = new Date(ts);
    return pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  function bindToday(dateStr) {
    Array.prototype.forEach.call(document.querySelectorAll("#view-today .strip .d"), function (el) {
      el.addEventListener("click", function () {
        var d = el.getAttribute("data-day");
        if (d > today()) return;
        selDate = d; save(); renderToday();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll("#view-today .task"), function (el) {
      var id = el.getAttribute("data-id");
      Array.prototype.forEach.call(el.querySelectorAll("[data-act]"), function (btn) {
        btn.addEventListener("click", function () {
          var act = btn.getAttribute("data-act");
          if (act === "clear") { setCell(dateStr, id, null); renderToday(); return; }
          if (act === "done") {
            if (id === "weekly_review") { openReview(dateStr); return; }
            setCell(dateStr, id, { s: "done", ts: Date.now() }); renderToday(); return;
          }
          if (act === "more") openMoreSheet(dateStr, el, id);
        });
      });
    });
    var rt = $("#btn-review-top");
    if (rt) rt.addEventListener("click", function () { openReview(dateStr); });
  }

  function openMoreSheet(dateStr, el, id) {
    var t = tasksOf(dateStr).filter(function (x) { return x.id === id; })[0] || {};
    openSheet("这一项怎么处理", null, [
      { label: "降级为 MVB", hint: t.mvb || "", value: "MVB" },
      { label: "加班", value: "加班" },
      { label: "生病", value: "生病" },
      { label: "临时有事", value: "临时有事" },
      { label: "其他", value: "其他" }
    ], function (v) {
      if (!v) return;
      if (v === "MVB") {
        if (id === "weekly_review") { openReview(dateStr); return; }
        setCell(dateStr, id, { s: "mvb", ts: Date.now() });
      } else {
        setCell(dateStr, id, { s: "skip", reason: v, ts: Date.now() });
      }
      renderToday();
    });
  }

  function isSundayReviewDue(dateStr) {
    if (parseD(dateStr).getDay() !== 0) return false;
    if (dateStr > today()) return false;
    return !state.reviews[mondayOf(dateStr)];
  }
  function brokenStreak() {
    var y = addDays(today(), -1), d2 = addDays(today(), -2);
    if (weekNo(today()) < 1) return false;
    return !isDecided(today()) && !isDecided(y) && !isDecided(d2) &&
      (!!state.checkins[y] || !!state.checkins[d2]);
  }

  /* ---------------- 计划 ---------------- */
  function renderPlan() {
    var rawW = weekNo(today());
    var w = Math.max(1, Math.min(S.PLAN_WEEKS, rawW));
    var stage = stageOf(w) || S.STAGES[0].name;
    var focus = S.MONTH_FOCUS[stage] || {};
    var weekLabel = rawW < 1 ? "即将开始 · 第 1 周" : "第 " + w + " 周";
    var html = "";

    html += '<div class="card"><div class="card-title">' + stage + " · " + weekLabel +
      (S.RAMP_WEEKS.indexOf(w) > -1 ? '<span class="tag warn">60% 起步</span>' : "") + '</div>';
    if (focus.ai) {
      html += '<div class="kv"><span>本周重点</span><b>' + focus.ai + '</b></div>' +
        '<div class="kv"><span>理财</span><b>' + focus.finance + '</b></div>' +
        '<div class="kv"><span>读书</span><b>' + focus.book + '</b></div>';
    }
    html += '</div>';

    html += '<div class="card"><div class="card-title">26 周进度<span class="tag muted">' + w + " / " + S.PLAN_WEEKS + '</span></div><div class="phase">';
    for (var i = 1; i <= S.PLAN_WEEKS; i++) {
      var cls = i === w ? "now" : (i < w ? "p3" : "p1");
      html += '<i class="' + cls + '"></i>';
    }
    html += '</div><div class="legend"><span>W1 开始</span><span>★W4 基线</span><span>★W13 中期</span><span>★W26 大考</span></div></div>';

    html += '<div class="card"><div class="card-title">四条线 · M6 验收</div>';
    S.GOALS.forEach(function (g) {
      var dm = S.DOMAINS[g.domain];
      html += '<div style="margin-bottom:12px"><div style="font-weight:600;font-size:13px;display:flex;gap:7px;align-items:center;margin-bottom:4px">' +
        '<span class="dot" style="background:' + dm.color + '"></span>' + g.title + '</div><ul class="sub" style="margin:0;padding-left:20px">' +
        g.items.map(function (x) { return "<li>" + x + "</li>"; }).join("") + '</ul></div>';
    });
    html += '</div>';

    html += '<div class="card"><div class="card-title">里程碑</div><div class="tl">' +
      S.MILESTONES.map(function (m) {
        return '<div class="it' + (m.at === "W4" ? " dim" : "") + '"><b>' + m.at + " · " + m.domain + '</b><div class="sub">' + m.text + '</div></div>';
      }).join("") + '</div></div>';

    html += '<div class="card"><div class="card-title">每周三种日子</div>' +
      '<div class="kv"><span>一 / 三 / 五</span><b>力量 75′ → 精听 60′ → AI 90′</b></div>' +
      '<div class="kv"><span>二 / 四</span><b>有氧 50′ → 深块 90′ → AI 90′</b></div>' +
      '<div class="kv"><span>周六</span><b>有氧 75′ → AI 深块 120′ → 理财 60′</b></div>' +
      '<div class="kv"><span>周日</span><b>恢复 60′ → 周测 75′ → 长文 60′ → 复盘 60′</b></div>' +
      '<div class="sub" style="margin-top:8px">窗口 18:00–23:00，每周有效投入约 28–30 小时。加班到 21:00 后只做 MVB。</div></div>';

    $("#view-plan").innerHTML = html;
  }

  /* ---------------- 趋势 ---------------- */
  var trendKey = "bodyfat";

  function renderTrend() {
    var m = METRICS.filter(function (x) { return x.key === trendKey; })[0] || METRICS[0];
    var months = Object.keys(state.metrics).sort();
    var pts = months.map(function (k) { return { x: k, v: Number(state.metrics[k][m.key]) }; })
      .filter(function (p) { return !isNaN(p.v); });

    var html = "";
    html += '<div class="chips">' + METRICS.map(function (x) {
      return '<button class="chip' + (x.key === trendKey ? " on" : "") + '" data-metric="' + x.key + '">' + x.label + '</button>';
    }).join("") + '</div>';

    html += '<div class="card"><div class="card-title">' + m.label +
      (pts.length ? '<span class="tag ok">目标 ' + m.target + m.unit + '</span>' : "") + '</div>';
    if (!pts.length) {
      html += '<div class="sub">还没有记录。点下面的按钮录一次，趋势就会出现。</div>';
    } else {
      html += chartSvg(pts, m.target);
      html += '<div class="legend"><span>最早 ' + pts[0].v + m.unit + "（" + pts[0].x + "）</span>" +
        '<span>最新 ' + pts[pts.length - 1].v + m.unit + "（" + pts[pts.length - 1].x + "）</span>" +
        '<span>目标 ' + m.target + m.unit + '</span></div>';
    }
    html += '<button class="btn wide" id="btn-metric">录入本月指标</button></div>';

    html += '<div class="card"><div class="card-title">26 周完成情况</div><div class="grid26">';
    var t0 = today();
    for (var w = 1; w <= S.PLAN_WEEKS; w++) {
      var mon = addDays(S.PLAN_START, (w - 1) * 7), past = 0, dec = 0;
      for (var k = 0; k < 7; k++) {
        var d = addDays(mon, k);
        if (d <= t0) { past++; if (isDecided(d)) dec++; }
      }
      var ratio = past ? dec / past : 0;
      var lvl = !past ? "" : ratio >= 0.85 ? "l4" : ratio >= 0.6 ? "l3" : ratio > 0 ? "l2" : "l1";
      html += '<span class="gcell ' + lvl + '">' + w + '</span>';
    }
    html += '</div><div class="legend"><span><i style="background:#fdece1"></i>&lt;60%</span>' +
      '<span><i style="background:#d3f9d8"></i>60–85%</span><span><i style="background:#37b24d"></i>≥85%</span>' +
      '<span><i style="background:var(--fill)"></i>未开始</span></div></div>';

    var rkeys = Object.keys(state.reviews).sort().reverse();
    html += '<div class="card"><div class="card-title">周复盘记录</div>';
    if (!rkeys.length) html += '<div class="sub">还没有周复盘。每周日 21:15 从今日页的「周复盘」任务进。</div>';
    else rkeys.slice(0, 8).forEach(function (k) {
      var r = state.reviews[k];
      html += '<div style="padding:8px 0;border-bottom:1px solid var(--line)"><b style="font-size:13px">' +
        k + " ~ " + addDays(k, 6) + '</b><div class="sub">' + esc(r.text || "") + '</div></div>';
    });
    html += '</div>';

    $("#view-trend").innerHTML = html;
    Array.prototype.forEach.call(document.querySelectorAll("#view-trend .chip"), function (b) {
      b.addEventListener("click", function () { trendKey = b.getAttribute("data-metric"); renderTrend(); });
    });
    $("#btn-metric").addEventListener("click", openMetricsSheet);
  }

  function chartSvg(pts, target) {
    var W = 300, H = 120, P = 12;
    var vals = pts.map(function (p) { return p.v; });
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    if (typeof target === "number") { min = Math.min(min, target); max = Math.max(max, target); }
    var span = max - min;
    if (span < 1e-9) { max = min + 1; span = 1; }
    min -= span * 0.08; max += span * 0.08; span = max - min;
    var n = pts.length;
    var X = function (i) { return n === 1 ? W / 2 : P + i * (W - 2 * P) / (n - 1); };
    var Y = function (v) { return P + (1 - (v - min) / span) * (H - 2 * P); };
    var poly = pts.map(function (p, i) { return X(i).toFixed(1) + "," + Y(p.v).toFixed(1); }).join(" ");
    var svg = '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none">';
    for (var g = 0; g <= 2; g++) {
      var y = P + g * (H - 2 * P) / 2;
      svg += '<line x1="' + P + '" y1="' + y + '" x2="' + (W - P) + '" y2="' + y + '" stroke="var(--line)"/>';
    }
    if (typeof target === "number") {
      var yt = Y(target);
      svg += '<line x1="' + P + '" y1="' + yt.toFixed(1) + '" x2="' + (W - P) + '" y2="' + yt.toFixed(1) +
        '" stroke="var(--ok)" stroke-dasharray="4 4"/>';
    }
    if (n > 1) svg += '<polyline fill="none" stroke="var(--brand)" stroke-width="2.5" points="' + poly + '"/>';
    pts.forEach(function (p, i) { svg += '<circle cx="' + X(i).toFixed(1) + '" cy="' + Y(p.v).toFixed(1) + '" r="3" fill="var(--brand)"/>'; });
    svg += '<circle cx="' + X(n - 1).toFixed(1) + '" cy="' + Y(pts[n - 1].v).toFixed(1) + '" r="4.5" fill="var(--ok)"/></svg>';
    return svg;
  }

  /* ---------------- 我的 ---------------- */
  function renderMine() {
    var b = state.baseline;
    var themeName = { auto: "跟随系统", light: "浅色", dark: "深色" }[state.settings.theme || "auto"];
    var html = "";

    html += '<div class="card"><div class="card-title">基线' +
      (b.weight ? '<span class="tag">已填</span>' : '<span class="tag warn">待填</span>') + '</div>' +
      '<div class="kv"><span>身高 / 体重</span><b>' + (b.height || "—") + " / " + (b.weight || "—") + '</b></div>' +
      '<div class="kv"><span>体脂 / 腰围</span><b>' + (b.bodyfat || "—") + " / " + (b.waist || "—") + '</b></div>' +
      '<div class="kv"><span>英语水平</span><b>' + (b.english || "—") + '</b></div>' +
      '<div class="kv"><span>本金</span><b>' + (b.capital || "—") + '</b></div>' +
      '<div class="kv"><span>应急金缺口</span><b>' + (b.emergency || "—") + '</b></div>' +
      '<button class="btn wide" id="btn-baseline">编辑基线</button></div>';

    html += '<div class="card"><div class="card-title">提醒</div>' +
      '<div class="kv"><span>每日打卡</span><b>' + state.settings.reminder + '</b></div>' +
      '<div class="kv"><span>周日复盘</span><b>' + state.settings.reviewReminder + '</b></div>' +
      '<div class="banner info" style="margin:10px 0 0">网页不能主动推送通知，请用手机自带闹钟兜底。</div></div>';

    html += '<div class="card"><div class="card-title">外观<span class="tag">' +
      (STYLES.filter(function (s) { return s.key === (state.settings.style || "energy"); })[0] || STYLES[0]).name + '</span></div>' +
      '<div class="sub" style="margin-bottom:6px">风格</div>' +
      '<div class="chips">' + STYLES.map(function (s) {
        return '<button class="chip' + ((state.settings.style || "energy") === s.key ? " on" : "") + '" data-style-set="' + s.key + '">' + s.name + '</button>';
      }).join("") + '</div>' +
      '<div class="sub" style="margin-bottom:6px">明暗</div>' +
      '<div class="chips">' + ["auto", "light", "dark"].map(function (k) {
        return '<button class="chip' + ((state.settings.theme || "auto") === k ? " on" : "") + '" data-theme-set="' + k + '">' +
          { auto: "跟随系统", light: "浅色", dark: "深色" }[k] + '</button>';
      }).join("") + '</div><div class="sub">当前：' + themeName + '</div></div>';

    html += '<div class="card"><div class="card-title">备份</div>' +
      '<button class="btn wide" id="btn-export">导出备份（JSON）</button>' +
      '<button class="btn wide" id="btn-import">从文件导入</button>' +
      '<button class="btn wide" id="btn-copy">复制到剪贴板</button>' +
      '<input type="file" id="file-in" accept="application/json,.json" hidden>' +
      '<div class="sub">数据只在这台设备。建议每周日导出一次。</div></div>';

    html += '<div class="card"><div class="card-title">关于</div>' +
      '<div class="sub">Growth Loop v0.2 · 本地优先 · MIT 开源<br>打卡 ' + Object.keys(state.checkins).length +
      ' 天 · 记录 ' + Object.keys(state.metrics).length + ' 个月指标</div>' +
      '<button class="btn wide danger" id="btn-clear">清空所有数据</button></div>';

    $("#view-mine").innerHTML = html;
    $("#btn-baseline").addEventListener("click", openBaselineSheet);
    $("#btn-export").addEventListener("click", exportFile);
    $("#btn-copy").addEventListener("click", copyBackup);
    $("#btn-import").addEventListener("click", function () { $("#file-in").click(); });
    $("#file-in").addEventListener("change", importFile);
    $("#btn-clear").addEventListener("click", clearAll);
    Array.prototype.forEach.call(document.querySelectorAll("#view-mine [data-theme-set]"), function (b2) {
      b2.addEventListener("click", function () {
        state.settings.theme = b2.getAttribute("data-theme-set");
        save(); applyTheme(); renderMine();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll("#view-mine [data-style-set]"), function (b3) {
      b3.addEventListener("click", function () {
        state.settings.style = b3.getAttribute("data-style-set");
        save(); applyStyle(); renderMine();
      });
    });
  }

  /* ---------------- 表单面板 ---------------- */
  function openSheet(title, sub, options, cb) {
    var box = $("#modal");
    box.innerHTML = '<div class="modal-mask"></div><div class="sheet"><div class="sheet-title">' + title + '</div>' +
      (sub ? '<div class="sheet-sub">' + sub + '</div>' : "") +
      options.map(function (o) {
        return '<button class="sheet-btn" data-v="' + esc(o.value) + '">' + esc(o.label) +
          (o.hint ? '<span class="h">' + esc(o.hint) + '</span>' : "") + '</button>';
      }).join("") + '<button class="sheet-btn cancel" data-v="">取消</button></div>';
    box.classList.add("on");
    box.querySelector(".modal-mask").addEventListener("click", close);
    Array.prototype.forEach.call(box.querySelectorAll("[data-v]"), function (b) {
      b.addEventListener("click", function () {
        var v = b.getAttribute("data-v");
        close(); if (v) cb(v);
      });
    });
    function close() { box.classList.remove("on"); box.innerHTML = ""; }
  }

  function openForm(title, fields, values, onSave) {
    var box = $("#modal");
    var html = '<div class="modal-mask"></div><div class="sheet"><div class="sheet-title">' + title + '</div>';
    fields.forEach(function (f) {
      var v = values && values[f.key] != null ? esc(values[f.key]) : "";
      html += '<div class="field"><label>' + f.label + '</label>';
      if (f.type === "textarea") html += '<textarea id="f-' + f.key + '">' + v + '</textarea>';
      else html += '<input id="f-' + f.key + '" type="' + (f.type || "text") + '" value="' + v + '" placeholder="' + esc(f.ph || "") + '">';
      html += '</div>';
    });
    html += '<button class="sheet-btn primary" id="form-ok">保存</button><button class="sheet-btn cancel" id="form-cancel">取消</button></div>';
    box.innerHTML = html;
    box.classList.add("on");
    box.querySelector(".modal-mask").addEventListener("click", close);
    $("#form-cancel").addEventListener("click", close);
    $("#form-ok").addEventListener("click", function () {
      var out = {};
      fields.forEach(function (f) { var el = $("#f-" + f.key); out[f.key] = el ? el.value.trim() : ""; });
      close(); onSave(out);
    });
    function close() { box.classList.remove("on"); box.innerHTML = ""; }
  }

  function openReview(dateStr) {
    var key = mondayOf(dateStr);
    var cur = state.reviews[key] || {};
    var fields = [
      { key: "fitness", label: "健身：做到 / 没做到" },
      { key: "english", label: "英语：做到 / 没做到" },
      { key: "finance", label: "理财：做到 / 没做到" },
      { key: "ai", label: "AI：做到 / 没做到" },
      { key: "text", label: "下周最重要的一件事", type: "textarea" }
    ];
    openForm("周复盘 · " + key + " ~ " + addDays(key, 6), fields, cur, function (v) {
      var text = v.text || [v.fitness, v.english, v.finance, v.ai].filter(Boolean).join("；");
      state.reviews[key] = Object.assign({}, v, { text: text, ts: Date.now() });
      setCell(dateStr, "weekly_review", { s: "done", ts: Date.now() });
      save(); renderToday();
    });
  }

  function openMetricsSheet() {
    var month = monthOf(today());
    var cur = state.metrics[month] || {};
    var fields = [{ key: "__month", label: "月份（YYYY-MM）" }].concat(
      METRICS.map(function (m) { return { key: m.key, label: m.label + "（目标 " + m.target + m.unit + "）" }; })
    );
    var values = Object.assign({}, cur); values.__month = month;
    openForm("录入指标", fields, values, function (v) {
      var k = v.__month || month;
      if (!state.metrics[k]) state.metrics[k] = {};
      METRICS.forEach(function (m) {
        var raw = v[m.key];
        if (raw === "" || raw == null) delete state.metrics[k][m.key];
        else state.metrics[k][m.key] = Number(raw);
      });
      if (!Object.keys(state.metrics[k]).length) delete state.metrics[k];
      save(); renderTrend();
    });
  }

  function openBaselineSheet() {
    var fields = [
      { key: "height", label: "身高" }, { key: "weight", label: "体重" },
      { key: "bodyfat", label: "体脂率" }, { key: "waist", label: "腰围" },
      { key: "english", label: "英语水平" }, { key: "capital", label: "本金 / 到账时间" },
      { key: "emergency", label: "应急金缺口" }
    ];
    openForm("编辑基线", fields, state.baseline, function (v) {
      state.baseline = v; save(); renderMine();
    });
  }

  /* ---------------- 备份 ---------------- */
  function exportFile() {
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "growth-loop-backup-" + today() + ".json";
    document.body.appendChild(a); a.click(); a.remove();
  }
  function copyBackup() {
    var txt = JSON.stringify(state);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(function () { alert("已复制，粘到备忘录即可。"); },
        function () { openForm("手动复制下面的备份", [{ key: "j", label: "内容", type: "textarea" }], { j: txt }, function () {}); });
    } else {
      openForm("手动复制下面的备份", [{ key: "j", label: "内容", type: "textarea" }], { j: txt }, function () {});
    }
  }
  function importFile(e) {
    var f = e.target.files[0];
    if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var obj = JSON.parse(r.result);
        if (!obj || !obj.checkins) throw new Error("不是 Growth Loop 的备份文件");
        var b = blank();
        state = Object.assign(b, obj);
        state.settings = Object.assign(b.settings, obj.settings || {});
        state.baseline = obj.baseline || {};
        save(); applyTheme(); renderAll();
        alert("导入成功：打卡 " + Object.keys(state.checkins).length + " 天。");
      } catch (err) { alert("导入失败：" + err.message); }
    };
    r.readAsText(f);
    e.target.value = "";
  }
  function clearAll() {
    if (!confirm("确定清空所有打卡数据？不可撤销，建议先导出备份。")) return;
    state = blank(); save(); applyTheme(); selDate = today(); renderAll();
  }

  /* ---------------- 工具与导航 ---------------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  var TABS = ["today", "plan", "trend", "mine"];
  function showTab(name) {
    TABS.forEach(function (t) { $("#view-" + t).classList.toggle("on", t === name); });
    Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (b) {
      b.classList.toggle("on", b.getAttribute("data-tab") === name);
    });
    location.hash = name;
    if (name === "today") renderToday();
    if (name === "plan") renderPlan();
    if (name === "trend") renderTrend();
    if (name === "mine") renderMine();
    window.scrollTo(0, 0);
  }
  function renderAll() { renderToday(); renderPlan(); renderTrend(); renderMine(); }

  function boot() {
    applyStyle();
    applyTheme();
    Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (b) {
      b.addEventListener("click", function () { showTab(b.getAttribute("data-tab")); });
    });
    var hash = (location.hash || "").replace("#", "");
    showTab(TABS.indexOf(hash) > -1 ? hash : "today");

    if (window.matchMedia) {
      try {
        window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () {
          if ((state.settings.theme || "auto") === "auto") applyTheme();
        });
      } catch (e) { /* 老浏览器忽略 */ }
    }
    if ("serviceWorker" in navigator && location.protocol !== "file:") {
      navigator.serviceWorker.register("sw.js").catch(function (e) { console.warn("SW 注册失败", e); });
    }
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
