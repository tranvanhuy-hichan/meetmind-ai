from __future__ import annotations

import io

from docx import Document
from docx.shared import Pt

from core.models import Meeting, Minutes, Participant


class DocxExporter:
    content_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    extension = "docx"

    def export(self, meeting: Meeting, minutes: Minutes, participants: list[Participant]) -> bytes:
        doc = Document()
        doc.styles["Normal"].font.name = "Calibri"
        doc.styles["Normal"].font.size = Pt(11)

        doc.add_heading("BIÊN BẢN CUỘC HỌP", level=0)
        doc.add_paragraph(meeting.title).runs[0].bold = True
        when = meeting.started_at or meeting.scheduled_at or meeting.created_at
        if when:
            doc.add_paragraph(f"Thời gian: {when:%d/%m/%Y %H:%M}")
        doc.add_paragraph("Thành phần tham dự: " + ", ".join(p.name for p in participants))

        doc.add_heading("1. Tóm tắt", level=1)
        doc.add_paragraph(minutes.summary or "—")

        if minutes.topics:
            doc.add_heading("2. Nội dung thảo luận", level=1)
            for topic in minutes.topics:
                doc.add_paragraph(topic, style="List Bullet")

        doc.add_heading("3. Kết luận và quyết định", level=1)
        if minutes.decisions:
            for d in minutes.decisions:
                doc.add_paragraph(d.text, style="List Number")
        else:
            doc.add_paragraph("Không có quyết định được ghi nhận.")

        doc.add_heading("4. Công việc được giao", level=1)
        if minutes.action_items:
            table = doc.add_table(rows=1, cols=3)
            table.style = "Table Grid"
            for cell, label in zip(table.rows[0].cells, ("Người phụ trách", "Công việc", "Thời hạn")):
                cell.text = label
                cell.paragraphs[0].runs[0].bold = True
            for a in minutes.action_items:
                row = table.add_row().cells
                row[0].text, row[1].text, row[2].text = a.owner or "—", a.task, a.due_date or "—"
        else:
            doc.add_paragraph("Không có công việc nào được giao.")

        buf = io.BytesIO()
        doc.save(buf)
        return buf.getvalue()
