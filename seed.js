/* Growth Loop · 计划种子数据（中性模板）
 *
 * 这里只放通用示例数字，不含任何个人信息；你自己的真实数字写在 seed.local.js
 * （已被 .gitignore 忽略，不会进开源仓库）。
 *   1) 复制 seed.local.example.js 为 seed.local.js
 *   2) 在 seed.local.js 里覆盖下面的键
 *   3) 想看不带本地覆盖的纯模板效果：打开 index.html?local=0
 *
 * 改计划结构（周模板、阶段、里程碑、规则）直接改本文件。
 */
window.SEED = (function () {
  "use strict";

  var PLAN_START = "2026-10-19"; // W1 周一
  var PLAN_WEEKS = 26;

  /* 会被 seed.local.js 覆盖的个性化文案。默认值全是通用示例。 */
  var NEUTRAL = {
    bodyfat: "22% → 15%",
    weightTarget: "体重 60–62kg（保住瘦体重减脂）",
    waistTarget: "腰围 ≤84cm",
    capital: "50 万防御型配置",
    cashflow: "3% → 1250/月，4% → 1667/月",
    bondBatch: "债券底仓分 3 批建（约 20 万）"
  };

  /* ?local=0 时忽略本地覆盖，用于预览与截图 */
  var q = (typeof location !== "undefined" && location.search) ? location.search : "";
  var useLocal = q.indexOf("local=0") === -1;
  var local = (useLocal && typeof window !== "undefined" && window.SEED_LOCAL) ? window.SEED_LOCAL : {};
  var P = Object.assign({}, NEUTRAL, local);

  var DOMAINS = {
    fitness: { name: "健身", color: "#e8590c" },
    english: { name: "英语", color: "#1c7ed6" },
    finance: { name: "理财", color: "#2f9e44" },
    ai:      { name: "AI",   color: "#7048e8" },
    core:    { name: "全局", color: "#495057" }
  };

  /* 每周三种日子（周一~周日）。minutes 用于估算本周投入小时。
   * mvb = 最低版本，加班/生病时降级用。 */
  var WEEK_TEMPLATE = {
    1: [
      { id: "strength_a", title: "力量 A", domain: "fitness", minutes: 75, mvb: "30 个俯卧撑", hint: "深蹲 / 卧推 / 划船，5–8 次 × 3–4 组" },
      { id: "en_listen",  title: "英语精听", domain: "english", minutes: 60, mvb: "10 分钟影子跟读", hint: "听 3 遍 → 看文本 → 跟读 3 遍 → 复述" },
      { id: "ai_block",   title: "AI 块",   domain: "ai",      minutes: 90, mvb: "写 1 页 ADR", hint: "底层夯实 / 打卡应用开发 / 管理能力" }
    ],
    2: [
      { id: "cardio",     title: "Zone2 有氧", domain: "fitness", minutes: 50, mvb: "快走 15 分钟", hint: "快走 / 椭圆 / 骑车，能说话但微喘" },
      { id: "en_deep",    title: "英语深块",   domain: "english", minutes: 90, mvb: "10 分钟影子跟读", hint: "影子 20′ + AI 对话 30′ + 录音回听 20′ + 生词 20′" },
      { id: "ai_block",   title: "AI 块",     domain: "ai",      minutes: 90, mvb: "写 1 页 ADR", hint: "底层夯实 / 打卡应用开发 / 管理能力" }
    ],
    3: [
      { id: "strength_b", title: "力量 B", domain: "fitness", minutes: 75, mvb: "30 个俯卧撑", hint: "硬拉 / 推举 / 引体（或下拉）" },
      { id: "en_listen",  title: "英语精听", domain: "english", minutes: 60, mvb: "10 分钟影子跟读", hint: "同一段材料连做 5 天，第 5 天脱稿复述" },
      { id: "ai_block",   title: "AI 块",   domain: "ai",      minutes: 90, mvb: "写 1 页 ADR", hint: "底层夯实 / 打卡应用开发 / 管理能力" }
    ],
    4: [
      { id: "cardio",     title: "Zone2 有氧", domain: "fitness", minutes: 50, mvb: "快走 15 分钟", hint: "快走 / 椭圆 / 骑车" },
      { id: "en_deep",    title: "英语深块",   domain: "english", minutes: 90, mvb: "10 分钟影子跟读", hint: "影子 + AI 对话 + 录音回听 + 生词" },
      { id: "ai_block",   title: "AI 块",     domain: "ai",      minutes: 90, mvb: "写 1 页 ADR", hint: "底层夯实 / 打卡应用开发 / 管理能力" }
    ],
    5: [
      { id: "strength_c", title: "力量 C", domain: "fitness", minutes: 75, mvb: "30 个俯卧撑", hint: "全身复合动作，重量优先" },
      { id: "en_listen",  title: "英语精听", domain: "english", minutes: 60, mvb: "10 分钟影子跟读", hint: "精听 + 跟读" },
      { id: "finance_fri", title: "理财/记账", domain: "finance", minutes: 60, mvb: "记一笔账", hint: "读书 + 记账 + 每月最后一个周日做月复盘" }
    ],
    6: [
      { id: "cardio_long", title: "有氧 / 长走", domain: "fitness", minutes: 75, mvb: "快走 15 分钟", hint: "长距离快走，制造热量缺口" },
      { id: "ai_deep",     title: "AI 深块",     domain: "ai",      minutes: 120, mvb: "30 分钟", hint: "一周最长的一段，做最需要连续时间的事" },
      { id: "finance_read", title: "理财 / 读书", domain: "finance", minutes: 60, mvb: "记一笔账", hint: "当月书单，读完写 300 字" }
    ],
    0: [
      { id: "recovery",   title: "恢复运动", domain: "fitness", minutes: 60, mvb: "拉伸 10 分钟", hint: "走路 / 拉伸，不做力量" },
      { id: "en_test",    title: "英语周测", domain: "english", minutes: 75, mvb: "录 1 分钟独白", hint: "录音并与上周对比，这是最硬的进步证据" },
      { id: "write_doc",  title: "写长文 / 月复盘", domain: "ai", minutes: 60, mvb: "写 200 字", hint: "每月一篇 1500 字技术长文" },
      { id: "weekly_review", title: "周复盘", domain: "core", minutes: 60, mvb: "写一句话", hint: "四条线各一句：做到 / 没做到 / 下周改什么" }
    ]
  };

  /* 阶段与每月重点 */
  var STAGES = [
    { name: "M1 体检月", from: 1,  to: 4  },
    { name: "M2 地基期", from: 5,  to: 9  },
    { name: "M3 地基期", from: 10, to: 13 },
    { name: "M4 地基期", from: 14, to: 18 },
    { name: "M5 地基期", from: 19, to: 22 },
    { name: "M6 大考月", from: 23, to: 26 }
  ];

  var MONTH_FOCUS = {
    "M1 体检月": { ai: "底层：Transformer + 评测口径；读 alpha-pit-guard 21 条", finance: "资产负债表 + 应急金 + 读《金融市场基础知识》", book: "《小狗钱钱》" },
    "M2 地基期": { ai: "底层：训练链路 SFT/LoRA/DPO；第 1 页 ADR", finance: "保障落地 + 复盘分红分析 10 只候选股", book: "《指数基金投资指南》" },
    "M3 地基期": { ai: "底层：推理优化与成本核算；主持评审用 pit-guard 当模板", finance: "IPS 定稿（含分红规则）+ 三套组合对比", book: "《投资最重要的事》" },
    "M4 地基期": { ai: "管理：ADR 3–4 页（PIT 对齐 / 中性化 / 口径可比）", finance: P.bondBatch.replace("债券底仓", "底仓"), book: "《漫步华尔街》" },
    "M5 地基期": { ai: "管理：把研究规范写成 skill；带人；向上汇报", finance: "权益首批建仓（每月一批）", book: "《您厉害，您赚得多》" },
    "M6 大考月": { ai: "产出：打卡应用开源发布 + checklist 成稿 + 分享", finance: "建仓 60–70% + 现金流测算复盘", book: "《解读基金》" }
  };

  var RAMP_WEEKS = [1, 2, 3, 4];
  var DELOAD_WEEKS = [4, 8, 13, 17, 22, 26];
  var CHECKPOINTS = { 4: "W4 基线", 13: "W13 中期测试", 26: "W26 半年大考" };

  /* 四条线 M6 目标 */
  var GOALS = [
    { domain: "fitness", title: "体脂 " + P.bodyfat + "（薄肌）",
      items: [P.weightTarget, P.waistTarget, "深蹲 ≥1.2×体重、硬拉 ≥1.5×体重、引体 ≥8", "每周 0.3kg 的节奏，快了就是掉肌肉"] },
    { domain: "english", title: "A2 → B1（外企是下一站）",
      items: ["3 分钟工作话题不卡死", "熟悉主题技术视频听懂 70%", "核心词 +1500；累计精听 150h", "外企要的 B2 约在 2027 Q4"] },
    { domain: "finance", title: P.capital,
      items: ["IPS 一页成稿；建仓 60–70%", P.cashflow, "选标的第一标准是回撤，不是股息率", "K 线只学到能看懂，不用来做决策"] },
    { domain: "ai", title: "工程师 → AI 经理",
      items: ["开源打卡应用 v1.0 发布且每天在用", "《训练与推理 checklist》1 份", "ADR 6 页、技术长文 6 篇、评审 6 次", "管理能力是当前最大缺口"] }
  ];

  /* 里程碑 */
  var MILESTONES = [
    { at: "W4",  domain: "全部", text: "基线填完：体脂 / 腰围 / 力量 / 英语录音 / 资产负债表" },
    { at: "W13", domain: "健身", text: "体脂 ≈21%、训练出勤 ≥80%" },
    { at: "W13", domain: "英语", text: "48 音素过关；累计精听 ≥60h；能脱稿复述 1 分钟" },
    { at: "W13", domain: "理财", text: "IPS 定稿；记账 30 天；债券底仓建好" },
    { at: "W13", domain: "AI",   text: "打卡应用骨架跑通" },
    { at: "W26", domain: "健身", text: "体脂 15%、腰围达标、力量达标的线" },
    { at: "W26", domain: "英语", text: "讲 5 分钟不卡死；技术视频听懂 70%" },
    { at: "W26", domain: "理财", text: "建仓 60–70%；能不看稿讲清组合" },
    { at: "W26", domain: "AI",   text: "打卡应用 v1.0 开源发布且每天在用" }
  ];

  /* W1 逐日清单 */
  var W1 = [
    { date: "2026-10-19", title: "力量 A ＋ 英语基线", items: ["18:45 力量 A：深蹲 / 卧推 / 划船，空杆或轻重量 3×8，录视频自查", "20:00 录 2 分钟自我介绍，只录一次不许重录", "20:30 打卡应用 M0 开工（本仓库）"] },
    { date: "2026-10-20", title: "有氧 ＋ 音素诊断", items: ["18:45 Zone2 快走 30 分钟", "19:30 48 音素诊断，挑出最差 3 个音各练 5 分钟；选定精听材料后就固定", "20:30 审技术方案：数据模型别压扁、依赖别多"] },
    { date: "2026-10-21", title: "财务体检", items: ["19:30 英语精听第一段（听3遍→看文本→跟读3遍）", "20:30 资产负债表 + 现金流表，负债按利率排序，算出应急金缺口"] },
    { date: "2026-10-22", title: "力量 B", items: ["18:45 力量 B：硬拉 / 推举 / 引体，轻重量 3×8，录像自查", "20:00 音素练习 + 跟读", "20:45 数据模型定稿：模型没定死不许写业务代码"] },
    { date: "2026-10-23", title: "英语深块（第一次）", items: ["19:30 影子跟读 20′ + AI 对话 20′（允许尴尬）+ 录音回听", "20:45 把体检整理成一页，标出应急金目标金额"] },
    { date: "2026-10-24", title: "AI 长块", items: ["19:15 做到打卡能存、关掉再打开数据还在", "读 alpha-pit-guard 21 条，写下第 1 页 ADR：为什么本地优先而不是云同步"] },
    { date: "2026-10-25", title: "复盘 ＋ 周测", items: ["19:00 录第二段 2 分钟，和周一那段对比（W1 唯一必须交的英语证据）", "20:00 四条线各一句：做到 / 没做到 / 下周改什么", "21:00 排 W2（加到 70%）"] }
  ];

  /* 三条规则：不许破 */
  var RULES = [
    "W1–W4 只跑 60%，每 4 周一个减量周",
    "MVB 兜底：30 个俯卧撑 + 10 分钟影子跟读 + 记一笔账",
    "断一天不算失败，连断两天当天恢复，且不补课",
    "睡眠优先：连续 3 天不足 7.5h，当天砍掉 AI 块"
  ];

  return {
    PLAN_START: PLAN_START,
    PLAN_WEEKS: PLAN_WEEKS,
    DOMAINS: DOMAINS,
    WEEK_TEMPLATE: WEEK_TEMPLATE,
    STAGES: STAGES,
    MONTH_FOCUS: MONTH_FOCUS,
    RAMP_WEEKS: RAMP_WEEKS,
    DELOAD_WEEKS: DELOAD_WEEKS,
    CHECKPOINTS: CHECKPOINTS,
    GOALS: GOALS,
    MILESTONES: MILESTONES,
    W1: W1,
    RULES: RULES,
    isLocal: !!local && Object.keys(local).length > 0
  };
})();
