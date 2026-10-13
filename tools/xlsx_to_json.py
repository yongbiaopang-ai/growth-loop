# -*- coding: utf-8 -*-
"""把《半年计划打卡表》xlsx 转成 Growth Loop 可导入的 JSON。

用法：
    python tools/xlsx_to_json.py <book.xlsx> -o import.json
    python tools/xlsx_to_json.py --sample -o data/sample.json    # 生成合成示例数据

设计原则（对应 M1.5 验收）：
1. 按**表头名**取值，不按列号 —— 缺列、多列、列序变化都不影响。
2. 工作表按**名字前缀模糊匹配** —— 表名带空格/括号/后缀也能认出来。
3. 空表、缺工作表、缺列一律不崩，只在 warnings 里说明。
4. 数值宽容解析："≤82" → 82，"1800-1900" 保持原文，"150h" → 150。
"""
import argparse
import datetime as dt
import json
import re
import sys

try:
    import openpyxl
except ImportError:  # pragma: no cover
    openpyxl = None

SCHEMA = "growth-loop.import.v1"

# 工作表名 → 内部键（按前缀匹配，忽略空格和括号内容）
SHEET_PREFIX = {
    "使用说明": "guide",
    "周打卡": "weekly",
    "指标追踪": "metrics",
    "里程碑": "milestones",
    "资金配置": "allocation",
    "月度复盘": "monthlyReviews",
    "书单与产出": "books",
    "本地量化项目素材": "assets",
}

# 指标表头 → 应用字段名
METRIC_HEADERS = {
    "体重kg": "weight",
    "体脂%": "bodyfat",
    "体脂": "bodyfat",
    "腰围cm": "waist",
    "深蹲kg": "squat",
    "硬拉kg": "deadlift",
    "引体个": "pullup",
    "静息心率": "rhr",
    "日均热量": "kcal",
    "蛋白g": "protein",
    "睡眠h": "sleep",
    "英语连续表达": "enMinutes",
    "累计精听h": "enHours",
    "累计输出次": "enOutput",
    "ai长文篇": "aiArticles",
    "adr页": "adr",
    "评审主持次": "reviews",
    "应急金": "emergency",
    "建仓比例": "investPct",
    "月度现金流": "cashflow",
    "净资产": "networth",
}


def norm(s):
    """去空格、去括号及括号内内容、统一小写，用于表名与表头匹配。"""
    s = str(s or "").strip()
    s = re.sub(r"[（(][^）)]*[）)]", "", s)
    return re.sub(r"\s+", "", s).lower()


def parse_num(v):
    """宽容取数：能变成数字就返回数字，否则返回 None。范围/区间保留为字符串。"""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return v
    s = str(v).strip()
    if not s:
        return None
    m = re.fullmatch(r"[≤≥<>约\s]*(-?\d+(?:\.\d+)?)\s*(?:kg|cm|%|h|g|元|万|次|页|个|分钟)?", s)
    if m:
        f = float(m.group(1))
        return int(f) if f.is_integer() else f
    return None


def parse_range_or_text(v):
    """目标行这种可能是 '25→15'、'≤82'、'1800-1900' 的，原样保留。"""
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def find_sheets(wb):
    """表名模糊匹配：返回 {内部键: 工作表名}。"""
    found = {}
    for name in wb.sheetnames:
        n = norm(name)
        for prefix, key in SHEET_PREFIX.items():
            if key in found:
                continue
            if n.startswith(norm(prefix)):
                found[key] = name
                break
    return found


def header_map(ws, header_row=1):
    """表头 → 列号。表头里的换行、空格、单位都归一化。"""
    m = {}
    if ws.max_row < header_row:
        return m
    for c in range(1, ws.max_column + 1):
        h = norm(ws.cell(row=header_row, column=c).value)
        if h and h not in m:
            m[h] = c
    return m


def pick(hmap, *names):
    """按候选表头名取列号。"""
    for n in names:
        k = norm(n)
        if k in hmap:
            return hmap[k]
        for hk, col in hmap.items():
            if hk.startswith(k) and len(k) >= 2:
                return col
    return None


def cell(ws, row, col):
    return ws.cell(row=row, column=col).value if col else None


