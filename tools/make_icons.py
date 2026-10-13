# -*- coding: utf-8 -*-
"""生成 PWA 图标（192 / 512）。用法：python tools/make_icons.py"""
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "icons")
BRAND = (31, 78, 121)
ACCENT = (55, 178, 77)


def rounded(size, radius, color):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=color)
    return img


def draw_icon(size):
    img = rounded(size, int(size * 0.22), BRAND)
    d = ImageDraw.Draw(img)
    # 进度环
    m = size * 0.22
    w = max(2, int(size * 0.055))
    d.arc([m, m, size - m, size - m], start=-90, end=210, fill=(255, 255, 255, 235), width=w)
    d.arc([m, m, size - m, size - m], start=215, end=265, fill=ACCENT, width=w)
    # 对勾
    p1 = (size * 0.33, size * 0.53)
    p2 = (size * 0.45, size * 0.66)
    p3 = (size * 0.69, size * 0.37)
    d.line([p1, p2], fill=(255, 255, 255, 255), width=int(size * 0.075), joint="curve")
    d.line([p2, p3], fill=(255, 255, 255, 255), width=int(size * 0.075), joint="curve")
    return img


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for s in (192, 512):
        p = os.path.join(OUT, "icon-%d.png" % s)
        draw_icon(s).save(p)
        print("wrote", p)
