#!/usr/bin/env python3
"""合成产品 OG 分享图（1200x630）。

为什么要本地合成文字：图像模型渲染中文标题经常糊字/错字，所以底图交给
Seedream 生成，标题、标语、要点的排版全部用 Pillow 精确绘制。

用法：
    # 1) 先生成底图（可选，仓库里已带一张）
    seedcli image '<prompt>' --size 1600x840 --no-watermark -o /tmp/og-bg.png

    # 2) 合成
    python3 scripts/make-og-image.py \
        --background /tmp/og-bg.png \
        --icon resources/icon.png \
        --out docs/assets/og-image.png
"""
from __future__ import annotations

import argparse
import os
import sys

from PIL import Image, ImageDraw, ImageFont

WIDTH, HEIGHT = 1200, 630
MARGIN = 76

# 中文字体候选（按可用性回退）。index 对应字体集合里的字重。
FONT_CANDIDATES = [
    ("/System/Library/Fonts/Hiragino Sans GB.ttc", 2),  # W6 粗
    ("/System/Library/Fonts/Hiragino Sans GB.ttc", 0),  # W3 细
    ("/System/Library/Fonts/STHeiti Medium.ttc", 1),
    ("/System/Library/Fonts/Supplemental/Songti.ttc", 1),
    ("/Library/Fonts/Arial Unicode.ttf", 0),
]

TITLE = "刊途 · Kantu"
TAGLINE = "为每一篇研究，找到合适的期刊"
BULLETS = [
    "输入标题与摘要，本地向量检索完成期刊匹配",
    "覆盖 72 本交通运输领域期刊，含 JCR / 中科院分区",
    "每刊给出 Top-3 证据论文，全流程离线不联网",
]
FOOTER = "macOS · 完全本地运行，无需远程 Embedding 服务"


def pick_font() -> tuple[str, int]:
    for path, index in FONT_CANDIDATES:
        if os.path.exists(path):
            try:
                ImageFont.truetype(path, 40, index=index)
                return path, index
            except OSError:
                continue
    raise SystemExit("找不到可用的中文字体")


def font(path: str, index: int, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size, index=index)


def load_background(path: str) -> Image.Image:
    im = Image.open(path).convert("RGB")
    # 轻微放大再裁切，避免拉伸变形
    scale = max(WIDTH / im.width, HEIGHT / im.height)
    im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
    left = (im.width - WIDTH) // 2
    top = (im.height - HEIGHT) // 2
    return im.crop((left, top, left + WIDTH, top + HEIGHT))


def apply_scrim(base: Image.Image) -> Image.Image:
    """左侧压暗，保证浅色文字在亮底图上也读得清。"""
    scrim = Image.new("L", (WIDTH, 1), 0)
    for x in range(WIDTH):
        if x <= WIDTH * 0.60:
            ratio = 1.0
        else:
            ratio = max(0.0, 1.0 - (x - WIDTH * 0.60) / (WIDTH * 0.34))
        scrim.putpixel((x, 0), int(232 * ratio))
    scrim = scrim.resize((WIDTH, HEIGHT))
    shade = Image.new("RGB", (WIDTH, HEIGHT), (3, 10, 24))
    return Image.composite(shade, base, scrim)


def rounded_icon(path: str, size: int) -> Image.Image:
    icon = Image.open(path).convert("RGBA").resize((size, size), Image.LANCZOS)
    mask = Image.new("L", (size * 4, size * 4), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size * 4 - 1, size * 4 - 1), radius=size * 4 // 5, fill=255)
    mask = mask.resize((size, size), Image.LANCZOS)
    icon.putalpha(mask)
    return icon


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--background", required=True)
    ap.add_argument("--icon", default="resources/icon.png")
    ap.add_argument("--out", default="docs/assets/og-image.png")
    args = ap.parse_args()

    font_path, _ = pick_font()
    canvas = apply_scrim(load_background(args.background))
    draw = ImageDraw.Draw(canvas)

    # 顶部：应用图标 + 品牌行
    y = MARGIN
    if os.path.exists(args.icon):
        icon_size = 74
        canvas.paste(rounded_icon(args.icon, icon_size), (MARGIN, y), rounded_icon(args.icon, icon_size))
        text_x = MARGIN + icon_size + 22
    else:
        text_x = MARGIN

    draw.text((text_x, y + 16), TITLE, font=font(font_path, 2, 46), fill=(255, 255, 255))

    # 标语
    y += 118
    draw.text((MARGIN, y), TAGLINE, font=font(font_path, 0, 34), fill=(226, 236, 250))

    # 蓝色分隔线
    y += 62
    draw.rounded_rectangle((MARGIN, y, MARGIN + 76, y + 4), radius=2, fill=(37, 99, 235))
    y += 30

    # 要点
    body = font(font_path, 0, 23)
    for item in BULLETS:
        draw.ellipse((MARGIN + 2, y + 9, MARGIN + 10, y + 17), fill=(96, 165, 250))
        draw.text((MARGIN + 26, y), item, font=body, fill=(178, 195, 218))
        y += 40

    # 页脚
    draw.text(
        (MARGIN, HEIGHT - MARGIN - 16),
        FOOTER,
        font=font(font_path, 0, 19),
        fill=(122, 140, 168),
    )

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    canvas.save(args.out, "PNG", optimize=True)
    print(f"已生成 {args.out}  {canvas.size[0]}x{canvas.size[1]}  ({os.path.getsize(args.out) // 1024}KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
