from __future__ import annotations

import secrets
from datetime import datetime

from core.errors import Invalid, NotFound, PermissionDenied
from core.languages import LANGUAGES
from core.platforms import LABEL, check_url, detect_platform, validate_platform
from core.models import Meeting, MeetingStatus, Participant, Role
from core.ports import EventBus, Repository
from core.services.access import AccessService
from core.services.auth import normalize_email
from core.services.invitations import InvitationService, InviteResult
from core.services.live_pipeline import LivePipeline
from core.services.mail import meeting_invite_mail
from core.services.orgs import MAX_INVITES_AT_ONCE, login_link
from core.services.topics import meeting_topic


def validate_lang(lang: str | None) -> str | None:
    if lang in (None, "", "orig"):
        return None
    if lang not in LANGUAGES:
        raise Invalid(f"Ngôn ngữ không được hỗ trợ: {lang}")
    return lang


class MeetingService:
    def __init__(
        self,
        repo: Repository,
        access: AccessService,
        pipeline: LivePipeline,
        bus: EventBus,
        invitations: InvitationService,
        app_url: str,
    ):
        self._repo = repo
        self._access = access
        self._pipeline = pipeline
        self._bus = bus
        self._invitations = invitations
        self._app_url = app_url

    async def create(
        self,
        owner_id: str,
        org_id: str,
        title: str,
        meet_url: str | None,
        scheduled_at: datetime | None,
        platform: str | None = None,
    ) -> Meeting:
        title = title.strip()
        if not title:
            raise Invalid("Tên phiên họp không được để trống")
        if await self._repo.get_org_member(org_id, owner_id) is None:
            raise PermissionDenied("Bạn không thuộc tổ chức này")
        platform = validate_platform(platform or detect_platform(meet_url))
        meeting = await self._repo.create_meeting(
            org_id, owner_id, title, check_url(meet_url, platform), scheduled_at, platform
        )
        await self._repo.add_participant(meeting.id, owner_id, Role.HOST.value, None)
        return meeting

    async def invite_by_email(self, meeting_id: str, actor_id: str, emails: list[str]) -> InviteResult:
        """Add people by email: now if they already have an account, otherwise at their first sign-in."""
        actor = await self._access.manager(meeting_id, actor_id)
        meeting = await self._access.meeting(meeting_id)
        cleaned = list(dict.fromkeys(normalize_email(e) for e in emails if e.strip()))
        if not cleaned:
            raise Invalid("Chưa nhập địa chỉ email nào")
        if len(cleaned) > MAX_INVITES_AT_ONCE:
            raise Invalid(f"Chỉ mời tối đa {MAX_INVITES_AT_ONCE} email mỗi lần")
        result = InviteResult()
        for email in cleaned:
            user = await self._repo.get_user_by_email(email)
            if user and await self._repo.get_participant(meeting_id, user.id):
                result.skipped.append(email)
                continue
            if user:
                await self._repo.add_participant(meeting_id, user.id, Role.MEMBER.value, None)
                result.added.append(email)
            elif await self._invitations.remember(email, meeting.org_id, actor_id, Role.MEMBER.value, meeting_id):
                result.invited.append(email)
            else:
                result.skipped.append(email)
                continue
            link = login_link(self._app_url, email, f"/meetings/{meeting_id}")
            await self._invitations.notify(meeting_invite_mail(email, meeting.title, actor.name, link), result)
        if result.added:
            await self._publish_participants(meeting_id)
        return result

    async def join_by_code(self, user_id: str, code: str) -> Meeting:
        meeting = await self._repo.get_meeting_by_code(code.strip())
        if meeting is None:
            raise NotFound("Mã tham gia không đúng")
        if await self._repo.get_participant(meeting.id, user_id) is None:
            await self._repo.add_participant(meeting.id, user_id, Role.MEMBER.value, None)
            await self._publish_participants(meeting.id)
        return meeting

    async def set_meet_url(self, meeting_id: str, user_id: str, meet_url: str | None) -> None:
        await self._access.manager(meeting_id, user_id)
        meeting = await self._access.meeting(meeting_id)
        await self._repo.update_meeting(meeting_id, meet_url=check_url(meet_url, meeting.platform))

    async def start(self, meeting_id: str, user_id: str) -> None:
        await self._access.manager(meeting_id, user_id)
        meeting = await self._access.meeting(meeting_id)
        if not meeting.meet_url:
            raise Invalid(f"Chưa có link {LABEL.get(meeting.platform, 'cuộc họp')} cho phiên họp này")
        if meeting.status in (MeetingStatus.BOT_JOINING.value, MeetingStatus.LIVE.value):
            raise Invalid("Phiên họp đang diễn ra")
        await self._pipeline.start(meeting_id, meeting.meet_url)

    async def end(self, meeting_id: str, user_id: str) -> None:
        await self._access.manager(meeting_id, user_id)
        await self._pipeline.stop(meeting_id)

    async def set_role(self, meeting_id: str, actor_id: str, target_id: str, role: str) -> None:
        await self._access.host(meeting_id, actor_id)
        if role not in (Role.COHOST.value, Role.MEMBER.value):
            raise Invalid("Vai trò không hợp lệ")
        target = await self._repo.get_participant(meeting_id, target_id)
        if target is None:
            raise NotFound("Không tìm thấy người tham gia")
        if target.role == Role.HOST.value:
            raise Invalid("Không thể đổi vai trò của chủ trì")
        await self._repo.update_participant(meeting_id, target_id, role=role)
        await self._publish_participants(meeting_id)

    async def set_display_lang(self, meeting_id: str, user_id: str, lang: str | None) -> None:
        await self._access.member(meeting_id, user_id)
        await self._repo.update_participant(meeting_id, user_id, display_lang=validate_lang(lang))

    async def participants(self, meeting_id: str) -> list[Participant]:
        return await self._repo.list_participants(meeting_id)

    async def _publish_participants(self, meeting_id: str) -> None:
        await self._bus.publish(meeting_topic(meeting_id), {"type": "participants.changed"})
