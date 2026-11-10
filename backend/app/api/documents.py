from uuid import UUID
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from ..engines.pdf_engine import PyPdfEngine
from ..models import (
    ApplyAnnotationsRequest,
    CropPagesRequest,
    DeletePagesRequest,
    Document,
    DocumentDetail,
    DuplicatePageRequest,
    ExtractPagesRequest,
    HeaderFooterRequest,
    IngestionResult,
    MergeDocumentsRequest,
    NativeTextEditRequest,
    PageRotateRequest,
    ReorderPagesRequest,
    ResizePagesRequest,
)
from ..repository import SQLiteDocumentRepository
from ..services.document_service import (
    DocumentNotFoundError,
    DocumentService,
    InvalidPdfError,
)
from ..storage import LocalImmutableFileStore, UploadTooLargeError
from ..config import settings

router = APIRouter(prefix="/api/documents", tags=["documents"])


def get_document_service() -> DocumentService:
    store = LocalImmutableFileStore(settings.data_root, settings.max_upload_bytes)
    repo = SQLiteDocumentRepository(settings.database_path)
    engine = PyPdfEngine()
    return DocumentService(store=store, repository=repo, pdf_engine=engine)


@router.post("", response_model=IngestionResult, status_code=status.HTTP_201_CREATED)
def upload_document(
    file: UploadFile = File(...),
    service: DocumentService = Depends(get_document_service),
) -> IngestionResult:
    try:
        doc, rev = service.import_document(file.filename or "document.pdf", file.file)
        return IngestionResult(document=doc, revision=rev)
    except UploadTooLargeError as err:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=str(err))
    except InvalidPdfError as err:
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail=str(err))
    except Exception as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Failed to ingest PDF: {err}")


@router.get("", response_model=list[Document])
def list_documents(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    search: str | None = Query(default=None, max_length=200),
    service: DocumentService = Depends(get_document_service),
) -> list[Document]:
    return service.list_documents(limit=limit, offset=offset, search=search)


@router.post("/merge", response_model=IngestionResult, status_code=status.HTTP_201_CREATED)
def merge_documents(
    request: MergeDocumentsRequest,
    service: DocumentService = Depends(get_document_service),
) -> IngestionResult:
    try:
        doc, rev = service.merge_documents(
            document_ids=request.document_ids,
            merged_title=request.title,
        )
        return IngestionResult(document=doc, revision=rev)
    except DocumentNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="One or more documents to merge not found")
    except (ValueError, FileNotFoundError) as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))


@router.get("/{document_id}", response_model=DocumentDetail)
def get_document(
    document_id: UUID,
    service: DocumentService = Depends(get_document_service),
) -> DocumentDetail:
    try:
        return service.get_document_detail(document_id)
    except DocumentNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")


@router.get("/{document_id}/revisions/{revision_id}/content")
def get_revision_content(
    document_id: UUID,
    revision_id: UUID,
    service: DocumentService = Depends(get_document_service),
):
    try:
        doc = service.get_document(document_id)
        path = service.get_revision_file_path_for_document(document_id, revision_id)
        if not path.exists():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Revision file not found")
        return FileResponse(
            path=str(path),
            media_type="application/pdf",
            filename=doc.title,
            content_disposition_type="inline",
            headers={
                "Accept-Ranges": "bytes",
                "Cache-Control": "private, max-age=86400, immutable",
            },
        )
    except DocumentNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document or revision not found")


@router.post("/{document_id}/rotate", response_model=IngestionResult)
def rotate_page(
    document_id: UUID,
    request: PageRotateRequest,
    service: DocumentService = Depends(get_document_service),
) -> IngestionResult:
    try:
        updated_doc, new_rev = service.rotate_page(
            document_id=document_id,
            page_index=request.page_index,
            degrees=request.degrees,
        )
        return IngestionResult(document=updated_doc, revision=new_rev)
    except DocumentNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    except (IndexError, ValueError) as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))


@router.post("/{document_id}/reorder", response_model=IngestionResult)
def reorder_pages(
    document_id: UUID,
    request: ReorderPagesRequest,
    service: DocumentService = Depends(get_document_service),
) -> IngestionResult:
    try:
        updated_doc, new_rev = service.reorder_pages(
            document_id=document_id,
            new_order=request.new_order,
        )
        return IngestionResult(document=updated_doc, revision=new_rev)
    except DocumentNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    except (IndexError, ValueError) as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))


