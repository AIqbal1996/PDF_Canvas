from io import BytesIO
from pathlib import Path
from tempfile import NamedTemporaryFile
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import StreamingResponse

from ..config import settings
from ..engines.pdf_engine import PyPdfEngine
from ..engines.template_engine import (
    BuiltInTemplateProtectedError,
    LocalTemplateEngine,
    TemplateEngine,
    TemplateNotFoundError,
)
from ..models import (
    IngestionResult,
    PdfTemplate,
    RenderTemplateRequest,
    TemplateSummary,
)
from ..repository import SQLiteDocumentRepository
from ..services.document_service import DocumentService
from ..storage import LocalImmutableFileStore

router = APIRouter(prefix="/api/templates", tags=["templates"])


def get_template_engine() -> TemplateEngine:
    return LocalTemplateEngine(settings.templates_path)


def get_document_service() -> DocumentService:
    store = LocalImmutableFileStore(settings.data_root, settings.max_upload_bytes)
    repo = SQLiteDocumentRepository(settings.database_path)
    engine = PyPdfEngine()
    return DocumentService(store=store, repository=repo, pdf_engine=engine)


@router.get("", response_model=list[TemplateSummary])
def list_templates(
    engine: TemplateEngine = Depends(get_template_engine),
) -> list[TemplateSummary]:
    """Lists all built-in and user-saved PDF templates."""
    return engine.list_templates()


@router.get("/{template_id}", response_model=PdfTemplate)
def get_template(
    template_id: str,
    engine: TemplateEngine = Depends(get_template_engine),
) -> PdfTemplate:
    """Retrieves a full template schema definition."""
    try:
        return engine.get_template(template_id)
    except TemplateNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Template '{template_id}' not found.",
        )


@router.post("", response_model=PdfTemplate, status_code=status.HTTP_201_CREATED)
def create_template(
    template: PdfTemplate,
    engine: TemplateEngine = Depends(get_template_engine),
) -> PdfTemplate:
    """Creates a new custom user template schema."""
    try:
        return engine.save_template(template)
    except BuiltInTemplateProtectedError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.put("/{template_id}", response_model=PdfTemplate)
def update_template(
    template_id: str,
    template: PdfTemplate,
    engine: TemplateEngine = Depends(get_template_engine),
) -> PdfTemplate:
    """Updates an existing custom user template schema."""
    if template.id != template_id:
        template.id = template_id

    try:
        return engine.save_template(template)
    except BuiltInTemplateProtectedError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.delete("/{template_id}")
def delete_template(
    template_id: str,
    engine: TemplateEngine = Depends(get_template_engine),
) -> dict:
    """Deletes a custom user template (built-in templates cannot be deleted)."""
    try:
        deleted = engine.delete_template(template_id)
        if not deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Template '{template_id}' not found.",
            )
        return {"status": "deleted", "id": template_id}
    except BuiltInTemplateProtectedError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/{template_id}/render", response_model=IngestionResult, status_code=status.HTTP_201_CREATED)
def render_template_to_document(
    template_id: str,
    request: RenderTemplateRequest,
    service: DocumentService = Depends(get_document_service),
    engine: TemplateEngine = Depends(get_template_engine),
) -> IngestionResult:
    """Renders a saved template with user variables and registers it as a new document in the catalog."""
    try:
        template = engine.get_template(template_id)
        doc, rev = service.create_document_from_template(
            template=template,
            variables=request.variables,
            title=request.title,
            template_engine=engine,
        )
        return IngestionResult(document=doc, revision=rev)
    except TemplateNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Template '{template_id}' not found.")
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Template render failed: {e}")


@router.post("/render-custom", response_model=IngestionResult, status_code=status.HTTP_201_CREATED)
def render_custom_template_to_document(
    request: RenderTemplateRequest,
    service: DocumentService = Depends(get_document_service),
    engine: TemplateEngine = Depends(get_template_engine),
) -> IngestionResult:
    """Renders an unsaved draft template schema with user variables and saves to catalog."""
    if not request.template:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing template definition in request body.")

    try:
        doc, rev = service.create_document_from_template(
            template=request.template,
            variables=request.variables,
            title=request.title,
            template_engine=engine,
        )
        return IngestionResult(document=doc, revision=rev)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Template render failed: {e}")


@router.post("/preview")
def preview_template_pdf(
    request: RenderTemplateRequest,
    engine: TemplateEngine = Depends(get_template_engine),
) -> StreamingResponse:
    """Renders a template into an in-memory/streamed PDF for real-time live preview without saving to catalog."""
    template: PdfTemplate
    if request.template_id:
        try:
            template = engine.get_template(request.template_id)
        except TemplateNotFoundError:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Template '{request.template_id}' not found.")
    elif request.template:
        template = request.template
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Must provide either template_id or template object.")

    # Render to a temporary buffer
    temp_file = settings.temp_path / f"preview_{uuid4()}.pdf"
    try:
        engine.render_to_pdf(template, request.variables, temp_file)
        pdf_bytes = temp_file.read_bytes()
        return StreamingResponse(
            BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={"Content-Disposition": 'inline; filename="template_preview.pdf"'},
        )
    finally:
        if temp_file.exists():
            temp_file.unlink(missing_ok=True)
