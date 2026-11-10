from io import BytesIO
import shutil
import tempfile
from pathlib import Path
from PIL import Image as PILImage, ImageDraw
import pytest
from fastapi.testclient import TestClient
import pymupdf as fitz
import pypdf

from app.config import settings
from app.main import app
from app.storage import LocalImmutableFileStore


@pytest.fixture(autouse=True)
def isolated_storage():
    temp_dir = Path(tempfile.mkdtemp(prefix="pdf_canvas_ocr_test_"))
    old_root = settings.data_root
    settings.data_root = temp_dir
    settings.ensure_directories()

    # Ensure tessdata exists in isolated storage
    tess_src = Path(__file__).resolve().parent.parent.parent / "local_data" / "tessdata" / "eng.traineddata"
    if tess_src.exists():
        shutil.copy2(tess_src, settings.tessdata_path / "eng.traineddata")

    yield temp_dir
    settings.data_root = old_root
    shutil.rmtree(temp_dir, ignore_errors=True)


client = TestClient(app)


def create_scanned_pdf_bytes() -> bytes:
    """Generates a PDF where Page 0 is a pure scanned raster image and Page 1 has vector text."""
    # 1. Page 0 Image with text
    im = PILImage.new("RGB", (400, 150), color="white")
    draw = ImageDraw.Draw(im)
    draw.text((30, 50), "OFFLINE INVOICE 9988", fill="black")
    img_buf = BytesIO()
    im.save(img_buf, format="PNG")

    doc = fitz.open()
    # Page 0: image only (scanned)
    p0 = doc.new_page(width=400, height=150)
    p0.insert_image(p0.rect, stream=img_buf.getvalue())

    # Page 1: normal vector text
    p1 = doc.new_page(width=400, height=150)
    p1.insert_text((30, 50), "This is native digital vector text for test page two.", fontsize=11)

    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


def test_ocr_status() -> None:
    res = client.get("/api/ocr/status")
    assert res.status_code == 200
    data = res.json()
    assert data["ocr_available"] is True
    assert "eng" in data["supported_languages"]


def test_ocr_inspection_detects_scanned_page() -> None:
    pdf_bytes = create_scanned_pdf_bytes()
    upload_res = client.post(
        "/api/documents",
        files={"file": ("scanned_doc.pdf", BytesIO(pdf_bytes), "application/pdf")},
    )
    assert upload_res.status_code == 201
    doc_id = upload_res.json()["document"]["id"]

    inspect_res = client.get(f"/api/ocr/documents/{doc_id}/inspect")
    assert inspect_res.status_code == 200
    inspection = inspect_res.json()
    assert inspection["total_pages"] == 2
    assert 0 in inspection["scanned_pages"]
    assert 1 in inspection["text_pages"]


def test_recognize_page_text() -> None:
    pdf_bytes = create_scanned_pdf_bytes()
    upload_res = client.post(
        "/api/documents",
        files={"file": ("ocr_recognize.pdf", BytesIO(pdf_bytes), "application/pdf")},
    )
    doc_id = upload_res.json()["document"]["id"]

    # Run OCR on Page 0 (scanned page)
    rec_res = client.get(f"/api/ocr/documents/{doc_id}/pages/0/recognize?language=eng&dpi=150")
    assert rec_res.status_code == 200
    data = rec_res.json()
    assert data["page_index"] == 0
    assert data["is_scanned"] is True
    assert data["word_count"] >= 2
    assert "INVOICE" in data["extracted_text"].upper() or "9988" in data["extracted_text"]

    # Verify word bounding boxes
    words = data["words"]
    assert len(words) > 0
    for w in words:
        assert len(w["bbox"]) == 4
        assert w["bbox"][2] > w["bbox"][0]  # x1 > x0


def test_apply_searchable_layer_creates_child_revision() -> None:
    pdf_bytes = create_scanned_pdf_bytes()
    upload_res = client.post(
        "/api/documents",
        files={"file": ("make_searchable.pdf", BytesIO(pdf_bytes), "application/pdf")},
    )
    doc_id = upload_res.json()["document"]["id"]
    original_path = settings.data_root / upload_res.json()["revision"]["storage_path"]
    original_sha256 = upload_res.json()["revision"]["sha256"]

    # Prior to OCR, page 0 has 0 native text in pypdf
    r_before = pypdf.PdfReader(str(original_path))
    assert len(r_before.pages[0].extract_text().strip()) == 0

    # Apply OCR searchable layer to page 0
    apply_res = client.post(
        f"/api/ocr/documents/{doc_id}/apply-searchable-layer",
        json={"page_indices": [0], "language": "eng", "dpi": 150},
    )
    assert apply_res.status_code == 200
    data = apply_res.json()
    new_rev = data["revision"]
    assert new_rev["operation"] == "ocr_searchable"

    # Verify that child revision now has searchable text on page 0!
    new_path = settings.data_root / new_rev["storage_path"]
    r_after = pypdf.PdfReader(str(new_path))
    p0_text = r_after.pages[0].extract_text().strip()
    assert len(p0_text) > 0
    assert "INVOICE" in p0_text.upper() or "9988" in p0_text

    # Invariant: Original source file unchanged
    assert LocalImmutableFileStore.calculate_sha256(original_path) == original_sha256


