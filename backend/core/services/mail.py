"""The wording of every email the product sends."""
from __future__ import annotations

from core.models import EmailMessage


def login_code_mail(email: str, code: str, ttl_minutes: int) -> EmailMessage:
    return EmailMessage(
        to=email,
        subject=f"Mã đăng nhập MeetMind: {code}",
        body=(
            f"Mã đăng nhập của bạn là: {code}\n\n"
            f"Mã có hiệu lực trong {ttl_minutes} phút và chỉ dùng được một lần.\n"
            "Nếu bạn không yêu cầu đăng nhập, hãy bỏ qua email này."
        ),
    )


def org_invite_mail(email: str, org_name: str, inviter: str, link: str, already_member: bool) -> EmailMessage:
    action = (
        f"{inviter} đã thêm bạn vào tổ chức \"{org_name}\" trên MeetMind."
        if already_member
        else f"{inviter} mời bạn tham gia tổ chức \"{org_name}\" trên MeetMind."
    )
    return EmailMessage(
        to=email,
        subject=f"Lời mời tham gia tổ chức {org_name}",
        body=f"{action}\n\nMở liên kết và đăng nhập bằng chính địa chỉ email này để tham gia:\n{link}\n",
    )


def meeting_invite_mail(email: str, meeting_title: str, inviter: str, link: str) -> EmailMessage:
    return EmailMessage(
        to=email,
        subject=f"Lời mời họp: {meeting_title}",
        body=(
            f"{inviter} mời bạn tham gia phiên họp \"{meeting_title}\" trên MeetMind.\n\n"
            f"Mở liên kết và đăng nhập bằng chính địa chỉ email này:\n{link}\n"
        ),
    )
