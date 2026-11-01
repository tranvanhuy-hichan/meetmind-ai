from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.container import Container
from app.deps import current_user, get_container
from app.security import create_token
from core.errors import Invalid
from core.models import User

router = APIRouter(prefix="/api", tags=["auth"])


class CodeRequest(BaseModel):
    email: str = Field(max_length=255)


class VerifyBody(BaseModel):
    email: str = Field(max_length=255)
    code: str = Field(max_length=12)
    name: str | None = Field(None, max_length=120)


class GoogleBody(BaseModel):
    credential: str = Field(max_length=4096)


class ProfileBody(BaseModel):
    name: str = Field(min_length=1, max_length=120)


def user_view(user: User) -> dict:
    return {"id": user.id, "email": user.email, "name": user.name}


@router.post("/auth/request-code")
async def request_code(body: CodeRequest, c: Container = Depends(get_container)) -> dict:
    """Same answer for known and unknown addresses, so it cannot be used to find out who has an account."""
    code = await c.auth.request_code(body.email)
    return {"sent": True, "dev_code": code if c.shows_dev_codes else None}


@router.post("/auth/verify")
async def verify(body: VerifyBody, c: Container = Depends(get_container)) -> dict:
    user = await c.auth.verify(body.email, body.code, body.name)
    s = c.settings
    return {"token": create_token(user.id, s.jwt_secret, s.jwt_ttl_hours), "user": user_view(user)}


@router.post("/auth/google")
async def google_sign_in(body: GoogleBody, c: Container = Depends(get_container)) -> dict:
    if c.identity is None:
        raise Invalid("Đăng nhập bằng Google chưa được cấu hình")
    user = await c.auth.sign_in_with_identity(await c.identity.verify(body.credential))
    s = c.settings
    return {"token": create_token(user.id, s.jwt_secret, s.jwt_ttl_hours), "user": user_view(user)}


@router.get("/me")
async def me(user: User = Depends(current_user)) -> dict:
    return user_view(user)


@router.patch("/me")
async def update_me(body: ProfileBody, user: User = Depends(current_user), c: Container = Depends(get_container)) -> dict:
    await c.repo.update_user(user.id, name=body.name.strip())
    user.name = body.name.strip()
    return user_view(user)
