from io import BytesIO
from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_health() -> None:
    assert client.get("/health").json() == {"status": "ok"}


def test_upload_creates_immutable_original() -> None:
    organization_id = str(uuid4())
    response = client.post(
        "/v1/documents",
        headers={"X-Organization-Id": organization_id},
        files={"file": ("sample.pdf", BytesIO(b"%PDF-1.7\n%%EOF"), "application/pdf")},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["document"]["original_revision_id"] == body["revision"]["id"]
    assert body["document"]["current_revision_id"] == body["revision"]["id"]


def test_rejects_non_pdf() -> None:
    response = client.post(
        "/v1/documents",
        headers={"X-Organization-Id": str(uuid4())},
        files={"file": ("fake.pdf", BytesIO(b"not a pdf"), "application/pdf")},
    )
    assert response.status_code == 415


def test_document_is_hidden_from_other_organization() -> None:
    owner = str(uuid4())
    upload = client.post(
        "/v1/documents",
        headers={"X-Organization-Id": owner},
        files={"file": ("sample.pdf", BytesIO(b"%PDF-1.7\n%%EOF"), "application/pdf")},
    )
    document_id = upload.json()["document"]["id"]
    response = client.get(
        f"/v1/documents/{document_id}",
        headers={"X-Organization-Id": str(uuid4())},
    )
    assert response.status_code == 404
