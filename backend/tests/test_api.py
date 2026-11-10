from io import BytesIO
import shutil
import tempfile
from pathlib import Path
from uuid import uuid4
import pytest
from fastapi.testclient import TestClient
import pypdf

from app.config import settings
from app.main import app
from app.storage import LocalImmutableFileStore


def create_synthetic_pdf(pages: int = 1) -> bytes:
    """Generates a valid, minimal PDF byte stream in memory."""
    writer = pypdf.PdfWriter()
    for _ in range(pages):
        writer.add_blank_page(width=595.28, height=841.89)  # A4 standard
    output = BytesIO()
    writer.write(output)
    return output.getvalue()


@pytest.fixture(autouse=True)
def isolated_storage():
    """Points local storage and SQLite database to a temporary directory for tests."""
    temp_dir = Path(tempfile.mkdtemp(prefix="pdf_canvas_test_"))
    old_root = settings.data_root
    settings.data_root = temp_dir
    settings.ensure_directories()
    yield temp_dir
    settings.data_root = old_root
    shutil.rmtree(temp_dir, ignore_errors=True)


client = TestClient(app)


def test_health_endpoint() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "mode": "local"}


def test_upload_valid_single_page_pdf() -> None:
    pdf_bytes = create_synthetic_pdf(pages=1)
    response = client.post(
        "/api/documents",
        files={"file": ("test_single.pdf", BytesIO(pdf_bytes), "application/pdf")},
    )
    assert response.status_code == 201
    data = response.json()
    doc = data["document"]
    rev = data["revision"]

    assert doc["title"] == "test_single.pdf"
    assert doc["page_count"] == 1
    assert doc["original_revision_id"] == rev["id"]
    assert doc["current_revision_id"] == rev["id"]
    assert rev["operation"] == "upload"
    assert rev["parent_revision_id"] is None


def test_upload_valid_multi_page_pdf() -> None:
    pdf_bytes = create_synthetic_pdf(pages=5)
    response = client.post(
        "/api/documents",
        files={"file": ("contracts.pdf", BytesIO(pdf_bytes), "application/pdf")},
    )
    assert response.status_code == 201
    doc = response.json()["document"]
    assert doc["page_count"] == 5


def test_reject_non_pdf_file() -> None:
    response = client.post(
        "/api/documents",
        files={"file": ("notes.txt", BytesIO(b"Hello world, not a PDF!"), "text/plain")},
    )
    assert response.status_code == 415
    assert "validation" in response.json()["detail"].lower()


def test_reject_corrupted_pdf_file() -> None:
    # Starts with %PDF- header but contains corrupted trailer
    corrupted_bytes = b"%PDF-1.7\nCorrupted content with no trailer or xref table"
    response = client.post(
        "/api/documents",
        files={"file": ("corrupt.pdf", BytesIO(corrupted_bytes), "application/pdf")},
    )
    assert response.status_code == 415


def test_rotation_creates_child_revision_and_preserves_original() -> None:
    pdf_bytes = create_synthetic_pdf(pages=3)
    upload_res = client.post(
        "/api/documents",
        files={"file": ("report.pdf", BytesIO(pdf_bytes), "application/pdf")},
    )
    assert upload_res.status_code == 201
    upload_data = upload_res.json()
    doc_id = upload_data["document"]["id"]
    original_rev_id = upload_data["revision"]["id"]
    original_sha256 = upload_data["revision"]["sha256"]
    original_path = settings.data_root / upload_data["revision"]["storage_path"]

    # Verify original file exists on disk
    assert original_path.exists()
    assert LocalImmutableFileStore.calculate_sha256(original_path) == original_sha256

    # Execute page rotation
    rotate_res = client.post(
        f"/api/documents/{doc_id}/rotate",
        json={"page_index": 0, "degrees": 90},
    )
    assert rotate_res.status_code == 200
    rotate_data = rotate_res.json()
    new_rev = rotate_data["revision"]
    updated_doc = rotate_data["document"]

    # Verification: New child revision created
    assert new_rev["id"] != original_rev_id
    assert new_rev["parent_revision_id"] == original_rev_id
    assert new_rev["operation"] == "rotate_page"
    assert updated_doc["current_revision_id"] == new_rev["id"]
    assert updated_doc["original_revision_id"] == original_rev_id

    # CRITICAL INVARIANT: Original file remains completely unchanged on disk
    assert original_path.exists()
    assert LocalImmutableFileStore.calculate_sha256(original_path) == original_sha256


