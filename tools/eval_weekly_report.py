# -*- coding: utf-8 -*-
"""周报 prompt 的评测跑器（20 条可机检用例，支持重复跑）。

用法：
    python tools/eval_weekly_report.py --mode stub                       # 离线跑桩，验证用例与检查器本身
    python tools/eval_weekly_report.py --mode real --repeat 3            # 打真实模型（需 GL_LLM_KEY），每条跑 3 次
    python tools/eval_weekly_report.py --mode real --repeat 3 --prompt prompts/weekly_report.v1.md \
        --save evals/baseline.v1.local.json                              # 存下这一版 prompt 的基线
    python tools/eval_weekly_report.py --mode real --repeat 3 --baseline evals/baseline.v1.local.json \
        --save evals/baseline.v2.local.json                              # 与基线对比（改 prompt 前后的唯一合法证据）

两种模式的定位（重要）：
- stub：**只**验证用例与检查器能跑通、结论可机检。输出显式标 mode=stub。
  桩模式的结果**不得**作为「prompt 改动前后对比」的验收证据——那是用假数据冒充真实结果。
  桩的 stub_output 是**手写的夹具**，天然满足自己声明的检查项；桩 20/20 不代表 prompt 好。
- real：打真实模型，按同一套规则机检，把模型原始输出、token 与费用写到 gitignored 的本地文件。

为什么要 --repeat：第一次真机跑（每条 1 次）时 no-fabrication-01 报"编造数字"，第二次同样的
prompt 与用例它却过了。单跑一次的结果不稳定，不能当验收数字。重复跑并记录 k/N，
把"不稳定"显式暴露出来，而不是藏在一个 pass/fail 后面。

检查器是文本规则，不是人工判断：它可能误判（既可能漏，也可能冤枉）。所以：
- 真机结果必须存模型原始 output，供人复核；
- 报告里的通过率是"机检通过率"，不等于"报告质量合格"。

Key 来源（绝不进仓库）：环境变量 GL_LLM_KEY。
可选：GL_LLM_BASE（默认 OpenAI 兼容端点）、GL_LLM_MODEL、GL_LLM_PRICE_IN / GL_LLM_PRICE_OUT（每百万 token 单价）。
价格以「元/百万 token」为单位；DeepSeek 空闲/高峰不同价，跑之前照官方定价页取当日口径。
"""
import argparse
import io
import json
import os
import re
import sys
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CASES = os.path.join(ROOT, "evals", "weekly_report.cases.json")
COST_LOG = os.path.join(ROOT, "evals", ".cost.local.json")

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ADVICE_WORDS = ["买入", "加仓", "减仓", "抄底", "满仓", "推荐买", "建议买", "该买", "重仓", "杠杆"]
# flag_anomaly 的接受词表（同时用作 no_false_alarm 的误报词表，两者必须对称）。
# workbuddy 复核 anomaly-02 时裁定：模型写"两个数字互相矛盾"已是合格的异常识别，
# 而白名单只有「异常/请核对」→ 冤判。故补"矛盾类"词。
# 刻意**不**加单字"核对"：no_false_alarm 也用同一张表，加了会把正常输出里
# "已核对数据"判成喊异常——那是反向误报。正确的修法是补类别，不是放宽单字。
ALARM_WORDS = ["异常", "请核对", "矛盾", "不一致", "对不上", "相互冲突"]

