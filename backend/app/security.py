from __future__ import annotations

import time

import jwt


def create_token(user_id: str, secret: str, ttl_hours: int) -> str:
    return jwt.encode({"sub": user_id, "exp": int(time.time()) + ttl_hours * 3600}, secret, algorithm="HS256")


def decode_token(token: str, secret: str) -> str:
    """Returns the user id or raises jwt.PyJWTError."""
    return jwt.decode(token, secret, algorithms=["HS256"])["sub"]
