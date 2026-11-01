import re
from pathlib import Path
from typing import Any


class PromptLibrary:
    """Loads versioned prompt files: `<id>.v<N>.md`. The highest version wins."""

    def __init__(self, directory: Path):
        self._dir = Path(directory)

    def render(self, prompt_id: str, variables: dict[str, Any]) -> str:
        text = self._latest(prompt_id).read_text(encoding="utf-8")
        for key, value in variables.items():
            text = text.replace("{{" + key + "}}", str(value))
        return text

    def _latest(self, prompt_id: str) -> Path:
        pattern = re.compile(rf"^{re.escape(prompt_id)}\.v(\d+)\.md$")
        found = [
            (int(m.group(1)), p)
            for p in self._dir.iterdir()
            if (m := pattern.match(p.name))
        ]
        if not found:
            raise FileNotFoundError(f"prompt '{prompt_id}' not found in {self._dir}")
        return max(found)[1]
