from __future__ import annotations

import json
import re
from typing import Any

import httpx

from core.prompts import PromptLibrary

_THINK = re.compile(r"<think>.*?</think>", re.DOTALL)


class LLMError(RuntimeError):
    pass


def _extract_json(text: str) -> dict:
    text = _THINK.sub("", text).strip()
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        raise ValueError("no JSON object in the model output")
    return json.loads(text[start : end + 1])


class OpenAICompatLLM:
    """Any server that speaks /v1/chat/completions: Ollama, vLLM, llama.cpp, LM Studio, OpenAI."""

    def __init__(
        self,
        prompts: PromptLibrary,
        base_url: str,
        model: str,
        api_key: str = "",
        timeout_s: float = 120.0,
        temperature: float = 0.0,
        max_tokens: int | None = None,
        client: httpx.AsyncClient | None = None,
    ):
        self._prompts = prompts
        self._model = model
        self._temperature = temperature
        self._max_tokens = max_tokens
        headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
        self._client = client or httpx.AsyncClient(
            base_url=base_url.rstrip("/"), headers=headers, timeout=timeout_s
        )

    async def complete_text(self, prompt_id: str, variables: dict[str, Any]) -> str:
        prompt = self._prompts.render(prompt_id, variables)
        return _THINK.sub("", await self._chat([{"role": "user", "content": prompt}], json_mode=False)).strip()

    async def complete_json(self, prompt_id: str, variables: dict[str, Any], schema: dict) -> dict:
        messages = [{"role": "user", "content": self._prompts.render(prompt_id, variables)}]
        last_error = ""
        for _ in range(2):
            reply = await self._chat(messages, json_mode=True)
            try:
                data = _extract_json(reply)
                missing = [k for k in schema.get("required", []) if k not in data]
                if not missing:
                    return data
                last_error = f"missing keys: {', '.join(missing)}"
            except ValueError as exc:
                last_error = str(exc)
            messages = messages + [
                {"role": "assistant", "content": reply},
                {"role": "user", "content": f"Your reply was invalid ({last_error}). Return only the corrected JSON object."},
            ]
        raise LLMError(f"model did not return valid JSON: {last_error}")

    async def _chat(self, messages: list[dict], json_mode: bool) -> str:
        body: dict[str, Any] = {"model": self._model, "messages": messages, "temperature": self._temperature, "stream": False}
        if self._max_tokens:
            body["max_tokens"] = self._max_tokens
        if json_mode:
            body["response_format"] = {"type": "json_object"}
        resp = await self._client.post("/chat/completions", json=body)
        if resp.status_code == 400 and json_mode:  # some servers reject response_format
            body.pop("response_format")
            resp = await self._client.post("/chat/completions", json=body)
        if resp.status_code >= 400:
            raise LLMError(f"LLM server returned {resp.status_code}: {resp.text[:200]}")
        return resp.json()["choices"][0]["message"]["content"] or ""

    async def aclose(self) -> None:
        await self._client.aclose()
