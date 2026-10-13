# -*- coding: utf-8 -*-
"""一键跑完全部测试，并断言仓库干净。

用法：
    python tools/check_all.py

总断言：跑完两个测试套件后 `git status --porcelain` 必须为空。
这条比任何单点断言都值钱——它同时挡住"测试原地改写被追踪文件"和
"行尾被改回去"这两类问题，这两类都真实发生过。

node 位置：优先 GL_NODE 环境变量，其次 PATH。都没找到就跳过 Node 套件并提示，
不在代码里写死绝对路径（那会把本机路径与用户名带进仓库）。
"""
import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Windows 控制台默认 gbk，子进程输出里的替换字符会让 print 直接抛 UnicodeEncodeError
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


def run(cmd, label):
    print("── %s ──" % label)
    print("$ " + " ".join(cmd))
    # 子进程输出是 UTF-8；同时给子进程钉住 PYTHONIOENCODING，避免它按 gbk 写管道
    env = dict(os.environ, PYTHONIOENCODING="utf-8")
    r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True,
                       encoding="utf-8", errors="replace", env=env)
    lines = (r.stdout or "").strip().splitlines()
    for ln in lines[-4:]:
        print("   " + ln)
    if r.returncode != 0:
        for ln in (r.stderr or "").strip().splitlines()[-5:]:
            print("   ! " + ln)
    print("   → 退出码 %d" % r.returncode)
    return r.returncode


def porcelain():
    """返回 git status --porcelain 的行列表；git 不可用返回 None。"""
    r = subprocess.run(["git", "status", "--porcelain"], cwd=ROOT,
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        return None
    return [l for l in (r.stdout or "").splitlines() if l.strip()]


def main():
    bad = 0
    # 先记录开跑前的工作区状态：断言的是"测试没有新增副作用"，
    # 不是"你此刻没有未提交的改动"——否则在开发中途跑必然误报。
    before = porcelain()
    if before is None:
        print("SKIP  git 不可用，跳过后面的工作区清洁检查")
    else:
        print("── 开跑前工作区 ──\n   %s" % ("干净" if not before else "已有 %d 处改动（开发中途正常）" % len(before)))

    bad += 1 if run([sys.executable, "tools/test_xlsx_import.py"], "导入器测试（Python）") != 0 else 0
    bad += 1 if run([sys.executable, "tools/check_main_commits.py"], "工作流检查（main 上不许有功能提交）") != 0 else 0

    node = os.environ.get("GL_NODE") or shutil.which("node")
    if node:
        bad += 1 if run([node, "tools/smoke_test.js"], "应用冒烟测试（Node）") != 0 else 0
    else:
        print("── 应用冒烟测试（Node）──\nSKIP  没找到 node；设 GL_NODE 或用 PATH 里的 node")

    print("── 工作区清洁（总断言）──")
    after = porcelain()
    if before is None or after is None:
        print("SKIP  git 不可用，跳过")
    else:
        new = [l for l in after if l not in before]
        if new:
            print("FAIL  测试留下了副作用（新出现的改动）：")
            for l in new:
                print("   " + l)
            bad += 1
        else:
            print("PASS  测试未留下任何副作用（git status 与开跑前一致）")
            if not after:
                print("      且工作区当前是干净的")
            print("      边界：只看得到 git 可见的变化。被 .gitignore 忽略的产物")
            print("      （seed.local.js、临时截图目录等）不在本断言覆盖范围内——")
            print("      它们不进仓库，但也意味着本工具证明不了它们没被动过。")

    print("\n全部通过" if bad == 0 else "\n失败 %d 项" % bad)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
