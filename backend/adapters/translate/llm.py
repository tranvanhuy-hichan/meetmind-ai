from __future__ import annotations

from core.languages import language_name
from core.models import Segment, Translation
from core.ports import LLM


class LLMTranslator:
    """Translates with the self-hosted LLM, using earlier segments and a glossary as context."""

    def __init__(self, llm: LLM, model_label: str = "llm"):
        self._llm = llm
        self._label = model_label

    async def translate(
        self,
        segments: list[Segment],
        target_lang: str,
        context: list[Segment] | None = None,
        glossary: dict[str, str] | None = None,
    ) -> list[Translation]:
        context_text = "\n".join(f"{s.speaker}: {s.text}" for s in (context or [])) or "(none)"
        glossary_text = "\n".join(f"{k} = {v}" for k, v in (glossary or {}).items()) or "(none)"
        out: list[Translation] = []
        for seg in segments:
            text = await self._llm.complete_text(
                "translate",
                {
                    "source_lang": language_name(seg.lang) if seg.lang else "the original language",
                    "target_lang": language_name(target_lang),
                    "glossary": glossary_text,
                    "context": context_text,
                    "text": seg.text,
                },
            )
            out.append(Translation(segment_id=seg.id, target_lang=target_lang, text=text, model=self._label))
        return out
