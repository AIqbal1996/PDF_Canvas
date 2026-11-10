from io import BytesIO
from pathlib import Path
import shutil
import tempfile

from fastapi.testclient import TestClient
from PIL import Image
import pymupdf as fitz
import pypdf
from pypdf.constants import UserAccessPermissions
import pytest

from app.config import settings
from app.main import app
from app.storage import LocalImmutableFileStore


@pytest.fixture(autouse=True)
def isolated_storage():
    temp_dir = Path(tempfile.mkdtemp(prefix="pdf_canvas_sec_test_"))
    old_root = settings.data_root
    settings.data_root = temp_dir
    settings.ensure_directories()

    yield temp_dir
    settings.data_root = old_root
    shutil.rmtree(temp_dir, ignore_errors=True)


client = TestClient(app)


def create_sensitive_pdf_bytes() -> bytes:
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    page.insert_text((50, 100), "Public Agreement Title", fontsize=14)
    page.insert_text((50, 160), "Client SSN: 987-65-4321 (Confidential)", fontsize=12)
    page.insert_text((50, 220), "SecretProjectName should remain case-checked.", fontsize=12)

    # Also embed a bright red square image at [50, 300, 150, 400] for raster redaction testing
    img = Image.new("RGB", (100, 100), (220, 38, 38))
    buf = BytesIO()
    img.save(buf, format="PNG")
    page.insert_image(fitz.Rect(50, 300, 150, 400), stream=buf.getvalue())

    doc.set_metadata(
        {
            "title": "Internal Deal Memo",
            "author": "Confidential Author",
            "creator": "Proprietary Editor",
            "keywords": "M&A, Secret",
        }
    )
    doc.set_xml_metadata("<xmpmeta>LeakyXmpMetadataPacket</xmpmeta>")
    doc.embfile_add("hidden_budget.txt", b"Q4 Salary Pool = $5M")
    cat = doc.pdf_catalog()
    doc.xref_set_key(cat, "OpenAction", "<</S /JavaScript /JS (app.alert('leak');)>>")

    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


