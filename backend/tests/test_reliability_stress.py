from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from pathlib import Path
import shutil
import tempfile
import time
from uuid import uuid4
import pytest
from fastapi.testclient import TestClient
from reportlab.pdfgen import canvas as rl_canvas

from app.config import settings
from app.main import app
from app.models import Document, Revision, RevisionOperation
from app.repository import SQLiteDocumentRepository
from app.storage import LocalImmutableFileStore


def create_large_synthetic_pdf(pages: int = 500) -> bytes:
    """Builds an N-page vector PDF in memory quickly via ReportLab."""
    buf = BytesIO()
    c = rl_canvas.Canvas(buf, pagesize=(595.28, 841.89))
    c.setFont("Helvetica", 11)
    for idx in range(pages):
        c.drawString(72, 760, f"Enterprise Benchmark Document - Page {idx + 1} of {pages}")
        c.showPage()
    c.save()
    return buf.getvalue()


def create_simple_pdf(label: str) -> bytes:
    buf = BytesIO()
    c = rl_canvas.Canvas(buf, pagesize=(595.28, 841.89))
    c.setFont("Helvetica", 12)
    c.drawString(72, 740, label)
    c.showPage()
    c.save()
    return buf.getvalue()


@pytest.fixture(autouse=True)
def isolated_storage():
    temp_dir = Path(tempfile.mkdtemp(prefix="pdf_canvas_p15_test_"))
    old_root = settings.data_root
    settings.data_root = temp_dir
    settings.ensure_directories()
    yield temp_dir
    settings.data_root = old_root
    shutil.rmtree(temp_dir, ignore_errors=True)


client = TestClient(app)


def test_500_page_pdf_ingestion_mutation_and_streaming_ranges() -> None:
    t_start = time.perf_counter()
    pdf_500 = create_large_synthetic_pdf(pages=500)

    up_res = client.post(
        "/api/documents",
        files={"file": ("enterprise_500_pages.pdf", BytesIO(pdf_500), "application/pdf")},
    )
    ingest_elapsed = time.perf_counter() - t_start
    assert up_res.status_code == 201
    assert ingest_elapsed < 15.0

    doc = up_res.json()["document"]
    orig_rev = up_res.json()["revision"]
    doc_id = doc["id"]
    orig_rev_id = orig_rev["id"]
    orig_sha = orig_rev["sha256"]
    orig_path = settings.data_root / orig_rev["storage_path"]
    assert doc["page_count"] == 500

    # Verify HTTP byte-range streaming & immutable caching headers for large PDF preview
    range_res = client.get(
        f"/api/documents/{doc_id}/revisions/{orig_rev_id}/content",
        headers={"Range": "bytes=0-1023"},
    )
    assert range_res.status_code == 206
    assert range_res.headers.get("accept-ranges") == "bytes"
    assert "immutable" in (range_res.headers.get("cache-control") or "")
    content_range = range_res.headers.get("content-range") or ""
    assert content_range.startswith("bytes 0-1023/")
    assert len(range_res.content) == 1024
    assert range_res.content.startswith(b"%PDF-")

    # Mutate middle page (page 250) cleanly & verify performance + DAG lineage
    t_mut = time.perf_counter()
    rot_res = client.post(
        f"/api/documents/{doc_id}/rotate",
        json={"page_index": 249, "degrees": 90},
    )
    mut_elapsed = time.perf_counter() - t_mut
    assert rot_res.status_code == 200
    assert mut_elapsed < 15.0
    child_rev = rot_res.json()["revision"]
    assert child_rev["page_count"] == 500
    assert child_rev["parent_revision_id"] == orig_rev_id
    assert child_rev["operation"] == "rotate_page"

    # Read TOC / bookmarks on 500-page PDF
    bm_res = client.get(f"/api/utilities/documents/{doc_id}/bookmarks")
    assert bm_res.status_code == 200
    assert bm_res.json()["total_pages"] == 500

    # Critical invariant: immutable 500-page original hash untouched on disk
    assert LocalImmutableFileStore.calculate_sha256(orig_path) == orig_sha


def test_catalog_search_pagination_and_revision_authorization() -> None:
    titles = [
        "alpha_contract.pdf",
        "beta_invoice.pdf",
        "alpha_appendix.pdf",
        "gamma_spec_50%.pdf",
        "delta_memo.pdf",
    ]
    created: list[tuple[str, str]] = []
    for title in titles:
        res = client.post(
            "/api/documents",
            files={"file": (title, BytesIO(create_simple_pdf(title)), "application/pdf")},
        )
        assert res.status_code == 201
        created.append((res.json()["document"]["id"], res.json()["revision"]["id"]))

    # Wildcard escaping: searching "50%" must only match "gamma_spec_50%.pdf"
    pct_res = client.get("/api/documents", params={"search": "50%"})
    assert pct_res.status_code == 200
    pct_titles = [d["title"] for d in pct_res.json()]
    assert pct_titles == ["gamma_spec_50%.pdf"]

    # Case-insensitive search
    alpha_res = client.get("/api/documents", params={"search": "ALPHA"})
    assert alpha_res.status_code == 200
    assert sorted(d["title"] for d in alpha_res.json()) == [
        "alpha_appendix.pdf",
        "alpha_contract.pdf",
    ]

    # Disjoint pagination slices across 5 docs
    p1 = client.get("/api/documents", params={"limit": 2, "offset": 0}).json()
    p2 = client.get("/api/documents", params={"limit": 2, "offset": 2}).json()
    p3 = client.get("/api/documents", params={"limit": 2, "offset": 4}).json()
    assert len(p1) == 2 and len(p2) == 2 and len(p3) == 1
    all_ids = {d["id"] for d in p1 + p2 + p3}
    assert len(all_ids) == 5

    # Authorization boundary: cannot stream or export doc B's revision via doc A's ID
    doc_a_id, _ = created[0]
    _, rev_b_id = created[1]
    bad_stream = client.get(f"/api/documents/{doc_a_id}/revisions/{rev_b_id}/content")
    assert bad_stream.status_code == 404

    bad_export = client.get(
        f"/api/documents/{doc_a_id}/export", params={"revision_id": rev_b_id}
    )
    assert bad_export.status_code == 404