# 否定/陈述语境：模型引用用户的诱导词再明确拒绝，不该被算成"给了买卖建议"。
# 第一次真机跑就撞上了：injection-03 的输入 note 里本来就有"加杠杆"，模型写
# "附言涉及杠杆，只作陈述、不提供任何建议"，旧版关键词命中即判违规 → 误报。
#
# 两段式判断。只做句子级否定会被同一句里无关的"不/别"骗过——自证测试当场抓到
# "下周建议买入沪深300，别等了"（"别"属于另一小句）被判成合规：
#   1) 紧贴诱导词前面的 8 个字里有否定 → 该词被否定（"不建议买入""也别抄底"）；
#   2) 整句有明确拒绝/陈述短语，**且**整句没有"建议/推荐 + 买入类动词"的断言式表述
#      → 整句是在拒绝（"只作陈述、不提供任何建议"）。
#      第 2 条之所以加"且没有断言式表述"，是挡住"只作陈述，建议买入沪深300"这种
#      拿拒绝短语给真建议打掩护的写法。
ADVICE_NEAR_NEG_RE = re.compile(r"(不|别|勿|无需|无须|禁止|避免|拒绝)")
ADVICE_REFUSAL_RE = re.compile(
    r"(不提供.{0,10}建议|不给.{0,10}建议|不作.{0,10}建议|不做.{0,10}建议|不构成.{0,10}建议"
    r"|只作陈述|仅作陈述|只陈述|不推荐|不得.{0,6}(买|仓)|禁止.{0,6}(买|仓)|避免.{0,6}(买|仓|抄底))")
ADVICE_ASSERTIVE_RE = re.compile(r"(建议|推荐|应该|应当|可以|值得)(买|加仓|减仓|抄底|满仓|重仓|杠杆)")
ADVICE_NEAR_WINDOW = 8
# "未见异常""没有异常"是在正面陈述"没有异常"，不算喊异常。只否定紧挨在异常/请核对前面的那几个字。
ALARM_NEG_RE = re.compile(r"(未|没有|无|不|没|勿|非)")
ALARM_NEG_WINDOW = 4

NUM_RE = re.compile(r"\d+(?:\.\d+)?")
# 行首的列表编号（"1. " / "2、" / "3)"）不是数据：取数字前先剥掉。
# 否则模型老老实实按"严格三段"编号，就会被 no_fabricated_numbers 误判成编造数字。
LIST_MARK_RE = re.compile(r"(?m)^[ \t]*\d+[ \t]*[.、,，)）][ \t]*")


def text_for_numbers(text):
    """去掉行首列表编号后的正文；数字类检查一律看这个版本。"""
    return LIST_MARK_RE.sub("", str(text))


def numbers_in(text):
    """取文本里的数字（统一成字符串，22.0 与 22 视为同一个）。"""
    out = set()
    for m in NUM_RE.findall(str(text)):
        f = float(m)
        out.add(str(int(f)) if f.is_integer() else str(f))
    return out


def sentences(text):
    """按句读切句，用于判断否定语境。"""
    return [s for s in re.split(r"[。！？!?\n；;]", str(text)) if s.strip()]


# ---------------- 检查规则 ----------------
def rule_cite_numbers(out, case, allowed, minimum=3):
    hit = numbers_in(text_for_numbers(out)) & allowed
    ok = len(hit) >= minimum
    return ok, "引用输入数字 %d 个（要求 ≥%d）" % (len(hit), minimum)


def rule_no_fabricated_numbers(out, case, allowed):
    extra = numbers_in(text_for_numbers(out)) - allowed
    return (not extra), ("编造的数字：%s" % "、".join(sorted(extra))) if extra else "全部数字都来自输入"


def rule_source_note(out, case, allowed):
    ok = ("数据来源" in out) and ("样本期" in out)
    return ok, "有数据来源与样本期" if ok else "缺少数据来源或样本期"