def test_reorder_pages() -> None:
    pdf_bytes = create_synthetic_pdf(pages=3)
    upload_res = client.post(
        "/api/documents",
        files={"file": ("reorder_test.pdf", BytesIO(pdf_bytes), "application/pdf")},
    )
    doc_id = upload_res.json()["document"]["id"]
    original_rev_id = upload_res.json()["revision"]["id"]
    original_path = settings.data_root / upload_res.json()["revision"]["storage_path"]
    original_sha256 = upload_res.json()["revision"]["sha256"]

    # Permute pages [0, 1, 2] -> [2, 0, 1]
    reorder_res = client.post(
        f"/api/documents/{doc_id}/reorder",
        json={"new_order": [2, 0, 1]},
    )
    assert reorder_res.status_code == 200
    data = reorder_res.json()
    new_rev = data["revision"]
    assert new_rev["operation"] == "reorder"
    assert new_rev["parent_revision_id"] == original_rev_id
    assert new_rev["page_count"] == 3

    # Assert original unchanged
    assert LocalImmutableFileStore.calculate_sha256(original_path) == original_sha256


def test_delete_pages() -> None:
    pdf_bytes = create_synthetic_pdf(pages=4)
    upload_res = client.post(
        "/api/documents",
        files={"file": ("delete_test.pdf", BytesIO(pdf_bytes), "application/pdf")},
    )
    doc_id = upload_res.json()["document"]["id"]

    # Delete pages 1 and 3 (leaving 2 pages)
    del_res = client.post(
        f"/api/documents/{doc_id}/delete-pages",
        json={"pages": [1, 3]},
    )
    assert del_res.status_code == 200
    data = del_res.json()
    assert data["document"]["page_count"] == 2
    assert data["revision"]["page_count"] == 2
    assert data["revision"]["operation"] == "delete_pages"


def test_delete_all_pages_rejected() -> None:
    pdf_bytes = create_synthetic_pdf(pages=2)
    upload_res = client.post(
        "/api/documents",
        files={"file": ("cannot_empty.pdf", BytesIO(pdf_bytes), "application/pdf")},
    )
    doc_id = upload_res.json()["document"]["id"]

    # Attempt to delete all pages
    del_res = client.post(
        f"/api/documents/{doc_id}/delete-pages",
        json={"pages": [0, 1]},
    )
    assert del_res.status_code == 400
    assert "at least 1 page must remain" in del_res.json()["detail"].lower()


def test_duplicate_page() -> None:
    pdf_bytes = create_synthetic_pdf(pages=2)
    upload_res = client.post(
        "/api/documents",
        files={"file": ("dup_test.pdf", BytesIO(pdf_bytes), "application/pdf")},
    )
    doc_id = upload_res.json()["document"]["id"]

    # Duplicate page 0 twice (count=2)
    dup_res = client.post(
        f"/api/documents/{doc_id}/duplicate-page",
        json={"page_index": 0, "count": 2},
    )
    assert dup_res.status_code == 200
    data = dup_res.json()
    assert data["document"]["page_count"] == 4  # 1 original + 2 duplicates + 1 second page
    assert data["revision"]["operation"] == "duplicate_page"


def test_extract_pages_creates_new_document() -> None:
    pdf_bytes = create_synthetic_pdf(pages=5)
    upload_res = client.post(
        "/api/documents",
        files={"file": ("main_doc.pdf", BytesIO(pdf_bytes), "application/pdf")},
    )
    doc_id = upload_res.json()["document"]["id"]

    # Extract pages 0 and 2 into a new document
    ext_res = client.post(
        f"/api/documents/{doc_id}/extract-pages",
        json={"pages": [0, 2], "title": "SubSection.pdf"},
    )
    assert ext_res.status_code == 201
    data = ext_res.json()
    new_doc = data["document"]
    new_rev = data["revision"]

    assert new_doc["id"] != doc_id
    assert new_doc["title"] == "SubSection.pdf"
    assert new_doc["page_count"] == 2
    assert new_doc["original_revision_id"] == new_rev["id"]
    assert new_rev["operation"] == "extract_pages"
    assert new_rev["parent_revision_id"] is None

    # Verify original document unchanged
    source_res = client.get(f"/api/documents/{doc_id}")
    assert source_res.json()["document"]["page_count"] == 5


