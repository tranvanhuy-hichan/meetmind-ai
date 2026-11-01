from __future__ import annotations

from dataclasses import dataclass

from core.errors import NotFound, PermissionDenied
from core.models import Meeting, Participant, Role
from core.ports import Repository


@dataclass
class Actor:
    user_id: str
    name: str
    role: Role

    @property
    def can_manage(self) -> bool:
        return self.role.can_manage


class AccessService:
    """Single place that answers 'is this user in this meeting, and as what?'"""

    def __init__(self, repo: Repository):
        self._repo = repo

    async def meeting(self, meeting_id: str) -> Meeting:
        meeting = await self._repo.get_meeting(meeting_id)
        if meeting is None:
            raise NotFound("Không tìm thấy phiên họp")
        return meeting

    async def member(self, meeting_id: str, user_id: str) -> Actor:
        part = await self._repo.get_participant(meeting_id, user_id)
        if part is None:
            raise PermissionDenied("Bạn không thuộc phiên họp này")
        return self._actor(part)

    async def manager(self, meeting_id: str, user_id: str) -> Actor:
        actor = await self.member(meeting_id, user_id)
        if not actor.can_manage:
            raise PermissionDenied("Chỉ chủ trì hoặc đồng chủ trì mới có quyền này")
        return actor

    async def host(self, meeting_id: str, user_id: str) -> Actor:
        actor = await self.member(meeting_id, user_id)
        if actor.role is not Role.HOST:
            raise PermissionDenied("Chỉ chủ trì mới có quyền này")
        return actor

    @staticmethod
    def _actor(part: Participant) -> Actor:
        return Actor(user_id=part.user_id, name=part.name, role=Role(part.role))
