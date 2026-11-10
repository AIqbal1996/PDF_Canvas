import base64
from datetime import UTC, datetime, timedelta
from io import BytesIO
import json
import logging
from pathlib import Path
import re
from typing import Protocol
from uuid import uuid4

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509.oid import NameOID
from PIL import Image, UnidentifiedImageError
from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
from pyhanko.pdf_utils.reader import PdfFileReader
from pyhanko.sign import fields, signers, validation
from pyhanko.stamp import TextStampStyle
from pyhanko_certvalidator import ValidationContext
import pypdf
from reportlab.lib.colors import HexColor
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas as rl_canvas

from ..models import (
    CryptographicSignatureStatus,
    DigitalSignRequest,
    DocumentSignaturesReport,
    GenerateSelfSignedCertRequest,
    LocalCertificateInfo,
    SavedSignature,
    SaveSignatureRequest,
    VisualSignatureStampRequest,
)


SAFE_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{4,64}$")
MAX_IMAGE_BASE64_CHARS = 7_500_000  # ~5.5 MB decoded image ceiling
MAX_PKCS12_BASE64_CHARS = 1_500_000  # ~1.1 MB decoded PKCS#12 ceiling
MAX_IMAGE_PIXELS = 25_000_000


class SignatureEngine(Protocol):
    def list_saved_signatures(self) -> list[SavedSignature]:
        """Lists reusable visual signature graphics stored locally."""
        ...

    def save_signature(self, req: SaveSignatureRequest) -> SavedSignature:
        """Validates and persists a drawn or uploaded PNG signature graphic locally."""
        ...

    def delete_signature(self, sig_id: str) -> bool:
        """Deletes a saved signature graphic from local storage."""
        ...

    def apply_visual_signature_stamp(
        self,
        source: Path,
        destination: Path,
        req: VisualSignatureStampRequest,
    ) -> None:
        """Applies a visual electronic signature image stamp overlay onto a PDF page."""
        ...

    def list_certificates(self) -> list[LocalCertificateInfo]:
        """Lists locally generated X.509 / PKCS#12 signing profiles (public metadata only)."""
        ...

    def generate_self_signed_certificate(
        self, req: GenerateSelfSignedCertRequest
    ) -> LocalCertificateInfo:
        """Generates a local RSA 2048-bit X.509 self-signed certificate protected in PKCS#12 format."""
        ...

    def delete_certificate(self, cert_id: str) -> bool:
        """Deletes a stored local certificate bundle."""
        ...

    def sign_pdf_cryptographically(
        self,
        source: Path,
        destination: Path,
        req: DigitalSignRequest,
    ) -> CryptographicSignatureStatus:
        """Embeds a PKCS#7 / PAdES cryptographic signature binding the PDF byte range."""
        ...

    def verify_pdf_signatures(
        self, source: Path, document_id: str
    ) -> DocumentSignaturesReport:
        """Verifies all embedded PKCS#7 / PAdES signatures offline."""
        ...


