from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any

import yaml
from pydantic_settings import BaseSettings, SettingsConfigDict

DEV_SECRET = "dev-only-insecure-secret-change-me-in-production"

DEFAULT_CONFIG: dict[str, Any] = {
    "bot": {"adapter": "fake", "speed": 1.0},
    "asr": {"adapter": "none"},
    "translator": {"adapter": "demo"},
    "llm": {"adapter": "demo"},
    "minutes": {"auto": True, "output_lang": "Vietnamese"},
    "storage": {"adapter": "local"},
    "email": {"adapter": "console"},
}


class Settings(BaseSettings):
    """Deployment settings (secrets, paths). Which adapters run is chosen in config.yaml."""

    model_config = SettingsConfigDict(env_prefix="MEETMIND_", env_file=".env", extra="ignore")

    config_path: Path = Path("config/config.yaml")
    database_url: str = "sqlite+aiosqlite:///./data/meetmind.db"
    data_dir: Path = Path("./data")
    prompts_dir: Path = Path("./prompts")
    jwt_secret: str = DEV_SECRET
    jwt_ttl_hours: int = 24 * 7
    cors_origins: list[str] = ["http://localhost:3000"]
    app_url: str = "http://localhost:3000"  # base of the links in emails
    max_upload_mb: int = 50
    # "Sign in with Google": the OAuth client id (public, not a secret). Empty = Google sign-in off.
    google_client_id: str = ""
    google_allowed_domains: list[str] = []  # e.g. ["congty.com"]; empty = any Google account
    # Creating Meet rooms from MeetMind needs the client secret as well, and the address the browser uses to reach
    # this API: Google sends the user back to <public_api_url>/api/google/callback (register it in the Google console).
    google_client_secret: str = ""
    public_api_url: str = "http://localhost:8000"
    meet_access_type: str = "OPEN"  # OPEN: anyone with the link joins, so the bot is not left waiting to be admitted
    # Sign-in by emailed code: "auto" = only when Google sign-in is not configured, "on", or "off".
    email_code: str = "auto"


_VAR = re.compile(r"\$\{(\w+)(?::-([^}]*))?\}")


def _variables() -> dict[str, str]:
    """What `${NAME}` can see: the process environment, then the values in ./.env (the environment wins)."""
    from dotenv import dotenv_values

    return {**{k: v for k, v in dotenv_values(".env").items() if v}, **os.environ}


def _expand(value: Any, variables: dict[str, str]) -> Any:
    """`${NAME}` inside a config string is replaced by the variable NAME, `${NAME:-fallback}` by the fallback
    when NAME is unset or empty. An unknown name without a fallback is left as written, so the mistake is visible."""
    if isinstance(value, str):
        return _VAR.sub(lambda m: variables.get(m.group(1)) or (m.group(2) if m.group(2) is not None else m.group(0)), value)
    if isinstance(value, dict):
        return {k: _expand(v, variables) for k, v in value.items()}
    return value


def load_config(path: Path) -> dict[str, Any]:
    """config.yaml overrides the demo defaults section by section."""
    config = {k: dict(v) for k, v in DEFAULT_CONFIG.items()}
    if path.exists():
        variables = _variables()
        for key, value in (yaml.safe_load(path.read_text(encoding="utf-8")) or {}).items():
            config[key] = {**config.get(key, {}), **_expand(value or {}, variables)}
    return config
