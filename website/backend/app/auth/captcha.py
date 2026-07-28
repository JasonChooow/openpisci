"""Simple SVG captcha for SMS send-code anti-abuse."""

from __future__ import annotations

import html
import secrets
import time
from dataclasses import dataclass

CAPTCHA_TTL_SECONDS = 180
_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


@dataclass
class _CaptchaEntry:
    answer: str
    expires_at: float


_store: dict[str, _CaptchaEntry] = {}


def reset_captcha_store() -> None:
    _store.clear()


def create_captcha() -> dict[str, str]:
    """Return ``{captcha_id, image_svg}`` for the client."""
    answer = "".join(secrets.choice(_ALPHABET) for _ in range(4))
    captcha_id = secrets.token_urlsafe(16)
    _store[captcha_id] = _CaptchaEntry(
        answer=answer.upper(),
        expires_at=time.time() + CAPTCHA_TTL_SECONDS,
    )
    return {
        "captcha_id": captcha_id,
        "image_svg": _render_svg(answer),
        "expires_in": str(CAPTCHA_TTL_SECONDS),
    }


def verify_captcha(captcha_id: str, captcha_code: str, *, consume: bool = True) -> bool:
    entry = _store.get(captcha_id)
    if entry is None:
        return False
    if time.time() > entry.expires_at:
        _store.pop(captcha_id, None)
        return False
    ok = entry.answer == str(captcha_code or "").strip().upper()
    if ok and consume:
        _store.pop(captcha_id, None)
    return ok


def _render_svg(text: str) -> str:
    """Lightweight SVG captcha without external image dependencies."""
    chars = list(text)
    spans = []
    for index, ch in enumerate(chars):
        x = 18 + index * 28
        rotate = secrets.randbelow(24) - 12
        y = 34 + (secrets.randbelow(7) - 3)
        color = secrets.choice(["#1d4ed8", "#0f766e", "#b45309", "#be123c", "#4338ca"])
        spans.append(
            f'<text x="{x}" y="{y}" fill="{color}" font-size="28" '
            f'font-family="DejaVu Sans, Arial, sans-serif" font-weight="700" '
            f'transform="rotate({rotate} {x},{y})">{html.escape(ch)}</text>'
        )
    noise = []
    for _ in range(6):
        x1, y1 = secrets.randbelow(130), secrets.randbelow(48)
        x2, y2 = secrets.randbelow(130), secrets.randbelow(48)
        noise.append(
            f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" '
            f'stroke="#94a3b8" stroke-width="1" opacity="0.7"/>'
        )
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="140" height="48" '
        'viewBox="0 0 140 48" role="img" aria-label="captcha">'
        '<rect width="140" height="48" rx="8" fill="#f8fafc"/>'
        + "".join(noise)
        + "".join(spans)
        + "</svg>"
    )
