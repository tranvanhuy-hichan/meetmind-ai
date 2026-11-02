"""Which meeting platform a link belongs to. Meet and Zoom are the two a meeting can be held on."""
from __future__ import annotations

import re
from urllib.parse import urlparse

from core.errors import Invalid

MEET = "meet"
ZOOM = "zoom"
PLATFORMS = (MEET, ZOOM)
LABEL = {MEET: "Google Meet", ZOOM: "Zoom"}


class MeetingLink(str):
    """A meeting URL that can carry the passcode of the meeting it was created with (Zoom's own link only holds it
    encrypted, which the embedded client cannot use)."""

    password: str | None = None

    def __new__(cls, url: str, password: str | None = None):
        link = super().__new__(cls, url)
        link.password = password
        return link


def zoom_meeting_number(url: str | None) -> str | None:
    match = re.search(r"/j/(\d{9,12})", url or "")
    return match.group(1) if match else None


def detect_platform(url: str | None) -> str | None:
    host = (urlparse(url or "").hostname or "").lower()
    if host == "meet.google.com":
        return MEET
    if host in ("zoom.us", "zoom.com") or host.endswith((".zoom.us", ".zoom.com")):
        return ZOOM
    return None


def validate_platform(platform: str | None) -> str:
    platform = platform or MEET
    if platform not in PLATFORMS:
        raise Invalid(f"Nền tảng họp không được hỗ trợ: {platform}")
    return platform


def check_url(url: str | None, platform: str) -> str | None:
    url = (url or "").strip()
    if not url:
        return None
    if not url.startswith("https://"):
        raise Invalid("Link cuộc họp phải bắt đầu bằng https://")
    if detect_platform(url) != platform:
        raise Invalid(f"Đây không phải link {LABEL[platform]}")
    return url
