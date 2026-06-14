#!/usr/bin/env python3
"""Generate the app icon set from a brand mascot render.

Auto-detects light or dark backgrounds and flood-fills from the borders so
interior highlights are preserved, then crops to content, squares + pads,
and emits the full Tauri / frontend icon set.
"""
import argparse
import os
from collections import deque

import numpy as np
from PIL import Image, ImageFilter

ICONS_DIR = "src-tauri/icons"
PUBLIC = "public"

LIGHT_MIN = 208  # pixel counts as light background if every channel >= this
DARK_MAX = 45    # pixel counts as dark background if every channel <= this


def _flood_fill_bg(mask: np.ndarray) -> np.ndarray:
    h, w = mask.shape
    bg = np.zeros((h, w), dtype=bool)
    visited = np.zeros((h, w), dtype=bool)
    dq = deque()
    for x in range(w):
        for y in (0, h - 1):
            if mask[y, x] and not visited[y, x]:
                visited[y, x] = True
                dq.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if mask[y, x] and not visited[y, x]:
                visited[y, x] = True
                dq.append((y, x))
    while dq:
        y, x = dq.popleft()
        bg[y, x] = True
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx] and mask[ny, nx]:
                visited[ny, nx] = True
                dq.append((ny, nx))
    return bg


def _key_to_rgba(rgb: Image.Image, bg: np.ndarray) -> Image.Image:
    alpha = np.where(bg, 0, 255).astype(np.uint8)
    out = rgb.convert("RGBA")
    aimg = Image.fromarray(alpha, mode="L")
    aimg = aimg.filter(ImageFilter.GaussianBlur(0.8))
    out.putalpha(aimg)
    return out


def remove_light_background(im: Image.Image) -> Image.Image:
    rgb = im.convert("RGB")
    a = np.asarray(rgb).astype(np.int16)
    light = a.min(axis=2) >= LIGHT_MIN
    bg = _flood_fill_bg(light)
    return _key_to_rgba(rgb, bg)


def remove_dark_background(im: Image.Image) -> Image.Image:
    rgb = im.convert("RGB")
    a = np.asarray(rgb).astype(np.int16)
    dark = a.max(axis=2) <= DARK_MAX
    bg = _flood_fill_bg(dark)
    return _key_to_rgba(rgb, bg)


def detect_and_key(im: Image.Image) -> Image.Image:
    rgb = im.convert("RGB")
    w, h = rgb.size
    corners = [
        rgb.getpixel((0, 0)),
        rgb.getpixel((w - 1, 0)),
        rgb.getpixel((0, h - 1)),
        rgb.getpixel((w - 1, h - 1)),
    ]
    avg = sum(sum(c) for c in corners) / (len(corners) * 3)
    if avg < 128:
        return remove_dark_background(im)
    return remove_light_background(im)


def crop_square(im: Image.Image, pad_ratio: float = 0.06) -> Image.Image:
    bbox = im.split()[-1].getbbox()
    if not bbox:
        return im
    im = im.crop(bbox)
    w, h = im.size
    side = max(w, h)
    pad = int(side * pad_ratio)
    canvas = side + 2 * pad
    sq = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    sq.paste(im, ((canvas - w) // 2, (canvas - h) // 2), im)
    return sq


def export_hero(source_path: str, dest_path: str, max_size: int = 640) -> None:
    src = Image.open(source_path)
    keyed = detect_and_key(src)
    w, h = keyed.size
    if max(w, h) > max_size:
        scale = max_size / max(w, h)
        keyed = keyed.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    os.makedirs(os.path.dirname(dest_path) or ".", exist_ok=True)
    keyed.save(dest_path)


def main():
    parser = argparse.ArgumentParser(description="Generate Tauri + frontend icons from a PNG source.")
    parser.add_argument(
        "--source",
        default=os.environ.get("BRAND_ICON_SOURCE", "brands/xiaonuo/icon-source.png"),
        help="Path to mascot PNG (relative to repo root)",
    )
    parser.add_argument(
        "--hero",
        default="",
        help="Optional chat empty-state hero PNG (relative to repo root)",
    )
    args = parser.parse_args()
    if not os.path.isfile(args.source):
        print(f"Icon source not found: {args.source}")
        raise SystemExit(1)

    src = Image.open(args.source)
    keyed = detect_and_key(src)
    master = crop_square(keyed).resize((1024, 1024), Image.LANCZOS)

    os.makedirs(ICONS_DIR, exist_ok=True)

    def save_png(size, name):
        master.resize((size, size), Image.LANCZOS).save(os.path.join(ICONS_DIR, name))

    save_png(32, "32x32.png")
    save_png(64, "64x64.png")
    save_png(128, "128x128.png")
    save_png(256, "128x128@2x.png")
    save_png(512, "icon.png")

    for size, name in [
        (30, "Square30x30Logo.png"), (44, "Square44x44Logo.png"),
        (71, "Square71x71Logo.png"), (89, "Square89x89Logo.png"),
        (107, "Square107x107Logo.png"), (142, "Square142x142Logo.png"),
        (150, "Square150x150Logo.png"), (284, "Square284x284Logo.png"),
        (310, "Square310x310Logo.png"), (50, "StoreLogo.png"),
    ]:
        save_png(size, name)

    master.save(
        os.path.join(ICONS_DIR, "icon.ico"),
        sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )

    try:
        master.save(os.path.join(ICONS_DIR, "icon.icns"))
        icns = "ok"
    except Exception as e:  # noqa: BLE001
        icns = f"skipped ({e})"

    os.makedirs(PUBLIC, exist_ok=True)
    master.save(os.path.join(PUBLIC, "piscis.png"))
    master.save(os.path.join(PUBLIC, "app-icon.png"))

    if args.hero and os.path.isfile(args.hero):
        export_hero(args.hero, os.path.join(PUBLIC, "chat-empty-hero.png"))
        print(f"hero: {args.hero} -> public/chat-empty-hero.png")

    print("icon.icns:", icns)
    print("done")


if __name__ == "__main__":
    main()
