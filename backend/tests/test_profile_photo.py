import io
import os
import pytest
from unittest.mock import patch, MagicMock
from types import SimpleNamespace
from fastapi import HTTPException, UploadFile
from httpx import ASGITransport, AsyncClient

import backend.server as server
from backend.services.storage import ProfilePhotoStorage, MAX_PHOTO_SIZE_BYTES


class _MockCursor:
    def __init__(self, records):
        self.records = records

    async def to_list(self, _limit=1000):
        return [dict(r) for r in self.records]


class _MockCollection:
    def __init__(self, records=None):
        self.records = list(records or [])

    async def find_one(self, query, projection=None):
        for r in self.records:
            match = True
            for k, v in query.items():
                if k == "$ne":
                    continue
                if r.get(k) != v:
                    match = False
                    break
            if match:
                res = dict(r)
                if projection:
                    for p, val in projection.items():
                        if val == 0 and p in res:
                            del res[p]
                return res
        return None

    def find(self, query, projection=None):
        matched = []
        for r in self.records:
            match = True
            for k, v in query.items():
                if r.get(k) != v:
                    match = False
                    break
            if match:
                res = dict(r)
                if projection:
                    for p, val in projection.items():
                        if val == 0 and p in res:
                            del res[p]
                matched.append(res)
        return _MockCursor(matched)

    async def insert_one(self, doc):
        self.records.append(dict(doc))
        return SimpleNamespace(inserted_id="mock_id")

    async def update_one(self, query, update):
        for r in self.records:
            match = True
            for k, v in query.items():
                if r.get(k) != v:
                    match = False
                    break
            if match:
                if "$set" in update:
                    r.update(update["$set"])
                if "$unset" in update:
                    for k in update["$unset"]:
                        r.pop(k, None)
                return SimpleNamespace(modified_count=1)
        return SimpleNamespace(modified_count=0)

    async def delete_one(self, query):
        for i, r in enumerate(self.records):
            match = True
            for k, v in query.items():
                if r.get(k) != v:
                    match = False
                    break
            if match:
                self.records.pop(i)
                return SimpleNamespace(deleted_count=1)
        return SimpleNamespace(deleted_count=0)

    async def delete_many(self, query):
        orig_len = len(self.records)
        self.records = [r for r in self.records if not all(r.get(k) == v for k, v in query.items())]
        return SimpleNamespace(deleted_count=orig_len - len(self.records))


@pytest.mark.asyncio
async def test_invalid_photo_mime_is_rejected():
    upload = UploadFile(filename="doc.pdf", file=io.BytesIO(b"%PDF-1.4"), headers={"content-type": "application/pdf"})
    with pytest.raises(HTTPException) as exc:
        await ProfilePhotoStorage().upload_profile_photo(upload)
    assert exc.value.status_code == 400
    assert "JPEG, PNG, or WebP" in exc.value.detail


@pytest.mark.asyncio
async def test_empty_photo_is_rejected():
    upload = UploadFile(filename="empty.jpg", file=io.BytesIO(b""), headers={"content-type": "image/jpeg"})
    with pytest.raises(HTTPException) as exc:
        await ProfilePhotoStorage().upload_profile_photo(upload)
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_oversized_photo_is_rejected():
    huge_data = b"x" * (MAX_PHOTO_SIZE_BYTES + 100)
    upload = UploadFile(filename="huge.jpg", file=io.BytesIO(huge_data), headers={"content-type": "image/jpeg"})
    with pytest.raises(HTTPException) as exc:
        await ProfilePhotoStorage().upload_profile_photo(upload)
    assert exc.value.status_code == 413


@pytest.mark.asyncio
async def test_cloudinary_photo_upload_is_mocked(monkeypatch):
    monkeypatch.setenv("MEDIA_STORAGE", "cloudinary")
    monkeypatch.setenv("CLOUDINARY_CLOUD_NAME", "mock_cloud")
    monkeypatch.setenv("CLOUDINARY_API_KEY", "mock_key")
    monkeypatch.setenv("CLOUDINARY_API_SECRET", "mock_secret")

    mock_upload_result = {
        "public_id": "workforce/photos/photo_test123",
        "secure_url": "https://res.cloudinary.com/mock_cloud/image/upload/v123/workforce/photos/photo_test123.jpg",
        "resource_type": "image",
    }

    import cloudinary.uploader
    with patch.object(cloudinary.uploader, "upload", return_value=mock_upload_result) as mocked_up:
        storage = ProfilePhotoStorage()
        upload = UploadFile(
            filename="photo.jpg",
            file=io.BytesIO(b"\xff\xd8\xff\xe0" + b"mockjpegdata"),
            headers={"content-type": "image/jpeg"},
        )
        result = await storage.upload_profile_photo(upload, worker_id="w-123")
        assert result["storage_provider"] == "cloudinary"
        assert result["public_id"] == "workforce/photos/photo_test123"
        assert result["secure_url"] == mock_upload_result["secure_url"]
        mocked_up.assert_called_once()