class LocalSignatureEngine:
    """100% local electronic stamp (Pillow + ReportLab) & cryptographic digital signature engine (pyHanko)."""

    def __init__(self, signatures_dir: Path, certs_dir: Path, temp_dir: Path) -> None:
        self.signatures_dir = signatures_dir.resolve()
        self.certs_dir = certs_dir.resolve()
        self.temp_dir = temp_dir.resolve()
        self.signatures_dir.mkdir(parents=True, exist_ok=True)
        self.certs_dir.mkdir(parents=True, exist_ok=True)
        self.temp_dir.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def _validate_safe_id(raw_id: str) -> str:
        if not raw_id or not SAFE_ID_PATTERN.fullmatch(raw_id):
            raise ValueError(f"Invalid identifier format: '{raw_id}'")
        return raw_id

    @staticmethod
    def _resolve_child(base_dir: Path, filename: str) -> Path:
        base_resolved = base_dir.resolve()
        candidate = (base_resolved / filename).resolve()
        if base_resolved not in candidate.parents:
            raise ValueError("Path traversal attempted")
        return candidate

    @staticmethod
    def _decode_base64_payload(raw_b64: str, max_chars: int) -> bytes:
        cleaned = raw_b64.strip()
        if len(cleaned) > max_chars:
            raise ValueError("Encoded payload exceeds maximum allowed size")

        if "," in cleaned and cleaned.lower().startswith("data:"):
            cleaned = cleaned.split(",", 1)[1]

        try:
            decoded = base64.b64decode(cleaned, validate=True)
        except Exception as err:
            raise ValueError(f"Invalid base64 payload: {err}") from err

        if not decoded:
            raise ValueError("Decoded payload is empty")
        return decoded

    @classmethod
    def _sanitize_signature_image(cls, raw_b64: str) -> tuple[bytes, int, int]:
        raw_bytes = cls._decode_base64_payload(raw_b64, MAX_IMAGE_BASE64_CHARS)
        Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS

        try:
            with Image.open(BytesIO(raw_bytes)) as img:
                img.verify()
            with Image.open(BytesIO(raw_bytes)) as img:
                if img.format not in {"PNG", "JPEG", "WEBP", "BMP"}:
                    raise ValueError(f"Unsupported signature image format: {img.format}")
                width, height = img.size
                if width < 1 or height < 1 or width > 4096 or height > 4096:
                    raise ValueError(
                        f"Signature image dimensions ({width}x{height}) out of supported range"
                    )
                rgba = img.convert("RGBA")
                out = BytesIO()
                rgba.save(out, format="PNG")
                return out.getvalue(), width, height
        except ValueError:
            raise
        except (UnidentifiedImageError, Image.DecompressionBombError, Exception) as err:
            raise ValueError(f"Invalid or corrupted signature image: {err}") from err

    # --- Reusable Visual Signatures Library ---

    def list_saved_signatures(self) -> list[SavedSignature]:
        results: list[SavedSignature] = []
        for meta_path in self.signatures_dir.glob("*.meta.json"):
            try:
                sig_id = meta_path.name.removesuffix(".meta.json")
                self._validate_safe_id(sig_id)
                png_path = self._resolve_child(self.signatures_dir, f"{sig_id}.png")
                if not png_path.exists():
                    continue
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
                b64_png = base64.b64encode(png_path.read_bytes()).decode("ascii")
                results.append(
                    SavedSignature(
                        id=sig_id,
                        name=str(meta["name"]),
                        image_data_url=f"data:image/png;base64,{b64_png}",
                        width=int(meta["width"]),
                        height=int(meta["height"]),
                        created_at=datetime.fromisoformat(meta["created_at"]),
                    )
                )
            except Exception:
                continue
        results.sort(key=lambda s: s.created_at, reverse=True)
        return results

    def save_signature(self, req: SaveSignatureRequest) -> SavedSignature:
        png_bytes, width, height = self._sanitize_signature_image(req.image_base64)
        sig_id = uuid4().hex[:12]
        now = datetime.now(UTC)

        png_path = self._resolve_child(self.signatures_dir, f"{sig_id}.png")
        meta_path = self._resolve_child(self.signatures_dir, f"{sig_id}.meta.json")

        tmp_png = png_path.with_suffix(".tmp_png")
        tmp_meta = meta_path.with_suffix(".tmp_json")
        try:
            tmp_png.write_bytes(png_bytes)
            tmp_png.replace(png_path)

            meta_payload = {
                "id": sig_id,
                "name": req.name.strip(),
                "width": width,
                "height": height,
                "created_at": now.isoformat(),
            }
            tmp_meta.write_text(json.dumps(meta_payload, indent=2), encoding="utf-8")
            tmp_meta.replace(meta_path)
        finally:
            tmp_png.unlink(missing_ok=True)
            tmp_meta.unlink(missing_ok=True)

        b64_png = base64.b64encode(png_bytes).decode("ascii")
        return SavedSignature(
            id=sig_id,
            name=req.name.strip(),
            image_data_url=f"data:image/png;base64,{b64_png}",
            width=width,
            height=height,
            created_at=now,
        )

    def delete_signature(self, sig_id: str) -> bool:
        safe_id = self._validate_safe_id(sig_id)
        png_path = self._resolve_child(self.signatures_dir, f"{safe_id}.png")
        meta_path = self._resolve_child(self.signatures_dir, f"{safe_id}.meta.json")
        existed = png_path.exists() or meta_path.exists()
        png_path.unlink(missing_ok=True)
        meta_path.unlink(missing_ok=True)
        return existed

    # --- Visual Electronic Stamp Overlay ---

    def apply_visual_signature_stamp(
        self,
        source: Path,
        destination: Path,
        req: VisualSignatureStampRequest,
    ) -> None:
        if not source.exists():
            raise FileNotFoundError(f"Source PDF does not exist: {source}")

        if req.saved_signature_id:
            safe_id = self._validate_safe_id(req.saved_signature_id)
            png_path = self._resolve_child(self.signatures_dir, f"{safe_id}.png")
            if not png_path.exists():
                raise FileNotFoundError(f"Saved signature '{safe_id}' not found")
            png_bytes = png_path.read_bytes()
        elif req.signature_image_base64:
            png_bytes, _, _ = self._sanitize_signature_image(req.signature_image_base64)
        else:
            raise ValueError(
                "Either saved_signature_id or signature_image_base64 must be provided"
            )

        reader = pypdf.PdfReader(str(source))
        if reader.is_encrypted:
            raise ValueError("Cannot stamp an encrypted PDF without unlocking it first")

        total_pages = len(reader.pages)
        if req.page_index < 0 or req.page_index >= total_pages:
            raise IndexError(f"Page index {req.page_index} out of range (0..{total_pages - 1})")

        writer = pypdf.PdfWriter()
        has_caption = bool(req.signer_name or req.reason or req.include_timestamp)
        caption_reserve = 14.0 if has_caption else 0.0

        for i, page in enumerate(reader.pages):
            if i == req.page_index:
                page_width = float(page.mediabox.width)
                page_height = float(page.mediabox.height)

                overlay_buf = BytesIO()
                canv = rl_canvas.Canvas(overlay_buf, pagesize=(page_width, page_height))

                img_area_height = max(12.0, req.height - caption_reserve)
                img_y = req.y + caption_reserve

                with Image.open(BytesIO(png_bytes)) as img_obj:
                    iw, ih = img_obj.size
                scale = min(req.width / iw, img_area_height / ih)
                draw_w = iw * scale
                draw_h = ih * scale
                offset_x = req.x + (req.width - draw_w) / 2.0
                offset_y = img_y + (img_area_height - draw_h) / 2.0

                canv.saveState()
                canv.setFillAlpha(req.opacity)
                canv.setStrokeAlpha(req.opacity)
                canv.drawImage(
                    ImageReader(BytesIO(png_bytes)),
                    offset_x,
                    offset_y,
                    width=draw_w,
                    height=draw_h,
                    mask="auto",
                )

                if has_caption:
                    canv.setStrokeColor(HexColor("#64748b"))
                    canv.setLineWidth(0.6)
                    canv.line(req.x, req.y + caption_reserve - 1.0, req.x + req.width, req.y + caption_reserve - 1.0)

                    parts: list[str] = []
                    if req.signer_name:
                        parts.append(f"Signed: {req.signer_name.strip()}")
                    if req.reason:
                        parts.append(req.reason.strip())
                    if req.include_timestamp:
                        parts.append(datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC"))
                    caption_text = " | ".join(parts)

                    canv.setFillColor(HexColor("#334155"))
                    canv.setFont("Helvetica", 6.5)
                    # Truncate overly wide caption neatly so it stays inside box width
                    while len(caption_text) > 10 and canv.stringWidth(caption_text, "Helvetica", 6.5) > req.width:
                        caption_text = caption_text[:-4] + "..."
                    canv.drawString(req.x + 2.0, req.y + 3.0, caption_text)

                canv.restoreState()
                canv.showPage()
                canv.save()
                overlay_buf.seek(0)

                overlay_reader = pypdf.PdfReader(overlay_buf)
                added = writer.add_page(page)
                added.merge_page(overlay_reader.pages[0])
            else:
                writer.add_page(page)

        destination.parent.mkdir(parents=True, exist_ok=True)
        temp_dest = destination.with_suffix(".tmp_stamp")
        try:
            with temp_dest.open("wb") as f:
                writer.write(f)
            temp_dest.replace(destination)
        finally:
            temp_dest.unlink(missing_ok=True)

    # --- Local PKCS#12 Self-Signed Certificate Management ---

    def list_certificates(self) -> list[LocalCertificateInfo]:
        results: list[LocalCertificateInfo] = []
        for meta_path in self.certs_dir.glob("*.meta.json"):
            try:
                cert_id = meta_path.name.removesuffix(".meta.json")
                self._validate_safe_id(cert_id)
                p12_path = self._resolve_child(self.certs_dir, f"{cert_id}.p12")
                if not p12_path.exists():
                    continue
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
                results.append(LocalCertificateInfo(**meta))
            except Exception:
                continue
        results.sort(key=lambda c: c.created_at, reverse=True)
        return results

    def generate_self_signed_certificate(
        self, req: GenerateSelfSignedCertRequest
    ) -> LocalCertificateInfo:
        cert_id = uuid4().hex[:12]
        now = datetime.now(UTC)
        not_before = now - timedelta(minutes=5)
        not_after = now + timedelta(days=req.validity_days)

        private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

        name_attrs = [x509.NameAttribute(NameOID.COMMON_NAME, req.common_name.strip())]
        if req.organization.strip():
            name_attrs.append(x509.NameAttribute(NameOID.ORGANIZATION_NAME, req.organization.strip()))
        if req.email.strip():
            name_attrs.append(x509.NameAttribute(NameOID.EMAIL_ADDRESS, req.email.strip()))

        subject = issuer = x509.Name(name_attrs)
        serial_num = x509.random_serial_number()

        cert = (
            x509.CertificateBuilder()
            .subject_name(subject)
            .issuer_name(issuer)
            .public_key(private_key.public_key())
            .serial_number(serial_num)
            .not_valid_before(not_before)
            .not_valid_after(not_after)
            .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
            .add_extension(
                x509.KeyUsage(
                    digital_signature=True,
                    content_commitment=True,
                    key_encipherment=False,
                    data_encipherment=False,
                    key_agreement=False,
                    key_cert_sign=False,
                    crl_sign=False,
                    encipher_only=False,
                    decipher_only=False,
                ),
                critical=True,
            )
            .add_extension(
                x509.SubjectKeyIdentifier.from_public_key(private_key.public_key()),
                critical=False,
            )
            .sign(private_key, hashes.SHA256())
        )

        p12_bytes = pkcs12.serialize_key_and_certificates(
            name=req.label.strip().encode("utf-8"),
            key=private_key,
            cert=cert,
            cas=None,
            encryption_algorithm=serialization.BestAvailableEncryption(
                req.password.encode("utf-8")
            ),
        )

        fingerprint = cert.fingerprint(hashes.SHA256()).hex()
        info = LocalCertificateInfo(
            id=cert_id,
            label=req.label.strip(),
            common_name=req.common_name.strip(),
            organization=req.organization.strip(),
            email=req.email.strip(),
            serial_number=format(serial_num, "x"),
            fingerprint_sha256=fingerprint,
            not_valid_before=not_before,
            not_valid_after=not_after,
            self_signed=True,
            created_at=now,
        )

        p12_path = self._resolve_child(self.certs_dir, f"{cert_id}.p12")
        meta_path = self._resolve_child(self.certs_dir, f"{cert_id}.meta.json")
        tmp_p12 = p12_path.with_suffix(".tmp_p12")
        tmp_meta = meta_path.with_suffix(".tmp_json")
        try:
            tmp_p12.write_bytes(p12_bytes)
            tmp_p12.replace(p12_path)
            tmp_meta.write_text(info.model_dump_json(indent=2), encoding="utf-8")
            tmp_meta.replace(meta_path)
        finally:
            tmp_p12.unlink(missing_ok=True)
            tmp_meta.unlink(missing_ok=True)

        return info

    def delete_certificate(self, cert_id: str) -> bool:
        safe_id = self._validate_safe_id(cert_id)
        p12_path = self._resolve_child(self.certs_dir, f"{safe_id}.p12")
        meta_path = self._resolve_child(self.certs_dir, f"{safe_id}.meta.json")
        existed = p12_path.exists() or meta_path.exists()
        p12_path.unlink(missing_ok=True)
        meta_path.unlink(missing_ok=True)
        return existed

    # --- Cryptographic PAdES / PKCS#7 Signing ---

    def sign_pdf_cryptographically(
        self,
        source: Path,
        destination: Path,
        req: DigitalSignRequest,
    ) -> CryptographicSignatureStatus:
        if not source.exists():
            raise FileNotFoundError(f"Source PDF does not exist: {source}")

        temp_p12_file: Path | None = None
        if req.cert_id:
            safe_id = self._validate_safe_id(req.cert_id)
            p12_path = self._resolve_child(self.certs_dir, f"{safe_id}.p12")
            if not p12_path.exists():
                raise FileNotFoundError(f"Certificate '{safe_id}' not found")
        elif req.pkcs12_base64:
            p12_raw = self._decode_base64_payload(req.pkcs12_base64, MAX_PKCS12_BASE64_CHARS)
            temp_p12_file = self.temp_dir / f"upload_{uuid4().hex}.p12"
            temp_p12_file.write_bytes(p12_raw)
            p12_path = temp_p12_file
        else:
            raise ValueError("Either cert_id or pkcs12_base64 must be provided")

        try:
            try:
                signer = signers.SimpleSigner.load_pkcs12(
                    str(p12_path),
                    passphrase=req.password.encode("utf-8"),
                )
            except Exception as err:
                raise ValueError(
                    "Failed to unlock PKCS#12 certificate: invalid passphrase or corrupted bundle"
                ) from err

            if signer is None or signer.signing_cert is None:
                raise ValueError("PKCS#12 bundle does not contain a valid signing key and certificate")

            # Inspect PDF page bounds and existing signature fields
            pypdf_reader = pypdf.PdfReader(str(source))
            if pypdf_reader.is_encrypted:
                raise ValueError("Cannot digitally sign an encrypted PDF without unlocking it")
            total_pages = len(pypdf_reader.pages)

            if req.visible:
                if req.page_index < 0 or req.page_index >= total_pages:
                    raise IndexError(
                        f"Page index {req.page_index} out of range (0..{total_pages - 1})"
                    )
                if not req.rect or req.rect[0] >= req.rect[2] or req.rect[1] >= req.rect[3]:
                    raise ValueError(
                        "Visible signature bounding box must satisfy x0 < x1 and y0 < y1"
                    )

            with source.open("rb") as f_inspect:
                hankoreader = PdfFileReader(f_inspect, strict=False)
                existing_sig_fields = {emb.field_name for emb in hankoreader.embedded_signatures}

            field_name = req.field_name.strip() if req.field_name else None
            if field_name:
                if field_name in existing_sig_fields:
                    raise ValueError(
                        f"Signature field '{field_name}' already exists in this PDF; choose a unique name"
                    )
            else:
                idx = 1
                while f"Signature_{idx}" in existing_sig_fields:
                    idx += 1
                field_name = f"Signature_{idx}"

            sig_meta = signers.PdfSignatureMetadata(
                field_name=field_name,
                reason=req.reason.strip() if req.reason else None,
                location=req.location.strip() if req.location else None,
                contact_info=req.contact_info.strip() if req.contact_info else None,
            )

            field_spec: fields.SigFieldSpec | None = None
            stamp_style: TextStampStyle | None = None
            if req.visible and req.rect:
                box = (
                    int(round(req.rect[0])),
                    int(round(req.rect[1])),
                    int(round(req.rect[2])),
                    int(round(req.rect[3])),
                )
                field_spec = fields.SigFieldSpec(
                    sig_field_name=field_name,
                    on_page=req.page_index,
                    box=box,
                )
                stamp_style = TextStampStyle(
                    stamp_text="Digitally Signed by %(signer)s\nDate: %(ts)s",
                    border_width=1,
                )
            else:
                field_spec = fields.SigFieldSpec(
                    sig_field_name=field_name,
                    on_page=0,
                    box=None,
                )

            destination.parent.mkdir(parents=True, exist_ok=True)
            temp_dest = destination.with_suffix(".tmp_signed")

            try:
                with source.open("rb") as src_f, temp_dest.open("wb") as out_f:
                    writer = IncrementalPdfFileWriter(src_f, strict=False)
                    pdf_signer = signers.PdfSigner(
                        signature_meta=sig_meta,
                        signer=signer,
                        stamp_style=stamp_style,
                        new_field_spec=field_spec,
                    )
                    pdf_signer.sign_pdf(writer, output=out_f)
                temp_dest.replace(destination)
            finally:
                temp_dest.unlink(missing_ok=True)

            report = self.verify_pdf_signatures(destination, document_id="")
            matching = [s for s in report.signatures if s.field_name == field_name]
            if matching:
                return matching[-1]
            return report.signatures[-1]
        finally:
            if temp_p12_file is not None:
                temp_p12_file.unlink(missing_ok=True)

    # --- Offline Cryptographic Verification ---

    @staticmethod
    def _extract_cn(asn1_name) -> str:
        try:
            native = asn1_name.native
            cn = native.get("common_name")
            if isinstance(cn, list):
                return ", ".join(str(x) for x in cn)
            if cn:
                return str(cn)
        except Exception:
            pass
        return str(getattr(asn1_name, "human_friendly", "Unknown Signer"))

    def verify_pdf_signatures(
        self, source: Path, document_id: str
    ) -> DocumentSignaturesReport:
        if not source.exists():
            raise FileNotFoundError(f"Source PDF does not exist: {source}")

        statuses: list[CryptographicSignatureStatus] = []

        # Suppress expected path-building ERROR log spam for offline self-signed certs
        certval_logger = logging.getLogger("pyhanko.sign.validation")
        prev_level = certval_logger.level
        certval_logger.setLevel(logging.CRITICAL)

        try:
            with source.open("rb") as f:
                reader = PdfFileReader(f, strict=False)
                embedded = list(reader.embedded_signatures)
                vc = ValidationContext(trust_roots=[], allow_fetching=False)

                for emb in embedded:
                    field_name = emb.field_name or "UnnamedSignature"
                    try:
                        st = validation.validate_pdf_signature(
                            emb,
                            signer_validation_context=vc,
                        )
                        cert = emb.signer_cert
                        signer_subject = cert.subject.human_friendly if cert else "Unknown"
                        issuer_subject = cert.issuer.human_friendly if cert else "Unknown"
                        self_signed = bool(cert and cert.issuer == cert.subject)
                        signer_cn = self._extract_cn(cert.subject) if cert else "Unknown"

                        sig_dict = emb.sig_object
                        reason_raw = sig_dict.get("/Reason")
                        loc_raw = sig_dict.get("/Location")
                        time_raw = sig_dict.get("/M")

                        dt_str: str | None = None
                        if st.signer_reported_dt:
                            dt_str = st.signer_reported_dt.isoformat()
                        elif time_raw is not None:
                            dt_str = str(time_raw)

                        digest_intact = bool(st.intact)
                        crypto_valid = bool(st.intact and st.valid)

                        statuses.append(
                            CryptographicSignatureStatus(
                                field_name=field_name,
                                signer_name=signer_cn,
                                signer_subject=signer_subject,
                                issuer_subject=issuer_subject,
                                self_signed=self_signed,
                                digest_intact=digest_intact,
                                cryptographically_valid=crypto_valid,
                                trusted_ca=bool(st.trusted),
                                coverage=st.coverage.name if st.coverage else "UNKNOWN",
                                modification_level=(
                                    st.modification_level.name if st.modification_level else "UNKNOWN"
                                ),
                                signing_time=dt_str,
                                reason=str(reason_raw) if reason_raw is not None else None,
                                location=str(loc_raw) if loc_raw is not None else None,
                                summary=st.summary(),
                            )
                        )
                    except Exception as err:
                        statuses.append(
                            CryptographicSignatureStatus(
                                field_name=field_name,
                                signer_name="Invalid / Corrupted",
                                signer_subject="Unknown",
                                issuer_subject="Unknown",
                                self_signed=False,
                                digest_intact=False,
                                cryptographically_valid=False,
                                trusted_ca=False,
                                coverage="INVALID",
                                modification_level="UNKNOWN",
                                summary="INVALID",
                                error=str(err),
                            )
                        )
        finally:
            certval_logger.setLevel(prev_level)

        has_sigs = len(statuses) > 0
        all_intact = has_sigs and all(s.cryptographically_valid for s in statuses)

        return DocumentSignaturesReport(
            document_id=document_id,
            has_digital_signatures=has_sigs,
            digital_signature_count=len(statuses),
            all_signatures_intact=all_intact,
            signatures=statuses,
        )
