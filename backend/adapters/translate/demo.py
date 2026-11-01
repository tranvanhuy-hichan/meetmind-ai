from __future__ import annotations

from adapters.demo_data import SCRIPT
from core.models import Segment, Translation

_TABLE = {(line["text"], lang): text for line in SCRIPT for lang, text in line["tr"].items()}


class DemoTranslator:
    """Looks translations up in the demo script. Anything else is marked as untranslated."""

    async def translate(
        self,
        segments: list[Segment],
        target_lang: str,
        context: list[Segment] | None = None,
        glossary: dict[str, str] | None = None,
    ) -> list[Translation]:
        return [
            Translation(
                segment_id=s.id,
                target_lang=target_lang,
                text=_TABLE.get((s.text, target_lang), f"[{target_lang}] {s.text}"),
                model="demo",
            )
            for s in segments
        ]
