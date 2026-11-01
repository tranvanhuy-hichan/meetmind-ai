from __future__ import annotations

from dataclasses import dataclass

from core.errors import Invalid, PermissionDenied
from core.ports import EventBus, Repository
from core.services.access import AccessService, Actor
from core.services.topics import meeting_topic


@dataclass
class PresenterState:
    user_id: str
    name: str
    position: dict | None = None
    seq: int = 0


class PresenterService:
    """One presenter per meeting. Everybody else can follow the presenter's reading position.

    Rules:
    - host/co-host can take over at any time;
    - a member can take over only if nobody is presenting, otherwise they send a request;
    - the presenter or a host/co-host can hand the role to any participant.
    Positions are page + fraction of the page, so they hold on any screen size.
    """

    def __init__(self, repo: Repository, access: AccessService, bus: EventBus):
        self._repo = repo
        self._access = access
        self._bus = bus
        self._states: dict[str, PresenterState] = {}

    def state(self, meeting_id: str) -> dict | None:
        st = self._states.get(meeting_id)
        if st is None:
            return None
        return {"user_id": st.user_id, "name": st.name, "position": st.position, "seq": st.seq}

    async def claim(self, meeting_id: str, actor: Actor) -> None:
        current = self._states.get(meeting_id)
        if current and current.user_id == actor.user_id:
            return
        if current is None or actor.can_manage:
            await self._set(meeting_id, PresenterState(actor.user_id, actor.name))
        else:
            await self._publish(
                meeting_id,
                {"type": "presenter.request", "user_id": actor.user_id, "name": actor.name},
            )

    async def release(self, meeting_id: str, actor: Actor) -> None:
        current = self._states.get(meeting_id)
        if current is None:
            return
        if current.user_id != actor.user_id and not actor.can_manage:
            raise PermissionDenied("Bạn không phải người đang trình bày")
        await self.clear(meeting_id)

    async def grant(self, meeting_id: str, actor: Actor, target_user_id: str) -> None:
        current = self._states.get(meeting_id)
        is_presenter = current is not None and current.user_id == actor.user_id
        if not (is_presenter or actor.can_manage):
            raise PermissionDenied("Chỉ người đang trình bày hoặc chủ trì mới trao được quyền")
        target = await self._repo.get_participant(meeting_id, target_user_id)
        if target is None:
            raise Invalid("Người nhận quyền không thuộc phiên họp")
        await self._set(meeting_id, PresenterState(target.user_id, target.name))

    async def move(self, meeting_id: str, actor: Actor, position: dict) -> None:
        current = self._states.get(meeting_id)
        if current is None or current.user_id != actor.user_id:
            raise PermissionDenied("Chỉ người đang trình bày mới điều khiển được vị trí")
        doc = await self._repo.get_document(str(position.get("doc_id", "")))
        if doc is None or doc.meeting_id != meeting_id:
            raise Invalid("Tài liệu không tồn tại trong phiên họp")
        page = min(max(int(position.get("page", 1)), 1), max(doc.page_count, 1))
        y_ratio = min(max(float(position.get("y_ratio", 0.0)), 0.0), 1.0)
        zoom = min(max(float(position.get("zoom", 1.0)), 0.25), 5.0)
        current.seq += 1
        current.position = {"doc_id": doc.id, "page": page, "y_ratio": y_ratio, "zoom": zoom}
        await self._publish(
            meeting_id, {"type": "presenter.position", "position": current.position, "seq": current.seq}
        )

    async def clear(self, meeting_id: str) -> None:
        if self._states.pop(meeting_id, None) is not None:
            await self._publish(meeting_id, {"type": "presenter.changed", "presenter": None})

    async def on_disconnect(self, meeting_id: str, user_id: str) -> None:
        current = self._states.get(meeting_id)
        if current and current.user_id == user_id:
            await self.clear(meeting_id)

    async def _set(self, meeting_id: str, state: PresenterState) -> None:
        self._states[meeting_id] = state
        await self._publish(
            meeting_id,
            {"type": "presenter.changed", "presenter": {"user_id": state.user_id, "name": state.name}},
        )

    async def _publish(self, meeting_id: str, payload: dict) -> None:
        await self._bus.publish(meeting_topic(meeting_id), payload)
