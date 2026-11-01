"""Domain models. Plain dataclasses: no framework or infrastructure imports."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum


class MeetingStatus(str, Enum):
    CREATED = "created"
    BOT_JOINING = "bot_joining"
    LIVE = "live"
    ENDED = "ended"
    PROCESSING = "processing"
    READY = "ready"
    BOT_FAILED = "bot_failed"


class Role(str, Enum):
    HOST = "host"
    COHOST = "cohost"
    MEMBER = "member"

    @property
    def can_manage(self) -> bool:
        return self in (Role.HOST, Role.COHOST)


class OrgRole(str, Enum):
    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"

    @property
    def can_manage(self) -> bool:
        return self in (OrgRole.OWNER, OrgRole.ADMIN)


@dataclass
class User:
    id: str
    email: str
    name: str


@dataclass
class Organization:
    id: str
    name: str
    created_at: datetime | None = None


@dataclass
class OrgMember:
    org_id: str
    user_id: str
    role: str
    name: str = ""
    email: str = ""


@dataclass
class Invitation:
    """An invitation sent to an email address that has not signed in yet.

    meeting_id None: invitation to the organization (with org role `role`).
    meeting_id set: invitation to that meeting only (the person joins as a guest member)."""

    id: str
    email: str
    org_id: str
    invited_by: str
    role: str = "member"
    meeting_id: str | None = None
    created_at: datetime | None = None
    accepted_at: datetime | None = None


@dataclass
class LoginCode:
    email: str
    code_hash: str
    expires_at: datetime
    created_at: datetime
    attempts: int = 0


@dataclass
class EmailMessage:
    to: str
    subject: str
    body: str


@dataclass
class Meeting:
    id: str
    org_id: str
    title: str
    owner_id: str
    invite_code: str
    meet_url: str | None = None
    status: str = MeetingStatus.CREATED.value
    scheduled_at: datetime | None = None
    started_at: datetime | None = None
    ended_at: datetime | None = None
    created_at: datetime | None = None


@dataclass
class Participant:
    meeting_id: str
    user_id: str
    role: str
    display_lang: str | None = None
    name: str = ""
    email: str = ""


@dataclass
class Document:
    id: str
    meeting_id: str
    uploader_id: str
    name: str
    mime: str
    size: int
    original_key: str
    pdf_key: str
    page_count: int
    allow_download: bool = False
    order_idx: int = 0
    created_at: datetime | None = None


@dataclass
class Segment:
    id: str
    meeting_id: str
    speaker: str
    start_ms: int
    end_ms: int
    text: str
    lang: str = ""
    participant_id: str | None = None
    is_final: bool = True
    source: str = ""


@dataclass
class Translation:
    segment_id: str
    target_lang: str
    text: str
    model: str = ""


@dataclass
class MeetingEvent:
    type: str  # joined | waiting | failed | ended
    detail: str = ""


@dataclass
class Decision:
    text: str
    evidence_segment_id: str | None = None


@dataclass
class ActionItem:
    task: str
    owner: str = ""
    due_date: str = ""
    evidence_segment_id: str | None = None


@dataclass
class Minutes:
    summary: str = ""
    topics: list[str] = field(default_factory=list)
    decisions: list[Decision] = field(default_factory=list)
    action_items: list[ActionItem] = field(default_factory=list)


@dataclass
class MinutesRecord:
    meeting_id: str
    minutes: Minutes
    status: str = "draft"  # draft | final
    updated_at: datetime | None = None


@dataclass
class ProcessedDocument:
    pdf: bytes
    page_count: int


@dataclass
class VerifiedIdentity:
    """Who an external identity provider says the person is. `email` is always verified by the provider."""

    email: str
    name: str = ""
