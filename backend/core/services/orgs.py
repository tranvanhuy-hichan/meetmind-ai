from __future__ import annotations

from urllib.parse import quote

from core.errors import Invalid, NotFound, PermissionDenied
from core.models import Invitation, OrgMember, OrgRole, Organization
from core.ports import Repository
from core.services.auth import normalize_email
from core.services.invitations import InvitationService, InviteResult
from core.services.mail import org_invite_mail

MAX_INVITES_AT_ONCE = 50


def login_link(app_url: str, email: str, next_path: str = "/") -> str:
    return f"{app_url.rstrip('/')}/login?email={quote(email)}&next={quote(next_path)}"


class OrgService:
    """An organization groups people and meetings. Access is always tied to an email address."""

    def __init__(self, repo: Repository, invitations: InvitationService, app_url: str):
        self._repo = repo
        self._invitations = invitations
        self._app_url = app_url

    async def create(self, user_id: str, name: str) -> Organization:
        name = name.strip()
        if not name:
            raise Invalid("Tên tổ chức không được để trống")
        return await self._repo.create_org(name[:120], user_id)

    async def list_for_user(self, user_id: str) -> list[tuple[Organization, str]]:
        return await self._repo.list_orgs_for_user(user_id)

    async def get(self, org_id: str, user_id: str) -> tuple[Organization, OrgMember]:
        org = await self._repo.get_org(org_id)
        member = await self._repo.get_org_member(org_id, user_id)
        if org is None or member is None:
            raise NotFound("Không tìm thấy tổ chức")  # same answer for outsiders: do not reveal it exists
        return org, member

    async def members(self, org_id: str, user_id: str) -> list[OrgMember]:
        await self.get(org_id, user_id)
        order = {"owner": 0, "admin": 1, "member": 2}
        found = await self._repo.list_org_members(org_id)
        return sorted(found, key=lambda m: (order.get(m.role, 3), m.name.lower()))

    async def pending(self, org_id: str, user_id: str) -> list[Invitation]:
        await self._manager(org_id, user_id)
        return [i for i in await self._repo.list_invitations(org_id) if i.meeting_id is None]

    async def invite(self, org_id: str, actor_id: str, actor_name: str, emails: list[str], role: str) -> InviteResult:
        org, actor = await self._manager(org_id, actor_id)
        if role not in (OrgRole.ADMIN.value, OrgRole.MEMBER.value):
            raise Invalid("Vai trò không hợp lệ")
        if role == OrgRole.ADMIN.value and actor.role != OrgRole.OWNER.value:
            raise PermissionDenied("Chỉ chủ sở hữu mới mời được quản trị viên")
        cleaned = list(dict.fromkeys(normalize_email(e) for e in emails if e.strip()))
        if not cleaned:
            raise Invalid("Chưa nhập địa chỉ email nào")
        if len(cleaned) > MAX_INVITES_AT_ONCE:
            raise Invalid(f"Chỉ mời tối đa {MAX_INVITES_AT_ONCE} email mỗi lần")

        result = InviteResult()
        for email in cleaned:
            user = await self._repo.get_user_by_email(email)
            if user and await self._repo.get_org_member(org_id, user.id):
                result.skipped.append(email)
                continue
            if user:
                await self._repo.add_org_member(org_id, user.id, role)
                result.added.append(email)
            elif await self._invitations.remember(email, org_id, actor_id, role, None):
                result.invited.append(email)
            else:
                result.skipped.append(email)
                continue
            link = login_link(self._app_url, email)
            await self._invitations.notify(org_invite_mail(email, org.name, actor_name, link, bool(user)), result)
        return result

    async def revoke_invitation(self, org_id: str, actor_id: str, invitation_id: str) -> None:
        await self._manager(org_id, actor_id)
        inv = await self._repo.get_invitation(invitation_id)
        if inv is None or inv.org_id != org_id:
            raise NotFound("Không tìm thấy lời mời")
        await self._repo.delete_invitation(invitation_id)

    async def set_role(self, org_id: str, actor_id: str, target_id: str, role: str) -> None:
        _, actor = await self.get(org_id, actor_id)
        if actor.role != OrgRole.OWNER.value:
            raise PermissionDenied("Chỉ chủ sở hữu mới đổi được vai trò")
        if role not in {r.value for r in OrgRole}:
            raise Invalid("Vai trò không hợp lệ")
        target = await self._repo.get_org_member(org_id, target_id)
        if target is None:
            raise NotFound("Không tìm thấy thành viên")
        if target.role == OrgRole.OWNER.value and role != OrgRole.OWNER.value:
            await self._require_other_owner(org_id, target_id)
        await self._repo.update_org_member(org_id, target_id, role)

    async def remove_member(self, org_id: str, actor_id: str, target_id: str) -> None:
        _, actor = await self.get(org_id, actor_id)
        target = await self._repo.get_org_member(org_id, target_id)
        if target is None:
            raise NotFound("Không tìm thấy thành viên")
        leaving = actor_id == target_id
        if not leaving:
            if not OrgRole(actor.role).can_manage:
                raise PermissionDenied("Bạn không có quyền xóa thành viên")
            if actor.role == OrgRole.ADMIN.value and target.role != OrgRole.MEMBER.value:
                raise PermissionDenied("Quản trị viên chỉ xóa được thành viên thường")
        if target.role == OrgRole.OWNER.value:
            await self._require_other_owner(org_id, target_id)
        await self._repo.remove_org_member(org_id, target_id)

    async def _manager(self, org_id: str, user_id: str) -> tuple[Organization, OrgMember]:
        org, member = await self.get(org_id, user_id)
        if not OrgRole(member.role).can_manage:
            raise PermissionDenied("Chỉ chủ sở hữu hoặc quản trị viên mới có quyền này")
        return org, member

    async def _require_other_owner(self, org_id: str, leaving_id: str) -> None:
        owners = [m for m in await self._repo.list_org_members(org_id) if m.role == OrgRole.OWNER.value]
        if not [m for m in owners if m.user_id != leaving_id]:
            raise Invalid("Tổ chức phải còn ít nhất một chủ sở hữu")
