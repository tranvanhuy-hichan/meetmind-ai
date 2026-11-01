from __future__ import annotations

import logging

from core.models import EmailMessage

log = logging.getLogger("meetmind.mail")


class ConsoleEmailSender:
    """Development sender: prints each email to the log and keeps it in `outbox`. Nothing leaves the machine."""

    def __init__(self) -> None:
        self.outbox: list[EmailMessage] = []

    async def send(self, message: EmailMessage) -> None:
        self.outbox.append(message)
        log.info("EMAIL to %s | %s\n%s", message.to, message.subject, message.body)
