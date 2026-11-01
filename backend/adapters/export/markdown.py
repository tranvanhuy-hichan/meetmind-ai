from __future__ import annotations

from core.models import Meeting, Minutes, Participant


class MarkdownExporter:
    content_type = "text/markdown; charset=utf-8"
    extension = "md"

    def export(self, meeting: Meeting, minutes: Minutes, participants: list[Participant]) -> bytes:
        out = [f"# Biên bản cuộc họp: {meeting.title}", ""]
        when = meeting.started_at or meeting.scheduled_at or meeting.created_at
        if when:
            out.append(f"**Thời gian:** {when:%d/%m/%Y %H:%M}  ")
        out += ["**Tham dự:** " + ", ".join(p.name for p in participants), "", "## Tóm tắt", "", minutes.summary or "—", ""]
        if minutes.topics:
            out += ["## Nội dung thảo luận", ""] + [f"- {t}" for t in minutes.topics] + [""]
        out += ["## Kết luận và quyết định", ""]
        out += [f"{i}. {d.text}" for i, d in enumerate(minutes.decisions, 1)] or ["Không có quyết định được ghi nhận."]
        out += ["", "## Công việc được giao", ""]
        if minutes.action_items:
            out += ["| Người phụ trách | Công việc | Thời hạn |", "|---|---|---|"]
            out += [f"| {a.owner or '—'} | {a.task} | {a.due_date or '—'} |" for a in minutes.action_items]
        else:
            out.append("Không có công việc nào được giao.")
        return ("\n".join(out) + "\n").encode("utf-8")
