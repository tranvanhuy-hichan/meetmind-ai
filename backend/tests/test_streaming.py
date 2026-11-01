"""Streaming while somebody speaks: live translation of growing text, recovery after a restart, polling economy."""
from __future__ import annotations

import asyncio

import httpx
import pytest

from adapters.bot.attendee import AttendeeBot
from adapters.bus.memory import MemoryBus
from core.models import Meeting, MeetingStatus, Segment, Translation
from core.services.recovery import recover_interrupted
from core.services.topics import meeting_topic
from core.services.translation import TranslationService

pytestmark = pytest.mark.timeout(20)


def seg(text: str, sid: str = "s1", lang: str = "vi") -> Segment:
    return Segment(id=sid, meeting_id="m", speaker="A", start_ms=0, end_ms=1000, text=text, lang=lang, is_final=False)


class SlowTranslator:
    """Takes a moment per call, like a real model, and records what it was asked to translate."""

    def __init__(self, delay: float = 0.05):
        self.calls: list[str] = []
        self.delay = delay

    async def translate(self, segments, target_lang, context=None, glossary=None):
        self.calls.append(segments[0].text)
        await asyncio.sleep(self.delay)
        return [Translation(segment_id=s.id, target_lang=target_lang, text=f"EN({s.text})") for s in segments]


class Repo:
    def __init__(self):
        self.saved: list[Translation] = []

    async def save_translation(self, tr):
        self.saved.append(tr)


async def _events(bus: MemoryBus):
    sub = bus.subscribe(meeting_topic("m"))
    return sub


async def test_growing_text_is_translated_live_but_only_the_newest_text_waits():
    bus, repo, translator = MemoryBus(), Repo(), SlowTranslator()
    service = TranslationService(translator, repo, bus, partials=True)
    sub = bus.subscribe(meeting_topic("m"))

    # five updates arrive while the first translation is still running
    tasks = [asyncio.create_task(service.translate_partial(seg(t), "en")) for t in ("Xin ch", "Xin chào", "Xin chào mọi", "Xin chào mọi người", "Xin chào mọi người ở đây")]
    await asyncio.gather(*tasks)

    shown = []
    while not sub.queue.empty():
        shown.append(sub.queue.get_nowait())
    assert translator.calls == ["Xin ch", "Xin chào mọi người ở đây"]  # the old in-between texts were skipped, not queued
    assert [e["text"] for e in shown] == ["EN(Xin ch)", "EN(Xin chào mọi người ở đây)"]
    assert all(e["partial"] is True and e["segment_id"] == "s1" for e in shown)
    assert repo.saved == []  # live translations are never stored


async def test_a_late_live_translation_never_overwrites_the_final_one():
    bus, repo, translator = MemoryBus(), Repo(), SlowTranslator(delay=0.1)
    service = TranslationService(translator, repo, bus, partials=True)
    sub = bus.subscribe(meeting_topic("m"))

    live = asyncio.create_task(service.translate_partial(seg("Xin chào"), "en"))
    await asyncio.sleep(0.02)  # the live translation is in flight...
    final = Segment(id="s1", meeting_id="m", speaker="A", start_ms=0, end_ms=1000, text="Xin chào mọi người", lang="vi")
    await service.translate_and_publish(final, "en")  # ...and the sentence ends
    await live

    events = []
    while not sub.queue.empty():
        events.append(sub.queue.get_nowait())
    assert [e["partial"] for e in events] == [False]  # only the final reached the readers
    assert events[0]["text"] == "EN(Xin chào mọi người)" and repo.saved[0].text == "EN(Xin chào mọi người)"


async def test_live_translation_can_be_switched_off_and_skips_tiny_or_same_language_text():
    translator = SlowTranslator(0)
    off = TranslationService(translator, Repo(), MemoryBus(), partials=False)
    await off.translate_partial(seg("Xin chào mọi người"), "en")
    on = TranslationService(translator, Repo(), MemoryBus(), partials=True)
    await on.translate_partial(seg("Xi"), "en")  # too short to be worth a call
    await on.translate_partial(seg("Xin chào", lang="en"), "en")  # already in the reader's language
    assert translator.calls == []


async def test_meetings_left_live_by_a_restart_are_closed_and_finalized():
    class MeetingRepo:
        def __init__(self):
            self.updates: dict[str, dict] = {}

        async def list_meetings_by_status(self, statuses):
            assert set(statuses) == {"bot_joining", "live"}
            return [Meeting(id="a", org_id="o", title="A", owner_id="u", invite_code="X"), Meeting(id="b", org_id="o", title="B", owner_id="u", invite_code="Y")]

        async def update_meeting(self, meeting_id, **fields):
            self.updates[meeting_id] = fields

    done: list[str] = []

    async def finalize(meeting_id: str) -> None:
        if meeting_id == "a":
            raise RuntimeError("LLM is down")  # one failure must not stop the other
        done.append(meeting_id)

    repo = MeetingRepo()
    assert await recover_interrupted(repo, finalize) == ["a", "b"]
    assert {k: v["status"] for k, v in repo.updates.items()} == {"a": MeetingStatus.ENDED.value, "b": MeetingStatus.ENDED.value}
    assert done == ["b"]


async def test_attendee_polls_only_what_changed_since_the_previous_poll():
    asked: list[str | None] = []

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if request.method == "POST":
            return httpx.Response(201, json={"id": "bot_1"})
        if path.endswith("/transcript"):
            asked.append(request.url.params.get("updated_after"))
            return httpx.Response(200, json=[])
        return httpx.Response(200, json={"state": "joined_recording" if len(asked) < 3 else "ended"})

    client = httpx.AsyncClient(base_url="http://attendee", transport=httpx.MockTransport(handler))
    bot = AttendeeBot("http://attendee", "k", poll_interval_s=0.001, state_every_s=0.0, client=client)
    await bot.join("m1", "https://meet.google.com/x")
    [_ async for _ in bot.events("m1")]

    assert asked[0] is None  # the first poll reads everything
    assert all(a is not None for a in asked[1:-1]) and len(asked) >= 3  # later polls only ask for changes
    assert asked[-1] is None  # the closing read at the end of the meeting is complete again


async def test_orphaned_bots_are_told_to_leave_after_a_restart():
    left: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "GET":
            assert sorted(request.url.params.get_list("states")) == sorted(
                ["joining", "waiting_room", "joined_not_recording", "joined_recording", "joined_recording_paused"]
            )
            return httpx.Response(200, json={"results": [{"id": "bot_a", "state": "joined_recording"}, {"id": "bot_b", "state": "joining"}]})
        left.append(request.url.path)
        return httpx.Response(200, json={}) if "bot_a" in request.url.path else httpx.Response(500)  # one of them refuses

    client = httpx.AsyncClient(base_url="http://attendee", transport=httpx.MockTransport(handler))
    bot = AttendeeBot("http://attendee", "k", client=client)
    assert await bot.release_orphans() == 1  # bot_b failed, and that does not stop the rest
    assert left == ["/api/v1/bots/bot_a/leave", "/api/v1/bots/bot_b/leave"]


async def test_recovery_releases_orphaned_bots_even_when_nothing_was_live():
    class EmptyRepo:
        async def list_meetings_by_status(self, statuses):
            return []

    calls: list[str] = []

    async def release() -> int:
        calls.append("released")
        return 2

    async def finalize(meeting_id: str) -> None:
        raise AssertionError("nothing to finalize")

    assert await recover_interrupted(EmptyRepo(), finalize, release) == []
    assert calls == ["released"]
