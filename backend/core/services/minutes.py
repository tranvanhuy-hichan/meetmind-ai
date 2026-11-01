from __future__ import annotations

import json
from dataclasses import asdict
from typing import Any

from core.errors import Invalid
from core.models import ActionItem, Decision, Minutes, MinutesRecord, Segment
from core.ports import LLM, Repository

MINUTES_SCHEMA = {"required": ["summary", "topics", "decisions", "action_items"]}


Labelled = list[tuple[str, Segment]]


def label_segments(segments: list[Segment]) -> Labelled:
    """Short ids (L1, L2, ...) for the prompt: a small model cites these reliably, unlike long random ids."""
    return [(f"L{i}", s) for i, s in enumerate(segments, 1)]


def format_transcript(labelled: Labelled) -> str:
    """One line per segment. No timestamps: a model tends to mistake them for deadlines."""
    return "\n".join(f"[{label}] {s.speaker}: {s.text}" for label, s in labelled)


def _chunk(labelled: Labelled, max_chars: int) -> list[Labelled]:
    chunks: list[Labelled] = []
    current: Labelled = []
    size = 0
    for label, s in labelled:
        cost = len(s.text) + len(s.speaker) + 12
        if current and size + cost > max_chars:
            chunks.append(current)
            current, size = [], 0
        current.append((label, s))
        size += cost
    if current:
        chunks.append(current)
    return chunks


def _restore_ids(raw: dict[str, Any], ids: dict[str, str]) -> dict[str, Any]:
    """Swap the labels the model cited back to real segment ids; anything it made up is dropped."""

    def fix(items: Any) -> list[Any]:
        out = []
        for item in items if isinstance(items, list) else []:
            if isinstance(item, dict):
                item = {**item, "evidence_segment_id": ids.get(str(item.get("evidence_segment_id", "")).strip())}
            out.append(item)
        return out

    return {**raw, "decisions": fix(raw.get("decisions")), "action_items": fix(raw.get("action_items"))}


def minutes_from_dict(data: dict[str, Any], valid_ids: set[str] | None = None) -> Minutes:
    """Tolerant conversion from LLM or client JSON. Evidence ids that do not exist are dropped."""

    def evidence(value: Any) -> str | None:
        value = str(value) if value else None
        return value if value and (valid_ids is None or value in valid_ids) else None

    def text(value: Any) -> str:
        return str(value).strip() if value else ""

    return Minutes(
        summary=text(data.get("summary")),
        topics=[text(t) for t in data.get("topics") or [] if text(t)],
        decisions=[
            Decision(text=text(d.get("text")), evidence_segment_id=evidence(d.get("evidence_segment_id")))
            for d in data.get("decisions") or []
            if isinstance(d, dict) and text(d.get("text"))
        ],
        action_items=[
            ActionItem(
                task=text(a.get("task")),
                owner=text(a.get("owner")),
                due_date=text(a.get("due_date")),
                evidence_segment_id=evidence(a.get("evidence_segment_id")),
            )
            for a in data.get("action_items") or []
            if isinstance(a, dict) and text(a.get("task"))
        ],
    )


def minutes_to_dict(minutes: Minutes) -> dict[str, Any]:
    return asdict(minutes)


class MinutesService:
    def __init__(self, repo: Repository, llm: LLM, chunk_chars: int = 6000, output_lang: str = "Vietnamese"):
        self._repo = repo
        self._llm = llm
        self._chunk_chars = chunk_chars
        self._output_lang = output_lang

    async def generate(self, meeting_id: str) -> MinutesRecord:
        segments = await self._repo.list_segments(meeting_id)
        if not segments:
            raise Invalid("Chưa có transcript để tạo biên bản")
        labelled = label_segments(segments)
        partials = [
            await self._llm.complete_json(
                "minutes_map",
                {"transcript": format_transcript(chunk), "output_lang": self._output_lang},
                MINUTES_SCHEMA,
            )
            for chunk in _chunk(labelled, self._chunk_chars)
        ]
        if len(partials) == 1:
            raw = partials[0]
        else:
            raw = await self._llm.complete_json(
                "minutes_reduce",
                {"partials": json.dumps(partials, ensure_ascii=False), "output_lang": self._output_lang},
                MINUTES_SCHEMA,
            )
        minutes = minutes_from_dict(_restore_ids(raw, {label: s.id for label, s in labelled}), {s.id for s in segments})
        return await self._repo.save_minutes(meeting_id, minutes, "draft")

    async def get(self, meeting_id: str) -> MinutesRecord | None:
        return await self._repo.get_minutes(meeting_id)

    async def update(self, meeting_id: str, data: dict[str, Any], status: str) -> MinutesRecord:
        if status not in ("draft", "final"):
            raise Invalid("Trạng thái không hợp lệ")
        segments = await self._repo.list_segments(meeting_id)
        minutes = minutes_from_dict(data, {s.id for s in segments})
        return await self._repo.save_minutes(meeting_id, minutes, status)
