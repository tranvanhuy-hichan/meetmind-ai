from __future__ import annotations

import secrets
import uuid
from dataclasses import fields
from datetime import datetime, timezone
from typing import Any, TypeVar

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text, delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from core import models as m
from core.services.minutes import minutes_from_dict, minutes_to_dict

T = TypeVar("T")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _id() -> str:
    return uuid.uuid4().hex[:12]


class Base(DeclarativeBase):
    pass


class UserRow(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_id)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))


class LoginCodeRow(Base):
    __tablename__ = "login_codes"
    email: Mapped[str] = mapped_column(String(255), primary_key=True)
    code_hash: Mapped[str] = mapped_column(String(128))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(Integer, default=0)


class OrgRow(Base):
    __tablename__ = "organizations"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_id)
    name: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class OrgMemberRow(Base):
    __tablename__ = "org_members"
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    role: Mapped[str] = mapped_column(String(16))


class InvitationRow(Base):
    __tablename__ = "invitations"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    email: Mapped[str] = mapped_column(String(255), index=True)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    meeting_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    invited_by: Mapped[str] = mapped_column(String(32))
    role: Mapped[str] = mapped_column(String(16), default="member")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class MeetingRow(Base):
    __tablename__ = "meetings"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_id)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    title: Mapped[str] = mapped_column(String(255))
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    invite_code: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    meet_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(String(24), default="created")
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class ParticipantRow(Base):
    __tablename__ = "participants"
    meeting_id: Mapped[str] = mapped_column(ForeignKey("meetings.id"), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    role: Mapped[str] = mapped_column(String(16))
    display_lang: Mapped[str | None] = mapped_column(String(8), nullable=True)


class DocumentRow(Base):
    __tablename__ = "documents"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    meeting_id: Mapped[str] = mapped_column(ForeignKey("meetings.id"), index=True)
    uploader_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String(255))
    mime: Mapped[str] = mapped_column(String(120))
    size: Mapped[int] = mapped_column(Integer)
    original_key: Mapped[str] = mapped_column(String(500))
    pdf_key: Mapped[str] = mapped_column(String(500))
    page_count: Mapped[int] = mapped_column(Integer)
    allow_download: Mapped[bool] = mapped_column(Boolean, default=False)
    order_idx: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class SegmentRow(Base):
    __tablename__ = "segments"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    meeting_id: Mapped[str] = mapped_column(ForeignKey("meetings.id"), index=True)
    speaker: Mapped[str] = mapped_column(String(120))
    participant_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    start_ms: Mapped[int] = mapped_column(Integer)
    end_ms: Mapped[int] = mapped_column(Integer)
    lang: Mapped[str] = mapped_column(String(8), default="")
    text: Mapped[str] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(24), default="")


class TranslationRow(Base):
    __tablename__ = "translations"
    segment_id: Mapped[str] = mapped_column(ForeignKey("segments.id"), primary_key=True)
    target_lang: Mapped[str] = mapped_column(String(8), primary_key=True)
    text: Mapped[str] = mapped_column(Text)
    model: Mapped[str] = mapped_column(String(64), default="")


class MinutesRow(Base):
    __tablename__ = "minutes"
    meeting_id: Mapped[str] = mapped_column(ForeignKey("meetings.id"), primary_key=True)
    data: Mapped[dict] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(8), default="draft")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


def _to(cls: type[T], row: Any, **extra: Any) -> T:
    """Row -> dataclass by matching field names."""
    values = {f.name: getattr(row, f.name) for f in fields(cls) if hasattr(row, f.name)}  # type: ignore[arg-type]
    values.update(extra)
    return cls(**values)


