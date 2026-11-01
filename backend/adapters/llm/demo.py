from __future__ import annotations

import re
from typing import Any

_LINE = re.compile(r"^\[(?P<id>[^\]]+)\] (?P<speaker>[^:]+): (?P<text>.*)$")
_DATE = re.compile(r"(?:trước|đến)\s+ngày\s+(\d{1,2}/\d{1,2})|\bby\s+(\d{1,2}/\d{1,2})", re.IGNORECASE)
_OWNER = re.compile(r"\b(em|tôi|mình|I)\b.*\b(phụ trách|sẽ|will)\b", re.IGNORECASE)
_DECISION = re.compile(r"^(chốt|thống nhất|quyết định)\b[^:]*:\s*", re.IGNORECASE)
_TOPIC = re.compile(r"(?:họp về|bàn về|thảo luận về)\s+(.+?)[.?!]?$", re.IGNORECASE)


class DemoLLM:
    """Rule-based stand-in for the LLM so the product runs without a model.

    It only understands the demo script. Real minutes need the OpenAI-compatible adapter."""

    async def complete_text(self, prompt_id: str, variables: dict[str, Any]) -> str:
        return str(variables.get("text", ""))

    async def complete_json(self, prompt_id: str, variables: dict[str, Any], schema: dict) -> dict:
        if prompt_id == "minutes_reduce":
            return self._merge(variables["partials"])
        return self._minutes(variables["transcript"])

    def _minutes(self, transcript: str) -> dict:
        lines = [m.groupdict() for raw in transcript.splitlines() if (m := _LINE.match(raw))]
        speakers = list(dict.fromkeys(line["speaker"] for line in lines))
        topics, decisions, actions = [], [], []
        for line in lines:
            text = line["text"]
            if m := _TOPIC.search(text):
                topics.append(m.group(1).strip())
            if _DECISION.match(text):
                decisions.append({"text": _DECISION.sub("", text).strip(), "evidence_segment_id": line["id"]})
                continue
            date = _DATE.search(text)
            owner = _OWNER.search(text)
            if date or "phụ trách" in text.lower():
                actions.append(
                    {
                        "task": text,
                        "owner": line["speaker"] if owner else "",
                        "due_date": (date.group(1) or date.group(2)) if date else "",
                        "evidence_segment_id": line["id"],
                    }
                )
        summary = (
            f"(Bản demo, không dùng mô hình ngôn ngữ) Cuộc họp có {len(lines)} lượt phát biểu "
            f"của {len(speakers)} người: {', '.join(speakers)}."
        )
        return {"summary": summary, "topics": topics, "decisions": decisions, "action_items": actions}

    @staticmethod
    def _merge(partials_json: str) -> dict:
        import json

        parts = json.loads(partials_json)
        return {
            "summary": " ".join(p.get("summary", "") for p in parts),
            "topics": list(dict.fromkeys(t for p in parts for t in p.get("topics", []))),
            "decisions": [d for p in parts for d in p.get("decisions", [])],
            "action_items": [a for p in parts for a in p.get("action_items", [])],
        }
