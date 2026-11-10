from pathlib import Path
from uuid import UUID, uuid4

from fastapi import FastAPI, File, Header, HTTPException, UploadFile, status

from .config import settings
from .domain import Document, Revision, RevisionSource, UploadResult
from .pdf_engine import SignatureOnlyPdfEngine
from .repository import InMemoryDocumentRepository
from .storage import LocalImmutableObjectStore, UploadTooLargeError

app = FastAPI(title="PDF Canvas API", version="0.1.0")
store = LocalImmutableObjectStore(settings.object_storage_root, settings.max_upload_bytes)
repository = InMemoryDocumentRepository()
pdf_engine = SignatureOnlyPdfEngine()


def organization_id(value: str = Header(alias="X-Organization-Id")) -> UUID:
    try:
        return UUID(value)
    except ValueError as error:
        raise HTTPException(status_code=400, detail="Invalid organization ID") from error


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/documents", response_model=UploadResult, status_code=status.HTTP_201_CREATED)
def upload_document(
    file: UploadFile = File(...),
    organization: UUID = Header(alias="X-Organization-Id"),
) -> UploadResult:
    document_id = uuid4()
    try:
        object_key, sha256, size = store.put_original(organization, document_id, file.file)
    except UploadTooLargeError as error:
        raise HTTPException(status_code=413, detail=str(error)) from error

    source_path = store.path_for(object_key)
    inspection = pdf_engine.inspect(source_path)
    if not inspection.valid:
        source_path.unlink(missing_ok=True)
        raise HTTPException(status_code=415, detail="Uploaded file is not a PDF")

    revision = Revision(
        document_id=document_id,
        source=RevisionSource.UPLOAD,
        object_key=object_key,
        sha256=sha256,
        size_bytes=size,
    )
    document = Document(
        id=document_id,
        organization_id=organization,
        title=Path(file.filename or "Untitled.pdf").name,
        original_revision_id=revision.id,
        current_revision_id=revision.id,
    )
    repository.add(document, revision)
    return UploadResult(document=document, revision=revision)


@app.get("/v1/documents/{document_id}", response_model=Document)
def get_document(
    document_id: UUID,
    organization: UUID = Header(alias="X-Organization-Id"),
) -> Document:
    document = repository.get_document(document_id, organization)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return document