def test_merge_documents_creates_new_document() -> None:
    pdf1 = create_synthetic_pdf(pages=2)
    pdf2 = create_synthetic_pdf(pages=3)

    up1 = client.post("/api/documents", files={"file": ("part1.pdf", BytesIO(pdf1), "application/pdf")})
    up2 = client.post("/api/documents", files={"file": ("part2.pdf", BytesIO(pdf2), "application/pdf")})
    doc1_id = up1.json()["document"]["id"]
    doc2_id = up2.json()["document"]["id"]

    # Merge them
    merge_res = client.post(
        "/api/documents/merge",
        json={"document_ids": [doc1_id, doc2_id], "title": "Combined_Report.pdf"},
    )
    assert merge_res.status_code == 201
    data = merge_res.json()
    merged_doc = data["document"]
    merged_rev = data["revision"]

    assert merged_doc["title"] == "Combined_Report.pdf"
    assert merged_doc["page_count"] == 5  # 2 + 3
    assert merged_doc["original_revision_id"] == merged_rev["id"]
    assert merged_rev["operation"] == "merge"
    assert merged_rev["parent_revision_id"] is None


def test_page_operation_invalid_indices() -> None:
    pdf_bytes = create_synthetic_pdf(pages=2)
    upload_res = client.post(
        "/api/documents",
        files={"file": ("bounds.pdf", BytesIO(pdf_bytes), "application/pdf")},
    )
    doc_id = upload_res.json()["document"]["id"]

    # Invalid rotation index
    res = client.post(f"/api/documents/{doc_id}/rotate", json={"page_index": 10, "degrees": 90})
    assert res.status_code == 400

    # Invalid reorder list length
    res = client.post(f"/api/documents/{doc_id}/reorder", json={"new_order": [0]})
    assert res.status_code == 400

    # Invalid duplicate index
    res = client.post(f"/api/documents/{doc_id}/duplicate-page", json={"page_index": 5, "count": 1})
    assert res.status_code == 400


def test_document_listing_and_detail() -> None:
    pdf1 = create_synthetic_pdf(1)
    pdf2 = create_synthetic_pdf(2)

    res1 = client.post("/api/documents", files={"file": ("doc1.pdf", BytesIO(pdf1), "application/pdf")})
    res2 = client.post("/api/documents", files={"file": ("doc2.pdf", BytesIO(pdf2), "application/pdf")})
    doc1_id = res1.json()["document"]["id"]
    doc2_id = res2.json()["document"]["id"]

    # Test list
    list_res = client.get("/api/documents")
    assert list_res.status_code == 200
    docs = list_res.json()
    assert len(docs) >= 2
    ids = [d["id"] for d in docs]
    assert doc1_id in ids
    assert doc2_id in ids

    # Test detail
    detail_res = client.get(f"/api/documents/{doc1_id}")
    assert detail_res.status_code == 200
    detail = detail_res.json()
    assert detail["document"]["id"] == doc1_id
    assert len(detail["revisions"]) == 1


def test_export_and_content_streaming() -> None:
    pdf_bytes = create_synthetic_pdf(pages=2)
    upload_res = client.post(
        "/api/documents",
        files={"file": ("invoice.pdf", BytesIO(pdf_bytes), "application/pdf")},
    )
    doc_id = upload_res.json()["document"]["id"]
    rev_id = upload_res.json()["revision"]["id"]

    # Test content stream
    content_res = client.get(f"/api/documents/{doc_id}/revisions/{rev_id}/content")
    assert content_res.status_code == 200
    assert content_res.headers["content-type"] == "application/pdf"
    assert len(content_res.content) > 0

    # Test export download
    export_res = client.get(f"/api/documents/{doc_id}/export")
    assert export_res.status_code == 200
    assert "attachment" in export_res.headers.get("content-disposition", "")
    assert len(export_res.content) == len(pdf_bytes)


def test_delete_document() -> None:
    pdf_bytes = create_synthetic_pdf(pages=1)
    upload_res = client.post(
        "/api/documents",
        files={"file": ("temp.pdf", BytesIO(pdf_bytes), "application/pdf")},
    )
    doc_id = upload_res.json()["document"]["id"]

    del_res = client.delete(f"/api/documents/{doc_id}")
    assert del_res.status_code == 204

    # Now verify 404
    get_res = client.get(f"/api/documents/{doc_id}")
    assert get_res.status_code == 404


