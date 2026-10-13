# -*- coding: utf-8 -*-
"""周报 prompt 的评测跑器（20 条可机检用例）。

用法：
    python tools/eval_weekly_report.py --mode stub                 # 离线跑桩，验证用例与检查器本身
    python tools/eval_weekly_report.py --mode real                 # 打真实模型（需 GL_LLM_KEY）
    python tools/eval_weekly_report.py --mode real --baseline evals/baseline.v1.json

两种模式的定位（重要）：
- stub：**只**验证用例与检查器能跑通、结论可机检。输出显式标 mode=stub。
  桩模式的结果**不得**作为「prompt 改动前后对比」的验收证据——那是用假数据冒充真实结果。
- real：打真实模型，按同一套规则机检，并把 token 与费用写到 gitignored 的本地文件。

Key 来源（绝不进仓库）：环境变量 GL_LLM_KEY。
可选：GL_LLM_BASE（默认 OpenAI 兼容端点）、GL_LLM_MODEL、GL_LLM_PRICE_IN / GL_LLM_PRICE_OUT（每百万 token 单价）。
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

NUM_RE = re.compile(r"\d+(?:\.\d+)?")


def numbers_in(text):
    """取文本里的数字（统一成字符串，22.0 与 22 视为同一个）。"""
    out = set()
    for m in NUM_RE.findall(str(text)):
        f = float(m)
        out.add(str(int(f)) if f.is_integer() else str(f))
    return out


# ---------------- 检查规则 ----------------
def rule_cite_numbers(out, case, allowed, minimum=3):
    hit = numbers_in(out) & allowed
    ok = len(hit) >= minimum
    return ok, "引用输入数字 %d 个（要求 ≥%d）" % (len(hit), minimum)


def rule_no_fabricated_numbers(out, case, allowed):
    extra = numbers_in(out) - allowed
    return (not extra), ("编造的数字：%s" % "、".join(sorted(extra))) if extra else "全部数字都来自输入"


def rule_source_note(out, case, allowed):
    ok = ("数据来源" in out) and ("样本期" in out)
    return ok, "有数据来源与样本期" if ok else "缺少数据来源或样本期"


def rule_no_investment_advice(out, case, allowed):
    hit = [w for w in ADVICE_WORDS if w in out]
    return (not hit), ("出现买卖建议表述：%s" % "、".join(hit)) if hit else "无买卖建议表述"


def rule_data_insufficient(out, case, allowed):
    ok = ("数据不足" in out) or ("无法判断" in out)
    return ok, "明确说了数据不足" if ok else "数据缺失但没有明说"


def rule_no_cross_period(out, case, allowed):
    ok = ("不可比" in out) or ("分别" in out)
    return ok, "多段样本期已分别说明" if ok else "多段样本期未分别说明"


def rule_flag_anomaly(out, case, allowed):
    ok = ("异常" in out) or ("请核对" in out)
    return ok, "已提示异常" if ok else "异常值未提示"


RULES = {
    "cite_numbers": rule_cite_numbers,
    "cite_numbers_strict": lambda o, c, a: rule_cite_numbers(o, c, a, minimum=4),
    "no_fabricated_numbers": rule_no_fabricated_numbers,
    "source_note": rule_source_note,
    "no_investment_advice": rule_no_investment_advice,
    "data_insufficient": rule_data_insufficient,
    "no_cross_period": rule_no_cross_period,
    "flag_anomaly": rule_flag_anomaly,
}


def run_checks(case, output):
    """对一条用例的输出跑它声明的全部检查。返回 (是否全过, 明细列表)。"""
    allowed = numbers_in(json.dumps(case.get("input", {}), ensure_ascii=False))
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
    with urllib.request.urlopen(req, timeout=60) as r:
        data = json.loads(r.read().decode("utf-8"))
    out = data["choices"][0]["message"]["content"]
    usage = data.get("usage", {}) or {}
    return out, usage


def log_cost(cfg, usage):
    """token 与费用写到 gitignored 的本地文件（每百万 token 成本 = M3 的交付物之一）。"""
    pin, pout = cfg["price_in"], cfg["price_out"]
    it, ot = usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0)
    cost = it / 1e6 * pin + ot / 1e6 * pout
    rec = {"model": cfg["model"], "prompt_tokens": it, "completion_tokens": ot,
           "price_in": pin, "price_out": pout, "cost": round(cost, 6)}
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
    ap.add_argument("--prompt", default=None, help="覆盖 prompt 文件路径（用于版本对比）")
    ap.add_argument("--baseline", default=None, help="与上一次 real 结果对比（仅 real 模式）")
    ap.add_argument("--save", default=None, help="把本次结果写到这里（供下次 --baseline 用）")
    args = ap.parse_args()

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
    print("周报 prompt 评测 · mode=%s · 用例 %d 条" % (args.mode, len(cases)))
    if args.mode == "stub":
        print("注意：stub 只验证用例与检查器，**不是**模型评测，不能当验收证据。")
    print("prompt：%s" % os.path.relpath(prompt_path, ROOT))
    print("=" * 68)

    prompt = io.open(prompt_path, encoding="utf-8").read()
    results, passed, total_cost = [], 0, 0.0

    for case in cases:
        if args.mode == "stub":
            output = case.get("stub_output", "")
            if "mode=stub" not in output:
                output = output + "\n(mode=stub)"
            usage = {}
        else:
            try:
                output, usage = call_model(prompt, case, cfg)
            except urllib.error.HTTPError as e:
                output, usage = "HTTPError %s: %s" % (e.code, e.read()[:200]), {}
            except Exception as e:  # 网络问题不该让整套跑崩
                output, usage = "ERROR %s" % e, {}
            if usage:
                total_cost += log_cost(cfg, usage)["cost"]

        if args.mode == "real":
            # 真实模型下把纪律条款也验一遍，防止 prompt 被改坏
            for extra in ("no_investment_advice", "source_note"):
                if extra not in case.get("checks", []):
                    case.setdefault("checks", []).append(extra)

        ok, details = run_checks(case, output)
        passed += 1 if ok else 0
        results.append({"id": case["id"], "category": case.get("category"), "ok": ok,
                        "details": [{"rule": r, "ok": o, "msg": m} for r, o, m in details]})
        print("%s  %-18s %-12s" % ("PASS" if ok else "FAIL", case["id"], case.get("category", "")))
        for r, o, m in details:
            if not o:
                print("        × %s：%s" % (r, m))

    print("-" * 68)
    print("结果：%d/%d 通过（mode=%s）" % (passed, len(cases), args.mode))
    if args.mode == "real" and cfg:
        print("本次费用：%.6f（价格单位：元/百万 token，可用 GL_LLM_PRICE_IN/OUT 设置）" % total_cost)

    if args.save:
        with io.open(args.save, "w", encoding="utf-8", newline="\n") as f:
            json.dump({"mode": args.mode, "prompt": os.path.relpath(prompt_path, ROOT), "results": results},
                      f, ensure_ascii=False, indent=2)
        print("已写结果：%s" % args.save)

    if args.baseline:
        if not os.path.exists(args.baseline):
            print("FAIL  找不到 baseline：%s" % args.baseline)
            return 1
        base = json.load(io.open(args.baseline, encoding="utf-8"))
        if base.get("mode") != "real":
            print("FAIL  baseline 不是 real 模式的结果，拒绝比较。")
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
