from __future__ import annotations

import asyncio
import io
import shutil
import tempfile
from pathlib import Path, PurePath

from pypdf import PdfReader
from pypdf.errors import PyPdfError

from core.errors import Invalid
from core.models import ProcessedDocument


def _count_pages(pdf: bytes) -> int:
    try:
        return len(PdfReader(io.BytesIO(pdf)).pages)
    except (PyPdfError, ValueError) as exc:
        raise Invalid("Tệp PDF không hợp lệ hoặc bị hỏng") from exc


class LibreOfficeProcessor:
    """PDFs pass through. Office files are converted with headless LibreOffice."""

    def __init__(self, binary: str = "soffice", timeout_s: int = 120):
        self._binary = binary
        self._timeout = timeout_s

    async def process(self, filename: str, data: bytes) -> ProcessedDocument:
        if PurePath(filename).suffix.lower() == ".pdf":
            if not data.startswith(b"%PDF"):
                raise Invalid("Tệp PDF không hợp lệ")
            return ProcessedDocument(pdf=data, page_count=_count_pages(data))
        pdf = await self._convert(filename, data)
        return ProcessedDocument(pdf=pdf, page_count=_count_pages(pdf))

    async def _convert(self, filename: str, data: bytes) -> bytes:
        if shutil.which(self._binary) is None:
            raise Invalid("Máy chủ chưa cài LibreOffice nên chưa chuyển được tệp Office sang PDF")
        with tempfile.TemporaryDirectory(prefix="meetmind-") as tmp:
            work = Path(tmp)
            src = work / ("source" + PurePath(filename).suffix.lower())
            src.write_bytes(data)
            proc = await asyncio.create_subprocess_exec(
                self._binary,
                f"-env:UserInstallation=file://{work / 'profile'}",
                "--headless",
                "--convert-to",
                "pdf",
                "--outdir",
                str(work),
                str(src),
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
            )
            try:
                await asyncio.wait_for(proc.wait(), timeout=self._timeout)
            except asyncio.TimeoutError:
                proc.kill()
                raise Invalid("Chuyển tài liệu sang PDF quá thời gian cho phép") from None
            out = work / "source.pdf"
            if not out.exists():
                raise Invalid("Không chuyển được tài liệu sang PDF")
            return out.read_bytes()