def test_resize_pages_a4_to_letter() -> None:
    pdf_bytes = create_synthetic_pdf(pages=2)
    upload_res = client.post(
        "/api/documents",
        files={"file": ("resize_me.pdf", BytesIO(pdf_bytes), "application/pdf")},
    )
    doc_id = upload_res.json()["document"]["id"]
    original_path = settings.data_root / upload_res.json()["revision"]["storage_path"]
    original_sha256 = upload_res.json()["revision"]["sha256"]

    # Resize all pages to Letter (612 x 792)
    resize_res = client.post(
        f"/api/documents/{doc_id}/resize",
        json={"target_size": "Letter", "scale_content": True},
    )
    assert resize_res.status_code == 200
    data = resize_res.json()
    new_rev = data["revision"]
    assert new_rev["operation"] == "resize_pages"

    # Verify resized dimensions in result file
    new_file = settings.data_root / new_rev["storage_path"]
    reader = pypdf.PdfReader(str(new_file))
    assert abs(float(reader.pages[0].mediabox.width) - 612.0) < 0.1
    assert abs(float(reader.pages[0].mediabox.height) - 792.0) < 0.1

    # Invariant: Original file untouched
    assert LocalImmutableFileStore.calculate_sha256(original_path) == original_sha256


def test_crop_pages() -> None:
    pdf_bytes = create_synthetic_pdf(pages=1)
    upload_res = client.post(
        "/api/documents",
        files={"file": ("crop_me.pdf", BytesIO(pdf_bytes), "application/pdf")},
    )
    doc_id = upload_res.json()["document"]["id"]
    original_path = settings.data_root / upload_res.json()["revision"]["storage_path"]
    original_sha256 = upload_res.json()["revision"]["sha256"]

    # Crop 10 points left, 15 right, 20 top, 25 bottom
    crop_res = client.post(
        f"/api/documents/{doc_id}/crop",
        json={"left": 10.0, "top": 20.0, "right": 15.0, "bottom": 25.0},
    )
    assert crop_res.status_code == 200
    data = crop_res.json()
    new_rev = data["revision"]
    assert new_rev["operation"] == "crop_pages"

    # Verify cropbox
    new_file = settings.data_root / new_rev["storage_path"]
    reader = pypdf.PdfReader(str(new_file))
    cb = reader.pages[0].cropbox
    assert float(cb.lower_left[0]) == 10.0
    assert float(cb.lower_left[1]) == 25.0

    # Invariant: Original file untouched
    assert LocalImmutableFileStore.calculate_sha256(original_path) == original_sha256


def test_crop_invalid_margins_rejected() -> None:
    pdf_bytes = create_synthetic_pdf(pages=1)
    upload_res = client.post(
        "/api/documents",
        files={"file": ("tiny.pdf", BytesIO(pdf_bytes), "application/pdf")},
    )
    doc_id = upload_res.json()["document"]["id"]

    # Margins exceed page width (595.28 pt)
    crop_res = client.post(
        f"/api/documents/{doc_id}/crop",
        json={"left": 400.0, "top": 10.0, "right": 400.0, "bottom": 10.0},
    )
    assert crop_res.status_code == 400
    assert "exceed page dimensions" in crop_res.json()["detail"].lower()


def test_header_footer_page_numbering() -> None:
    pdf_bytes = create_synthetic_pdf(pages=3)
    upload_res = client.post(
        "/api/documents",
        files={"file": ("report_numbered.pdf", BytesIO(pdf_bytes), "application/pdf")},
    )
    doc_id = upload_res.json()["document"]["id"]
    original_path = settings.data_root / upload_res.json()["revision"]["storage_path"]
    original_sha256 = upload_res.json()["revision"]["sha256"]

    # Apply headers, footers and numbering
    hf_res = client.post(
        f"/api/documents/{doc_id}/header-footer",
        json={
            "header_center": "Company Confidential",
            "footer_center": "Page {page} of {total}",
            "skip_first_page": True,
            "margin": 36.0,
        },
    )
    assert hf_res.status_code == 200
    data = hf_res.json()
    new_rev = data["revision"]
    assert new_rev["operation"] == "header_footer"
    assert new_rev["page_count"] == 3

    # Invariant: Original file untouched
    assert LocalImmutableFileStore.calculate_sha256(original_path) == original_sha256


