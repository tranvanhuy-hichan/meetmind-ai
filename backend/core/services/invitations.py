from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field

from core.models import EmailMessage, Invitation, User
from core.ports import EmailSender, Repository

log = logging.getLogger(__name__)


@dataclass
class InviteResult:
    added: list[str] = field(default_factory=list)  # already had an account: access granted now
    invited: list[str] = field(default_factory=list)  # no account yet: access waits for their first sign-in
    skipped: list[str] = field(default_factory=list)  # already in
    email_failed: list[str] = field(default_factory=list)


class InvitationService:
    """Shared by organizations and meetings: grant access now, or remember it for the first sign-in."""

    def __init__(self, repo: Repository, mailer: EmailSender):
        self._repo = repo
        self._mailer = mailer

    async def accept_pending(self, user: User) -> None:
        """Called after every sign-in: turn invitations sent to this address into real access."""
        for inv in await self._repo.find_invitations(user.email):
            if inv.meeting_id:
                if await self._repo.get_participant(inv.meeting_id, user.id) is None:
                    await self._repo.add_participant(inv.meeting_id, user.id, "member", None)
            elif await self._repo.get_org_member(inv.org_id, user.id) is None:
                await self._repo.add_org_member(inv.org_id, user.id, inv.role)
            await self._repo.mark_invitation_accepted(inv.id)

    async def remember(self, email: str, org_id: str, invited_by: str, role: str, meeting_id: str | None) -> bool:
        """Stores a pending invitation unless an identical one is already waiting. True if new."""
        for existing in await self._repo.find_invitations(email):
            if existing.org_id == org_id and existing.meeting_id == meeting_id:
                return False
        await self._repo.add_invitation(
            Invitation(id=uuid.uuid4().hex[:12], email=email, org_id=org_id, invited_by=invited_by, role=role, meeting_id=meeting_id)
        )
        return True

    async def notify(self, message: EmailMessage, result: InviteResult) -> None:
        try:
            await self._mailer.send(message)
        except Exception:
            log.exception("could not send email to %s", message.to)
            result.email_failed.append(message.to)
