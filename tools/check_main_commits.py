# -*- coding: utf-8 -*-
"""里程碑工作流检查：main 的直系历史里不得出现功能提交。

起因：M1.5 与 M3 两次把 `feat(...)` 提交直接落到 main（各自修过一次）。
原本想用 git pre-commit 钩子挡，但钩子要经 sh 运行，在某些受限环境里起不来，
而且钩子失败会把正常提交一起堵住——所以改成这个「随时可跑、失败只报不拦」的检查。

规则：`main` 的 first-parent 链上，除**根提交**与**合并提交**外，
其余提交标题不得以 feat( / fix( / perf( 开头——那些属于里程碑分支，应当通过 merge 进来。
允许：merge…、chore(main)…、docs…、chore…

用法：python tools/check_main_commits.py
"""
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FORBIDDEN = re.compile(r"^(feat|fix|perf)\s*\(")

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


def git(args):
    r = subprocess.run(["git"] + args, cwd=ROOT, capture_output=True,
                       text=True, encoding="utf-8", errors="replace")
    return r.returncode, (r.stdout or "").strip()


def main():
    rc, branch = git(["symbolic-ref", "--short", "HEAD"])
    if rc != 0:
        print("SKIP  当前不在分支上（分离头指针），跳过长检查")
        return 0
    if branch != "main":
        print("SKIP  当前在分支 %s；本检查只在 main 上执行" % branch)
        return 0

    rc, out = git(["log", "--first-parent", "--pretty=%H%x09%P%x09%s", "main"])
    if rc != 0:
        print("SKIP  读不到 main 的历史")
        return 0

    bad = []
    for line in out.splitlines():
        parts = line.split("\t")
        if len(parts) < 3:
            continue
        sha, parents, subject = parts[0], parts[1].strip(), parts[2].strip()
        if not parents:
            continue                      # 根提交豁免（仓库第一个提交）
        if len(parents.split()) > 1:
            continue                      # 合并提交豁免
        if FORBIDDEN.match(subject):
            bad.append((sha[:8], subject))

    if bad:
        print("FAIL  main 直系历史里出现了功能提交（应当走分支再 merge）：")
        for sha, s in bad:
            print("   %s  %s" % (sha, s))
        return 1

    print("PASS  main 直系历史只有合并与文档/杂项提交")
    return 0


if __name__ == "__main__":
    sys.exit(main())
