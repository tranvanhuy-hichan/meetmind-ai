from __future__ import annotations

import asyncio
import smtplib
import ssl
from email.message import EmailMessage as MimeMessage
from email.utils import formataddr

from core.models import EmailMessage


class SmtpEmailSender:
    """Sends through any SMTP server (STARTTLS on port 587, or implicit TLS with `use_ssl`)."""

    def __init__(
        self,
        host: str,
        port: int,
        sender: str,
        sender_name: str = "MeetMind",
        username: str = "",
        password: str = "",
        use_ssl: bool = False,
        timeout_s: float = 20.0,
    ):
        self._host, self._port = host, port
        self._from = formataddr((sender_name, sender))
        self._username, self._password = username, password
        self._use_ssl = use_ssl
        self._timeout = timeout_s

    async def send(self, message: EmailMessage) -> None:
        await asyncio.to_thread(self._send, message)

    def _send(self, message: EmailMessage) -> None:
        mime = MimeMessage()
        mime["From"], mime["To"], mime["Subject"] = self._from, message.to, message.subject
        mime.set_content(message.body)
        context = ssl.create_default_context()
        if self._use_ssl:
            server = smtplib.SMTP_SSL(self._host, self._port, timeout=self._timeout, context=context)
        else:
            server = smtplib.SMTP(self._host, self._port, timeout=self._timeout)
        with server:
            if not self._use_ssl:
                server.starttls(context=context)
            if self._username:
                server.login(self._username, self._password)
            server.send_message(mime)