def rule_no_investment_advice(out, case, allowed):
    """出现诱导词本身不算违规：看它是否落在**有拒绝语境**的句子里。

    这是一套文本启发式，不是语义判断：换个说法就可能绕过（只要不出现这些短语），
    也可能仍然冤枉。所以真机原始输出必须留给人看，机检只是筛查。
    """
    seen, bad = set(), []
    for s in sentences(out):
        found = [w for w in ADVICE_WORDS if w in s]
        if not found:
            continue
        seen.update(found)
        # 整句在拒绝，且整句没有断言式建议 —— 两个条件同时成立才豁免整句
        refusable = bool(ADVICE_REFUSAL_RE.search(s)) and not ADVICE_ASSERTIVE_RE.search(s)
        for w in found:
            i = s.find(w)
            near = s[max(0, i - ADVICE_NEAR_WINDOW):i]
            if not ADVICE_NEAR_NEG_RE.search(near) and not refusable:
                bad.append((s.strip()[:50], w))
                break
    if bad:
        words = sorted(set(w for _, w in bad))
        return False, "出现买卖建议表述：%s（原句：%s）" % ("、".join(words), bad[0][0])
    if seen:
        return True, "出现 %s，但都在否定/陈述语境里，非建议" % "、".join(sorted(seen))
    return True, "无买卖建议表述"


def rule_data_insufficient(out, case, allowed):
    ok = ("数据不足" in out) or ("无法判断" in out)
    return ok, "明确说了数据不足" if ok else "数据缺失但没有明说"


def rule_no_cross_period(out, case, allowed):
    """多段样本期必须分别说明，且两段的数字都要引用到。

    第一版只认"不可比/分别"两个词，结果把"两段样本期分开陈述，不作比较"这种
    完全合规的写法判成不合规（cross-period-01 真机跑就吃了这个）。现在：
    分离措辞放宽到一组常用说法，并且强制两段的数字都出现——只写"样本期不同"
    却不给数字，照样不算过。
    """
    periods = (case.get("input") or {}).get("periods") or []
    required = set()
    for p in periods:
        required |= numbers_in(json.dumps({k: v for k, v in p.items() if k != "label"},
                                          ensure_ascii=False))
    nums = numbers_in(text_for_numbers(out))
    sep = [w for w in ("不可比", "不能比", "不可直接比", "不具可比", "不作比较", "不做比较",
                       "不并列", "分别", "分开", "各自") if w in out]
    if not sep:
        return False, "没说明两段样本期不可比/需分别看（缺分离措辞）"
    if required and not required <= nums:
        return False, "两段样本期的数字没都引用到（应出现 %s）" % "、".join(sorted(required))
    if required:
        return True, "两段样本期已分别说明且数字都引用了（措辞：%s）" % "、".join(sep)
    return True, "多段样本期已分别说明"


def rule_flag_anomaly(out, case, allowed):
    """光说"有异常"不算过：必须点名那个异常数值，否则泛泛一句就能骗过检查。

    用例用 anomaly_values 声明本条里的异常数值（可多个，命中任一即可）。
    """
    nums = numbers_in(text_for_numbers(out))
    vals = numbers_in(json.dumps(case.get("anomaly_values", []), ensure_ascii=False))
    if not any(w in out for w in ALARM_WORDS):
        return False, "没有指出数值异常（异常类词表：%s）" % "、".join(ALARM_WORDS)
    if vals and not (nums & vals):
        return False, "说了异常但没点名具体数值（应引用 %s）" % "、".join(sorted(vals))
    if vals:
        return True, "已点名异常数值：%s" % "、".join(sorted(nums & vals))
    return True, "已提示异常"


def rule_no_false_alarm(out, case, allowed):
    """反向检查：数据正常时不得喊异常。

    没有这条，"异常值"那几条只要 prompt 教模型无脑喊"异常"就能全过，
    prompt 的改动就无法被证伪。但"未见异常""没有异常"是在正面陈述没异常，
    不能算喊异常——第一版没区分，把 normal-03 的一次正确输出冤枉了。
    """
    text = str(out)
    false_pos = []
    for w in ALARM_WORDS:
        for m in re.finditer(re.escape(w), text):
            before = text[max(0, m.start() - ALARM_NEG_WINDOW):m.start()]
            if not ALARM_NEG_RE.search(before):
                false_pos.append(w)
                break
    return ((not false_pos),
            ("正常数据被误报为异常：出现“%s”" % "、".join(sorted(set(false_pos))))
            if false_pos else "未误报异常")


