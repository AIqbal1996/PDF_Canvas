from pathlib import Path
from typing import Protocol
import pymupdf as fitz
import pypdf
from pypdf import PasswordType
from pypdf.constants import UserAccessPermissions

from ..models import (
    DocumentSecurityInspection,
    EncryptPdfRequest,
    RedactPdfRequest,
    SanitizeMetadataRequest,
)


class SecurityEngine(Protocol):
    def inspect_security(self, source: Path, document_id: str) -> DocumentSecurityInspection:
        """Inspects encryption state, metadata dictionaries, XMP, attachments, annotations, and script actions."""
        ...

    def encrypt_pdf(self, source: Path, destination: Path, req: EncryptPdfRequest) -> None:
        """Encrypts a PDF using AES-256 with configurable user/owner passwords and permissions."""
        ...

    def decrypt_pdf(self, source: Path, destination: Path, password: str) -> None:
        """Verifies user/owner password and writes an unencrypted copy to destination."""
        ...

    def apply_permanent_redaction(
        self, source: Path, destination: Path, req: RedactPdfRequest
    ) -> int:
        """Irreversibly removes underlying text and image pixels inside redaction regions."""
        ...

    def sanitize_metadata(
        self, source: Path, destination: Path, req: SanitizeMetadataRequest
    ) -> None:
        """Removes identifying metadata (/Info, XMP), attachments, thumbnails, and active scripts."""
        ...