@pytest.mark.asyncio
async def test_admin_upload_worker_photo_flow(monkeypatch):
    worker_doc = {
        "id": "worker-1",
        "business_id": "biz-alpha",
        "name": "Ramesh Kumar",
        "mobile": "9876543210",
        "work_type": "Mason",
        "salary": 25000,
        "status": "ACTIVE",
    }
    mock_db = SimpleNamespace(
        workers=_MockCollection([worker_doc]),
    )
    monkeypatch.setattr(server, "db", mock_db)

    async def mock_admin():
        return {"id": "admin-1", "business_id": "biz-alpha", "username": "owner"}

    server.app.dependency_overrides[server.get_current_admin] = mock_admin

    mock_upload_result = {
        "public_id": "workforce/photos/photo_ramesh123",
        "secure_url": "https://res.cloudinary.com/demo/image/upload/v1/workforce/photos/photo_ramesh123.jpg",
        "resource_type": "image",
        "storage_provider": "cloudinary",
    }

    with patch.object(server.photo_storage, "upload_profile_photo", return_value=mock_upload_result):
        try:
            transport = ASGITransport(app=server.app)
            async with AsyncClient(transport=transport, base_url="http://testserver") as client:
                files = {"file": ("avatar.png", b"\x89PNG\r\n\x1a\n" + b"dummydata", "image/png")}
                res = await client.post("/api/workers/worker-1/profile-photo", files=files)
                assert res.status_code == 200
                data = res.json()
                assert data["id"] == "worker-1"
                assert data["profile_photo_url"] == mock_upload_result["secure_url"]
                assert "password_hash" not in data
                assert "password" not in data
                assert "CLOUDINARY_API_SECRET" not in data

                # Verify worker doc was updated
                updated = await mock_db.workers.find_one({"id": "worker-1"})
                assert updated.get("profile_photo_url") == mock_upload_result["secure_url"]
                assert updated.get("profile_photo_asset_id") == "workforce/photos/photo_ramesh123"
        finally:
            server.app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_cross_business_photo_upload_is_blocked(monkeypatch):
    worker_doc = {
        "id": "worker-other",
        "business_id": "biz-beta",
        "name": "Suresh",
    }
    mock_db = SimpleNamespace(
        workers=_MockCollection([worker_doc]),
    )
    monkeypatch.setattr(server, "db", mock_db)

    # Admin belongs to biz-alpha, worker belongs to biz-beta
    async def mock_admin():
        return {"id": "admin-alpha", "business_id": "biz-alpha", "username": "owner"}

    server.app.dependency_overrides[server.get_current_admin] = mock_admin

    try:
        transport = ASGITransport(app=server.app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            files = {"file": ("avatar.jpg", b"\xff\xd8\xff" + b"dummy", "image/jpeg")}
            res = await client.post("/api/workers/worker-other/profile-photo", files=files)
            assert res.status_code == 404
    finally:
        server.app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_remove_worker_profile_photo(monkeypatch):
    worker_doc = {
        "id": "worker-2",
        "business_id": "biz-alpha",
        "name": "Amit Sharma",
        "profile_photo_url": "https://res.cloudinary.com/demo/image/upload/v1/workforce/photos/photo_123.jpg",
        "profile_photo_asset_id": "workforce/photos/photo_123",
        "profile_photo_provider": "cloudinary",
        "profile_photo_updated_at": "2026-08-15T00:00:00Z",
    }
    mock_db = SimpleNamespace(
        workers=_MockCollection([worker_doc]),
    )
    monkeypatch.setattr(server, "db", mock_db)

    async def mock_admin():
        return {"id": "admin-1", "business_id": "biz-alpha", "username": "owner"}

    server.app.dependency_overrides[server.get_current_admin] = mock_admin

    with patch.object(server.photo_storage, "delete_profile_photo", return_value=None) as mock_del:
        try:
            transport = ASGITransport(app=server.app)
            async with AsyncClient(transport=transport, base_url="http://testserver") as client:
                res = await client.delete("/api/workers/worker-2/profile-photo")
                assert res.status_code == 200
                data = res.json()
                assert data["id"] == "worker-2"
                assert data.get("profile_photo_url") is None

                # Worker record still exists
                stored = await mock_db.workers.find_one({"id": "worker-2"})
                assert stored is not None
                assert "profile_photo_url" not in stored or stored["profile_photo_url"] is None
                mock_del.assert_called_once()
        finally:
            server.app.dependency_overrides.clear()