def create_synthetic_pdf_with_text(text: str = "SampleText") -> bytes:
    from reportlab.pdfgen import canvas as rl_canvas
    buf = BytesIO()
    c = rl_canvas.Canvas(buf, pagesize=(595.28, 841.89))
    c.drawString(100, 500, text)
    c.save()
    return buf.getvalue()


def test_apply_text_and_shape_annotations() -> None:
    pdf_bytes = create_synthetic_pdf(pages=1)
    upload_res = client.post(
        "/api/documents",
        files={"file": ("contract_annot.pdf", BytesIO(pdf_bytes), "application/pdf")},
    )
    doc_id = upload_res.json()["document"]["id"]
    original_path = settings.data_root / upload_res.json()["revision"]["storage_path"]
    original_sha256 = upload_res.json()["revision"]["sha256"]

    # Apply styled text overlay and highlight shape
    annot_res = client.post(
        f"/api/documents/{doc_id}/annotate",
        json={
            "page_index": 0,
            "texts": [
                {
                    "text": "Approved for Signature",
                    "x": 100.0,
                    "y": 600.0,
                    "font_name": "Helvetica",
                    "font_size": 14.0,
                    "color": "#0284c7",
                    "link_url": "https://example.com/verify",
                }
            ],
            "shapes": [
                {
                    "type": "highlight",
                    "x": 95.0,
                    "y": 595.0,
                    "width": 180.0,
                    "height": 22.0,
                    "color": "#fde047",
                    "opacity": 0.4,
                }
            ],
        },
    )
    assert annot_res.status_code == 200
    data = annot_res.json()
    new_rev = data["revision"]
    assert new_rev["operation"] == "annotate"

    # Verify that the new revision has the text
    new_file = settings.data_root / new_rev["storage_path"]
    reader = pypdf.PdfReader(str(new_file))
    assert "Approved for Signature" in reader.pages[0].extract_text()

    # Invariant: Original file untouched
    assert LocalImmutableFileStore.calculate_sha256(original_path) == original_sha256


def test_native_text_replacement() -> None:
    pdf_bytes = create_synthetic_pdf_with_text("AlphaBetaGamma")
    upload_res = client.post(
        "/api/documents",
        files={"file": ("native_edit.pdf", BytesIO(pdf_bytes), "application/pdf")},
    )
    doc_id = upload_res.json()["document"]["id"]
    original_path = settings.data_root / upload_res.json()["revision"]["storage_path"]
    original_sha256 = upload_res.json()["revision"]["sha256"]

    # Replace native text stream
    replace_res = client.post(
        f"/api/documents/{doc_id}/native-text-edit",
        json={
            "page_index": 0,
            "target_text": "AlphaBetaGamma",
            "replacement_text": "ReplacedDelta",
        },
    )
    assert replace_res.status_code == 200
    data = replace_res.json()
    new_rev = data["revision"]
    assert new_rev["operation"] == "native_text_edit"

    # Verify replaced text in native content stream
    new_file = settings.data_root / new_rev["storage_path"]
    reader = pypdf.PdfReader(str(new_file))
    extracted = reader.pages[0].extract_text()
    assert "ReplacedDelta" in extracted
    assert "AlphaBetaGamma" not in extracted

    # Invariant: Original file untouched
    assert LocalImmutableFileStore.calculate_sha256(original_path) == original_sha256


def test_native_text_replacement_missing_target() -> None:
    pdf_bytes = create_synthetic_pdf_with_text("SomeExistingText")
    upload_res = client.post(
        "/api/documents",
        files={"file": ("native_fail.pdf", BytesIO(pdf_bytes), "application/pdf")},
    )
    doc_id = upload_res.json()["document"]["id"]

    # Attempt to replace text that is not in the stream
    replace_res = client.post(
        f"/api/documents/{doc_id}/native-text-edit",
        json={
            "page_index": 0,
            "target_text": "NonExistentString12345",
            "replacement_text": "NewText",
        },
    )
    assert replace_res.status_code == 400
    assert "could not be matched directly" in replace_res.json()["detail"].lower()
