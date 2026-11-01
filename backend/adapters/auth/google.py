from __future__ import annotations

import asyncio
from typing import Any, Callable

from core.errors import Invalid
from core.models import VerifiedIdentity


def _google_verify(credential: str, client_id: str) -> dict[str, Any]:
    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token

    # Checks the signature against Google's published keys, the issuer, the expiry and that the token was issued for our client id.
    return id_token.verify_oauth2_token(credential, google_requests.Request(), client_id)


class GoogleIdentityVerifier:
    """Verifies the ID token that "Sign in with Google" hands to the browser."""

    def __init__(
        self,
        client_id: str,
        allowed_domains: list[str] | None = None,
        verify_token: Callable[[str, str], dict[str, Any]] = _google_verify,
    ):
        self._client_id = client_id
        self._domains = {d.lower().lstrip("@") for d in (allowed_domains or []) if d.strip()}
        self._verify = verify_token

    async def verify(self, credential: str) -> VerifiedIdentity:
        try:
            claims = await asyncio.to_thread(self._verify, credential, self._client_id)
        except Exception:  # bad signature, wrong audience, expired, unreachable key server ...
            raise Invalid("Không xác minh được tài khoản Google. Hãy thử đăng nhập lại") from None
        email = str(claims.get("email", "")).strip().lower()
        if not email or claims.get("email_verified") is not True:
            raise Invalid("Email của tài khoản Google này chưa được Google xác minh")
        if self._domains and email.rsplit("@", 1)[-1] not in self._domains:
            raise Invalid("Tài khoản Google này không thuộc tên miền được phép")
        return VerifiedIdentity(email=email, name=str(claims.get("name", "")).strip())
