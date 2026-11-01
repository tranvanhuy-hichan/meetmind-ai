"""Office -> PDF conversion needs LibreOffice, so it is skipped where it is not installed."""
from __future__ import annotations

import io
import shutil

import pytest
from docx import Document

from adapters.docproc.libreoffice import LibreOfficeProcessor
from core.errors import Invalid
from tests.conftest import make_pdf


async def test_pdf_passthrough_and_validation():
    proc = LibreOfficeProcessor()
    assert (await proc.process("a.pdf", make_pdf(4))).page_count == 4
    with pytest.raises(Invalid):
        await proc.process("a.pdf", b"not a pdf")


@pytest.mark.skipif(shutil.which("soffice") is None, reason="LibreOffice not installed")
@pytest.mark.timeout(120)
async def test_docx_is_converted_to_pdf():
    doc = Document()
    doc.add_paragraph("Xin chào MeetMind")
    buf = io.BytesIO()
    doc.save(buf)
    result = await LibreOfficeProcessor().process("bao-cao.docx", buf.getvalue())
    assert result.pdf.startswith(b"%PDF") and result.page_count >= 1
