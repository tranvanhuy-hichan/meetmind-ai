from __future__ import annotations

from urllib.parse import quote

from fastapi import APIRouter, Depends, Response, UploadFile
from pydantic import BaseModel

from app.container import Container
from app.deps import current_user, get_container
from core.models import User
from core.services.documents import document_view

router = APIRouter(prefix="/api", tags=["documents"])


class DocumentPatch(BaseModel):
    allow_download: bool


@router.post("/meetings/{meeting_id}/documents", status_code=201)
async def upload_document(
    meeting_id: str,
    file: UploadFile,
    user: User = Depends(current_user),
    c: Container = Depends(get_container),
) -> dict:
    data = await file.read(c.settings.max_upload_mb * 1024 * 1024 + 1)
    doc = await c.documents.upload(meeting_id, user.id, file.filename or "", file.content_type or "", data)
    return document_view(doc)


@router.get("/documents/{doc_id}/file")
async def document_pdf(doc_id: str, user: User = Depends(current_user), c: Container = Depends(get_container)) -> Response:
    _, data = await c.documents.read_pdf(doc_id, user.id)
    return Response(data, media_type="application/pdf", headers={"Cache-Control": "private, max-age=3600"})


@router.get("/documents/{doc_id}/download")
async def document_original(doc_id: str, user: User = Depends(current_user), c: Container = Depends(get_container)) -> Response:
    doc, data = await c.documents.read_original(doc_id, user.id)
    return Response(
        data,
        media_type=doc.mime,
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(doc.name)}"},
    )


@router.patch("/documents/{doc_id}")
async def patch_document(doc_id: str, body: DocumentPatch, user: User = Depends(current_user), c: Container = Depends(get_container)) -> dict:
    return document_view(await c.documents.set_allow_download(doc_id, user.id, body.allow_download))


@router.delete("/documents/{doc_id}", status_code=204)
async def delete_document(doc_id: str, user: User = Depends(current_user), c: Container = Depends(get_container)) -> Response:
    await c.documents.delete(doc_id, user.id)
    return Response(status_code=204)
