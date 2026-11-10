import base64
from io import BytesIO
import json
from pathlib import Path
import shutil
import tempfile

from fastapi.testclient import TestClient
from PIL import Image
import pymupdf as fitz
import pytest

from app.config import settings
from app.main import app
from app.storage import LocalImmutableFileStore


@pytest.fixture(autouse=True)
def isolated_storage():
    temp_dir = Path(tempfile.mkdtemp(prefix="pdf_canvas_sig_test_"))
    old_root = settings.data_root
    settings.data_root = temp_dir
    settings.ensure_directories()

    yield temp_dir
    settings.data_root = old_root
    shutil.rmtree(temp_dir, ignore_errors=True)


client = TestClient(app)


def create_sample_pdf_bytes() -> bytes:
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    page.insert_text((50, 720), "Master Service Agreement — Confidential", fontsize=14)
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


def create_signature_png_base64() -> str:
    img = Image.new("RGBA", (240, 80), (0, 0, 0, 0))
    # Draw crisp blue stroke diagonal across transparent canvas
    for i in range(20, 220):
        y = int(40 + 18 * ((i % 40) / 40.0 - 0.5))
        for dy in (-1, 0, 1):
            img.putpixel((i, max(0, min(79, y + dy))), (29, 78, 216, 255))
    buf = BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


def test_saved_signature_library_lifecycle_and_validation() -> None:
    sig_b64 = create_signature_png_base64()

    # 1. Save valid PNG signature
    res = client.post(
        "/api/signatures/library",
        json={"name": "Primary Ink Signature", "image_base64": sig_b64},
    )
    assert res.status_code == 201
    created = res.json()
    sig_id = created["id"]
    assert created["name"] == "Primary Ink Signature"
    assert created["width"] == 240
    assert created["height"] == 80
    assert created["image_data_url"].startswith("data:image/png;base64,")

    # 2. List library
    list_res = client.get("/api/signatures/library")
    assert list_res.status_code == 200
    assert len(list_res.json()) == 1
    assert list_res.json()[0]["id"] == sig_id

    # 3. Reject corrupted/non-image base64 payload
    bad_res = client.post(
        "/api/signatures/library",
        json={
            "name": "Malicious Payload",
            "image_base64": base64.b64encode(b"#!/bin/sh\nrm -rf /").decode("ascii"),
        },
    )
    assert bad_res.status_code == 400

    # 4. Path traversal defense on delete
    trav_res = client.delete("/api/signatures/library/..%5Cevil")
    assert trav_res.status_code == 400

    # 5. Clean delete
    del_res = client.delete(f"/api/signatures/library/{sig_id}")
    assert del_res.status_code == 204
    assert client.get("/api/signatures/library").json() == []


def test_visual_signature_stamp_creates_revision_and_preserves_original() -> None:
    pdf_bytes = create_sample_pdf_bytes()
    upload = client.post(
        "/api/documents",
        files={"file": ("msa.pdf", BytesIO(pdf_bytes), "application/pdf")},
    )
    assert upload.status_code == 201
    doc_id = upload.json()["document"]["id"]
    orig_rev = upload.json()["revision"]
    orig_path = settings.data_root / orig_rev["storage_path"]
    orig_sha = orig_rev["sha256"]

    # Save reusable signature first
    sig_res = client.post(
        "/api/signatures/library",
        json={"name": "Alice Ink", "image_base64": create_signature_png_base64()},
    )
    sig_id = sig_res.json()["id"]

    # Apply visual stamp overlay
    stamp_res = client.post(
        f"/api/signatures/documents/{doc_id}/visual-stamp",
        json={
            "page_index": 0,
            "x": 72.0,
            "y": 100.0,
            "width": 180.0,
            "height": 64.0,
            "saved_signature_id": sig_id,
            "signer_name": "Alice Signer",
            "reason": "Reviewed",
            "include_timestamp": True,
            "opacity": 0.95,
        },
    )
    assert stamp_res.status_code == 200
    stamp_rev = stamp_res.json()["revision"]
    assert stamp_rev["operation"] == "visual_signature_stamp"
    assert stamp_rev["parent_revision_id"] == orig_rev["id"]

    # Confirm caption rendered on page and truthful verification distinction
    stamped_path = settings.data_root / stamp_rev["storage_path"]
    fitz_doc = fitz.open(str(stamped_path))
    extracted = fitz_doc[0].get_text()
    images = fitz_doc[0].get_images()
    fitz_doc.close()
    assert "Alice Signer" in extracted
    assert len(images) >= 1

    verify_res = client.get(f"/api/signatures/documents/{doc_id}/verify")
    assert verify_res.status_code == 200
    report = verify_res.json()
    assert report["has_digital_signatures"] is False
    assert report["digital_signature_count"] == 0

    # Validation / failure paths
    bad_page = client.post(
        f"/api/signatures/documents/{doc_id}/visual-stamp",
        json={
            "page_index": 99,
            "x": 50.0,
            "y": 50.0,
            "width": 150.0,
            "height": 50.0,
            "saved_signature_id": sig_id,
        },
    )
    assert bad_page.status_code == 400

    missing_sig = client.post(
        f"/api/signatures/documents/{doc_id}/visual-stamp",
        json={
            "page_index": 0,
            "x": 50.0,
            "y": 50.0,
            "width": 150.0,
            "height": 50.0,
            "saved_signature_id": "nonexistent12",
        },
    )
    assert missing_sig.status_code == 404

    # Source file byte-level immutability
    assert LocalImmutableFileStore.calculate_sha256(orig_path) == orig_sha


