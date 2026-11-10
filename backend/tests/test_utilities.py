from io import BytesIO
from pathlib import Path
import random
import shutil
import tempfile
from uuid import uuid4

from fastapi.testclient import TestClient
from PIL import Image
import pymupdf as fitz
import pytest

from app.config import settings
from app.main import app
from app.storage import LocalImmutableFileStore


@pytest.fixture(autouse=True)
def isolated_storage():
    temp_dir = Path(tempfile.mkdtemp(prefix="pdf_canvas_util_test_"))
    old_root = settings.data_root
    settings.data_root = temp_dir
    settings.ensure_directories()

    yield temp_dir
    settings.data_root = old_root
    shutil.rmtree(temp_dir, ignore_errors=True)


client = TestClient(app)


def create_multipage_pdf(pages_text: list[str], with_heavy_image: bool = False) -> bytes:
    doc = fitz.open()
    for idx, text in enumerate(pages_text):
        page = doc.new_page(width=595, height=842)
        page.insert_text((50, 100), text, fontsize=18 if idx < 2 else 11)
        if idx == 0 and with_heavy_image:
            # Generate 600x600 textured RGB image placed inside 150x150 pt rect (~288 effective DPI)
            rng = random.Random(42)
            raw_pixels = bytearray(600 * 600 * 3)
            for p in range(0, len(raw_pixels), 3):
                val = (p // 3 + rng.randint(0, 80)) % 256
                raw_pixels[p] = val
                raw_pixels[p + 1] = (val * 2) % 256
                raw_pixels[p + 2] = 255 - val
            img = Image.frombytes("RGB", (600, 600), bytes(raw_pixels))
            buf = BytesIO()
            img.save(buf, format="PNG")
            page.insert_image(fitz.Rect(50, 200, 200, 350), stream=buf.getvalue())
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


def test_watermark_placement_layers_and_failure_paths() -> None:
    pdf_bytes = create_multipage_pdf(["Page One Agreement", "Page Two Appendix"])
    upload = client.post(
        "/api/documents",
        files={"file": ("watermark_test.pdf", BytesIO(pdf_bytes), "application/pdf")},
    )
    assert upload.status_code == 201
    doc_id = upload.json()["document"]["id"]
    orig_rev = upload.json()["revision"]
    orig_path = settings.data_root / orig_rev["storage_path"]
    orig_sha = orig_rev["sha256"]

    # 1. Invalid inputs rejected cleanly
    bad_pos = client.post(
        f"/api/utilities/documents/{doc_id}/watermark",
        json={"text": "CONFIDENTIAL", "position": "diagonal"},
    )
    assert bad_pos.status_code == 400

    bad_page = client.post(
        f"/api/utilities/documents/{doc_id}/watermark",
        json={"text": "CONFIDENTIAL", "page_indices": [99]},
    )
    assert bad_page.status_code == 400

    blank_text = client.post(
        f"/api/utilities/documents/{doc_id}/watermark",
        json={"text": "   "},
    )
    assert blank_text.status_code == 400

    # 2. Targeted page 0 center watermark
    wm1 = client.post(
        f"/api/utilities/documents/{doc_id}/watermark",
        json={
            "text": "CONFIDENTIAL",
            "position": "center",
            "layer": "over",
            "opacity": 0.25,
            "rotation": 45.0,
            "color": "#dc2626",
            "page_indices": [0],
        },
    )
    assert wm1.status_code == 200
    rev1 = wm1.json()["revision"]
    assert rev1["operation"] == "watermark"
    assert rev1["parent_revision_id"] == orig_rev["id"]

    wm1_path = settings.data_root / rev1["storage_path"]
    fdoc1 = fitz.open(str(wm1_path))
    assert "CONFIDENTIAL" in fdoc1[0].get_text()
    assert "CONFIDENTIAL" not in fdoc1[1].get_text()
    fdoc1.close()

    # 3. Tiled under-layer watermark across all pages
    wm2 = client.post(
        f"/api/utilities/documents/{doc_id}/watermark",
        json={
            "text": "INTERNAL DRAFT",
            "position": "tile",
            "layer": "under",
            "opacity": 0.2,
            "rotation": 30.0,
        },
    )
    assert wm2.status_code == 200
    wm2_path = settings.data_root / wm2.json()["revision"]["storage_path"]
    fdoc2 = fitz.open(str(wm2_path))
    assert "INTERNAL DRAFT" in fdoc2[0].get_text()
    assert "INTERNAL DRAFT" in fdoc2[1].get_text()
    fdoc2.close()

    # 4. Encrypted PDF rejected cleanly
    client.post(
        f"/api/security/documents/{doc_id}/encrypt",
        json={"user_password": "Lock123"},
    )
    wm_enc = client.post(
        f"/api/utilities/documents/{doc_id}/watermark",
        json={"text": "BLOCKED"},
    )
    assert wm_enc.status_code == 400

    # Original SHA-256 unchanged
    assert LocalImmutableFileStore.calculate_sha256(orig_path) == orig_sha


def test_compression_lossless_and_raster_downsampling() -> None:
    pdf_bytes = create_multipage_pdf(["Heavy Raster Report", "Second Page Text"], with_heavy_image=True)
    upload = client.post(
        "/api/documents",
        files={"file": ("heavy_raster.pdf", BytesIO(pdf_bytes), "application/pdf")},
    )
    assert upload.status_code == 201
    doc_id = upload.json()["document"]["id"]
    orig_rev = upload.json()["revision"]
    orig_path = settings.data_root / orig_rev["storage_path"]
    orig_sha = orig_rev["sha256"]

    # Invalid mode rejected
    bad_mode = client.post(
        f"/api/utilities/documents/{doc_id}/compress",
        json={"mode": "ultra_lossy"},
    )
    assert bad_mode.status_code == 400

    # Lossless optimization
    lossless_res = client.post(
        f"/api/utilities/documents/{doc_id}/compress",
        json={"mode": "lossless"},
    )
    assert lossless_res.status_code == 200
    lossless_data = lossless_res.json()
    assert lossless_data["revision"]["operation"] == "compress"
    assert lossless_data["mode"] == "lossless"
    assert lossless_data["compressed_bytes"] > 0

    # Compact optimization (raster downsampling + JPEG compression)
    compact_res = client.post(
        f"/api/utilities/documents/{doc_id}/compress",
        json={"mode": "compact"},
    )
    assert compact_res.status_code == 200
    c_data = compact_res.json()
    assert c_data["mode"] == "compact"
    assert c_data["compressed_bytes"] < c_data["original_bytes"]
    assert c_data["reduction_percent"] > 20.0

    # Text remains intact after compact optimization
    c_path = settings.data_root / c_data["revision"]["storage_path"]
    fdoc = fitz.open(str(c_path))
    assert "Heavy Raster Report" in fdoc[0].get_text()
    assert "Second Page Text" in fdoc[1].get_text()
    fdoc.close()

    assert LocalImmutableFileStore.calculate_sha256(orig_path) == orig_sha


def test_bookmarks_crud_validation_and_autosuggest() -> None:
    doc = fitz.open()
    p0 = doc.new_page()
    p0.insert_text((50, 100), "1. Executive Summary", fontsize=22)
    p1 = doc.new_page()
    p1.insert_text((50, 100), "2. Technical Architecture", fontsize=18)
    p2 = doc.new_page()
    p2.insert_text((50, 100), "Regular body text paragraph only.", fontsize=10)
    pdf_bytes = doc.tobytes()
    doc.close()

    upload = client.post(
        "/api/documents",
        files={"file": ("outline_doc.pdf", BytesIO(pdf_bytes), "application/pdf")},
    )
    doc_id = upload.json()["document"]["id"]
    orig_rev = upload.json()["revision"]
    orig_path = settings.data_root / orig_rev["storage_path"]
    orig_sha = orig_rev["sha256"]

    # Initially empty bookmarks
    init_bm = client.get(f"/api/utilities/documents/{doc_id}/bookmarks")
    assert init_bm.status_code == 200
    assert init_bm.json()["total_pages"] == 3
    assert init_bm.json()["bookmarks"] == []

    # Auto-suggest detects large headings
    sug = client.get(f"/api/utilities/documents/{doc_id}/bookmarks/suggest")
    assert sug.status_code == 200
    suggestions = sug.json()
    assert len(suggestions) == 3
    assert suggestions[0]["title"] == "1. Executive Summary"
    assert suggestions[1]["title"] == "2. Technical Architecture"
    assert suggestions[2]["title"] == "Page 3"

    # Invalid hierarchy rejected (first bookmark level 2)
    bad_first = client.put(
        f"/api/utilities/documents/{doc_id}/bookmarks",
        json={"bookmarks": [{"level": 2, "title": "Child First", "page_index": 0}]},
    )
    assert bad_first.status_code == 400

    # Invalid hierarchy jump rejected (level 1 -> level 3)
    bad_jump = client.put(
        f"/api/utilities/documents/{doc_id}/bookmarks",
        json={
            "bookmarks": [
                {"level": 1, "title": "Chapter 1", "page_index": 0},
                {"level": 3, "title": "Deep Jump", "page_index": 1},
            ]
        },
    )
    assert bad_jump.status_code == 400

    # Out-of-bounds page index rejected
    bad_page = client.put(
        f"/api/utilities/documents/{doc_id}/bookmarks",
        json={"bookmarks": [{"level": 1, "title": "Out of Bounds", "page_index": 9}]},
    )
    assert bad_page.status_code == 400

    # Valid hierarchical bookmarks persisted in new revision
    put_res = client.put(
        f"/api/utilities/documents/{doc_id}/bookmarks",
        json={
            "bookmarks": [
                {"level": 1, "title": "1. Executive Summary", "page_index": 0},
                {"level": 2, "title": "1.1 Overview", "page_index": 1},
                {"level": 1, "title": "Appendix", "page_index": 2},
            ]
        },
    )
    assert put_res.status_code == 200
    bm_rev = put_res.json()["revision"]
    assert bm_rev["operation"] == "bookmarks_update"

    fetched = client.get(f"/api/utilities/documents/{doc_id}/bookmarks").json()
    assert len(fetched["bookmarks"]) == 3
    assert fetched["bookmarks"][1] == {
        "level": 2,
        "title": "1.1 Overview",
        "page_index": 1,
    }

    assert LocalImmutableFileStore.calculate_sha256(orig_path) == orig_sha


def test_document_comparison_text_and_visual_diff_and_revisions() -> None:
    pdf_a = create_multipage_pdf(["Quarterly Budget Q1\nRevenue: $100,000", "Unchanged Page Two"])
    pdf_b = create_multipage_pdf(["Quarterly Budget Q1\nRevenue: $145,000\nAdjusted Forecast", "Unchanged Page Two"])

    up_a = client.post(
        "/api/documents",
        files={"file": ("budget_v1.pdf", BytesIO(pdf_a), "application/pdf")},
    ).json()
    up_b = client.post(
        "/api/documents",
        files={"file": ("budget_v2.pdf", BytesIO(pdf_b), "application/pdf")},
    ).json()
    doc_a_id = up_a["document"]["id"]
    rev_a_id = up_a["revision"]["id"]
    doc_b_id = up_b["document"]["id"]
    rev_b_id = up_b["revision"]["id"]

    # 1. Identical comparison reports zero diffs
    same_cmp = client.post(
        "/api/utilities/compare",
        json={"document_a_id": doc_a_id, "document_b_id": doc_a_id},
    )
    assert same_cmp.status_code == 200
    same_data = same_cmp.json()
    assert same_data["identical_pages"] == 2
    assert same_data["changed_pages"] == 0
    assert same_data["page_diffs"][0]["visual_diff_percent"] == 0.0
    assert same_data["page_diffs"][0]["text_similarity"] == 1.0

    # 2. Comparison between v1 and v2 identifies changes cleanly on page 0 and identical page 1
    diff_cmp = client.post(
        "/api/utilities/compare",
        json={"document_a_id": doc_a_id, "document_b_id": doc_b_id},
    )
    assert diff_cmp.status_code == 200
    d_data = diff_cmp.json()
    assert d_data["changed_pages"] == 1
    assert d_data["identical_pages"] == 1
    p0 = d_data["page_diffs"][0]
    p1 = d_data["page_diffs"][1]
    assert p0["text_changed"] is True
    assert p0["added_lines"] >= 1
    assert p0["visual_diff_percent"] > 0.0
    assert p0["visual_changed"] is True
    assert p1["text_changed"] is False
    assert p1["visual_changed"] is False

    # 3. Cross-document revision authorization guard rejects mismatched revision_id
    mismatch = client.post(
        "/api/utilities/compare",
        json={
            "document_a_id": doc_a_id,
            "revision_a_id": rev_b_id,
            "document_b_id": doc_b_id,
        },
    )
    assert mismatch.status_code == 400

    # 4. Visual PNG diff endpoint returns crisp PNG highlighting differing pixels in red
    img_res = client.get(
        f"/api/utilities/compare-page-image?doc_a_id={doc_a_id}&doc_b_id={doc_b_id}&page_index=0&rev_a_id={rev_a_id}&rev_b_id={rev_b_id}"
    )
    assert img_res.status_code == 200
    assert img_res.headers["content-type"] == "image/png"
    assert img_res.content[:8] == b"\x89PNG\r\n\x1a\n"

    diff_pil = Image.open(BytesIO(img_res.content)).convert("RGB")
    # Confirm red highlight pixels (239, 68, 68) are present in the visual diff PNG
    has_red_highlight = any(
        r > 220 and g < 90 and b < 90 for (r, g, b) in diff_pil.get_flattened_data()
    )
    assert has_red_highlight is True

    # Out-of-bounds page diff image returns 400
    bad_idx = client.get(
        f"/api/utilities/compare-page-image?doc_a_id={doc_a_id}&doc_b_id={doc_b_id}&page_index=10"
    )
    assert bad_idx.status_code == 400


def test_batch_utilities_and_partial_failure_resilience() -> None:
    pdf1 = create_multipage_pdf(["Batch Doc One"])
    pdf2 = create_multipage_pdf(["Batch Doc Two"])
    pdf3 = create_multipage_pdf(["Encrypted Batch Doc"])

    d1 = client.post("/api/documents", files={"file": ("b1.pdf", BytesIO(pdf1), "application/pdf")}).json()["document"]["id"]
    d2 = client.post("/api/documents", files={"file": ("b2.pdf", BytesIO(pdf2), "application/pdf")}).json()["document"]["id"]
    d3 = client.post("/api/documents", files={"file": ("b3.pdf", BytesIO(pdf3), "application/pdf")}).json()["document"]["id"]

    # Lock d3 so batch operation rejects d3 individually without failing d1 & d2
    client.post(f"/api/security/documents/{d3}/encrypt", json={"user_password": "Secret"})
    missing_id = str(uuid4())

    # Invalid batch action returns 400 upfront
    bad_action = client.post(
        "/api/utilities/batch",
        json={"document_ids": [d1], "action": "unknown_action"},
    )
    assert bad_action.status_code == 400

    # Watermark missing payload rejected upfront
    missing_wm = client.post(
        "/api/utilities/batch",
        json={"document_ids": [d1], "action": "watermark"},
    )
    assert missing_wm.status_code == 400

    # Batch Watermark across [d1, d2, d3, missing_id]
    batch_wm = client.post(
        "/api/utilities/batch",
        json={
            "document_ids": [d1, d2, d3, missing_id],
            "action": "watermark",
            "watermark": {"text": "BATCH STAMP"},
        },
    )
    assert batch_wm.status_code == 200
    bw_data = batch_wm.json()
    assert bw_data["total"] == 4
    assert bw_data["succeeded"] == 2
    assert bw_data["failed"] == 2
    assert bw_data["results"][0]["success"] is True
    assert bw_data["results"][1]["success"] is True
    assert bw_data["results"][2]["success"] is False
    assert bw_data["results"][3]["success"] is False

    # Batch Compress & Batch Sanitize across [d1, d2]
    batch_cmp = client.post(
        "/api/utilities/batch",
        json={
            "document_ids": [d1, d2],
            "action": "compress",
            "compress": {"mode": "lossless"},
        },
    )
    assert batch_cmp.status_code == 200
    assert batch_cmp.json()["succeeded"] == 2

    batch_san = client.post(
        "/api/utilities/batch",
        json={
            "document_ids": [d1, d2],
            "action": "sanitize",
            "sanitize": {"strip_info_dict": True, "strip_xmp_metadata": True},
        },
    )
    assert batch_san.status_code == 200
    assert batch_san.json()["succeeded"] == 2