def test_aes256_encryption_permissions_owner_lock_and_decryption() -> None:
    pdf_bytes = create_sensitive_pdf_bytes()
    upload = client.post(
        "/api/documents",
        files={"file": ("secret_contract.pdf", BytesIO(pdf_bytes), "application/pdf")},
    )
    assert upload.status_code == 201
    doc_id = upload.json()["document"]["id"]
    orig_rev = upload.json()["revision"]
    orig_path = settings.data_root / orig_rev["storage_path"]
    orig_sha = orig_rev["sha256"]

    # 1. Encrypt rejection when both passwords are empty
    empty_enc = client.post(
        f"/api/security/documents/{doc_id}/encrypt",
        json={"user_password": "", "owner_password": ""},
    )
    assert empty_enc.status_code == 400

    # 2. Encrypt with both user & owner password and restricted copy/modify permissions
    enc_res = client.post(
        f"/api/security/documents/{doc_id}/encrypt",
        json={
            "user_password": "OpenPass!1",
            "owner_password": "AdminPass!2",
            "permissions": {
                "allow_printing": True,
                "allow_copying": False,
                "allow_modifying": False,
                "allow_annotations": False,
            },
        },
    )
    assert enc_res.status_code == 200
    enc_data = enc_res.json()
    assert enc_data["revision"]["operation"] == "encrypt"
    assert enc_data["document"]["page_count"] == 1
    assert enc_data["revision"]["page_count"] == 1

    # Verify AES-256 permissions on disk
    enc_path = settings.data_root / enc_data["revision"]["storage_path"]
    reader = pypdf.PdfReader(str(enc_path))
    assert reader.is_encrypted is True
    assert reader.decrypt("WrongPass") == 0
    assert reader.decrypt("OpenPass!1") == 1
    assert bool(reader.user_access_permissions & UserAccessPermissions.PRINT) is True
    assert bool(reader.user_access_permissions & UserAccessPermissions.EXTRACT) is False
    assert bool(reader.user_access_permissions & UserAccessPermissions.MODIFY) is False

    # Inspect reflects locked state
    insp_locked = client.get(f"/api/security/documents/{doc_id}/inspect").json()
    assert insp_locked["is_encrypted"] is True
    assert insp_locked["requires_open_password"] is True
    assert "AES-256" in insp_locked["encryption_scheme"]

    # Re-encrypting already encrypted PDF rejected
    re_enc = client.post(
        f"/api/security/documents/{doc_id}/encrypt",
        json={"user_password": "AnotherPassword"},
    )
    assert re_enc.status_code == 400

    # Wrong password decrypt rejected
    bad_dec = client.post(
        f"/api/security/documents/{doc_id}/decrypt",
        json={"password": "WrongPassword!"},
    )
    assert bad_dec.status_code == 400

    # Valid decrypt succeeds and creates decrypt child revision
    dec_res = client.post(
        f"/api/security/documents/{doc_id}/decrypt",
        json={"password": "OpenPass!1"},
    )
    assert dec_res.status_code == 200
    assert dec_res.json()["revision"]["operation"] == "decrypt"

    # Now test Owner-only permissions lock (no open password, only owner lock)
    owner_lock = client.post(
        f"/api/security/documents/{doc_id}/encrypt",
        json={
            "user_password": "",
            "owner_password": "MasterOwner!9",
            "permissions": {"allow_printing": True, "allow_copying": False},
        },
    )
    assert owner_lock.status_code == 200

    insp_owner = client.get(f"/api/security/documents/{doc_id}/inspect").json()
    assert insp_owner["is_encrypted"] is True
    assert insp_owner["requires_open_password"] is False

    # Unlocking owner-locked PDF with an arbitrary wrong password must fail with 400
    bad_owner = client.post(
        f"/api/security/documents/{doc_id}/decrypt",
        json={"password": "WrongOwnerPassword"},
    )
    assert bad_owner.status_code == 400

    # Attempting redaction or sanitization while encrypted must fail with 400
    enc_redact = client.post(
        f"/api/security/documents/{doc_id}/redact",
        json={"search_terms": ["Public"]},
    )
    assert enc_redact.status_code == 400

    enc_san = client.post(
        f"/api/security/documents/{doc_id}/sanitize",
        json={"strip_info_dict": True},
    )
    assert enc_san.status_code == 400

    # Unlocking owner-locked PDF with owner password succeeds
    dec_owner = client.post(
        f"/api/security/documents/{doc_id}/decrypt",
        json={"password": "MasterOwner!9"},
    )
    assert dec_owner.status_code == 200
    dec_path = settings.data_root / dec_owner.json()["revision"]["storage_path"]
    assert pypdf.PdfReader(str(dec_path)).is_encrypted is False

    # Original file remains unencrypted & byte-level identical
    assert LocalImmutableFileStore.calculate_sha256(orig_path) == orig_sha