def test_pkcs12_generation_digital_sign_multisig_and_tamper_detection() -> None:
    pdf_bytes = create_sample_pdf_bytes()
    upload = client.post(
        "/api/documents",
        files={"file": ("contract_to_sign.pdf", BytesIO(pdf_bytes), "application/pdf")},
    )
    doc_id = upload.json()["document"]["id"]
    orig_rev = upload.json()["revision"]
    orig_path = settings.data_root / orig_rev["storage_path"]
    orig_sha = orig_rev["sha256"]

    # 1. Generate two local self-signed PKCS#12 certificates
    cert1_res = client.post(
        "/api/signatures/certs/self-signed",
        json={
            "label": "Legal Counsel",
            "common_name": "Dr. Clara Vance",
            "organization": "Acme Legal",
            "email": "clara@local.invalid",
            "validity_days": 365,
            "password": "StrongPassword!1",
        },
    )
    assert cert1_res.status_code == 201
    cert1 = cert1_res.json()
    cert1_id = cert1["id"]
    assert cert1["self_signed"] is True

    # Ensure password is never stored inside cert metadata json on disk
    meta_json = json.loads((settings.certs_path / f"{cert1_id}.meta.json").read_text(encoding="utf-8"))
    assert "StrongPassword!1" not in json.dumps(meta_json)

    cert2_res = client.post(
        "/api/signatures/certs/self-signed",
        json={
            "label": "CFO Countersign",
            "common_name": "Marcus Sterling",
            "organization": "Acme Finance",
            "email": "marcus@local.invalid",
            "validity_days": 365,
            "password": "SecondPassword!2",
        },
    )
    assert cert2_res.status_code == 201
    cert2_id = cert2_res.json()["id"]

    # 2. Failure path: wrong passphrase returns 400
    wrong_pw = client.post(
        f"/api/signatures/documents/{doc_id}/digital-sign",
        json={
            "cert_id": cert1_id,
            "password": "WrongPassword999",
            "reason": "Test",
            "visible": True,
            "page_index": 0,
            "rect": [40.0, 40.0, 260.0, 100.0],
        },
    )
    assert wrong_pw.status_code == 400

    # 3. Failure path: missing cert returns 404
    missing_cert = client.post(
        f"/api/signatures/documents/{doc_id}/digital-sign",
        json={
            "cert_id": "missingcert99",
            "password": "StrongPassword!1",
        },
    )
    assert missing_cert.status_code == 404

    # 4. First cryptographic signature (visible box)
    sign1_res = client.post(
        f"/api/signatures/documents/{doc_id}/digital-sign",
        json={
            "cert_id": cert1_id,
            "password": "StrongPassword!1",
            "reason": "Approved by Legal",
            "location": "New York Local",
            "visible": True,
            "page_index": 0,
            "rect": [40.0, 40.0, 260.0, 100.0],
        },
    )
    assert sign1_res.status_code == 200
    rev1 = sign1_res.json()["revision"]
    assert rev1["operation"] == "digital_signature"
    assert rev1["parent_revision_id"] == orig_rev["id"]

    # Verify offline report
    v1 = client.get(f"/api/signatures/documents/{doc_id}/verify")
    assert v1.status_code == 200
    r1 = v1.json()
    assert r1["has_digital_signatures"] is True
    assert r1["digital_signature_count"] == 1
    assert r1["all_signatures_intact"] is True
    s1 = r1["signatures"][0]
    assert s1["digest_intact"] is True
    assert s1["cryptographically_valid"] is True
    assert s1["self_signed"] is True
    assert s1["trusted_ca"] is False
    assert s1["signer_name"] == "Dr. Clara Vance"
    assert s1["reason"] == "Approved by Legal"

    # 5. Second incremental cryptographic signature (countersignature)
    sign2_res = client.post(
        f"/api/signatures/documents/{doc_id}/digital-sign",
        json={
            "cert_id": cert2_id,
            "password": "SecondPassword!2",
            "reason": "Financial Approval",
            "location": "Chicago Local",
            "visible": True,
            "page_index": 0,
            "rect": [300.0, 40.0, 520.0, 100.0],
        },
    )
    assert sign2_res.status_code == 200
    rev2 = sign2_res.json()["revision"]
    assert rev2["parent_revision_id"] == rev1["id"]

    v2 = client.get(f"/api/signatures/documents/{doc_id}/verify")
    assert v2.status_code == 200
    r2 = v2.json()
    assert r2["digital_signature_count"] == 2
    assert r2["all_signatures_intact"] is True
    signer_names = {s["signer_name"] for s in r2["signatures"]}
    assert signer_names == {"Dr. Clara Vance", "Marcus Sterling"}
    assert all(s["cryptographically_valid"] is True for s in r2["signatures"])

    # 6. Inline uploaded .p12 signing failure / deletion checks
    del_c = client.delete(f"/api/signatures/certs/{cert2_id}")
    assert del_c.status_code == 204
    assert len(client.get("/api/signatures/certs").json()) == 1

    # 7. Tamper test: modify bytes inside signed revision file directly on disk
    signed_path = settings.data_root / rev2["storage_path"]
    raw = bytearray(signed_path.read_bytes())
    raw[140] ^= 0x01
    signed_path.write_bytes(bytes(raw))

    tampered_verify = client.get(f"/api/signatures/documents/{doc_id}/verify")
    assert tampered_verify.status_code == 200
    tampered_report = tampered_verify.json()
    assert tampered_report["has_digital_signatures"] is True
    assert tampered_report["all_signatures_intact"] is False
    assert any(s["digest_intact"] is False for s in tampered_report["signatures"])

    # Invariant: Immutable source file untouched
    assert LocalImmutableFileStore.calculate_sha256(orig_path) == orig_sha