def read_metrics(ws, warnings):
    """指标追踪(12个月)：row1 表头，row2 目标，其余为 M1..M12。"""
    hmap = header_map(ws)
    month_col = pick(hmap, "月份")
    if not month_col:
        warnings.append("指标追踪：找不到「月份」列，跳过")
        return {}, {}
    cols = {}
    for h, field in METRIC_HEADERS.items():
        c = pick(hmap, h)
        if c and field not in cols:
            cols[field] = c
    metrics, targets = {}, {}
    for r in range(2, ws.max_row + 1):
        label = str(cell(ws, r, month_col) or "").strip()
        if not label:
            continue
        values = {}
        for field, c in cols.items():
            raw = cell(ws, r, c)
            num = parse_num(raw)
            if num is not None:
                values[field] = num
        if norm(label) == "目标":
            targets = {f: parse_range_or_text(cell(ws, r, c)) for f, c in cols.items()
                       if parse_range_or_text(cell(ws, r, c)) is not None}
            continue
        if values:
            metrics[label] = values
    return metrics, targets


def read_weekly(ws, warnings):
    """周打卡(26周)：表头在 row1。数值列可能是空的（只有计划文案）。"""
    hmap = header_map(ws)
    week_col = pick(hmap, "周次")
    if not week_col:
        warnings.append("周打卡：找不到「周次」列，跳过")
        return []
    def c(*names):
        return pick(hmap, *names)
    cols = {
        "monday": c("周一"), "sunday": c("周日"), "stage": c("阶段"),
        "hours": c("投入h"), "workout": c("运动"), "calorieDays": c("热量达标"),
        "listenDays": c("英语精听"), "speakCount": c("英语输出"), "aiHours": c("AI小时", "AI 小时"),
        "aiTask": c("本周AI任务", "本周 AI 任务"), "financeTask": c("本周理财任务"),
        "reading": c("本周读书"), "reviewed": c("周复盘"), "note": c("一句话复盘"),
    }
    out = []
    for r in range(2, ws.max_row + 1):
        w = cell(ws, r, week_col)
        if w is None or str(w).strip() == "":
            continue
        row = {"week": int(w) if isinstance(w, (int, float)) else str(w).strip()}
        for field, col in cols.items():
            v = cell(ws, r, col)
            if v is None or str(v).strip() == "":
                continue
            row[field] = v if field in ("monday", "sunday", "stage") else (parse_num(v) if field != "aiTask" and field != "financeTask" and field != "reading" and field != "note" and field != "reviewed" else str(v).strip())
        out.append(row)
    return out


def read_table(ws, warnings, key="表"):
    """通用：表头行 + 若干数据行 → [ {表头: 值} ]。"""
    hmap = header_map(ws)
    if not hmap:
        warnings.append(f"{key}：没有表头，跳过")
        return []
    rows = []
    for r in range(2, ws.max_row + 1):
        item = {}
        for h, c in hmap.items():
            v = cell(ws, r, c)
            if v is None or str(v).strip() == "":
                continue
            item[h] = v
        if item:
            rows.append(item)
    return rows


def read_baseline(guide_ws, warnings):
    """使用说明里的基线表：A 列项目名，B 列数值。宽松抓取，抓不到就算了。"""
    if guide_ws is None:
        return {}
    out = {}
    for r in range(1, guide_ws.max_row + 1):
        a = guide_ws.cell(row=r, column=1).value
        b = guide_ws.cell(row=r, column=2).value
        if not a or b is None:
            continue
        key = norm(a)
        if not key or key.startswith("项目"):
            continue
        if any(k in key for k in ("身高", "体重", "体脂", "腰围", "英语", "本金", "应急金", "身高体重")):
            out[str(a).strip()] = str(b).strip()
    if not out:
        warnings.append("使用说明：没抓到基线行（正常，可能是空表）")
    return out


