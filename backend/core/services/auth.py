from __future__ import annotations

import hashlib
import hmac
import re
import secrets
from datetime import datetime, timedelta, timezone

from core.errors import Invalid
from core.models import LoginCode, User, VerifiedIdentity
from core.ports import EmailSender, Repository
from core.services.invitations import InvitationService
from core.services.mail import login_code_mail

_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def normalize_email(email: str) -> str:
    email = (email or "").strip().lower()
    if not _EMAIL.match(email) or len(email) > 255:
        raise Invalid("Địa chỉ email không hợp lệ")
    return email


def _hash(code: str, salt: str) -> str:
    return hashlib.sha256(f"{salt}:{code}".encode()).hexdigest()


class AuthService:
    """Passwordless sign-in: an emailed one-time code proves the address belongs to the person.

    Whoever was invited by email gets their access the moment they sign in with that address."""

    def __init__(
        self,
        repo: Repository,
        mailer: EmailSender,
        invitations: InvitationService,
        ttl_minutes: int = 10,
        resend_after_s: int = 30,
        max_attempts: int = 5,
        email_code_enabled: bool = True,
    ):
        self._repo = repo
        self._mailer = mailer
        self._invitations = invitations
        self._ttl = ttl_minutes
        self._resend_after = resend_after_s
        self._max_attempts = max_attempts
        self.email_code_enabled = email_code_enabled

    async def request_code(self, email: str) -> str:
        """Sends a code and returns it; callers must only reveal it in development."""
        self._require_email_code()
        email = normalize_email(email)
        now = datetime.now(timezone.utc)
        existing = await self._repo.get_login_code(email)
        if existing and (now - _utc(existing.created_at)).total_seconds() < self._resend_after:
            raise Invalid("Vừa gửi mã xong, vui lòng đợi ít giây rồi thử lại")
        code = f"{secrets.randbelow(10**6):06d}"
        salt = secrets.token_hex(8)
        await self._repo.save_login_code(
            LoginCode(
                email=email,
                code_hash=f"{salt}${_hash(code, salt)}",
                expires_at=now + timedelta(minutes=self._ttl),
                created_at=now,
            )
        )
        await self._mailer.send(login_code_mail(email, code, self._ttl))
        return code

    async def verify(self, email: str, code: str, name: str | None) -> User:
        self._require_email_code()
        email = normalize_email(email)
        stored = await self._repo.get_login_code(email)
        if stored is None or _utc(stored.expires_at) < datetime.now(timezone.utc):
            raise Invalid("Mã không đúng hoặc đã hết hạn. Hãy yêu cầu mã mới")
        salt, digest = stored.code_hash.split("$")
        if not hmac.compare_digest(_hash((code or "").strip(), salt), digest):
            await self._repo.bump_login_attempts(email)
            if stored.attempts + 1 >= self._max_attempts:
                await self._repo.delete_login_code(email)
                raise Invalid("Nhập sai quá nhiều lần. Hãy yêu cầu mã mới")
            raise Invalid("Mã không đúng hoặc đã hết hạn. Hãy yêu cầu mã mới")
        await self._repo.delete_login_code(email)
        return await self._sign_in(email, name)

    async def sign_in_with_identity(self, identity: VerifiedIdentity) -> User:
        """The identity provider already proved the address, so no code is needed."""
        return await self._sign_in(normalize_email(identity.email), identity.name)

    async def _sign_in(self, email: str, name: str | None) -> User:
        user = await self._repo.get_user_by_email(email)
        if user is None:
            display = (name or "").strip() or email.split("@")[0]
            user = await self._repo.create_user(email, display[:120])
        await self._invitations.accept_pending(user)
        return user

    def _require_email_code(self) -> None:
        if not self.email_code_enabled:
            raise Invalid("Đăng nhập bằng mã email đã tắt. Hãy đăng nhập bằng Google")


def _utc(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
