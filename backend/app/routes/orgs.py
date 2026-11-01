from __future__ import annotations

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, Field

from app.container import Container
from app.deps import current_user, get_container
from core.models import User
from core.services.invitations import InviteResult

router = APIRouter(prefix="/api/orgs", tags=["organizations"])


class CreateOrg(BaseModel):
    name: str = Field(max_length=120)


class InviteBody(BaseModel):
    emails: list[str] = Field(max_length=200)
    role: str = "member"


class RenameBody(BaseModel):
    name: str = Field(max_length=120)


class RoleBody(BaseModel):
    role: str


def invite_view(result: InviteResult) -> dict:
    return {
        "added": result.added,
        "invited": result.invited,
        "skipped": result.skipped,
        "email_failed": result.email_failed,
    }


@router.get("")
async def list_orgs(user: User = Depends(current_user), c: Container = Depends(get_container)) -> list[dict]:
    return [
        {"id": o.id, "name": o.name, "role": role, "created_at": o.created_at, "member_count": await c.orgs.member_count(o.id)}
        for o, role in await c.orgs.list_for_user(user.id)
    ]


@router.post("")
async def create_org(body: CreateOrg, user: User = Depends(current_user), c: Container = Depends(get_container)) -> dict:
    org = await c.orgs.create(user.id, body.name)
    return {"id": org.id, "name": org.name, "role": "owner", "created_at": org.created_at, "member_count": 1}


@router.get("/{org_id}")
async def get_org(org_id: str, user: User = Depends(current_user), c: Container = Depends(get_container)) -> dict:
    org, me = await c.orgs.get(org_id, user.id)
    manage = me.role in ("owner", "admin")
    pending = await c.orgs.pending(org_id, user.id) if manage else []
    return {
        "id": org.id,
        "name": org.name,
        "role": me.role,
        "created_at": org.created_at,
        "members": [
            {"user_id": m.user_id, "name": m.name, "email": m.email, "role": m.role}
            for m in await c.orgs.members(org_id, user.id)
        ],
        "pending": [{"id": i.id, "email": i.email, "role": i.role, "created_at": i.created_at} for i in pending],
    }


@router.patch("/{org_id}")
async def rename_org(org_id: str, body: RenameBody, user: User = Depends(current_user), c: Container = Depends(get_container)) -> dict:
    org = await c.orgs.rename(org_id, user.id, body.name)
    return {"id": org.id, "name": org.name}


@router.post("/{org_id}/invitations")
async def invite(org_id: str, body: InviteBody, user: User = Depends(current_user), c: Container = Depends(get_container)) -> dict:
    return invite_view(await c.orgs.invite(org_id, user.id, user.name, body.emails, body.role))


@router.delete("/{org_id}/invitations/{invitation_id}", status_code=204)
async def revoke(org_id: str, invitation_id: str, user: User = Depends(current_user), c: Container = Depends(get_container)) -> Response:
    await c.orgs.revoke_invitation(org_id, user.id, invitation_id)
    return Response(status_code=204)


@router.put("/{org_id}/members/{user_id}")
async def set_role(org_id: str, user_id: str, body: RoleBody, user: User = Depends(current_user), c: Container = Depends(get_container)) -> dict:
    await c.orgs.set_role(org_id, user.id, user_id, body.role)
    return {"ok": True}


@router.delete("/{org_id}/members/{user_id}", status_code=204)
async def remove_member(org_id: str, user_id: str, user: User = Depends(current_user), c: Container = Depends(get_container)) -> Response:
    await c.orgs.remove_member(org_id, user.id, user_id)
    return Response(status_code=204)
