from pathlib import Path
from typing import Any, BinaryIO, Callable
from uuid import UUID, uuid4
from ..config import settings
from ..engines.ai_engine import AIEngine, LocalAndEuriAIEngine
from ..engines.form_engine import FormEngine, LocalFormEngine
from ..engines.ocr_engine import LocalOcrEngine, OcrEngine
from ..engines.pdf_engine import PdfEngine
from ..engines.security_engine import LocalSecurityEngine, SecurityEngine
from ..engines.signature_engine import LocalSignatureEngine, SignatureEngine
from ..engines.template_engine import LocalTemplateEngine, TemplateEngine
from ..engines.utilities_engine import LocalUtilitiesEngine, UtilitiesEngine
from ..models import (
    AIAnalysisResponse,
    AIAskRequest,
    AIContextPreview,
    AIExtractRequest,
    AIStructuredExtractionResponse,
    AISummarizeRequest,
    BatchDocumentResult,
    BatchUtilityRequest,
    BatchUtilityResponse,
    BookmarkItem,
    CompareDocumentsRequest,
    CompressionResult,
    CreateFormFieldRequest,
    DigitalSignRequest,
    Document,
    DocumentBookmarks,
    DocumentComparisonReport,
    DocumentDetail,
    DocumentFormsInspection,
    DocumentOcrInspection,
    DocumentSecurityInspection,
    DocumentSignaturesReport,
    EncryptPdfRequest,
    HeaderFooterRequest,
    PageOcrResult,
    PdfTemplate,
    RedactPdfRequest,
    Revision,
    RevisionOperation,
    SanitizeMetadataRequest,
    SaveAISummaryPdfRequest,
    ScannedReconstructionRequest,
    ScannedRegionCorrectionRequest,
    ShapeAnnotation,
    TextAnnotation,
    VisualSignatureStampRequest,
    WatermarkRequest,
)
from ..repository import DocumentRepository
from ..storage import LocalImmutableFileStore


class DocumentNotFoundError(Exception):
    pass


class InvalidPdfError(Exception):
    pass