def test_permanent_redaction_strips_underlying_text_and_image_pixels() -> None:
    pdf_bytes = create_sensitive_pdf_bytes()
    upload = client.post(
        "/api/documents",
        files={"file": ("redact_target.pdf", BytesIO(pdf_bytes), "application/pdf")},
    )
    doc_id = upload.json()["document"]["id"]
    orig_rev = upload.json()["revision"]
    orig_path = settings.data_root / orig_rev["storage_path"]
    orig_sha = orig_rev["sha256"]

    # Case-sensitive search for wrong case returns 400 (not matched)
    miss = client.post(
        f"/api/security/documents/{doc_id}/redact",
        json={
            "search_terms": ["secretprojectname"],
            "case_sensitive": True,
        },
    )
    assert miss.status_code == 400

    # Invalid box returns 400
    bad_box = client.post(
        f"/api/security/documents/{doc_id}/redact",
        json={
            "regions": [
                {"page_index": 0, "rect": [200.0, 100.0, 50.0, 120.0]},
            ]
        },
    )
    assert bad_box.status_code == 400

    # Apply permanent redaction to both search term AND raster image square region
    redact_res = client.post(
        f"/api/security/documents/{doc_id}/redact",
        json={
            "search_terms": ["987-65-4321", "SecretProjectName"],
            "case_sensitive": True,
            "overlay_text": "[PURGED]",
            "fill_color": "#000000",
            "text_color": "#FFFFFF",
            "regions": [
                {
                    "page_index": 0,
                    "rect": [55.0, 305.0, 145.0, 395.0],
                    "overlay_text": "",
                    "fill_color": "#000000",
                }
            ],
        },
    )
    assert redact_res.status_code == 200
    redacted_rev = redact_res.json()["revision"]
    assert redacted_rev["operation"] == "redact"
    assert redacted_rev["parent_revision_id"] == orig_rev["id"]

    # Inspect redacted output with PyMuPDF & raw byte check
    redacted_path = settings.data_root / redacted_rev["storage_path"]
    fitz_doc = fitz.open(str(redacted_path))
    extracted_text = fitz_doc[0].get_text()
    assert "Public Agreement Title" in extracted_text
    assert "987-65-4321" not in extracted_text
    assert "SecretProjectName" not in extracted_text
    assert "[PURGED]" in extracted_text
    assert fitz_doc[0].search_for("987-65-4321") == []

    # Verify decompressed page content stream does NOT hold original SSN string
    stream_bytes = b""
    for xref in fitz_doc[0].get_contents():
        stream_bytes += fitz_doc.xref_stream(xref)
    assert b"987-65-4321" not in stream_bytes

    # Verify center pixel inside redacted image box turned black instead of original red (220, 38, 38)
    pix = fitz_doc[0].get_pixmap(clip=fitz.Rect(90, 340, 110, 360))
    center_rgb = pix.pixel(pix.width // 2, pix.height // 2)[:3]
    assert center_rgb[0] < 20 and center_rgb[1] < 20 and center_rgb[2] < 20
    fitz_doc.close()

    # Original file remains byte-level immutable
    assert LocalImmutableFileStore.calculate_sha256(orig_path) == orig_sha


def test_metadata_xmp_attachment_and_javascript_sanitization() -> None:
    pdf_bytes = create_sensitive_pdf_bytes()
    upload = client.post(
        "/api/documents",
        files={"file": ("leaky_metadata.pdf", BytesIO(pdf_bytes), "application/pdf")},
    )
    doc_id = upload.json()["document"]["id"]
    orig_rev = upload.json()["revision"]
    orig_path = settings.data_root / orig_rev["storage_path"]
    orig_sha = orig_rev["sha256"]

    # 1. Inspect detects all 4 privacy/security risks
    insp1 = client.get(f"/api/security/documents/{doc_id}/inspect")
    assert insp1.status_code == 200
    d1 = insp1.json()
    assert d1["metadata_field_count"] >= 4
    assert d1["metadata"]["author"] == "Confidential Author"
    assert d1["has_xmp_metadata"] is True
    assert d1["xmp_bytes"] > 0
    assert d1["embedded_files"] == ["hidden_budget.txt"]
    assert d1["has_javascript_or_open_action"] is True

    # 2. Sanitize everything cleanly
    san_res = client.post(
        f"/api/security/documents/{doc_id}/sanitize",
        json={
            "strip_info_dict": True,
            "strip_xmp_metadata": True,
            "strip_embedded_files": True,
            "strip_javascript": True,
            "strip_thumbnails": True,
        },
    )
    assert san_res.status_code == 200
    san_rev = san_res.json()["revision"]
    assert san_rev["operation"] == "sanitize_metadata"

    # 3. Re-inspect confirms complete removal while keeping visible document body
    insp2 = client.get(f"/api/security/documents/{doc_id}/inspect").json()
    assert insp2["metadata_field_count"] == 0
    assert insp2["has_xmp_metadata"] is False
    assert insp2["xmp_bytes"] == 0
    assert insp2["embedded_files"] == []
    assert insp2["has_javascript_or_open_action"] is False

    san_path = settings.data_root / san_rev["storage_path"]
    raw_bytes = san_path.read_bytes()
    assert b"LeakyXmpMetadataPacket" not in raw_bytes
    assert b"app.alert" not in raw_bytes
    assert b"Confidential Author" not in raw_bytes

    fitz_doc = fitz.open(str(san_path))
    assert "Public Agreement Title" in fitz_doc[0].get_text()
    fitz_doc.close()

    # Original file remains untouched
    assert LocalImmutableFileStore.calculate_sha256(orig_path) == orig_sha
