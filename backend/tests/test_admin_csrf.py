from types import SimpleNamespace

import pytest
from httpx import ASGITransport, AsyncClient
from starlette.requests import Request
from starlette.responses import Response

from backend import server


@pytest.mark.asyncio
async def test_admin_me_renews_session_without_rotating_csrf():
    csrf_token = "csrf-from-admin-login"
    request = Request({
        "type": "http",
        "method": "GET",
        "path": "/api/admin/me",
        "headers": [(b"cookie", f"access_token=access-1; csrf_token={csrf_token}".encode())],
    })
    response = Response()
    admin = {
        "id": "admin-1",
        "email": "owner@example.com",
        "business_id": "business-1",
    }

    data = await server.admin_me(request, response, admin)

    assert data["csrf_token"] == csrf_token
    csrf_cookie_headers = [
        value.decode() for name, value in response.raw_headers
        if name.lower() == b"set-cookie" and value.startswith(b"csrf_token=")
    ]
    assert len(csrf_cookie_headers) == 1
    assert csrf_cookie_headers[0].startswith(f"csrf_token={csrf_token};")


class FakeRevokedTokens:
    async def update_one(self, *_args, **_kwargs):
        return SimpleNamespace()


@pytest.mark.asyncio
@pytest.mark.parametrize("header_token", [None, "wrong-token"])
async def test_authenticated_mutations_reject_missing_or_invalid_admin_csrf(monkeypatch, header_token):
    monkeypatch.setattr(server, "db", SimpleNamespace(revoked_admin_tokens=FakeRevokedTokens()))
    transport = ASGITransport(app=server.app)
    headers = {"X-CSRF-Token": header_token} if header_token else {}
    async with AsyncClient(
        transport=transport,
        base_url="http://testserver",
        cookies={"access_token": "access-1", "csrf_token": "valid-token"},
        headers=headers,
    ) as client:
        response = await client.post("/api/admin/logout")

    assert response.status_code == 403
    assert response.json()["detail"] == "CSRF validation failed"
