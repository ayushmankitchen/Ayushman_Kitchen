from types import SimpleNamespace

import pytest
from starlette.requests import Request
from starlette.responses import Response

from backend import server


class FakeBusinesses:
    async def find_one(self, *_args, **_kwargs):
        return {"id": "business-1", "name": "Test Business"}


@pytest.mark.asyncio
async def test_worker_me_renews_session_without_rotating_csrf(monkeypatch):
    """A GET auth refresh must not invalidate the header used by the next password POST."""
    csrf_token = "csrf-from-worker-login"
    request = Request({
        "type": "http",
        "method": "GET",
        "path": "/api/worker/me",
        "headers": [(b"cookie", f"session_token=session-1; csrf_token={csrf_token}".encode())],
    })
    response = Response()
    worker = {
        "id": "worker-1",
        "worker_id": "worker-1",
        "business_id": "business-1",
        "name": "Ramesh",
    }
    monkeypatch.setattr(server, "db", SimpleNamespace(businesses=FakeBusinesses()))

    data = await server.worker_me(request, response, worker)

    assert data["csrf_token"] == csrf_token
    csrf_cookie_headers = [
        value.decode() for name, value in response.raw_headers
        if name.lower() == b"set-cookie" and value.startswith(b"csrf_token=")
    ]
    assert len(csrf_cookie_headers) == 1
    assert csrf_cookie_headers[0].startswith(f"csrf_token={csrf_token};")
