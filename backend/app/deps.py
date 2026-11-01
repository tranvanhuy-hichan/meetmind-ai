from __future__ import annotations

import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.container import Container
from app.security import decode_token
from core.models import User

_bearer = HTTPBearer(auto_error=False)


def get_container(request: Request) -> Container:
    return request.app.state.container


async def current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    container: Container = Depends(get_container),
) -> User:
    if creds is None:
        raise HTTPException(status_code=401, detail="Chưa đăng nhập")
    try:
        user_id = decode_token(creds.credentials, container.settings.jwt_secret)
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Phiên đăng nhập không hợp lệ hoặc đã hết hạn") from None
    user = await container.repo.get_user(user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="Tài khoản không tồn tại")
    return user