def test_inline_visual_stamp_inline_p12_invisible_sign_and_failure_paths() -> None:
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.hazmat.primitives.serialization import pkcs12
    from cryptography.x509.oid import NameOID
    from datetime import UTC, datetime, timedelta

    pdf_bytes = create_sample_pdf_bytes()
    upload = client.post(
        "/api/documents",
        files={"file": ("inline_test.pdf", BytesIO(pdf_bytes), "application/pdf")},
    )
    assert upload.status_code == 201
    doc_id = upload.json()["document"]["id"]
    orig_path = settings.data_root / upload.json()["revision"]["storage_path"]
    orig_sha = upload.json()["revision"]["sha256"]

    # 1. Inline visual signature stamp (without saving to library)
    stamp_res = client.post(
        f"/api/signatures/documents/{doc_id}/visual-stamp",
        json={
            "page_index": 0,
            "x": 100.0,
            "y": 150.0,
            "width": 160.0,
            "height": 60.0,
            "signature_image_base64": create_signature_png_base64(),
            "signer_name": "External Guest",
            "include_timestamp": False,
        },
    )
    assert stamp_res.status_code == 200
    assert stamp_res.json()["revision"]["operation"] == "visual_signature_stamp"

    # 2. Failure: neither saved_signature_id nor signature_image_base64 provided
    missing_both = client.post(
        f"/api/signatures/documents/{doc_id}/visual-stamp",
        json={"page_index": 0, "x": 10.0, "y": 10.0, "width": 100.0, "height": 40.0},
    )
    assert missing_both.status_code == 400

    # 3. Synthesize external PKCS#12 in memory & sign invisibly via pkcs12_base64
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = issuer = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "External Cert Holder")])
    now = datetime.now(UTC)
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(minutes=5))
        .not_valid_after(now + timedelta(days=90))
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
        .sign(key, hashes.SHA256())
    )
    p12_bytes = pkcs12.serialize_key_and_certificates(
        name=b"external",
        key=key,
        cert=cert,
        cas=None,
        encryption_algorithm=serialization.BestAvailableEncryption(b"extPass!99"),
    )
    p12_b64 = base64.b64encode(p12_bytes).decode("ascii")

    sign_res = client.post(
        f"/api/signatures/documents/{doc_id}/digital-sign",
        json={
            "pkcs12_base64": p12_b64,
            "password": "extPass!99",
            "reason": "Invisible Seal",
            "visible": False,
        },
    )
    assert sign_res.status_code == 200
    assert sign_res.json()["revision"]["operation"] == "digital_signature"

    # Temp .p12 upload file must be cleaned up immediately after signing
    assert list(settings.temp_path.glob("*.p12")) == []

    report = client.get(f"/api/signatures/documents/{doc_id}/verify").json()
    assert report["digital_signature_count"] == 1
    assert report["all_signatures_intact"] is True
    assert report["signatures"][0]["signer_name"] == "External Cert Holder"

    # 4. Reject invalid rect when visible=True and reject corrupt p12
    bad_rect = client.post(
        f"/api/signatures/documents/{doc_id}/digital-sign",
        json={
            "pkcs12_base64": p12_b64,
            "password": "extPass!99",
            "visible": True,
            "page_index": 0,
            "rect": [300.0, 50.0, 100.0, 100.0],
        },
    )
    assert bad_rect.status_code == 400

    corrupt_p12 = client.post(
        f"/api/signatures/documents/{doc_id}/digital-sign",
        json={
            "pkcs12_base64": base64.b64encode(b"not-a-pkcs12").decode("ascii"),
            "password": "extPass!99",
        },
    )
    assert corrupt_p12.status_code == 400
    assert list(settings.temp_path.glob("*.p12")) == []

    # Invariant: Immutable source file untouched
    assert LocalImmutableFileStore.calculate_sha256(orig_path) == orig_sha
