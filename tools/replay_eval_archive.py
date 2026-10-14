# -*- coding: utf-8 -*-
"""用已存档的真机原始输出重放检查，证明"改了裁判"没有改掉已有判决。

为什么需要它（workbuddy 的复核要求原文）：
**改了裁判必须自证裁判没被改成偏向模型。** 光在报告里说"我放宽了规则"不算，
因为放宽正好能让模型通过。可验证的做法是：把改动前后的裁判，对**同一批已存档的
模型原始输出**各判一次，逐规则比对 k/N。判决重合，才说明改动的效果局限在"原来
判错的那几条"；有任何一条既有判决被改掉，本工具就退出 1。

为什么能这么做：真机 `--save` 的产物里存了每条每次的模型原始输出（`outputs`）
与每条规则的通过次数（`passed_runs`），所以重放不需要再花钱调模型。

默认只重放 `evals/baseline.v*.local.json`（修正后裁判跑出来的验收存档）。
`evals/baseline.local.json`（22:41 那次）是**修正前**的诊断存档，它当初用的裁判
已经不存在了，混在一起重放没有意义，所以刻意排除。

用法：
    python tools/replay_eval_archive.py                     # 重放全部验收存档
    python tools/replay_eval_archive.py --archive X.json    # 指定文件
    python tools/replay_eval_archive.py --allow-diff        # 只报告，不因判决变化失败
"""
import argparse
import glob
import io
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))

import eval_weekly_report as E  # noqa: E402

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

CASES = os.path.join(ROOT, "evals", "weekly_report.cases.json")


def load_cases():
    data = json.load(io.open(CASES, encoding="utf-8"))
    return {c["id"]: c for c in data["cases"]}


def replay(path, cases):
    """返回 (检查数, 变化列表, 缺用例列表)。变化项为 (case_id, rule, 存档k/N, 重算k/N)。"""
    arc = json.load(io.open(path, encoding="utf-8"))
    if arc.get("mode") != "real":
        return 0, [], ["%s 不是 real 存档，跳过" % os.path.basename(path)]
    changes, missing, checked = [], [], 0
    for r in arc.get("results", []):
        case = cases.get(r["id"])
        if case is None:
            missing.append(r["id"])
            continue
        outputs = r.get("outputs") or []
        n = r.get("runs", len(outputs))
        # 真机跑时跑器会把这两条纪律条款补进用例的检查清单，重放要照做，否则
        # 会拿"少了几条规则"的裁判去比，得出假的一致。
        import copy
        case = copy.deepcopy(case)
        for extra in ("no_investment_advice", "source_note"):
            if extra not in case.get("checks", []):
                case.setdefault("checks", []).append(extra)
        for d in r.get("details", []):
            rule = d["rule"]
            fn = E.RULES.get(rule)
            if fn is None:
                changes.append((r["id"], rule, d.get("passed_runs"), "规则已不存在"))
                continue
            allowed = E.allowed_numbers(case)
            k = 0
            for out in outputs:
                ok, _ = fn(out, case, allowed)
                if ok:
                    k += 1
            checked += 1
            if k != d.get("passed_runs"):
                changes.append((r["id"], rule, "%d/%d" % (d.get("passed_runs"), n), "%d/%d" % (k, n)))
    return checked, changes, missing


def main():
    ap = argparse.ArgumentParser(description="用存档的模型原始输出重放检查")
    ap.add_argument("--archive", action="append", default=None)
    ap.add_argument("--allow-diff", action="store_true", help="判决有变化也只报告不失败")
    args = ap.parse_args()

    paths = args.archive or sorted(glob.glob(os.path.join(ROOT, "evals", "baseline.v*.local.json")))
    if not paths:
        print("SKIP  没有找到验收存档（evals/baseline.v*.local.json）；开源用户没有存档也能跑通")
        return 0

    cases = load_cases()
    print("重放存档：%d 份" % len(paths))
    bad = 0
    total_checked = 0
    for p in paths:
        name = os.path.relpath(p, ROOT)
        checked, changes, missing = replay(p, cases)
        total_checked += checked
        tag = "OK  " if not changes else "DIFF"
        print("%s  %-42s 逐规则比对 %d 项" % (tag, name, checked))
        for cid, rule, was, now in changes:
            print("        ! %s / %s：存档 %s → 重算 %s" % (cid, rule, was, now))
        for m in missing:
            print("        - %s" % m)
        if changes:
            bad += 1

    print("-" * 68)
    print("逐规则比对合计 %d 项；判决有变化的存档 %d 份" % (total_checked, bad))
    if bad and not args.allow_diff:
        print("FAIL  改了裁判却改动了既有判决：要么是修错了，要么是放宽到偏向模型，逐条看上面的 DIFF。")
        return 1
    if bad:
        print("（--allow-diff：只报告，不算失败）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