class LocalSecurityEngine:
    """Offline PDF security engine powered by pypdf (AES-256 encryption) and PyMuPDF (permanent redaction & scrub)."""

    @staticmethod
    def _hex_to_rgb_float(hex_str: str, default: tuple[float, float, float] = (0.0, 0.0, 0.0)) -> tuple[float, float, float]:
        cleaned = (hex_str or "").strip().lstrip("#")
        if len(cleaned) != 6:
            return default
        try:
            r = int(cleaned[0:2], 16) / 255.0
            g = int(cleaned[2:4], 16) / 255.0
            b = int(cleaned[4:6], 16) / 255.0
            return (r, g, b)
        except ValueError:
            return default

    @staticmethod
    def _detect_encryption_scheme(reader: pypdf.PdfReader) -> str | None:
        if not reader.is_encrypted:
            return None
        try:
            enc = reader.trailer.get("/Encrypt")
            if enc is None:
                return "Encrypted"
            enc_obj = enc.get_object() if hasattr(enc, "get_object") else enc
            v = int(enc_obj.get("/V", 0))
            r = int(enc_obj.get("/R", 0))
            length = int(enc_obj.get("/Length", 0))
            if v >= 5 or r >= 5:
                return f"AES-256 (V={v}, R={r})"
            if v == 4:
                return f"AES-128 / V4 ({length or 128}-bit)"
            return f"RC4 / Legacy (V={v}, R={r})"
        except Exception:
            return "Standard PDF Encryption"

    @staticmethod
    def _catalog_has_active_actions(doc: fitz.Document) -> bool:
        try:
            cat = doc.pdf_catalog()
            for key in ("OpenAction", "AA"):
                val_type, _ = doc.xref_get_key(cat, key)
                if val_type not in ("null", ""):
                    return True
            names_type, names_val = doc.xref_get_key(cat, "Names")
            if names_type == "xref":
                names_xref = int(names_val.split()[0])
                js_type, _ = doc.xref_get_key(names_xref, "JavaScript")
                if js_type not in ("null", ""):
                    return True
            elif names_type == "dict" and "/JavaScript" in names_val:
                return True
            for page in doc:
                px = page.xref
                p_aa_type, _ = doc.xref_get_key(px, "AA")
                if p_aa_type not in ("null", ""):
                    return True
        except Exception:
            pass
        return False

    def inspect_security(self, source: Path, document_id: str) -> DocumentSecurityInspection:
        if not source.exists():
            raise FileNotFoundError(f"Source PDF does not exist: {source}")

        reader = pypdf.PdfReader(str(source))
        is_enc = reader.is_encrypted
        scheme = self._detect_encryption_scheme(reader)
        warnings: list[str] = []

        requires_open_pw = False
        if is_enc:
            probe = pypdf.PdfReader(str(source))
            if probe.decrypt("") == PasswordType.NOT_DECRYPTED:
                requires_open_pw = True
                warnings.append(
                    "Document is locked with a User Open Password. Decrypt the PDF to inspect internal metadata or attachments."
                )
                return DocumentSecurityInspection(
                    document_id=document_id,
                    is_encrypted=True,
                    requires_open_password=True,
                    encryption_scheme=scheme,
                    warnings=warnings,
                )

        doc = fitz.open(str(source))
        try:
            if doc.needs_pass:
                doc.authenticate("")

            raw_meta = doc.metadata or {}
            clean_meta = {
                k: str(v).strip()
                for k, v in raw_meta.items()
                if k not in ("encryption", "format") and v is not None and str(v).strip() != ""
            }
            xml_meta = doc.get_xml_metadata() or ""
            xmp_bytes = len(xml_meta.encode("utf-8")) if xml_meta else 0
            emb_names = list(doc.embfile_names())
            has_js = self._catalog_has_active_actions(doc)

            annot_count = 0
            for page in doc:
                annot_count += sum(1 for _ in page.annots() or [])

            if clean_meta:
                warnings.append(f"Contains {len(clean_meta)} populated /Info metadata field(s).")
            if xmp_bytes > 0:
                warnings.append(f"Contains embedded XMP XML metadata packet ({xmp_bytes} bytes).")
            if emb_names:
                warnings.append(f"Contains {len(emb_names)} embedded file attachment(s).")
            if has_js:
                warnings.append("Contains catalog/page OpenAction or JavaScript triggers.")

            return DocumentSecurityInspection(
                document_id=document_id,
                is_encrypted=is_enc,
                requires_open_password=False,
                encryption_scheme=scheme,
                metadata=clean_meta,
                metadata_field_count=len(clean_meta),
                has_xmp_metadata=xmp_bytes > 0,
                xmp_bytes=xmp_bytes,
                embedded_files=emb_names,
                has_javascript_or_open_action=has_js,
                annotation_count=annot_count,
                warnings=warnings,
            )
        finally:
            doc.close()

    def encrypt_pdf(self, source: Path, destination: Path, req: EncryptPdfRequest) -> None:
        if not source.exists():
            raise FileNotFoundError(f"Source PDF does not exist: {source}")

        user_pw = req.user_password or ""
        owner_pw = req.owner_password or ""
        if not user_pw and not owner_pw:
            raise ValueError("Provide at least a user open password or an owner permissions password")

        reader = pypdf.PdfReader(str(source))
        if reader.is_encrypted:
            raise ValueError("Document is already encrypted. Decrypt it first before changing security settings.")

        perm = UserAccessPermissions(0)
        if req.permissions.allow_printing:
            perm |= UserAccessPermissions.PRINT | UserAccessPermissions.PRINT_TO_REPRESENTATION
        if req.permissions.allow_copying:
            perm |= UserAccessPermissions.EXTRACT | UserAccessPermissions.EXTRACT_TEXT_AND_GRAPHICS
        if req.permissions.allow_modifying:
            perm |= UserAccessPermissions.MODIFY | UserAccessPermissions.ASSEMBLE_DOC
        if req.permissions.allow_annotations:
            perm |= UserAccessPermissions.ADD_OR_MODIFY | UserAccessPermissions.FILL_FORM_FIELDS

        writer = pypdf.PdfWriter()
        writer.append(reader)
        effective_owner = owner_pw if owner_pw else user_pw
        writer.encrypt(
            user_password=user_pw,
            owner_password=effective_owner,
            permissions_flag=perm,
            algorithm="AES-256",
        )

        destination.parent.mkdir(parents=True, exist_ok=True)
        temp_dest = destination.with_suffix(".tmp_enc")
        try:
            with temp_dest.open("wb") as f:
                writer.write(f)
            temp_dest.replace(destination)
        finally:
            temp_dest.unlink(missing_ok=True)

    def decrypt_pdf(self, source: Path, destination: Path, password: str) -> None:
        if not source.exists():
            raise FileNotFoundError(f"Source PDF does not exist: {source}")

        probe = pypdf.PdfReader(str(source))
        if not probe.is_encrypted:
            raise ValueError("Document is not encrypted")

        # Determine whether the document requires an open password or has an owner-only lock
        has_user_open_password = probe.decrypt("") == PasswordType.NOT_DECRYPTED

        reader = pypdf.PdfReader(str(source))
        auth_result = reader.decrypt(password)
        if auth_result == PasswordType.NOT_DECRYPTED:
            raise ValueError("Incorrect password for encrypted PDF")

        if not has_user_open_password and auth_result != PasswordType.OWNER_PASSWORD:
            raise ValueError(
                "Owner password is required to strip document permissions lock"
            )

        writer = pypdf.PdfWriter()
        writer.append(reader)

        destination.parent.mkdir(parents=True, exist_ok=True)
        temp_dest = destination.with_suffix(".tmp_dec")
        try:
            with temp_dest.open("wb") as f:
                writer.write(f)
            verify_reader = pypdf.PdfReader(str(temp_dest))
            if verify_reader.is_encrypted:
                raise RuntimeError("Decryption verification failed: output remains encrypted")
            temp_dest.replace(destination)
        finally:
            temp_dest.unlink(missing_ok=True)

    def apply_permanent_redaction(
        self, source: Path, destination: Path, req: RedactPdfRequest
    ) -> int:
        if not source.exists():
            raise FileNotFoundError(f"Source PDF does not exist: {source}")

        cleaned_terms = [t.strip() for t in req.search_terms if t and t.strip()]
        if not req.regions and not cleaned_terms:
            raise ValueError("Provide at least one redaction bounding box or search term")

        reader = pypdf.PdfReader(str(source))
        if reader.is_encrypted:
            raise ValueError("Document is encrypted. Decrypt it before applying permanent redactions.")

        doc = fitz.open(str(source))
        total_pages = len(doc)
        touched_pages: set[int] = set()
        staged_count = 0

        try:
            # Validate & stage coordinate regions
            for reg in req.regions:
                if reg.page_index < 0 or reg.page_index >= total_pages:
                    raise IndexError(
                        f"Redaction page_index {reg.page_index} out of range (0..{total_pages - 1})"
                    )
                x0, y0, x1, y1 = reg.rect
                if x0 >= x1 or y0 >= y1:
                    raise ValueError(
                        f"Invalid redaction bounding box [x0={x0}, y0={y0}, x1={x1}, y1={y1}]: x1 > x0 and y1 > y0 required"
                    )
                page = doc[reg.page_index]
                fill_rgb = self._hex_to_rgb_float(reg.fill_color, (0.0, 0.0, 0.0))
                text_rgb = self._hex_to_rgb_float(reg.text_color, (1.0, 1.0, 1.0))
                page.add_redact_annot(
                    fitz.Rect(x0, y0, x1, y1),
                    text=reg.overlay_text,
                    fill=fill_rgb,
                    text_color=text_rgb,
                )
                touched_pages.add(reg.page_index)
                staged_count += 1

            # Resolve & stage text search terms across target pages
            if cleaned_terms:
                if req.page_indices is not None and len(req.page_indices) > 0:
                    target_pages = req.page_indices
                    for p_idx in target_pages:
                        if p_idx < 0 or p_idx >= total_pages:
                            raise IndexError(
                                f"Page index {p_idx} out of range (0..{total_pages - 1})"
                            )
                else:
                    target_pages = list(range(total_pages))

                default_fill = self._hex_to_rgb_float(req.fill_color, (0.0, 0.0, 0.0))
                default_text = self._hex_to_rgb_float(req.text_color, (1.0, 1.0, 1.0))

                for p_idx in target_pages:
                    page = doc[p_idx]
                    for term in cleaned_terms:
                        matches = page.search_for(term)
                        for m_rect in matches:
                            if req.case_sensitive:
                                extracted = page.get_textbox(m_rect)
                                if term not in extracted:
                                    continue
                            page.add_redact_annot(
                                m_rect,
                                text=req.overlay_text,
                                fill=default_fill,
                                text_color=default_text,
                            )
                            touched_pages.add(p_idx)
                            staged_count += 1

            if staged_count == 0:
                raise ValueError(
                    "No matching text or regions found to redact on the selected pages."
                )

            # Permanently eradicate underlying text glyphs & overlapping raster image pixels
            for p_idx in sorted(touched_pages):
                doc[p_idx].apply_redactions(images=fitz.PDF_REDACT_IMAGE_PIXELS)

            destination.parent.mkdir(parents=True, exist_ok=True)
            temp_dest = destination.with_suffix(".tmp_redact")
            try:
                doc.save(str(temp_dest), garbage=4, deflate=True)
                doc.close()
                temp_dest.replace(destination)
            finally:
                temp_dest.unlink(missing_ok=True)

            return staged_count
        finally:
            if not doc.is_closed:
                doc.close()

    def sanitize_metadata(
        self, source: Path, destination: Path, req: SanitizeMetadataRequest
    ) -> None:
        if not source.exists():
            raise FileNotFoundError(f"Source PDF does not exist: {source}")

        reader = pypdf.PdfReader(str(source))
        if reader.is_encrypted:
            raise ValueError("Document is encrypted. Decrypt it before sanitizing metadata.")

        doc = fitz.open(str(source))
        try:
            doc.scrub(
                attached_files=req.strip_embedded_files,
                clean_pages=False,
                embedded_files=req.strip_embedded_files,
                hidden_text=req.strip_hidden_text,
                javascript=req.strip_javascript,
                metadata=req.strip_info_dict,
                redactions=False,
                remove_links=req.strip_links,
                reset_fields=False,
                reset_responses=False,
                thumbnails=req.strip_thumbnails,
                xml_metadata=req.strip_xmp_metadata,
            )

            if req.strip_info_dict:
                doc.set_metadata({})

            if req.strip_xmp_metadata:
                doc.del_xml_metadata()

            if req.strip_embedded_files:
                for emb_name in list(doc.embfile_names()):
                    doc.embfile_del(emb_name)

            if req.strip_javascript:
                cat = doc.pdf_catalog()
                doc.xref_set_key(cat, "OpenAction", "null")
                doc.xref_set_key(cat, "AA", "null")
                names_type, names_val = doc.xref_get_key(cat, "Names")
                if names_type == "xref":
                    names_xref = int(names_val.split()[0])
                    doc.xref_set_key(names_xref, "JavaScript", "null")
                for page in doc:
                    doc.xref_set_key(page.xref, "AA", "null")

            if req.strip_annotations:
                for page in doc:
                    for annot in list(page.annots() or []):
                        page.delete_annot(annot)

            destination.parent.mkdir(parents=True, exist_ok=True)
            temp_dest = destination.with_suffix(".tmp_san")
            try:
                doc.save(str(temp_dest), garbage=4, deflate=True, clean=True)
                doc.close()
                temp_dest.replace(destination)
            finally:
                temp_dest.unlink(missing_ok=True)
        finally:
            if not doc.is_closed:
                doc.close()