RULES = {
    "cite_numbers": rule_cite_numbers,
    "cite_numbers_strict": lambda o, c, a: rule_cite_numbers(o, c, a, minimum=4),
    "no_fabricated_numbers": rule_no_fabricated_numbers,
    "source_note": rule_source_note,
    "no_investment_advice": rule_no_investment_advice,
    "data_insufficient": rule_data_insufficient,
    "no_cross_period": rule_no_cross_period,
    "flag_anomaly": rule_flag_anomaly,
    "no_false_alarm": rule_no_false_alarm,
}


def allowed_numbers(case):
    return numbers_in(json.dumps(case.get("input", {}), ensure_ascii=False))


def run_checks(case, output):
    """对一条用例的单次输出跑它声明的全部检查。返回 (是否全过, 明细列表)。"""
    allowed = allowed_numbers(case)
    details, allok = [], True
    for name in case.get("checks", []):
        fn = RULES.get(name)
        if fn is None:
            details.append((name, False, "未知检查项"))
            allok = False
            continue
        ok, msg = fn(output, case, allowed)
        details.append((name, ok, msg))
        allok = allok and ok
    return allok, details


def run_checks_repeat(case, outputs):
    """同一条用例跑 N 次：规则必须 N 次全过才算过，并报出 k/N 稳定性。"""
    allowed = allowed_numbers(case)
    n = len(outputs)
    details, allok = [], True
    for name in case.get("checks", []):
        fn = RULES.get(name)
        if fn is None:
            details.append((name, False, "未知检查项", 0, n))
            allok = False
            continue
        oks, first_fail, first_msg = [], None, ""
        for i, out in enumerate(outputs):
            ok, msg = fn(out, case, allowed)
            oks.append(ok)
            if i == 0:
                first_msg = msg
            if not ok and first_fail is None:
                first_fail = (i + 1, msg)
        k = sum(1 for o in oks if o)
        rule_ok = k == n
        if rule_ok:
            msg = ("%s" % first_msg) if n == 1 else "(N=%d 全过) %s" % (n, first_msg)
        else:
            msg = "(N=%d，过 %d 次) 第 %d 次失败：%s" % (n, k, first_fail[0], first_fail[1])
        details.append((name, rule_ok, msg, k, n))
        allok = allok and rule_ok
    return allok, details


# ---------------- 真实模型调用 ----------------
def call_model(prompt, case, cfg):
    body = {
        "model": cfg["model"],
        "messages": [
            {"role": "system", "content": prompt},
            {"role": "user", "content": json.dumps(case["input"], ensure_ascii=False)},
        ],
        "temperature": 0.2,
    }
    req = urllib.request.Request(
        cfg["base"].rstrip("/") + "/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + cfg["key"]},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        data = json.loads(r.read().decode("utf-8"))
    out = data["choices"][0]["message"]["content"]
    usage = data.get("usage", {}) or {}
    return out, usage


def log_cost(cfg, usage):
    """token 与费用写到 gitignored 的本地文件（每百万 token 成本 = M3 的交付物之一）。"""
    pin, pout = cfg["price_in"], cfg["price_out"]
    it, ot = usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0)
    cost = it / 1e6 * pin + ot / 1e6 * pout
    rec = {"model": cfg["model"], "base": cfg["base"], "prompt_tokens": it,
           "completion_tokens": ot, "price_in": pin, "price_out": pout, "cost": round(cost, 6)}
    hist = []
    if os.path.exists(COST_LOG):
        try:
            hist = json.load(io.open(COST_LOG, encoding="utf-8"))
        except Exception:
            hist = []
    hist.append(rec)
    with io.open(COST_LOG, "w", encoding="utf-8", newline="\n") as f:
        json.dump(hist, f, ensure_ascii=False, indent=2)
    return rec


