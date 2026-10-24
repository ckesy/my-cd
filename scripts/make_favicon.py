#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从 public/DFLOGO1.png（东风圆环 logo，白底）生成站点图标：
  public/favicon.ico        (16/32/48 多尺寸，兼容 Safari / 旧浏览器)
  public/favicon-32.png
  public/favicon-16.png
  public/apple-touch-icon.png (180x180，白底，iOS 不认透明)
  public/logo-mark.png      (512x512 透明底，备用)
运行：/Users/lyn/.workbuddy/binaries/python/envs/default/bin/python scripts/make_favicon.py
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "public" / "DFLOGO1.png"
OUT = ROOT / "public"


def white_to_alpha(img: Image.Image, threshold: int = 246) -> Image.Image:
    """已有透明通道就直接用；纯白底才做抠白（alpha = 255 - min(r,g,b)）。"""
    if "A" in img.getbands() and img.convert("RGBA").split()[-1].getextrema()[0] < 250:
        return img.convert("RGBA")
    img = img.convert("RGB")
    px = img.load()
    w, h = img.size
    out = Image.new("RGBA", (w, h))
    opx = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            m = min(r, g, b)
            if m >= threshold:                       # 纯白/近白 → 全透明
                opx[x, y] = (r, g, b, 0)
            else:
                a = int((255 - m) * 255 / (255 - threshold))
                opx[x, y] = (r, g, b, min(255, a))
    return out


def trim(img: Image.Image, pad_ratio: float = 0.08) -> Image.Image:
    """裁掉透明留白，再按比例补边并补成正方形。"""
    bbox = img.split()[-1].getbbox()
    if bbox:
        img = img.crop(bbox)
    w, h = img.size
    side = int(max(w, h) * (1 + pad_ratio * 2))
    canvas = Image.new("RGBA", (side, side), (255, 255, 255, 0))
    canvas.paste(img, ((side - w) // 2, (side - h) // 2), img)
    return canvas


def square_icon(img: Image.Image, size: int) -> Image.Image:
    return img.resize((size, size), Image.LANCZOS)


def on_white(img: Image.Image, size: int) -> Image.Image:
    """铺白底（iOS apple-touch-icon 需要不透明）。"""
    bg = Image.new("RGB", (size, size), (255, 255, 255))
    bg.paste(img, (0, 0), img)
    return bg


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"缺少源图：{SRC}")

    master = trim(white_to_alpha(Image.open(SRC)))
    master.save(OUT / "logo-mark.png")

    sizes = {16: "favicon-16.png", 32: "favicon-32.png", 48: "favicon-48.png"}
    for size, name in sizes.items():
        square_icon(master, size).save(OUT / name)

    ico = [square_icon(master, s) for s in (16, 32, 48)]
    ico[0].save(
        OUT / "favicon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48)],
    )

    on_white(square_icon(master, 180), 180).save(OUT / "apple-touch-icon.png")
    print("done:", ", ".join(sorted(p.name for p in OUT.glob("favicon*"))))


if __name__ == "__main__":
    main()