def test_concurrent_sqlite_wal_readers_and_writers() -> None:
    repo = SQLiteDocumentRepository(settings.database_path)
    stats = repo.get_db_stats()
    assert stats["journal_mode"] == "wal"
    assert stats["integrity_ok"] is True

    errors: list[Exception] = []

    def worker(idx: int) -> None:
        try:
            local_repo = SQLiteDocumentRepository(settings.database_path)
            doc_id = uuid4()
            rev_id = uuid4()
            doc = Document(
                id=doc_id,
                title=f"concurrent_{idx}.pdf",
                page_count=1,
                size_bytes=1234,
                original_revision_id=rev_id,
                current_revision_id=rev_id,
            )
            rev = Revision(
                id=rev_id,
                document_id=doc_id,
                parent_revision_id=None,
                operation=RevisionOperation.UPLOAD,
                storage_path=f"originals/{doc_id}/original.pdf",
                sha256="a" * 64,
                size_bytes=1234,
                page_count=1,
            )
            local_repo.add(doc, rev)
            fetched = local_repo.get_document(doc_id)
            assert fetched is not None
            _ = local_repo.list_documents(limit=20, offset=0, search="concurrent")
        except Exception as exc:
            errors.append(exc)

    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(worker, range(32)))

    assert errors == []
    final_stats = repo.get_db_stats()
    assert final_stats["integrity_ok"] is True
    assert final_stats["document_count"] == 32
    assert final_stats["revision_count"] == 32


def test_system_diagnostics_integrity_audit_and_safe_temp_cleanup() -> None:
    up_res = client.post(
        "/api/documents",
        files={"file": ("audit_target.pdf", BytesIO(create_simple_pdf("Audit Me")), "application/pdf")},
    )
    assert up_res.status_code == 201
    doc_id = up_res.json()["document"]["id"]
    orig_rev = up_res.json()["revision"]
    orig_path = settings.data_root / orig_rev["storage_path"]
    orig_sha = orig_rev["sha256"]

    rot_res = client.post(
        f"/api/documents/{doc_id}/rotate",
        json={"page_index": 0, "degrees": 90},
    )
    assert rot_res.status_code == 200
    child_rev = rot_res.json()["revision"]
    child_path = settings.data_root / child_rev["storage_path"]
    child_sha = child_rev["sha256"]

    # Plant stale temp buffers outside originals & active revisions
    stale_1 = settings.temp_path / "stale_merge_buffer.tmp"
    stale_1.write_bytes(b"temporary bytes 12345")
    stale_2 = settings.working_path / doc_id / "orphaned_stage.tmp_rev"
    stale_2.write_bytes(b"staged orphan bytes")

    # 1. System diagnostics report
    diag_res = client.get("/api/system/diagnostics")
    assert diag_res.status_code == 200
    diag = diag_res.json()
    assert diag["status"] == "healthy"
    assert diag["sqlite_integrity_ok"] is True
    assert diag["sqlite_journal_mode"] == "wal"
    assert diag["document_count"] == 1
    assert diag["revision_count"] == 2
    assert diag["temp_reclaimable_files"] == 2
    assert diag["temp_reclaimable_bytes"] == len(b"temporary bytes 12345") + len(b"staged orphan bytes")

    # 2. Verify SHA-256 catalog integrity (all clean)
    audit_res = client.post("/api/system/verify-integrity")
    assert audit_res.status_code == 200
    audit = audit_res.json()
    assert audit["healthy"] is True
    assert audit["checked_documents"] == 1
    assert audit["checked_revisions"] == 2
    assert audit["verified_revisions"] == 2
    assert audit["originals_intact"] == 1
    assert audit["issues"] == []

    # 3. Clean stale temp files and confirm originals + active working revisions remain untouched
    cleanup_res = client.post("/api/system/cleanup-temp")
    assert cleanup_res.status_code == 200
    cleaned = cleanup_res.json()
    assert cleaned["removed_files"] == 2
    assert cleaned["freed_bytes"] == len(b"temporary bytes 12345") + len(b"staged orphan bytes")
    assert cleaned["preserved_originals"] == 1
    assert cleaned["preserved_revisions"] == 2
    assert not stale_1.exists()
    assert not stale_2.exists()
    assert orig_path.exists()
    assert LocalImmutableFileStore.calculate_sha256(orig_path) == orig_sha
    assert child_path.exists()
    assert LocalImmutableFileStore.calculate_sha256(child_path) == child_sha

    # 4. Failure detection: tamper child revision bytes and ensure audit catches SHA-256 mismatch
    raw = bytearray(child_path.read_bytes())
    raw[-10] ^= 0xFF
    child_path.write_bytes(bytes(raw))

    tamper_audit = client.post("/api/system/verify-integrity").json()
    assert tamper_audit["healthy"] is False
    assert tamper_audit["originals_intact"] == 1
    assert len(tamper_audit["issues"]) == 1
    assert tamper_audit["issues"][0]["revision_id"] == child_rev["id"]
    assert tamper_audit["issues"][0]["issue_type"] == "sha256_mismatch"
