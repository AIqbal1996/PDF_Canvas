from datetime import UTC, datetime
from enum import StrEnum
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class RevisionSource(StrEnum):
    UPLOAD = "upload"
    EDIT = "edit"
    EXPORT = "export"


class Revision(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    document_id: UUID
    parent_revision_id: UUID | None = None
    source: RevisionSource
    object_key: str
    sha256: str
    size_bytes: int
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class Document(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    organization_id: UUID
    title: str
    mime_type: str = "application/pdf"
    original_revision_id: UUID
    current_revision_id: UUID
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class UploadResult(BaseModel):
    document: Document
    revision: Revision

