from __future__ import annotations

import asyncio
import uuid

from core.models import Segment


class FasterWhisperASR:
    """Speech-to-text for recordings with faster-whisper (pip install '.[whisper]').

    Whisper does not say who is speaking: every segment gets the same generic speaker label.
    Use it as a fallback when the bot gives no transcript of its own."""

    def __init__(self, model: str = "small", device: str = "auto", compute_type: str = "int8"):
        self._model_name = model
        self._device = device
        self._compute_type = compute_type
        self._model = None

    async def transcribe_file(self, path: str, lang: str | None = None) -> list[Segment]:
        return await asyncio.to_thread(self._transcribe, path, lang)

    def _transcribe(self, path: str, lang: str | None) -> list[Segment]:
        if self._model is None:
            from faster_whisper import WhisperModel  # imported lazily: it is an optional dependency

            self._model = WhisperModel(self._model_name, device=self._device, compute_type=self._compute_type)
        segments, info = self._model.transcribe(path, language=lang, vad_filter=True)
        return [
            Segment(
                id=f"seg_{uuid.uuid4().hex[:10]}",
                meeting_id="",
                speaker="Người nói",
                start_ms=int(s.start * 1000),
                end_ms=int(s.end * 1000),
                text=s.text.strip(),
                lang=info.language,
                source="whisper",
            )
            for s in segments
            if s.text.strip()
        ]