def convert(path):
    if openpyxl is None:
        raise RuntimeError("需要 openpyxl：用 bundled python 运行")
    wb = openpyxl.load_workbook(path, data_only=True)
    warnings = []
    sheets = find_sheets(wb)
    missing = [k for k in SHEET_PREFIX.values() if k not in sheets]
    if missing:
        warnings.append("缺少工作表：" + "、".join(missing))

    def ws(key):
        return wb[sheets[key]] if key in sheets else None

    metrics, targets = read_metrics(ws("metrics"), warnings) if ws("metrics") else ({}, {})
    weekly = read_weekly(ws("weekly"), warnings) if ws("weekly") else []
    milestones = read_table(ws("milestones"), warnings, "里程碑") if ws("milestones") else []
    allocation = read_table(ws("allocation"), warnings, "资金配置") if ws("allocation") else []
    monthly = read_table(ws("monthlyReviews"), warnings, "月度复盘") if ws("monthlyReviews") else []
    books = read_table(ws("books"), warnings, "书单与产出") if ws("books") else []
    assets = read_table(ws("assets"), warnings, "本地量化项目素材") if ws("assets") else []
    baseline = read_baseline(ws("guide"), warnings)

    return {
        "schema": SCHEMA,
        "generated": dt.datetime.now().isoformat(timespec="seconds"),
        "source": {"file": str(path).split("\\")[-1], "sheets": wb.sheetnames},
        "plan": {"start": "2026-10-19", "weeks": 26},
        "baseline": baseline,
        "metrics": metrics,
        "metricTargets": targets,
        "weekly": weekly,
        "milestones": milestones,
        "allocation": allocation,
        "monthlyReviews": monthly,
        "books": books,
        "assets": assets,
        "warnings": warnings,
    }


def make_sample():
    """生成合成历史数据：12 个月指标 + 26 周打卡，全部是编的，不含任何真实信息。"""
    months = []
    y, m = 2026, 10
    for _ in range(12):
        months.append(f"{y}-{m:02d}")
        m += 1
        if m > 12:
            m = 1
            y += 1
    metrics = {}
    for i, key in enumerate(months):
        metrics[key] = {
            "weight": round(72 - i * 0.55, 1),
            "bodyfat": round(24 - i * 0.8, 1),
            "waist": round(90 - i * 0.7, 1),
            "squat": 60 + i * 5,
            "deadlift": 80 + i * 6,
            "pullup": min(12, 3 + i),
            "sleep": 7.1 + (i % 3) * 0.2,
            "enHours": round(8 + i * 9.5, 1),
            "investPct": min(70, (i + 1) * 6),
        }
    weekly = []
    for w in range(1, 27):
        d = dt.date(2026, 10, 19) + dt.timedelta(weeks=w - 1)
        weekly.append({
            "week": w,
            "monday": d.isoformat(),
            "sunday": (d + dt.timedelta(days=6)).isoformat(),
            "stage": "示例阶段",
            "hours": round(16 + (w % 5) * 2.5, 1),
            "workout": 4 + (w % 2),
            "listenDays": 4 + (w % 3),
            "speakCount": 2 + (w % 2),
            "aiHours": round(6 + (w % 4) * 1.5, 1),
            "reviewed": "是" if w % 4 else "否",
        })
    return {
        "schema": SCHEMA,
        "generated": dt.datetime.now().isoformat(timespec="seconds"),
        "source": {"file": "（合成示例数据，非真实记录）", "sheets": []},
        "plan": {"start": "2026-10-19", "weeks": 26},
        "baseline": {},
        "metrics": metrics,
        "metricTargets": {},
        "weekly": weekly,
        "milestones": [],
        "allocation": [],
        "monthlyReviews": [],
        "books": [],
        "assets": [],
        "warnings": [],
    }


def main(argv=None):
    ap = argparse.ArgumentParser(description="打卡表 xlsx → Growth Loop 可导入 JSON")
    ap.add_argument("book", nargs="?", help="xlsx 路径")
    ap.add_argument("-o", "--out", default="import.json", help="输出 JSON")
    ap.add_argument("--sample", action="store_true", help="生成合成示例数据（不读 xlsx）")
    args = ap.parse_args(argv)

    data = make_sample() if args.sample else convert(args.book)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"写出 {args.out}")
    print(f"  指标月份 {len(data['metrics'])} 个 · 周记录 {len(data['weekly'])} 条 · "
          f"里程碑 {len(data['milestones'])} · 资金 {len(data['allocation'])} · 书 {len(data['books'])}")
    for w in data["warnings"]:
        print("  警告：" + w)
    return 0


if __name__ == "__main__":
    sys.exit(main())
