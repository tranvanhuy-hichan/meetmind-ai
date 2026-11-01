from __future__ import annotations

import uuid
from dataclasses import asdict
from pathlib import PurePath

from core.errors import Invalid, NotFound, PermissionDenied
from core.models import Document
from core.ports import DocumentProcessor, EventBus, ObjectStore, Repository
from core.services.access import AccessService
from core.services.topics import meeting_topic

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".doc", ".pptx", ".ppt", ".odt", ".odp"}


def document_view(doc: Document) -> dict:
    """What clients are allowed to see: never the storage keys."""
    data = asdict(doc)
    data.pop("original_key")
    data.pop("pdf_key")
    return data


class DocumentService:
    def __init__(
        self,
        repo: Repository,
        store: ObjectStore,
        processor: DocumentProcessor,
        access: AccessService,
        bus: EventBus,
        max_bytes: int = 50 * 1024 * 1024,
    ):
        self._repo = repo
        self._store = store
        self._processor = processor
        self._access = access
        self._bus = bus
        self._max_bytes = max_bytes

    async def upload(self, meeting_id: str, user_id: str, filename: str, mime: str, data: bytes) -> Document:
        await self._access.manager(meeting_id, user_id)
        meeting = await self._access.meeting(meeting_id)
        name = PurePath(filename or "").name
        ext = PurePath(name).suffix.lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise Invalid("Chỉ hỗ trợ PDF, Word (.docx, .doc, .odt) và PowerPoint (.pptx, .ppt, .odp)")
        if not data:
            raise Invalid("Tệp rỗng")
        if len(data) > self._max_bytes:
            raise Invalid(f"Tệp vượt quá {self._max_bytes // (1024 * 1024)} MB")

        processed = await self._processor.process(name, data)
        doc_id = uuid.uuid4().hex[:12]
        base = f"orgs/{meeting.org_id}/meetings/{meeting_id}/documents/{doc_id}"
        original_key, pdf_key = f"{base}/original{ext}", f"{base}/document.pdf"
        await self._store.put(original_key, data)
        await self._store.put(pdf_key, processed.pdf)

        existing = await self._repo.list_documents(meeting_id)
        doc = await self._repo.add_document(
            Document(
                id=doc_id,
                meeting_id=meeting_id,
                uploader_id=user_id,
                name=name,
                mime=mime or "application/octet-stream",
                size=len(data),
                original_key=original_key,
                pdf_key=pdf_key,
                page_count=processed.page_count,
                order_idx=len(existing),
            )
        )
        await self._publish(meeting_id, {"type": "doc.added", "document": document_view(doc)})
        return doc

    async def list(self, meeting_id: str, user_id: str) -> list[Document]:
        await self._access.member(meeting_id, user_id)
        return await self._repo.list_documents(meeting_id)

    async def read_pdf(self, doc_id: str, user_id: str) -> tuple[Document, bytes]:
        doc = await self._get(doc_id)
        await self._access.member(doc.meeting_id, user_id)
        return doc, await self._store.get(doc.pdf_key)

    async def read_original(self, doc_id: str, user_id: str) -> tuple[Document, bytes]:
        doc = await self._get(doc_id)
        actor = await self._access.member(doc.meeting_id, user_id)
        if not (doc.allow_download or actor.can_manage):
            raise PermissionDenied("Chủ trì chưa cho phép tải tài liệu này")
        return doc, await self._store.get(doc.original_key)

    async def set_allow_download(self, doc_id: str, user_id: str, allow: bool) -> Document:
        doc = await self._get(doc_id)
        await self._access.manager(doc.meeting_id, user_id)
        await self._repo.update_document(doc_id, allow_download=allow)
        doc.allow_download = allow
        await self._publish(doc.meeting_id, {"type": "doc.updated", "document": document_view(doc)})
        return doc

    async def delete(self, doc_id: str, user_id: str) -> None:
        doc = await self._get(doc_id)
        await self._access.manager(doc.meeting_id, user_id)
        await self._repo.delete_document(doc_id)
        await self._store.delete(doc.original_key)
        await self._store.delete(doc.pdf_key)
        await self._publish(doc.meeting_id, {"type": "doc.removed", "doc_id": doc_id})

    async def _get(self, doc_id: str) -> Document:
        doc = await self._repo.get_document(doc_id)
        if doc is None:
            raise NotFound("Không tìm thấy tài liệu")
        return doc

    async def _publish(self, meeting_id: str, payload: dict) -> None:
        await self._bus.publish(meeting_topic(meeting_id), payload)
