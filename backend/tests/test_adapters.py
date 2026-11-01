"""Adapters and small core helpers, against mocked servers."""
from __future__ import annotations

import json

import httpx
import pytest

from adapters.bot.attendee import AttendeeBot
from adapters.llm.openai_compat import LLMError, OpenAICompatLLM
from core.languages import guess_lang
from core.prompts import PromptLibrary
from core.services.minutes import minutes_from_dict


def test_prompt_library_picks_highest_version(tmp_path):
    (tmp_path / "hello.v1.md").write_text("old {{name}}")
    (tmp_path / "hello.v2.md").write_text("new {{name}}")
    assert PromptLibrary(tmp_path).render("hello", {"name": "A"}) == "new A"
    with pytest.raises(FileNotFoundError):
        PromptLibrary(tmp_path).render("missing", {})


def test_guess_lang():
    assert guess_lang("Chào mọi người, hôm nay chúng ta họp") == "vi"
    assert guess_lang("Hello everyone, welcome") == "en"


def test_minutes_drops_unknown_evidence_and_empty_items():
    raw = {
        "summary": " ok ",
        "topics": ["A", "", None],
        "decisions": [{"text": "Chốt", "evidence_segment_id": "ghost"}, {"text": ""}, "bad"],
        "action_items": [{"task": "Làm", "owner": "B", "due_date": "15/11", "evidence_segment_id": "s1"}, {"owner": "x"}],
    }
    minutes = minutes_from_dict(raw, {"s1"})
    assert minutes.summary == "ok" and minutes.topics == ["A"]
    assert [d.evidence_segment_id for d in minutes.decisions] == [None]
    assert len(minutes.action_items) == 1 and minutes.action_items[0].evidence_segment_id == "s1"


def _llm(tmp_path, handler) -> OpenAICompatLLM:
    (tmp_path / "t.v1.md").write_text("say {{x}}")
    client = httpx.AsyncClient(base_url="http://llm/v1", transport=httpx.MockTransport(handler))
    return OpenAICompatLLM(PromptLibrary(tmp_path), "http://llm/v1", "m", client=client)


def _reply(content: str) -> httpx.Response:
    return httpx.Response(200, json={"choices": [{"message": {"content": content}}]})


async def test_llm_json_retries_once_then_succeeds(tmp_path):
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(json.loads(request.content))
        return _reply("not json at all") if len(calls) == 1 else _reply('<think>hmm</think>```json\n{"a": 1}\n```')

    data = await _llm(tmp_path, handler).complete_json("t", {"x": "hi"}, {"required": ["a"]})
    assert data == {"a": 1} and len(calls) == 2
    assert "invalid" in calls[1]["messages"][-1]["content"]


async def test_llm_json_gives_up_after_retry(tmp_path):
    with pytest.raises(LLMError):
        await _llm(tmp_path, lambda r: _reply("{}")).complete_json("t", {"x": "hi"}, {"required": ["a"]})


async def test_llm_text_strips_thinking_and_falls_back_without_response_format(tmp_path):
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        seen.append("response_format" in body)
        if "response_format" in body:
            return httpx.Response(400, text="unsupported")
        return _reply('<think>x</think>{"a": 2}')

    assert await _llm(tmp_path, handler).complete_json("t", {"x": "hi"}, {"required": ["a"]}) == {"a": 2}
    assert seen == [True, False]


async def test_attendee_bot_follows_captions_that_grow_in_place():
    """Attendee rewrites a caption utterance while the person speaks: partials first, one final when it settles."""
    poll = {"n": 0}
    # state per poll: joining, waiting_room, then joined while the caption grows and settles, then ended
    states = ["joining", "waiting_room", "joined_recording", "joined_recording", "joined_recording", "joined_recording", "joined_recording", "ended"]
    captions = {
        3: "Xin",
        4: "Xin chào mọi người",
        5: "Xin chào mọi người",
        6: "Xin chào mọi người",
        7: "Xin chào mọi người",
        8: "Xin chào mọi người",
    }

    def transcript() -> list[dict]:
        text = captions.get(poll["n"])
        if not text:
            return []
        first = {"speaker_name": "A", "speaker_uuid": "u1", "timestamp_ms": 1_700_000_000_000, "duration_ms": 900, "transcription": {"transcript": text}}
        second = {"speaker_name": "B", "speaker_uuid": "u2", "timestamp_ms": 1_700_000_004_000, "duration_ms": 800, "transcription": {"transcript": "Hello"}}
        return [first, second] if poll["n"] >= 6 else [first]

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        assert request.headers["Authorization"] == "Token k"
        if request.method == "POST" and path == "/api/v1/bots":
            assert json.loads(request.content)["meeting_url"] == "https://meet.google.com/x"
            return httpx.Response(201, json={"id": "bot_1", "state": "ready"})
        if path == "/api/v1/bots/bot_1":
            poll["n"] = min(poll["n"] + 1, len(states))
            return httpx.Response(200, json={"id": "bot_1", "state": states[poll["n"] - 1]})
        if path == "/api/v1/bots/bot_1/transcript":
            return httpx.Response(200, json=transcript())
        return httpx.Response(404)

    client = httpx.AsyncClient(base_url="http://attendee", transport=httpx.MockTransport(handler), headers={"Authorization": "Token k"})
    ticks = iter(range(1, 1000))  # one tick per poll, so "unchanged for 2 s" means two polls
    bot = AttendeeBot("http://attendee", "k", poll_interval_s=0.001, stable_s=2.0, state_every_s=0.0, clock=lambda: float(next(ticks)), client=client)
    await bot.join("m1", "https://meet.google.com/x")

    events = [e.type async for e in bot.events("m1")]
    segments = [s async for s in bot.segments("m1")]
    assert events == ["waiting", "joined", "ended"]

    first = [s for s in segments if s.speaker == "A"]
    assert [(s.text, s.is_final) for s in first] == [("Xin", False), ("Xin chào mọi người", False), ("Xin chào mọi người", True)]
    assert len({s.id for s in first}) == 1  # one utterance keeps one id, so the UI replaces the partial text
    assert first[0].start_ms == 0 and first[-1].end_ms == 900

    second = [s for s in segments if s.speaker == "B"]
    assert [(s.text, s.is_final) for s in second] == [("Hello", False), ("Hello", True)]  # settled when the meeting ended
    assert second[0].start_ms == 4000 and second[0].id != first[0].id