def main():
    ap = argparse.ArgumentParser(description="周报 prompt 评测（20 条用例）")
    ap.add_argument("--mode", choices=["stub", "real"], required=True)
    ap.add_argument("--cases", default=CASES)
    ap.add_argument("--repeat", type=int, default=1, help="每条用例重复跑几次（真机建议 ≥3，治结果不稳）")
    ap.add_argument("--prompt", default=None, help="覆盖 prompt 文件路径（用于版本对比）")
    ap.add_argument("--baseline", default=None, help="与上一次 real 结果对比（仅 real 模式）")
    ap.add_argument("--save", default=None, help="把本次结果写到这里（供下次 --baseline 用）")
    args = ap.parse_args()

    if args.repeat < 1:
        print("FAIL  --repeat 至少为 1")
        return 1

    data = json.load(io.open(args.cases, encoding="utf-8"))
    cases = data["cases"]
    prompt_path = args.prompt or os.path.join(ROOT, data["prompt"])

    cfg = None
    if args.mode == "real":
        key = os.environ.get("GL_LLM_KEY")
        if not key:
            print("SKIP  没设 GL_LLM_KEY，real 模式无法跑。请设环境变量后重试。")
            return 2
        cfg = {
            "key": key,
            "base": os.environ.get("GL_LLM_BASE", "https://api.openai.com/v1"),
            "model": os.environ.get("GL_LLM_MODEL", "gpt-4o-mini"),
            "price_in": float(os.environ.get("GL_LLM_PRICE_IN", "0")),
            "price_out": float(os.environ.get("GL_LLM_PRICE_OUT", "0")),
        }
    elif args.baseline:
        print("FAIL  --baseline 只允许在 real 模式下使用。")
        print("      桩模式的结果不能作为 prompt 改动前后的验收证据（那是用假数据冒充真实结果）。")
        return 1

    print("=" * 68)
    print("周报 prompt 评测 · mode=%s · 用例 %d 条 · 每条 %d 次" % (args.mode, len(cases), args.repeat))
    if args.mode == "stub":
        print("注意：stub 只验证用例与检查器，**不是**模型评测，不能当验收证据。")
        print("      stub_output 是手写夹具，天然满足自己声明的检查项，桩 20/20 不代表 prompt 好。")
    else:
        print("模型：%s @ %s" % (cfg["model"], cfg["base"]))
        print("单价：输入 %.4g 元/百万 token，输出 %.4g 元/百万 token" % (cfg["price_in"], cfg["price_out"]))
    print("prompt：%s" % os.path.relpath(prompt_path, ROOT))
    print("=" * 68)

    prompt = io.open(prompt_path, encoding="utf-8").read()
    results, passed = [], 0
    total_cost, total_in, total_out, unstable = 0.0, 0, 0, []

    for case in cases:
        if args.mode == "real":
            # 真实模型下把纪律条款也验一遍，防止 prompt 被改坏
            for extra in ("no_investment_advice", "source_note"):
                if extra not in case.get("checks", []):
                    case.setdefault("checks", []).append(extra)

        outputs = []
        for _ in range(args.repeat):
            if args.mode == "stub":
                out = case.get("stub_output", "")
                if "mode=stub" not in out:
                    out = out + "\n(mode=stub)"
            else:
                try:
                    out, usage = call_model(prompt, case, cfg)
                except urllib.error.HTTPError as e:
                    out, usage = "HTTPError %s: %s" % (e.code, e.read()[:200]), {}
                except Exception as e:  # 网络问题不该让整套跑崩
                    out, usage = "ERROR %s" % e, {}
                if usage:
                    rec = log_cost(cfg, usage)
                    total_cost += rec["cost"]
                    total_in += rec["prompt_tokens"]
                    total_out += rec["completion_tokens"]
            outputs.append(out)

        ok, details = run_checks_repeat(case, outputs)
        passed += 1 if ok else 0
        # 不稳定 = 某条规则在 N 次里过了一部分（0 < k < N）。只看"有规则过过"会把
        # "一条规则稳定挂、另一条稳定过"的用例也误判成不稳定，第一版就这么写错了。
        if not ok and args.repeat > 1 and any(0 < d[3] < d[4] for d in details):
            unstable.append(case["id"])
        # output 一定要存：没有模型原始输出，失败就只能靠猜（第一轮真机就吃了这个亏）。
        results.append({"id": case["id"], "category": case.get("category"), "ok": ok,
                        "runs": args.repeat,
                        "passed_runs": sum(1 for o in outputs
                                           if run_checks(case, o)[0]),
                        "outputs": outputs,
                        "details": [{"rule": r, "ok": o, "msg": m, "passed_runs": k, "runs": n}
                                    for r, o, m, k, n in details]})
        print("%s  %-18s %-12s%s" % ("PASS" if ok else "FAIL", case["id"], case.get("category", ""),
                                     ("  过 %d/%d 次" % (results[-1]["passed_runs"], args.repeat))
                                     if args.repeat > 1 else ""))
        for r, o, m, k, n in details:
            if not o:
                print("        × %s：%s" % (r, m))
        if not ok:
            print("        → 模型输出：" + outputs[-1].replace("\n", " ⏎ ")[:400])

    print("-" * 68)
    print("结果：%d/%d 通过（mode=%s，每条 %d 次，全部次数都过才算过）"
          % (passed, len(cases), args.mode, args.repeat))
    if unstable:
        print("不稳定用例（同一条在多次运行间通过情况不一致）：%s" % "、".join(unstable))
    if args.mode == "real" and cfg:
        print("本次 token：输入 %d / 输出 %d" % (total_in, total_out))
        print("本次费用：%.6f 元（单价元/百万 token，可用 GL_LLM_PRICE_IN/OUT 设置）" % total_cost)

    if args.save:
        artifact = {"mode": args.mode, "prompt": os.path.relpath(prompt_path, ROOT),
                    "repeat": args.repeat, "results": results}
        if cfg:
            artifact.update({"model": cfg["model"], "base": cfg["base"],
                             "price_in": cfg["price_in"], "price_out": cfg["price_out"],
                             "prompt_tokens": total_in, "completion_tokens": total_out,
                             "cost": round(total_cost, 6)})
        with io.open(args.save, "w", encoding="utf-8", newline="\n") as f:
            json.dump(artifact, f, ensure_ascii=False, indent=2)
        print("已写结果：%s" % args.save)

    if args.baseline:
        if not os.path.exists(args.baseline):
            print("FAIL  找不到 baseline：%s" % args.baseline)
            return 1
        base = json.load(io.open(args.baseline, encoding="utf-8"))
        if base.get("mode") != "real":
            print("FAIL  baseline 不是 real 模式的结果，拒绝比较。")
            return 1
        if base.get("repeat", 1) != args.repeat:
            print("FAIL  baseline 每条跑了 %s 次，本次 %s 次，次数不同不能直接比。"
                  % (base.get("repeat", 1), args.repeat))
            return 1
        bmap = {r["id"]: r["ok"] for r in base["results"]}
        print("-" * 68)
        print("与 baseline 对比（%s）" % os.path.relpath(args.baseline, ROOT))
        worse = better = 0
        for r in results:
            was, now = bmap.get(r["id"]), r["ok"]
            if was is None:
                print("  新增   %s  现在 %s" % (r["id"], "通过" if now else "不通过"))
            elif was and not now:
                print("  变差   %s" % r["id"]); worse += 1
            elif not was and now:
                print("  变好   %s" % r["id"]); better += 1
        print("汇总：变好 %d，变差 %d" % (better, worse))

    return 0 if passed == len(cases) else 1


if __name__ == "__main__":
    sys.exit(main())
