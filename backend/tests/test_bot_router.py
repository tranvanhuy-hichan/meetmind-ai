from __future__ import annotations

import pytest

from adapters.bot.router import PlatformBotRouter
from core.platforms import detect_platform


class _Bot:
    def __init__(self):
        self.joined: list[str] = []

    async def join(self, meeting_id, meet_url):
        self.joined.append(meet_url)

    async def leave(self, meeting_id): ...

    async def get_recording(self, meeting_id):
        return None


def test_detect_platform():
    assert detect_platform("https://meet.google.com/abc-defg-hij") == "meet"
    assert detect_platform("https://us02web.zoom.us/j/1?pwd=x") == "zoom"
    assert detect_platform("https://zoom.us/j/1") == "zoom"
    assert detect_platform("https://evilzoom.us/j/1") is None
    assert detect_platform("https://zoom.us.evil.com/j/1") is None
    assert detect_platform("") is None


@pytest.mark.asyncio
async def test_router_picks_bot_by_link():
    meet, zoom = _Bot(), _Bot()
    router = PlatformBotRouter({"meet": meet, "zoom": zoom})
    await router.join("m1", "https://meet.google.com/abc-defg-hij")
    await router.join("m2", "https://zoom.us/j/1")
    assert meet.joined == ["https://meet.google.com/abc-defg-hij"] and zoom.joined == ["https://zoom.us/j/1"]
