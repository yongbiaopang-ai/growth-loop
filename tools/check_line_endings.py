# -*- coding: utf-8 -*-
"""行尾巡检：列出仓库里仍是 CRLF 的追踪文本文件。

为什么需要它：`.gitattributes` 里写了 `eol=lf`，git 会**按 LF 存储**，
所以 `git status` 是干净的——但工作区文件可能仍是 CRLF，而 CRLF 会让
"文件被外部改动"的假象反复出现，干扰编辑与评审。check_all.py 把它接进总断言。

用法：python tools/check_line_endings.py
"""
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BINARY = {".png", ".jpg", ".jpeg", ".gif", ".ico", ".webp", ".xlsx", ".docx", ".zip"}

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


def tracked_files():
    out = subprocess.run(["git", "ls-files", "-z"], cwd=ROOT, capture_output=True,
                         encoding="utf-8", errors="replace")
    if out.returncode != 0:
        return None
    return [f for f in (out.stdout or "").split("\0") if f]


def main():
    files = tracked_files()
    if files is None:
        print("SKIP  不是 git 仓库或 git 不可用")
        return 0
    bad = []
    for f in files:
        if os.path.splitext(f)[1].lower() in BINARY:
            continue
        try:
            b = open(os.path.join(ROOT, f), "rb").read()
        except OSError as e:
            bad.append((f, "读取失败：%s" % e))
            continue
        if b.count(b"\r\n"):
            bad.append((f, b.count(b"\r\n")))
    if bad:
        print("FAIL  以下追踪文件仍是 CRLF（应为 LF）：")
        for f, n in bad:
            print("   %s  CRLF=%s" % (f, n))
        print("   修法：删掉这些文件后 `git checkout -- .`（git 会按 .gitattributes 以 LF 重建）")
        return 1
    print("PASS  追踪文件全部是 LF（共 %d 个）" % len(files))
    return 0


if __name__ == "__main__":
    sys.exit(main())