class SqlRepository:
    def __init__(self, url: str):
        self._engine = create_async_engine(url)
        self._session: async_sessionmaker[AsyncSession] = async_sessionmaker(self._engine, expire_on_commit=False)

    async def create_schema(self) -> None:
        async with self._engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    async def drop_schema(self) -> None:
        """Removes every table. For tests and local resets only."""
        async with self._engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)

    async def dispose(self) -> None:
        await self._engine.dispose()

    async def _add(self, row: Any) -> Any:
        async with self._session() as s:
            s.add(row)
            await s.commit()
        return row

    async def _update(self, model: Any, where: list, fields_: dict[str, Any]) -> None:
        if not fields_:
            return
        async with self._session() as s:
            await s.execute(update(model).where(*where).values(**fields_))
            await s.commit()

    # users
    async def create_user(self, email: str, name: str) -> m.User:
        row = await self._add(UserRow(email=email.lower(), name=name))
        return _to(m.User, row)

    async def update_user(self, user_id: str, **fields_: Any) -> None:
        await self._update(UserRow, [UserRow.id == user_id], fields_)

    # sign-in codes (one per email: asking again replaces the previous one)
    async def save_login_code(self, code: m.LoginCode) -> None:
        async with self._session() as s:
            await s.merge(LoginCodeRow(**{f.name: getattr(code, f.name) for f in fields(m.LoginCode)}))
            await s.commit()

    async def get_login_code(self, email: str) -> m.LoginCode | None:
        async with self._session() as s:
            row = await s.get(LoginCodeRow, email)
        return _to(m.LoginCode, row) if row else None

    async def bump_login_attempts(self, email: str) -> None:
        async with self._session() as s:
            await s.execute(update(LoginCodeRow).where(LoginCodeRow.email == email).values(attempts=LoginCodeRow.attempts + 1))
            await s.commit()

    async def delete_login_code(self, email: str) -> None:
        async with self._session() as s:
            await s.execute(delete(LoginCodeRow).where(LoginCodeRow.email == email))
            await s.commit()

    # organizations
    async def create_org(self, name: str, owner_id: str) -> m.Organization:
        row = OrgRow(name=name)
        async with self._session() as s:
            s.add(row)
            await s.flush()
            s.add(OrgMemberRow(org_id=row.id, user_id=owner_id, role="owner"))
            await s.commit()
        return _to(m.Organization, row)

    async def get_org(self, org_id: str) -> m.Organization | None:
        async with self._session() as s:
            row = await s.get(OrgRow, org_id)
        return _to(m.Organization, row) if row else None

    async def update_org(self, org_id: str, **fields_: Any) -> None:
        await self._update(OrgRow, [OrgRow.id == org_id], fields_)

    async def list_orgs_for_user(self, user_id: str) -> list[tuple[m.Organization, str]]:
        stmt = (
            select(OrgRow, OrgMemberRow.role)
            .join(OrgMemberRow, OrgMemberRow.org_id == OrgRow.id)
            .where(OrgMemberRow.user_id == user_id)
            .order_by(OrgRow.created_at)
        )
        async with self._session() as s:
            rows = (await s.execute(stmt)).all()
        return [(_to(m.Organization, o), role) for o, role in rows]

    async def add_org_member(self, org_id: str, user_id: str, role: str) -> None:
        await self._add(OrgMemberRow(org_id=org_id, user_id=user_id, role=role))

    async def get_org_member(self, org_id: str, user_id: str) -> m.OrgMember | None:
        stmt = (
            select(OrgMemberRow, UserRow)
            .join(UserRow, UserRow.id == OrgMemberRow.user_id)
            .where(OrgMemberRow.org_id == org_id, OrgMemberRow.user_id == user_id)
        )
        async with self._session() as s:
            result = (await s.execute(stmt)).first()
        return _to(m.OrgMember, result[0], name=result[1].name, email=result[1].email) if result else None

    async def list_org_members(self, org_id: str) -> list[m.OrgMember]:
        stmt = select(OrgMemberRow, UserRow).join(UserRow, UserRow.id == OrgMemberRow.user_id).where(OrgMemberRow.org_id == org_id)
        async with self._session() as s:
            rows = (await s.execute(stmt)).all()
        return [_to(m.OrgMember, mem, name=u.name, email=u.email) for mem, u in rows]

    async def update_org_member(self, org_id: str, user_id: str, role: str) -> None:
        await self._update(OrgMemberRow, [OrgMemberRow.org_id == org_id, OrgMemberRow.user_id == user_id], {"role": role})

    async def remove_org_member(self, org_id: str, user_id: str) -> None:
        async with self._session() as s:
            await s.execute(delete(OrgMemberRow).where(OrgMemberRow.org_id == org_id, OrgMemberRow.user_id == user_id))
            await s.commit()

    # invitations (only the ones still waiting are listed or found)
    async def add_invitation(self, inv: m.Invitation) -> m.Invitation:
        values = {f.name: getattr(inv, f.name) for f in fields(m.Invitation) if f.name not in ("created_at", "accepted_at")}
        row = await self._add(InvitationRow(**values))
        return _to(m.Invitation, row)

    async def get_invitation(self, inv_id: str) -> m.Invitation | None:
        async with self._session() as s:
            row = await s.get(InvitationRow, inv_id)
        return _to(m.Invitation, row) if row else None

    async def list_invitations(self, org_id: str) -> list[m.Invitation]:
        stmt = select(InvitationRow).where(InvitationRow.org_id == org_id, InvitationRow.accepted_at.is_(None)).order_by(InvitationRow.created_at)
        async with self._session() as s:
            rows = (await s.execute(stmt)).scalars().all()
        return [_to(m.Invitation, r) for r in rows]

    async def find_invitations(self, email: str) -> list[m.Invitation]:
        stmt = select(InvitationRow).where(InvitationRow.email == email.lower(), InvitationRow.accepted_at.is_(None))
        async with self._session() as s:
            rows = (await s.execute(stmt)).scalars().all()
        return [_to(m.Invitation, r) for r in rows]

    async def mark_invitation_accepted(self, inv_id: str) -> None:
        await self._update(InvitationRow, [InvitationRow.id == inv_id], {"accepted_at": _now()})

    async def delete_invitation(self, inv_id: str) -> None:
        async with self._session() as s:
            await s.execute(delete(InvitationRow).where(InvitationRow.id == inv_id))
            await s.commit()

    async def get_user(self, user_id: str) -> m.User | None:
        async with self._session() as s:
            row = await s.get(UserRow, user_id)
        return _to(m.User, row) if row else None

    async def get_user_by_email(self, email: str) -> m.User | None:
        async with self._session() as s:
            row = (await s.execute(select(UserRow).where(UserRow.email == email.lower()))).scalar_one_or_none()
        return _to(m.User, row) if row else None

    # meetings
    async def create_meeting(self, org_id: str, owner_id: str, title: str, meet_url: str | None, scheduled_at) -> m.Meeting:
        row = await self._add(
            MeetingRow(
                org_id=org_id,
                owner_id=owner_id,
                title=title,
                meet_url=meet_url,
                scheduled_at=scheduled_at,
                invite_code=secrets.token_hex(4).upper(),
            )
        )
        return _to(m.Meeting, row)

    async def get_meeting(self, meeting_id: str) -> m.Meeting | None:
        async with self._session() as s:
            row = await s.get(MeetingRow, meeting_id)
        return _to(m.Meeting, row) if row else None

    async def get_meeting_by_code(self, code: str) -> m.Meeting | None:
        async with self._session() as s:
            row = (
                await s.execute(select(MeetingRow).where(MeetingRow.invite_code == code.upper()))
            ).scalar_one_or_none()
        return _to(m.Meeting, row) if row else None

    async def list_meetings_for_user(self, user_id: str) -> list[tuple[m.Meeting, str]]:
        stmt = (
            select(MeetingRow, ParticipantRow.role)
            .join(ParticipantRow, ParticipantRow.meeting_id == MeetingRow.id)
            .where(ParticipantRow.user_id == user_id)
            .order_by(MeetingRow.created_at.desc())
        )
        async with self._session() as s:
            rows = (await s.execute(stmt)).all()
        return [(_to(m.Meeting, r), role) for r, role in rows]

    async def list_meetings_by_status(self, statuses: list[str]) -> list[m.Meeting]:
        async with self._session() as s:
            rows = (await s.execute(select(MeetingRow).where(MeetingRow.status.in_(statuses)))).scalars().all()
        return [_to(m.Meeting, r) for r in rows]

    async def update_meeting(self, meeting_id: str, **fields_: Any) -> None:
        await self._update(MeetingRow, [MeetingRow.id == meeting_id], fields_)

    # participants
    async def add_participant(self, meeting_id: str, user_id: str, role: str, display_lang: str | None) -> m.Participant:
        await self._add(ParticipantRow(meeting_id=meeting_id, user_id=user_id, role=role, display_lang=display_lang))
        return await self.get_participant(meeting_id, user_id)  # type: ignore[return-value]

    async def get_participant(self, meeting_id: str, user_id: str) -> m.Participant | None:
        stmt = (
            select(ParticipantRow, UserRow)
            .join(UserRow, UserRow.id == ParticipantRow.user_id)
            .where(ParticipantRow.meeting_id == meeting_id, ParticipantRow.user_id == user_id)
        )
        async with self._session() as s:
            result = (await s.execute(stmt)).first()
        return _to(m.Participant, result[0], name=result[1].name, email=result[1].email) if result else None

    async def list_participants(self, meeting_id: str) -> list[m.Participant]:
        stmt = (
            select(ParticipantRow, UserRow)
            .join(UserRow, UserRow.id == ParticipantRow.user_id)
            .where(ParticipantRow.meeting_id == meeting_id)
        )
        async with self._session() as s:
            rows = (await s.execute(stmt)).all()
        parts = [_to(m.Participant, p, name=u.name, email=u.email) for p, u in rows]
        order = {"host": 0, "cohost": 1, "member": 2}
        return sorted(parts, key=lambda p: (order.get(p.role, 3), p.name.lower()))

    async def update_participant(self, meeting_id: str, user_id: str, **fields_: Any) -> None:
        await self._update(
            ParticipantRow,
            [ParticipantRow.meeting_id == meeting_id, ParticipantRow.user_id == user_id],
            fields_,
        )

    # documents
    async def add_document(self, doc: m.Document) -> m.Document:
        values = {f.name: getattr(doc, f.name) for f in fields(m.Document) if f.name != "created_at"}
        row = await self._add(DocumentRow(**values))
        return _to(m.Document, row)

    async def get_document(self, doc_id: str) -> m.Document | None:
        async with self._session() as s:
            row = await s.get(DocumentRow, doc_id)
        return _to(m.Document, row) if row else None

    async def list_documents(self, meeting_id: str) -> list[m.Document]:
        stmt = select(DocumentRow).where(DocumentRow.meeting_id == meeting_id).order_by(DocumentRow.order_idx)
        async with self._session() as s:
            rows = (await s.execute(stmt)).scalars().all()
        return [_to(m.Document, r) for r in rows]

    async def update_document(self, doc_id: str, **fields_: Any) -> None:
        await self._update(DocumentRow, [DocumentRow.id == doc_id], fields_)

    async def delete_document(self, doc_id: str) -> None:
        async with self._session() as s:
            await s.execute(delete(DocumentRow).where(DocumentRow.id == doc_id))
            await s.commit()

    # transcript
    async def add_segment(self, seg: m.Segment) -> None:
        values = {f.name: getattr(seg, f.name) for f in fields(m.Segment) if f.name != "is_final"}
        async with self._session() as s:
            await s.merge(SegmentRow(**values))
            await s.commit()

    async def list_segments(self, meeting_id: str) -> list[m.Segment]:
        stmt = select(SegmentRow).where(SegmentRow.meeting_id == meeting_id).order_by(SegmentRow.start_ms)
        async with self._session() as s:
            rows = (await s.execute(stmt)).scalars().all()
        return [_to(m.Segment, r) for r in rows]

    async def save_translation(self, tr: m.Translation) -> None:
        async with self._session() as s:
            await s.merge(TranslationRow(segment_id=tr.segment_id, target_lang=tr.target_lang, text=tr.text, model=tr.model))
            await s.commit()

    async def list_translations(self, meeting_id: str, lang: str) -> dict[str, m.Translation]:
        stmt = (
            select(TranslationRow)
            .join(SegmentRow, SegmentRow.id == TranslationRow.segment_id)
            .where(SegmentRow.meeting_id == meeting_id, TranslationRow.target_lang == lang)
        )
        async with self._session() as s:
            rows = (await s.execute(stmt)).scalars().all()
        return {r.segment_id: _to(m.Translation, r) for r in rows}

    # minutes
    async def get_minutes(self, meeting_id: str) -> m.MinutesRecord | None:
        async with self._session() as s:
            row = await s.get(MinutesRow, meeting_id)
        if row is None:
            return None
        return m.MinutesRecord(meeting_id, minutes_from_dict(row.data), row.status, row.updated_at)

    async def save_minutes(self, meeting_id: str, minutes: m.Minutes, status: str) -> m.MinutesRecord:
        now = _now()
        async with self._session() as s:
            await s.merge(MinutesRow(meeting_id=meeting_id, data=minutes_to_dict(minutes), status=status, updated_at=now))
            await s.commit()
        return m.MinutesRecord(meeting_id, minutes, status, now)
