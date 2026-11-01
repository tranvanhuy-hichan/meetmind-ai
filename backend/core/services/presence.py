from __future__ import annotations

from dataclasses import dataclass


@dataclass
class Connection:
    conn_id: str
    meeting_id: str
    user_id: str
    name: str
    lang: str | None = None  # None = show original, no translation


class PresenceRegistry:
    """Who is connected to a meeting right now, and which language each person reads."""

    def __init__(self) -> None:
        self._conns: dict[str, Connection] = {}

    def join(self, conn: Connection) -> None:
        self._conns[conn.conn_id] = conn

    def leave(self, conn_id: str) -> Connection | None:
        return self._conns.pop(conn_id, None)

    def set_lang(self, conn_id: str, lang: str | None) -> None:
        if conn_id in self._conns:
            self._conns[conn_id].lang = lang

    def lang_of(self, conn_id: str) -> str | None:
        conn = self._conns.get(conn_id)
        return conn.lang if conn else None

    def languages(self, meeting_id: str) -> set[str]:
        return {c.lang for c in self._in(meeting_id) if c.lang}

    def online(self, meeting_id: str) -> list[dict]:
        seen: dict[str, str] = {}
        for c in self._in(meeting_id):
            seen.setdefault(c.user_id, c.name)
        return [{"user_id": uid, "name": name} for uid, name in seen.items()]

    def has_user(self, meeting_id: str, user_id: str) -> bool:
        return any(c.user_id == user_id for c in self._in(meeting_id))

    def _in(self, meeting_id: str) -> list[Connection]:
        return [c for c in self._conns.values() if c.meeting_id == meeting_id]
