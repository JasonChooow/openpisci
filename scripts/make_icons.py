#!/usr/bin/env python3
"""Generate the app icon set from a brand mascot render.

Keys out the light background (flood fill from the borders so interior
highlights are preserved), crops to content, squares + pads it, then emits
the full Tauri / frontend icon set.
"""
import argparse
import os
from collections import deque

import numpy as np
from PIL import Image, ImageFilter

ICONS_DIR = "src-tauri/icons"
PUBLIC = "public"

LIGHT_MIN = 208  # pixel counts as background if every channel >= this


def remove_light_background(im: Image.Image) -> Image.Image:
    rgb = im.convert("RGB")
    a = np.asarray(rgb).astype(np.int16)
    h, w, _ = a.shape
    light = (a.min(axis=2) >= LIGHT_MIN)

    # Flood fill the "light" region starting from every border pixel so that
    # only background connected to the edge is removed (interior gold specular
    # highlights stay opaque).
    bg = np.zeros((h, w), dtype=bool)
    visited = np.zeros((h, w), dtype=bool)
    dq = deque()
    for x in range(w):
        for y in (0, h - 1):
            if light[y, x] and not visited[y, x]:
                visited[y, x] = True
                dq.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if light[y, x] and not visited[y, x]:
                visited[y, x] = True
                dq.append((y, x))
    while dq:
        y, x = dq.popleft()
        bg[y, x] = True
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx] and light[ny, nx]:
                visited[ny, nx] = True
                dq.append((ny, nx))

    alpha = np.where(bg, 0, 255).astype(np.uint8)
    out = rgb.convert("RGBA")
    aimg = Image.fromarray(alpha, mode="L")
    # Feather the matte edge by 1px for clean anti-aliased borders.
    aimg = aimg.filter(ImageFilter.GaussianBlur(0.8))
    out.putalpha(aimg)
    return out


def crop_square(im: Image.Image, pad_ratio: float = 0.06) -> Image.Image:
    bbox = im.split()[-1].getbbox()
    im = im.crop(bbox)
    w, h = im.size
    side = max(w, h)
    pad = int(side * pad_ratio)
    canvas = side + 2 * pad
    sq = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    sq.paste(im, ((canvas - w) // 2, (canvas - h) // 2), im)
    return sq


def main():
    parser = argparse.ArgumentParser(description="Generate Tauri + frontend icons from a PNG source.")
    parser.add_argument(
        "--source",
        default=os.environ.get("BRAND_ICON_SOURCE", "brands/xiaonuo/icon-source.png"),
        help="Path to mascot PNG (relative to repo root)",
    )
    args = parser.parse_args()
    if not os.path.isfile(args.source):
        print(f"Icon source not found: {args.source}")
        raise SystemExit(1)

    src = Image.open(args.source)
    keyed = remove_light_background(src)
    master = crop_square(keyed).resize((1024, 1024), Image.LANCZOS)

    os.makedirs(ICONS_DIR, exist_ok=True)

    def save_png(size, name):
        master.resize((size, size), Image.LANCZOS).save(os.path.join(ICONS_DIR, name))

    # Core Tauri icons
    save_png(32, "32x32.png")
    save_png(64, "64x64.png")
    save_png(128, "128x128.png")
    save_png(256, "128x128@2x.png")
    save_png(512, "icon.png")

    # Windows Store / tile logos present in the repo
    for size, name in [
        (30, "Square30x30Logo.png"), (44, "Square44x44Logo.png"),
        (71, "Square71x71Logo.png"), (89, "Square89x89Logo.png"),
        (107, "Square107x107Logo.png"), (142, "Square142x142Logo.png"),
        (150, "Square150x150Logo.png"), (284, "Square284x284Logo.png"),
        (310, "Square310x310Logo.png"), (50, "StoreLogo.png"),
    ]:
        save_png(size, name)

    # .ico (multi-size)
    master.save(os.path.join(ICONS_DIR, "icon.ico"),
                sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])

    # .icns (best effort; macOS bundle)
    try:
        master.save(os.path.join(ICONS_DIR, "icon.icns"))
        icns = "ok"
    except Exception as e:  # noqa: BLE001
        icns = f"skipped ({e})"

    # Frontend logo
    os.makedirs(PUBLIC, exist_ok=True)
    master.save(os.path.join(PUBLIC, "piscis.png"))

    print("icon.icns:", icns)
    print("done")


if __name__ == "__main__":
    main()