async def test_minutes_cite_short_labels_and_map_them_back(tmp_path):
    """The model sees L1, L2... and may cite them (or invent ids); the stored minutes carry real segment ids only."""
    from core.models import Segment
    from core.services.minutes import MinutesService, format_transcript, label_segments

    segs = [Segment(id=f"seg_{i:08x}", meeting_id="m", speaker="A", start_ms=i * 1000, end_ms=i * 1000 + 500, text=f"dòng {i}") for i in range(3)]
    assert format_transcript(label_segments(segs)) == "[L1] A: dòng 0\n[L2] A: dòng 1\n[L3] A: dòng 2"  # no timestamps

    class ModelThatCitesLabels:
        async def complete_text(self, prompt_id, variables):
            return ""

        async def complete_json(self, prompt_id, variables, schema):
            assert "[L2] A: dòng 1" in variables["transcript"]
            return {
                "summary": "ok",
                "topics": [],
                "decisions": [{"text": "d", "evidence_segment_id": "L2"}],
                "action_items": [
                    {"task": "t1", "owner": "A", "due_date": "15/11", "evidence_segment_id": "L3"},
                    {"task": "t2", "owner": "", "due_date": "", "evidence_segment_id": "L99"},  # invented
                ],
            }

    saved = {}

    class Repo:
        async def list_segments(self, meeting_id):
            return segs

        async def save_minutes(self, meeting_id, minutes, status):
            saved["minutes"] = minutes
            return minutes

    await MinutesService(Repo(), ModelThatCitesLabels()).generate("m")
    m = saved["minutes"]
    assert m.decisions[0].evidence_segment_id == segs[1].id
    assert [a.evidence_segment_id for a in m.action_items] == [segs[2].id, None]


def test_config_variables_use_the_environment_or_the_fallback(monkeypatch, tmp_path):
    from app.settings import load_config

    path = tmp_path / "c.yaml"
    path.write_text("bot:\n  adapter: ${BOT_X:-fake}\n  api_key: ${KEY_X:-}\n  nested:\n    lang: ${LANG_X:-vi-VN}\n  plain: ${NOT_SET}\n", encoding="utf-8")
    for name in ("BOT_X", "KEY_X", "LANG_X", "NOT_SET"):
        monkeypatch.delenv(name, raising=False)
    bot = load_config(path)["bot"]
    assert (bot["adapter"], bot["api_key"], bot["nested"]["lang"]) == ("fake", "", "vi-VN")  # fallbacks apply
    assert bot["plain"] == "${NOT_SET}"  # no fallback and unset: left visible instead of silently empty

    monkeypatch.setenv("BOT_X", "attendee")
    monkeypatch.setenv("KEY_X", "secret")
    bot = load_config(path)["bot"]
    assert (bot["adapter"], bot["api_key"]) == ("attendee", "secret")


def test_config_variables_also_come_from_the_dotenv_file(monkeypatch, tmp_path):
    from app.settings import load_config

    (tmp_path / ".env").write_text("FROM_DOTENV=minio.local:9000\nBOTH=from-file\n", encoding="utf-8")
    (tmp_path / "c.yaml").write_text("storage:\n  endpoint: ${FROM_DOTENV}\n  both: ${BOTH}\n", encoding="utf-8")
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("FROM_DOTENV", raising=False)
    monkeypatch.setenv("BOTH", "from-environment")
    storage = load_config(tmp_path / "c.yaml")["storage"]
    assert storage["endpoint"] == "minio.local:9000"
    assert storage["both"] == "from-environment"  # the real environment beats the file