@router.post("/{document_id}/delete-pages", response_model=IngestionResult)
def delete_pages(
    document_id: UUID,
    request: DeletePagesRequest,
    service: DocumentService = Depends(get_document_service),
) -> IngestionResult:
    try:
        updated_doc, new_rev = service.delete_pages(
            document_id=document_id,
            pages=request.pages,
        )
        return IngestionResult(document=updated_doc, revision=new_rev)
    except DocumentNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    except (IndexError, ValueError) as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))


@router.post("/{document_id}/duplicate-page", response_model=IngestionResult)
def duplicate_page(
    document_id: UUID,
    request: DuplicatePageRequest,
    service: DocumentService = Depends(get_document_service),
) -> IngestionResult:
    try:
        updated_doc, new_rev = service.duplicate_page(
            document_id=document_id,
            page_index=request.page_index,
            count=request.count,
        )
        return IngestionResult(document=updated_doc, revision=new_rev)
    except DocumentNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    except (IndexError, ValueError) as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))


@router.post("/{document_id}/extract-pages", response_model=IngestionResult, status_code=status.HTTP_201_CREATED)
def extract_pages(
    document_id: UUID,
    request: ExtractPagesRequest,
    service: DocumentService = Depends(get_document_service),
) -> IngestionResult:
    try:
        new_doc, new_rev = service.extract_pages(
            document_id=document_id,
            pages=request.pages,
            new_title=request.title,
        )
        return IngestionResult(document=new_doc, revision=new_rev)
    except DocumentNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    except (IndexError, ValueError) as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))


@router.post("/{document_id}/resize", response_model=IngestionResult)
def resize_pages(
    document_id: UUID,
    request: ResizePagesRequest,
    service: DocumentService = Depends(get_document_service),
) -> IngestionResult:
    try:
        updated_doc, new_rev = service.resize_pages(
            document_id=document_id,
            target_size=request.target_size,
            page_indices=request.page_indices,
            scale_content=request.scale_content,
        )
        return IngestionResult(document=updated_doc, revision=new_rev)
    except DocumentNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    except (IndexError, ValueError) as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))


@router.post("/{document_id}/crop", response_model=IngestionResult)
def crop_pages(
    document_id: UUID,
    request: CropPagesRequest,
    service: DocumentService = Depends(get_document_service),
) -> IngestionResult:
    try:
        updated_doc, new_rev = service.crop_pages(
            document_id=document_id,
            left=request.left,
            top=request.top,
            right=request.right,
            bottom=request.bottom,
            page_indices=request.page_indices,
        )
        return IngestionResult(document=updated_doc, revision=new_rev)
    except DocumentNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    except (IndexError, ValueError) as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))


@router.post("/{document_id}/header-footer", response_model=IngestionResult)
def apply_header_footer(
    document_id: UUID,
    request: HeaderFooterRequest,
    service: DocumentService = Depends(get_document_service),
) -> IngestionResult:
    try:
        updated_doc, new_rev = service.apply_header_footer(
            document_id=document_id,
            req=request,
        )
        return IngestionResult(document=updated_doc, revision=new_rev)
    except DocumentNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    except (IndexError, ValueError) as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))


@router.post("/{document_id}/annotate", response_model=IngestionResult)
def annotate_document(
    document_id: UUID,
    request: ApplyAnnotationsRequest,
    service: DocumentService = Depends(get_document_service),
) -> IngestionResult:
    try:
        updated_doc, new_rev = service.apply_annotations(
            document_id=document_id,
            page_index=request.page_index,
            texts=request.texts,
            shapes=request.shapes,
        )
        return IngestionResult(document=updated_doc, revision=new_rev)
    except DocumentNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    except (IndexError, ValueError) as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))


@router.post("/{document_id}/native-text-edit", response_model=IngestionResult)
def native_text_edit(
    document_id: UUID,
    request: NativeTextEditRequest,
    service: DocumentService = Depends(get_document_service),
) -> IngestionResult:
    try:
        updated_doc, new_rev = service.replace_native_text(
            document_id=document_id,
            page_index=request.page_index,
            target_text=request.target_text,
            replacement_text=request.replacement_text,
        )
        return IngestionResult(document=updated_doc, revision=new_rev)
    except DocumentNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    except (IndexError, ValueError) as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))


@router.get("/{document_id}/export")
def export_document(
    document_id: UUID,
    revision_id: UUID | None = Query(default=None),
    service: DocumentService = Depends(get_document_service),
):
    try:
        file_path, filename = service.export_revision(document_id, revision_id)
        return FileResponse(
            path=str(file_path),
            media_type="application/pdf",
            filename=filename,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except DocumentNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    except InvalidPdfError as err:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(err))


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(
    document_id: UUID,
    service: DocumentService = Depends(get_document_service),
):
    deleted = service.delete_document(document_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