class DocumentService:
    def __init__(
        self,
        store: LocalImmutableFileStore,
        repository: DocumentRepository,
        pdf_engine: PdfEngine,
    ) -> None:
        self.store = store
        self.repository = repository
        self.pdf_engine = pdf_engine

    def import_document(self, filename: str, stream: BinaryIO) -> tuple[Document, Revision]:
        document_id = uuid4()
        original_revision_id = uuid4()

        # 1. Put into immutable original storage
        relative_path, sha256, size_bytes = self.store.put_original(document_id, stream)
        file_path = self.store.path_for(relative_path)

        # 2. Inspect with PDF engine
        inspection = self.pdf_engine.inspect(file_path)
        if not inspection.valid:
            # Cleanup invalid upload
            file_path.unlink(missing_ok=True)
            raise InvalidPdfError(
                f"Uploaded file failed PDF validation: {', '.join(inspection.warnings)}"
            )

        # 3. Create initial revision (immutable original)
        revision = Revision(
            id=original_revision_id,
            document_id=document_id,
            parent_revision_id=None,
            operation=RevisionOperation.UPLOAD,
            storage_path=relative_path,
            sha256=sha256,
            size_bytes=size_bytes,
            page_count=inspection.page_count,
        )

        # Clean title
        safe_title = Path(filename or "Untitled.pdf").name
        if not safe_title.lower().endswith(".pdf"):
            safe_title += ".pdf"

        # 4. Create document record
        document = Document(
            id=document_id,
            title=safe_title,
            mime_type="application/pdf",
            page_count=inspection.page_count,
            size_bytes=size_bytes,
            original_revision_id=original_revision_id,
            current_revision_id=original_revision_id,
        )

        # 5. Persist to SQLite
        self.repository.add(document, revision)
        return document, revision

    def get_document(self, document_id: UUID) -> Document:
        doc = self.repository.get_document(document_id)
        if not doc:
            raise DocumentNotFoundError(f"Document {document_id} not found")
        return doc

    def get_document_detail(self, document_id: UUID) -> DocumentDetail:
        doc = self.get_document(document_id)
        revisions = self.repository.list_revisions_for_document(document_id)
        return DocumentDetail(document=doc, revisions=revisions)

    def list_documents(
        self, limit: int = 50, offset: int = 0, search: str | None = None
    ) -> list[Document]:
        return self.repository.list_documents(limit=limit, offset=offset, search=search)

    def get_revision(self, revision_id: UUID) -> Revision:
        rev = self.repository.get_revision(revision_id)
        if not rev:
            raise DocumentNotFoundError(f"Revision {revision_id} not found")
        return rev

    def get_revision_file_path(self, revision_id: UUID) -> Path:
        revision = self.get_revision(revision_id)
        return self.store.path_for(revision.storage_path)

    def get_revision_file_path_for_document(self, document_id: UUID, revision_id: UUID) -> Path:
        revision = self.get_revision(revision_id)
        if revision.document_id != document_id:
            raise DocumentNotFoundError(
                f"Revision {revision_id} does not belong to document {document_id}"
            )
        return self.store.path_for(revision.storage_path)

    def _apply_mutation(
        self,
        document_id: UUID,
        operation: RevisionOperation,
        action: Callable[[Path, Path], None],
    ) -> tuple[Document, Revision]:
        """Generic template method applying an atomic PDF mutation and creating a child revision."""
        document = self.get_document(document_id)
        current_rev = self.get_revision(document.current_revision_id)
        current_path = self.store.path_for(current_rev.storage_path)

        new_revision_id = uuid4()
        temp_dest = current_path.parent / f"mut_{new_revision_id}.tmp"

        try:
            action(current_path, temp_dest)

            # Store the child revision
            rel_path, sha256, size_bytes = self.store.put_revision(
                document_id=document_id,
                revision_id=new_revision_id,
                source=temp_dest,
            )

            inspection = self.pdf_engine.inspect(self.store.path_for(rel_path))
            new_page_count = (
                inspection.page_count
                if (inspection.valid and inspection.page_count > 0)
                else current_rev.page_count
            )

            new_revision = Revision(
                id=new_revision_id,
                document_id=document_id,
                parent_revision_id=current_rev.id,
                operation=operation,
                storage_path=rel_path,
                sha256=sha256,
                size_bytes=size_bytes,
                page_count=new_page_count,
            )

            self.repository.add_revision(new_revision)
            self.repository.update_current_revision(
                document_id=document_id,
                revision_id=new_revision_id,
                page_count=new_page_count,
                size_bytes=size_bytes,
            )

            updated_doc = self.get_document(document_id)
            return updated_doc, new_revision
        finally:
            temp_dest.unlink(missing_ok=True)

    def rotate_page(
        self, document_id: UUID, page_index: int, degrees: int
    ) -> tuple[Document, Revision]:
        return self._apply_mutation(
            document_id=document_id,
            operation=RevisionOperation.ROTATE_PAGE,
            action=lambda src, dst: self.pdf_engine.rotate_page(src, dst, page_index, degrees),
        )

    def reorder_pages(
        self, document_id: UUID, new_order: list[int]
    ) -> tuple[Document, Revision]:
        return self._apply_mutation(
            document_id=document_id,
            operation=RevisionOperation.REORDER,
            action=lambda src, dst: self.pdf_engine.reorder_pages(src, dst, new_order),
        )

    def delete_pages(
        self, document_id: UUID, pages: list[int]
    ) -> tuple[Document, Revision]:
        return self._apply_mutation(
            document_id=document_id,
            operation=RevisionOperation.DELETE_PAGES,
            action=lambda src, dst: self.pdf_engine.delete_pages(src, dst, pages),
        )

    def duplicate_page(
        self, document_id: UUID, page_index: int, count: int = 1
    ) -> tuple[Document, Revision]:
        return self._apply_mutation(
            document_id=document_id,
            operation=RevisionOperation.DUPLICATE_PAGE,
            action=lambda src, dst: self.pdf_engine.duplicate_page(src, dst, page_index, count),
        )

    def resize_pages(
        self,
        document_id: UUID,
        target_size: str,
        page_indices: list[int] | None = None,
        scale_content: bool = True,
    ) -> tuple[Document, Revision]:
        return self._apply_mutation(
            document_id=document_id,
            operation=RevisionOperation.RESIZE_PAGES,
            action=lambda src, dst: self.pdf_engine.resize_pages(
                src, dst, target_size, page_indices, scale_content
            ),
        )

    def crop_pages(
        self,
        document_id: UUID,
        left: float,
        top: float,
        right: float,
        bottom: float,
        page_indices: list[int] | None = None,
    ) -> tuple[Document, Revision]:
        return self._apply_mutation(
            document_id=document_id,
            operation=RevisionOperation.CROP_PAGES,
            action=lambda src, dst: self.pdf_engine.crop_pages(
                src, dst, left, top, right, bottom, page_indices
            ),
        )

    def apply_header_footer(
        self,
        document_id: UUID,
        req: HeaderFooterRequest,
    ) -> tuple[Document, Revision]:
        doc = self.get_document(document_id)
        return self._apply_mutation(
            document_id=document_id,
            operation=RevisionOperation.HEADER_FOOTER,
            action=lambda src, dst: self.pdf_engine.apply_header_footer(
                source=src,
                destination=dst,
                header_left=req.header_left,
                header_center=req.header_center,
                header_right=req.header_right,
                footer_left=req.footer_left,
                footer_center=req.footer_center,
                footer_right=req.footer_right,
                font_size=req.font_size,
                font_color=req.font_color,
                margin=req.margin,
                skip_first_page=req.skip_first_page,
                start_number=req.start_number,
                page_indices=req.page_indices,
                document_title=doc.title,
            ),
        )

    def apply_annotations(
        self,
        document_id: UUID,
        page_index: int,
        texts: list[TextAnnotation],
        shapes: list[ShapeAnnotation],
    ) -> tuple[Document, Revision]:
        raw_texts = [t.model_dump() for t in texts]
        raw_shapes = [s.model_dump() for s in shapes]
        return self._apply_mutation(
            document_id=document_id,
            operation=RevisionOperation.ANNOTATE,
            action=lambda src, dst: self.pdf_engine.apply_annotations(
                src, dst, page_index, raw_texts, raw_shapes
            ),
        )

    def replace_native_text(
        self,
        document_id: UUID,
        page_index: int,
        target_text: str,
        replacement_text: str,
    ) -> tuple[Document, Revision]:
        return self._apply_mutation(
            document_id=document_id,
            operation=RevisionOperation.NATIVE_TEXT_EDIT,
            action=lambda src, dst: self.pdf_engine.replace_native_text(
                src, dst, page_index, target_text, replacement_text
            ),
        )

    def insert_image(
        self,
        document_id: UUID,
        page_index: int,
        image_bytes: bytes,
        x: float,
        y: float,
        width: float | None = None,
        height: float | None = None,
        rotation: float = 0.0,
        opacity: float = 1.0,
    ) -> tuple[Document, Revision]:
        return self._apply_mutation(
            document_id=document_id,
            operation=RevisionOperation.IMAGE_INSERT,
            action=lambda src, dst: self.pdf_engine.insert_image(
                src, dst, page_index, image_bytes, x, y, width, height, rotation, opacity
            ),
        )

    def list_images(self, document_id: UUID, page_index: int) -> list[dict]:
        doc = self.get_document(document_id)
        current_rev = self.get_revision(doc.current_revision_id)
        src = self.store.path_for(current_rev.storage_path)
        return self.pdf_engine.list_images(src, page_index)

    def extract_image(self, document_id: UUID, page_index: int, image_name: str) -> tuple[bytes, str]:
        doc = self.get_document(document_id)
        current_rev = self.get_revision(doc.current_revision_id)
        src = self.store.path_for(current_rev.storage_path)
        return self.pdf_engine.extract_image(src, page_index, image_name)

    def replace_image(
        self,
        document_id: UUID,
        page_index: int,
        image_name: str,
        new_image_bytes: bytes,
    ) -> tuple[Document, Revision]:
        return self._apply_mutation(
            document_id=document_id,
            operation=RevisionOperation.IMAGE_REPLACE,
            action=lambda src, dst: self.pdf_engine.replace_image(
                src, dst, page_index, image_name, new_image_bytes
            ),
        )

    def delete_image(
        self,
        document_id: UUID,
        page_index: int,
        image_name: str,
    ) -> tuple[Document, Revision]:
        return self._apply_mutation(
            document_id=document_id,
            operation=RevisionOperation.IMAGE_DELETE,
            action=lambda src, dst: self.pdf_engine.delete_image(
                src, dst, page_index, image_name
            ),
        )

    def inspect_scanned_pages(
        self, document_id: UUID, ocr_engine: OcrEngine | None = None
    ) -> DocumentOcrInspection:
        doc = self.get_document(document_id)
        current_rev = self.get_revision(doc.current_revision_id)
        src = self.store.path_for(current_rev.storage_path)
        engine = ocr_engine or LocalOcrEngine(settings.tessdata_path)
        return engine.inspect_scanned_pages(src)

    def recognize_page_text(
        self,
        document_id: UUID,
        page_index: int,
        language: str = "eng",
        dpi: int = 150,
        ocr_engine: OcrEngine | None = None,
    ) -> PageOcrResult:
        doc = self.get_document(document_id)
        current_rev = self.get_revision(doc.current_revision_id)
        src = self.store.path_for(current_rev.storage_path)
        engine = ocr_engine or LocalOcrEngine(settings.tessdata_path)
        return engine.recognize_page_text(src, page_index=page_index, language=language, dpi=dpi)

    def apply_ocr_searchable_layer(
        self,
        document_id: UUID,
        page_indices: list[int] | None = None,
        language: str = "eng",
        dpi: int = 150,
        ocr_engine: OcrEngine | None = None,
    ) -> tuple[Document, Revision]:
        engine = ocr_engine or LocalOcrEngine(settings.tessdata_path)
        return self._apply_mutation(
            document_id=document_id,
            operation=RevisionOperation.OCR_SEARCHABLE,
            action=lambda src, dst: engine.make_searchable_pdf(
                src, dst, page_indices=page_indices, language=language, dpi=dpi
            ),
        )

    def correct_scanned_region(
        self,
        document_id: UUID,
        request: ScannedRegionCorrectionRequest,
        ocr_engine: OcrEngine | None = None,
    ) -> tuple[Document, Revision]:
        engine = ocr_engine or LocalOcrEngine(settings.tessdata_path)
        return self._apply_mutation(
            document_id=document_id,
            operation=RevisionOperation.SCANNED_REGION_CORRECTION,
            action=lambda src, dst: engine.correct_scanned_region(
                source=src,
                destination=dst,
                page_index=request.page_index,
                bbox=request.bbox,
                replacement_text=request.replacement_text,
                font_name=request.font_name,
                font_size=request.font_size,
                text_color=request.text_color,
                background_color=request.background_color,
                cleanup_raster=request.cleanup_raster,
            ),
        )

    def reconstruct_scanned_pages(
        self,
        document_id: UUID,
        request: ScannedReconstructionRequest,
        ocr_engine: OcrEngine | None = None,
    ) -> tuple[Document, Revision]:
        engine = ocr_engine or LocalOcrEngine(settings.tessdata_path)

        if request.create_new_document:
            source_doc = self.get_document(document_id)
            current_rev = self.get_revision(source_doc.current_revision_id)
            current_path = self.store.path_for(current_rev.storage_path)

            new_doc_id = uuid4()
            original_rev_id = uuid4()
            temp_dest = current_path.parent / f"reconstruct_{new_doc_id}.tmp"

            try:
                engine.reconstruct_scanned_page(
                    source=current_path,
                    destination=temp_dest,
                    page_indices=request.page_indices,
                    mode=request.mode,
                    font_name=request.font_name,
                    language=request.language,
                    dpi=request.dpi,
                )
                with temp_dest.open("rb") as stream:
                    rel_path, sha256_hash, size_bytes = self.store.put_original(new_doc_id, stream)

                inspection = self.pdf_engine.validate(temp_dest)
                revision = Revision(
                    id=original_rev_id,
                    document_id=new_doc_id,
                    parent_revision_id=None,
                    operation=RevisionOperation.SCANNED_RECONSTRUCTION,
                    storage_path=rel_path,
                    sha256=sha256_hash,
                    size_bytes=size_bytes,
                    page_count=inspection.page_count,
                )
                new_title = request.new_title or f"Reconstructed - {source_doc.title}"
                new_doc = Document(
                    id=new_doc_id,
                    title=new_title,
                    page_count=inspection.page_count,
                    size_bytes=size_bytes,
                    original_revision_id=original_rev_id,
                    current_revision_id=original_rev_id,
                )
                self.repository.add(new_doc, revision)
                return new_doc, revision
            finally:
                if temp_dest.exists():
                    temp_dest.unlink(missing_ok=True)
        else:
            return self._apply_mutation(
                document_id=document_id,
                operation=RevisionOperation.SCANNED_RECONSTRUCTION,
                action=lambda src, dst: engine.reconstruct_scanned_page(
                    source=src,
                    destination=dst,
                    page_indices=request.page_indices,
                    mode=request.mode,
                    font_name=request.font_name,
                    language=request.language,
                    dpi=request.dpi,
                ),
            )

    def inspect_forms(
        self,
        document_id: UUID,
        form_engine: FormEngine | None = None,
    ) -> DocumentFormsInspection:
        doc = self.get_document(document_id)
        current_rev = self.get_revision(doc.current_revision_id)
        src = self.store.path_for(current_rev.storage_path)
        engine = form_engine or LocalFormEngine()
        return engine.inspect_forms(src)

    def fill_forms(
        self,
        document_id: UUID,
        values: dict[str, Any],
        flatten: bool = False,
        form_engine: FormEngine | None = None,
    ) -> tuple[Document, Revision]:
        engine = form_engine or LocalFormEngine()
        op = RevisionOperation.FORM_FLATTEN if flatten else RevisionOperation.FORM_FILL
        return self._apply_mutation(
            document_id=document_id,
            operation=op,
            action=lambda src, dst: engine.fill_forms(src, dst, values=values, flatten=flatten),
        )

    def flatten_forms(
        self,
        document_id: UUID,
        form_engine: FormEngine | None = None,
    ) -> tuple[Document, Revision]:
        engine = form_engine or LocalFormEngine()
        return self._apply_mutation(
            document_id=document_id,
            operation=RevisionOperation.FORM_FLATTEN,
            action=lambda src, dst: engine.flatten_forms(src, dst),
        )

    def add_form_field(
        self,
        document_id: UUID,
        request: CreateFormFieldRequest,
        form_engine: FormEngine | None = None,
    ) -> tuple[Document, Revision]:
        engine = form_engine or LocalFormEngine()
        return self._apply_mutation(
            document_id=document_id,
            operation=RevisionOperation.FORM_FIELD_CREATE,
            action=lambda src, dst: engine.add_form_field(src, dst, req=request),
        )

    def _default_signature_engine(self) -> LocalSignatureEngine:
        return LocalSignatureEngine(
            signatures_dir=settings.signatures_path,
            certs_dir=settings.certs_path,
            temp_dir=settings.temp_path,
        )

    def apply_visual_signature_stamp(
        self,
        document_id: UUID,
        request: VisualSignatureStampRequest,
        signature_engine: SignatureEngine | None = None,
    ) -> tuple[Document, Revision]:
        """Applies a visual electronic signature stamp overlay (graphic/caption), creating a child revision."""
        engine = signature_engine or self._default_signature_engine()
        return self._apply_mutation(
            document_id=document_id,
            operation=RevisionOperation.VISUAL_SIGNATURE_STAMP,
            action=lambda src, dst: engine.apply_visual_signature_stamp(src, dst, req=request),
        )

    def sign_document_digitally(
        self,
        document_id: UUID,
        request: DigitalSignRequest,
        signature_engine: SignatureEngine | None = None,
    ) -> tuple[Document, Revision]:
        """Embeds a PKCS#7 / PAdES cryptographic signature over the PDF byte range as a child revision."""
        engine = signature_engine or self._default_signature_engine()
        return self._apply_mutation(
            document_id=document_id,
            operation=RevisionOperation.DIGITAL_SIGNATURE,
            action=lambda src, dst: engine.sign_pdf_cryptographically(src, dst, req=request),
        )

    def verify_document_signatures(
        self,
        document_id: UUID,
        signature_engine: SignatureEngine | None = None,
    ) -> DocumentSignaturesReport:
        """Inspects and cryptographically verifies all embedded digital signatures offline."""
        doc = self.get_document(document_id)
        current_rev = self.get_revision(doc.current_revision_id)
        src = self.store.path_for(current_rev.storage_path)
        engine = signature_engine or self._default_signature_engine()
        return engine.verify_pdf_signatures(src, document_id=str(doc.id))

    def inspect_security(
        self,
        document_id: UUID,
        security_engine: SecurityEngine | None = None,
    ) -> DocumentSecurityInspection:
        doc = self.get_document(document_id)
        current_rev = self.get_revision(doc.current_revision_id)
        src = self.store.path_for(current_rev.storage_path)
        engine = security_engine or LocalSecurityEngine()
        return engine.inspect_security(src, document_id=str(doc.id))

    def encrypt_document(
        self,
        document_id: UUID,
        request: EncryptPdfRequest,
        security_engine: SecurityEngine | None = None,
    ) -> tuple[Document, Revision]:
        engine = security_engine or LocalSecurityEngine()
        return self._apply_mutation(
            document_id=document_id,
            operation=RevisionOperation.ENCRYPT,
            action=lambda src, dst: engine.encrypt_pdf(src, dst, req=request),
        )

    def decrypt_document(
        self,
        document_id: UUID,
        password: str,
        security_engine: SecurityEngine | None = None,
    ) -> tuple[Document, Revision]:
        engine = security_engine or LocalSecurityEngine()
        return self._apply_mutation(
            document_id=document_id,
            operation=RevisionOperation.DECRYPT,
            action=lambda src, dst: engine.decrypt_pdf(src, dst, password=password),
        )

    def redact_document(
        self,
        document_id: UUID,
        request: RedactPdfRequest,
        security_engine: SecurityEngine | None = None,
    ) -> tuple[Document, Revision]:
        engine = security_engine or LocalSecurityEngine()
        return self._apply_mutation(
            document_id=document_id,
            operation=RevisionOperation.REDACT,
            action=lambda src, dst: engine.apply_permanent_redaction(src, dst, req=request),
        )

    def sanitize_document_metadata(
        self,
        document_id: UUID,
        request: SanitizeMetadataRequest,
        security_engine: SecurityEngine | None = None,
    ) -> tuple[Document, Revision]:
        engine = security_engine or LocalSecurityEngine()
        return self._apply_mutation(
            document_id=document_id,
            operation=RevisionOperation.SANITIZE_METADATA,
            action=lambda src, dst: engine.sanitize_metadata(src, dst, req=request),
        )

    # --- Phase 13 Advanced Utilities (Watermark, Compression, Bookmarks, Compare, Batch) ---

    def apply_watermark(
        self,
        document_id: UUID,
        request: WatermarkRequest,
        utilities_engine: UtilitiesEngine | None = None,
    ) -> tuple[Document, Revision]:
        engine = utilities_engine or LocalUtilitiesEngine()
        return self._apply_mutation(
            document_id=document_id,
            operation=RevisionOperation.WATERMARK,
            action=lambda src, dst: engine.apply_watermark(src, dst, req=request),
        )

    def compress_document(
        self,
        document_id: UUID,
        mode: str = "lossless",
        utilities_engine: UtilitiesEngine | None = None,
    ) -> CompressionResult:
        engine = utilities_engine or LocalUtilitiesEngine()
        norm_mode = mode.strip().lower()
        size_metrics: list[tuple[int, int]] = []

        def _run_compress(src: Path, dst: Path) -> None:
            orig_b, new_b = engine.compress_pdf(src, dst, mode=norm_mode)
            size_metrics.append((orig_b, new_b))

        doc, rev = self._apply_mutation(
            document_id=document_id,
            operation=RevisionOperation.COMPRESS,
            action=_run_compress,
        )
        orig_bytes, new_bytes = size_metrics[0]
        saved_bytes = orig_bytes - new_bytes
        reduction = round((saved_bytes / orig_bytes) * 100.0, 2) if orig_bytes > 0 else 0.0
        return CompressionResult(
            document=doc,
            revision=rev,
            original_bytes=orig_bytes,
            compressed_bytes=new_bytes,
            saved_bytes=saved_bytes,
            reduction_percent=reduction,
            mode=norm_mode,
        )

    def get_bookmarks(
        self,
        document_id: UUID,
        utilities_engine: UtilitiesEngine | None = None,
    ) -> DocumentBookmarks:
        doc = self.get_document(document_id)
        current_rev = self.get_revision(doc.current_revision_id)
        src = self.store.path_for(current_rev.storage_path)
        engine = utilities_engine or LocalUtilitiesEngine()
        return engine.get_bookmarks(src, document_id=str(doc.id))

    def suggest_bookmarks(
        self,
        document_id: UUID,
        utilities_engine: UtilitiesEngine | None = None,
    ) -> list[BookmarkItem]:
        doc = self.get_document(document_id)
        current_rev = self.get_revision(doc.current_revision_id)
        src = self.store.path_for(current_rev.storage_path)
        engine = utilities_engine or LocalUtilitiesEngine()
        return engine.suggest_bookmarks(src)

    def update_bookmarks(
        self,
        document_id: UUID,
        bookmarks: list[BookmarkItem],
        utilities_engine: UtilitiesEngine | None = None,
    ) -> tuple[Document, Revision]:
        engine = utilities_engine or LocalUtilitiesEngine()
        return self._apply_mutation(
            document_id=document_id,
            operation=RevisionOperation.BOOKMARKS_UPDATE,
            action=lambda src, dst: engine.set_bookmarks(src, dst, bookmarks),
        )

    def _resolve_revision_path_for_doc(
        self, document_id: UUID, revision_id: UUID | None
    ) -> tuple[Document, Path]:
        doc = self.get_document(document_id)
        if revision_id is not None:
            rev = self.get_revision(revision_id)
            if rev.document_id != doc.id:
                raise ValueError(
                    f"Revision {revision_id} does not belong to document {document_id}"
                )
            return doc, self.store.path_for(rev.storage_path)
        head_rev = self.get_revision(doc.current_revision_id)
        return doc, self.store.path_for(head_rev.storage_path)

    def compare_documents(
        self,
        request: CompareDocumentsRequest,
        utilities_engine: UtilitiesEngine | None = None,
    ) -> DocumentComparisonReport:
        doc_a, path_a = self._resolve_revision_path_for_doc(
            request.document_a_id, request.revision_a_id
        )
        doc_b, path_b = self._resolve_revision_path_for_doc(
            request.document_b_id, request.revision_b_id
        )
        label_a = (
            f"{doc_a.title} ({str(request.revision_a_id)[:8]})"
            if request.revision_a_id
            else doc_a.title
        )
        label_b = (
            f"{doc_b.title} ({str(request.revision_b_id)[:8]})"
            if request.revision_b_id
            else doc_b.title
        )
        engine = utilities_engine or LocalUtilitiesEngine()
        return engine.compare_pdfs(
            path_a=path_a,
            path_b=path_b,
            doc_a_id=str(doc_a.id),
            doc_b_id=str(doc_b.id),
            title_a=label_a,
            title_b=label_b,
            max_pages=request.max_pages,
        )

    def render_diff_page_image(
        self,
        doc_a_id: UUID,
        doc_b_id: UUID,
        page_index: int,
        rev_a_id: UUID | None = None,
        rev_b_id: UUID | None = None,
        dpi: int = 120,
        utilities_engine: UtilitiesEngine | None = None,
    ) -> bytes:
        _, path_a = self._resolve_revision_path_for_doc(doc_a_id, rev_a_id)
        _, path_b = self._resolve_revision_path_for_doc(doc_b_id, rev_b_id)
        engine = utilities_engine or LocalUtilitiesEngine()
        return engine.render_diff_page_image(
            path_a=path_a,
            path_b=path_b,
            page_index=page_index,
            dpi=dpi,
        )

    def run_batch_utility(
        self,
        request: BatchUtilityRequest,
        utilities_engine: UtilitiesEngine | None = None,
        security_engine: SecurityEngine | None = None,
    ) -> BatchUtilityResponse:
        norm_action = request.action.strip().lower()
        if norm_action not in {"watermark", "compress", "sanitize"}:
            raise ValueError("Batch action must be 'watermark', 'compress', or 'sanitize'")
        if norm_action == "watermark" and request.watermark is None:
            raise ValueError("watermark configuration must be provided for batch watermark")

        u_engine = utilities_engine or LocalUtilitiesEngine()
        s_engine = security_engine or LocalSecurityEngine()

        results: list[BatchDocumentResult] = []
        succeeded = 0
        failed = 0

        for doc_id in request.document_ids:
            doc_title = str(doc_id)
            try:
                doc = self.get_document(doc_id)
                doc_title = doc.title

                if norm_action == "watermark":
                    assert request.watermark is not None
                    _, rev = self.apply_watermark(doc_id, request.watermark, utilities_engine=u_engine)
                elif norm_action == "compress":
                    mode = request.compress.mode if request.compress else "lossless"
                    comp = self.compress_document(doc_id, mode=mode, utilities_engine=u_engine)
                    rev = comp.revision
                else:
                    san_req = request.sanitize or SanitizeMetadataRequest()
                    _, rev = self.sanitize_document_metadata(
                        doc_id, san_req, security_engine=s_engine
                    )

                results.append(
                    BatchDocumentResult(
                        document_id=str(doc_id),
                        title=doc_title,
                        success=True,
                        new_revision_id=str(rev.id),
                    )
                )
                succeeded += 1
            except Exception as err:
                results.append(
                    BatchDocumentResult(
                        document_id=str(doc_id),
                        title=doc_title,
                        success=False,
                        error=str(err),
                    )
                )
                failed += 1

        return BatchUtilityResponse(
            action=norm_action,
            total=len(request.document_ids),
            succeeded=succeeded,
            failed=failed,
            results=results,
        )

    # --- Phase 14 AI Assistant (Euri API + Local Ollama) ---

    def preview_ai_context(
        self,
        document_id: UUID,
        page_indices: list[int] | None = None,
        max_context_chars: int = 36000,
        ai_engine: AIEngine | None = None,
    ) -> AIContextPreview:
        doc = self.get_document(document_id)
        current_rev = self.get_revision(doc.current_revision_id)
        src = self.store.path_for(current_rev.storage_path)
        engine = ai_engine or LocalAndEuriAIEngine()
        return engine.preview_context(
            source=src,
            document_id=str(doc.id),
            page_indices=page_indices,
            max_context_chars=max_context_chars,
        )

    def ai_summarize_document(
        self,
        document_id: UUID,
        request: AISummarizeRequest,
        override_api_key: str | None = None,
        ai_engine: AIEngine | None = None,
    ) -> AIAnalysisResponse:
        doc = self.get_document(document_id)
        current_rev = self.get_revision(doc.current_revision_id)
        src = self.store.path_for(current_rev.storage_path)
        engine = ai_engine or LocalAndEuriAIEngine()
        return engine.summarize_document(
            source=src,
            document_id=str(doc.id),
            req=request,
            override_api_key=override_api_key,
        )

    def ai_ask_document(
        self,
        document_id: UUID,
        request: AIAskRequest,
        override_api_key: str | None = None,
        ai_engine: AIEngine | None = None,
    ) -> AIAnalysisResponse:
        doc = self.get_document(document_id)
        current_rev = self.get_revision(doc.current_revision_id)
        src = self.store.path_for(current_rev.storage_path)
        engine = ai_engine or LocalAndEuriAIEngine()
        return engine.ask_document(
            source=src,
            document_id=str(doc.id),
            req=request,
            override_api_key=override_api_key,
        )

    def ai_extract_structured_data(
        self,
        document_id: UUID,
        request: AIExtractRequest,
        override_api_key: str | None = None,
        ai_engine: AIEngine | None = None,
    ) -> AIStructuredExtractionResponse:
        doc = self.get_document(document_id)
        current_rev = self.get_revision(doc.current_revision_id)
        src = self.store.path_for(current_rev.storage_path)
        engine = ai_engine or LocalAndEuriAIEngine()
        return engine.extract_structured_data(
            source=src,
            document_id=str(doc.id),
            req=request,
            override_api_key=override_api_key,
        )

    def ai_save_summary_pdf(
        self,
        document_id: UUID,
        request: SaveAISummaryPdfRequest,
        ai_engine: AIEngine | None = None,
    ) -> tuple[Document, Revision]:
        norm_mode = request.mode.strip().lower()
        if norm_mode not in {"new_document", "prepend_cover_page"}:
            raise ValueError("mode must be 'new_document' or 'prepend_cover_page'")

        engine = ai_engine or LocalAndEuriAIEngine()

        if norm_mode == "prepend_cover_page":
            return self._apply_mutation(
                document_id=document_id,
                operation=RevisionOperation.AI_SUMMARY_COVER,
                action=lambda src, dst: engine.export_summary_to_pdf(
                    source=src,
                    destination=dst,
                    heading=request.heading,
                    content=request.content,
                    model_used=request.model_used,
                    mode="prepend_cover_page",
                ),
            )

        # Standalone new catalog document
        source_doc = self.get_document(document_id)
        new_doc_id = uuid4()
        original_rev_id = uuid4()
        settings.temp_path.mkdir(parents=True, exist_ok=True)
        temp_dest = settings.temp_path / f"ai_summary_{new_doc_id}.tmp"

        try:
            engine.export_summary_to_pdf(
                source=None,
                destination=temp_dest,
                heading=request.heading,
                content=request.content,
                model_used=request.model_used,
                mode="new_document",
            )
            with temp_dest.open("rb") as stream:
                rel_path, sha256_hash, size_bytes = self.store.put_original(new_doc_id, stream)

            inspection = self.pdf_engine.inspect(self.store.path_for(rel_path))
            page_count = inspection.page_count if inspection.valid else 1

            doc_title = request.title or f"AI Summary - {source_doc.title}"
            if not doc_title.lower().endswith(".pdf"):
                doc_title += ".pdf"

            revision = Revision(
                id=original_rev_id,
                document_id=new_doc_id,
                parent_revision_id=None,
                operation=RevisionOperation.AI_SUMMARY_REPORT,
                storage_path=rel_path,
                sha256=sha256_hash,
                size_bytes=size_bytes,
                page_count=page_count,
            )
            new_doc = Document(
                id=new_doc_id,
                title=doc_title,
                mime_type="application/pdf",
                page_count=page_count,
                size_bytes=size_bytes,
                original_revision_id=original_rev_id,
                current_revision_id=original_rev_id,
            )
            self.repository.add(new_doc, revision)
            return new_doc, revision
        finally:
            temp_dest.unlink(missing_ok=True)

    def extract_pages(
        self, document_id: UUID, pages: list[int], new_title: str | None = None
    ) -> tuple[Document, Revision]:
        """Extracts pages into a brand new standalone document with its own original revision."""
        source_doc = self.get_document(document_id)
        current_rev = self.get_revision(source_doc.current_revision_id)
        current_path = self.store.path_for(current_rev.storage_path)

        new_doc_id = uuid4()
        original_rev_id = uuid4()
        temp_dest = current_path.parent / f"extract_{new_doc_id}.tmp"

        try:
            self.pdf_engine.extract_pages(current_path, temp_dest, pages)
            with temp_dest.open("rb") as stream:
                rel_path, sha256, size_bytes = self.store.put_original(new_doc_id, stream)

            inspection = self.pdf_engine.inspect(self.store.path_for(rel_path))
            page_count = inspection.page_count if inspection.valid else len(pages)

            title = new_title or f"Extracted from {source_doc.title}"
            if not title.lower().endswith(".pdf"):
                title += ".pdf"

            revision = Revision(
                id=original_rev_id,
                document_id=new_doc_id,
                parent_revision_id=None,
                operation=RevisionOperation.EXTRACT_PAGES,
                storage_path=rel_path,
                sha256=sha256,
                size_bytes=size_bytes,
                page_count=page_count,
            )

            new_document = Document(
                id=new_doc_id,
                title=title,
                mime_type="application/pdf",
                page_count=page_count,
                size_bytes=size_bytes,
                original_revision_id=original_rev_id,
                current_revision_id=original_rev_id,
            )

            self.repository.add(new_document, revision)
            return new_document, revision
        finally:
            temp_dest.unlink(missing_ok=True)

    def merge_documents(
        self, document_ids: list[UUID], merged_title: str = "Merged.pdf"
    ) -> tuple[Document, Revision]:
        """Merges multiple documents into a new standalone document."""
        if len(document_ids) < 2:
            raise ValueError("At least 2 documents are required to merge")

        source_paths: list[Path] = []
        for doc_id in document_ids:
            doc = self.get_document(doc_id)
            current_rev = self.get_revision(doc.current_revision_id)
            source_paths.append(self.store.path_for(current_rev.storage_path))

        new_doc_id = uuid4()
        original_rev_id = uuid4()
        temp_dest = self.store.root / "temp" / f"merge_{new_doc_id}.tmp"
        temp_dest.parent.mkdir(parents=True, exist_ok=True)

        try:
            self.pdf_engine.merge_documents(source_paths, temp_dest)
            with temp_dest.open("rb") as stream:
                rel_path, sha256, size_bytes = self.store.put_original(new_doc_id, stream)

            inspection = self.pdf_engine.inspect(self.store.path_for(rel_path))
            page_count = inspection.page_count if inspection.valid else 0

            title = merged_title or "Merged.pdf"
            if not title.lower().endswith(".pdf"):
                title += ".pdf"

            revision = Revision(
                id=original_rev_id,
                document_id=new_doc_id,
                parent_revision_id=None,
                operation=RevisionOperation.MERGE,
                storage_path=rel_path,
                sha256=sha256,
                size_bytes=size_bytes,
                page_count=page_count,
            )

            new_document = Document(
                id=new_doc_id,
                title=title,
                mime_type="application/pdf",
                page_count=page_count,
                size_bytes=size_bytes,
                original_revision_id=original_rev_id,
                current_revision_id=original_rev_id,
            )

            self.repository.add(new_document, revision)
            return new_document, revision
        finally:
            temp_dest.unlink(missing_ok=True)

    def create_document_from_template(
        self,
        template: PdfTemplate,
        variables: dict[str, Any],
        title: str | None = None,
        template_engine: TemplateEngine | None = None,
    ) -> tuple[Document, Revision]:
        """Synthesizes a PDF from a template and registers it as a new document in the local catalog."""
        engine = template_engine or LocalTemplateEngine(settings.templates_path)
        new_doc_id = uuid4()
        original_rev_id = uuid4()
        temp_dest = settings.temp_path / f"tpl_render_{new_doc_id}.tmp"

        try:
            page_count, _ = engine.render_to_pdf(template, variables, temp_dest)
            with temp_dest.open("rb") as stream:
                rel_path, sha256_hash, stored_size = self.store.put_original(new_doc_id, stream)

            doc_title = title or f"{template.name}.pdf"
            if not doc_title.lower().endswith(".pdf"):
                doc_title += ".pdf"

            revision = Revision(
                id=original_rev_id,
                document_id=new_doc_id,
                parent_revision_id=None,
                operation=RevisionOperation.TEMPLATE_RENDER,
                storage_path=rel_path,
                sha256=sha256_hash,
                size_bytes=stored_size,
                page_count=page_count,
            )
            new_document = Document(
                id=new_doc_id,
                title=doc_title,
                mime_type="application/pdf",
                page_count=page_count,
                size_bytes=stored_size,
                original_revision_id=original_rev_id,
                current_revision_id=original_rev_id,
            )

            self.repository.add(new_document, revision)
            return new_document, revision
        finally:
            if temp_dest.exists():
                temp_dest.unlink(missing_ok=True)

    def export_revision(
        self, document_id: UUID, revision_id: UUID | None = None
    ) -> tuple[Path, str]:
        document = self.get_document(document_id)
        target_rev_id = revision_id if revision_id is not None else document.current_revision_id
        target_rev = self.get_revision(target_rev_id)
        if target_rev.document_id != document.id:
            raise DocumentNotFoundError(
                f"Revision {target_rev_id} does not belong to document {document_id}"
            )
        target_path = self.store.path_for(target_rev.storage_path)

        if not target_path.exists():
            raise FileNotFoundError(f"Export target file missing: {target_path}")

        # Validate before export
        inspection = self.pdf_engine.validate(target_path)
        if not inspection.valid:
            raise InvalidPdfError(f"Export file validation failed: {inspection.warnings}")

        export_name = document.title
        return target_path, export_name

    def delete_document(self, document_id: UUID) -> bool:
        return self.repository.delete_document(document_id)