def test_correct_scanned_region() -> None:
    pdf_bytes = create_scanned_pdf_bytes()
    upload_res = client.post(
        "/api/documents",
        files={"file": ("correct_region.pdf", BytesIO(pdf_bytes), "application/pdf")},
    )
    doc_id = upload_res.json()["document"]["id"]
    original_path = settings.data_root / upload_res.json()["revision"]["storage_path"]
    original_sha256 = upload_res.json()["revision"]["sha256"]

    # Correct region on page 0: redact raster pixels and insert replacement text
    res = client.post(
        f"/api/ocr/documents/{doc_id}/correct-scanned-region",
        json={
            "page_index": 0,
            "bbox": [20.0, 40.0, 220.0, 75.0],
            "replacement_text": "PAID INVOICE 12345",
            "font_name": "Helvetica",
            "font_size": 12.0,
            "text_color": "#1E40AF",
            "background_color": "#FFFFFF",
            "cleanup_raster": True,
        },
    )
    assert res.status_code == 200
    data = res.json()
    new_rev = data["revision"]
    assert new_rev["operation"] == "scanned_region_correction"

    # Verify that the new revision has the replacement text
    new_path = settings.data_root / new_rev["storage_path"]
    doc = fitz.open(str(new_path))
    p0_text = doc[0].get_text()
    doc.close()
    assert "PAID INVOICE 12345" in p0_text

    # Invariant: Original source file remains byte-level immutable
    assert LocalImmutableFileStore.calculate_sha256(original_path) == original_sha256


def test_correct_scanned_region_invalid_bbox() -> None:
    pdf_bytes = create_scanned_pdf_bytes()
    upload_res = client.post(
        "/api/documents",
        files={"file": ("invalid_bbox.pdf", BytesIO(pdf_bytes), "application/pdf")},
    )
    doc_id = upload_res.json()["document"]["id"]

    # Send x0 > x1 (invalid bbox)
    res = client.post(
        f"/api/ocr/documents/{doc_id}/correct-scanned-region",
        json={
            "page_index": 0,
            "bbox": [200.0, 40.0, 50.0, 75.0],
            "replacement_text": "Invalid",
        },
    )
    assert res.status_code == 400


def test_reconstruct_scanned_page_clean_vector() -> None:
    pdf_bytes = create_scanned_pdf_bytes()
    upload_res = client.post(
        "/api/documents",
        files={"file": ("reconstruct.pdf", BytesIO(pdf_bytes), "application/pdf")},
    )
    doc_id = upload_res.json()["document"]["id"]
    original_path = settings.data_root / upload_res.json()["revision"]["storage_path"]
    original_sha256 = upload_res.json()["revision"]["sha256"]

    # Reconstruct page 0 into clean vector document
    res = client.post(
        f"/api/ocr/documents/{doc_id}/reconstruct",
        json={
            "page_indices": [0],
            "mode": "clean_vector",
            "font_name": "Helvetica",
            "language": "eng",
            "dpi": 150,
            "create_new_document": False,
        },
    )
    assert res.status_code == 200
    data = res.json()
    new_rev = data["revision"]
    assert new_rev["operation"] == "scanned_reconstruction"

    # Verify reconstructed page 0 in new revision
    new_path = settings.data_root / new_rev["storage_path"]
    doc = fitz.open(str(new_path))
    assert len(doc) == 2
    # In clean_vector mode, page 0 should have 0 raster images (all replaced with vector typography)
    assert len(doc[0].get_images()) == 0
    p0_text = doc[0].get_text()
    doc.close()
    assert "INVOICE" in p0_text.upper() or "9988" in p0_text

    # Invariant: Original source file unchanged
    assert LocalImmutableFileStore.calculate_sha256(original_path) == original_sha256


def test_reconstruct_scanned_page_as_new_document() -> None:
    pdf_bytes = create_scanned_pdf_bytes()
    upload_res = client.post(
        "/api/documents",
        files={"file": ("reconstruct_standalone.pdf", BytesIO(pdf_bytes), "application/pdf")},
    )
    doc_id = upload_res.json()["document"]["id"]

    res = client.post(
        f"/api/ocr/documents/{doc_id}/reconstruct",
        json={
            "page_indices": [0],
            "mode": "clean_vector",
            "create_new_document": True,
            "new_title": "Clean Reconstructed Invoice.pdf",
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["document"]["id"] != doc_id
    assert data["document"]["title"] == "Clean Reconstructed Invoice.pdf"
    assert data["revision"]["parent_revision_id"] is None

