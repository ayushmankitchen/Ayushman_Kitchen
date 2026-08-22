import pytest
import uuid
import hashlib
from datetime import datetime, timezone, timedelta
from httpx import AsyncClient, ASGITransport
from backend.server import app, db, hash_password, verify_password
from backend.services.email import email_service


@pytest.mark.asyncio
async def test_complete_forgot_and_reset_password_flow(monkeypatch):
    sent_emails = []

    async def mock_send(recipient_email, recipient_name, reset_link):
        sent_emails.append({
            "email": recipient_email,
            "name": recipient_name,
            "link": reset_link,
        })
        return True

    monkeypatch.setattr(email_service, "send_password_reset_email", mock_send)

    tag = uuid.uuid4().hex[:6]
    admin_id = str(uuid.uuid4())
    admin_email = f"admin_{tag}@ayushmankitchen.com"
    admin_user = f"admin_{tag}"
    old_admin_pw = "OldAdminSecret123!"
    new_admin_pw = "NewAdminSecret456!"

    # Insert test admin directly
    await db.admins.insert_one({
        "id": admin_id,
        "name": f"Admin {tag}",
        "username": admin_user,
        "email": admin_email,
        "password_hash": hash_password(old_admin_pw),
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })

    # Insert test student/worker
    biz_id = str(uuid.uuid4())
    student_id = str(uuid.uuid4())
    student_email = f"student_{tag}@ayushmankitchen.com"
    student_login = f"STU_{tag}"
    old_student_pw = "OldStudentSecret123!"
    new_student_pw = "NewStudentSecret456!"

    await db.workers.insert_one({
        "id": student_id,
        "business_id": biz_id,
        "name": f"Student {tag}",
        "login_id": student_login,
        "email": student_email,
        "password_hash": hash_password(old_student_pw),
        "status": "ACTIVE",
        "portal_enabled": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        # 1. Test unknown email forgot password returns generic success
        unknown_res = await client.post("/api/auth/forgot-password", json={"email": "nonexistent@example.com"})
        assert unknown_res.status_code == 200
        assert unknown_res.json()["message"] == "If an account exists for this email, a password reset link has been sent."
        assert len(sent_emails) == 0

        # 2. Test admin forgot password
        admin_forgot = await client.post("/api/auth/forgot-password", json={"email": admin_email})
        assert admin_forgot.status_code == 200
        assert admin_forgot.json()["message"] == "If an account exists for this email, a password reset link has been sent."
        assert len(sent_emails) == 1
        admin_reset_link = sent_emails[-1]["link"]
        assert "token=" in admin_reset_link
        raw_admin_token = admin_reset_link.split("token=")[1].split("&")[0]

        # Verify DB token record
        admin_token_hash = hashlib.sha256(raw_admin_token.encode("utf-8")).hexdigest()
        token_doc = await db.password_reset_tokens.find_one({"token_hash": admin_token_hash})
        assert token_doc is not None
        assert token_doc["user_id"] == admin_id
        assert token_doc["token_type"] == "password_reset"
        assert token_doc["used_at"] is None
        assert raw_admin_token not in str(token_doc)

        # 3. Test invalid token rejection
        bad_reset = await client.post("/api/auth/reset-password", json={
            "token": "invalid_fake_token_12345",
            "new_password": new_admin_pw,
        })
        assert bad_reset.status_code == 400

        # 4. Test expired token rejection
        expired_token_raw = f"expired_test_token_{uuid.uuid4().hex}"
        expired_hash = hashlib.sha256(expired_token_raw.encode("utf-8")).hexdigest()
        await db.password_reset_tokens.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": admin_id,
            "admin_id": admin_id,
            "token_type": "password_reset",
            "token_hash": expired_hash,
            "expires_at": (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat(),
            "used_at": None,
            "created_at": (datetime.now(timezone.utc) - timedelta(minutes=35)).isoformat(),
        })
        exp_res = await client.post("/api/auth/reset-password", json={
            "token": expired_token_raw,
            "new_password": new_admin_pw,
        })
        assert exp_res.status_code == 400
        assert "expired" in exp_res.json()["detail"].lower()

        # 5. Test valid reset for admin
        succ_reset = await client.post("/api/auth/reset-password", json={
            "token": raw_admin_token,
            "new_password": new_admin_pw,
        })
        assert succ_reset.status_code == 200
        assert succ_reset.json()["message"] == "Password reset successfully."

        # 6. Verify single-use token - second attempt fails
        second_attempt = await client.post("/api/auth/reset-password", json={
            "token": raw_admin_token,
            "new_password": "YetAnotherPassword123!",
        })
        assert second_attempt.status_code == 400

        # 7. Verify admin old password no longer works
        old_login = await client.post("/api/admin/login", json={
            "identifier": admin_user,
            "password": old_admin_pw,
        })
        assert old_login.status_code == 401

        # 8. Verify admin new password works
        new_login = await client.post("/api/admin/login", json={
            "identifier": admin_user,
            "password": new_admin_pw,
        })
        assert new_login.status_code == 200

        # 9. Test student forgot password & reset flow
        student_forgot = await client.post("/api/auth/forgot-password", json={"email": student_email})
        assert student_forgot.status_code == 200
        assert len(sent_emails) == 2
        student_reset_link = sent_emails[-1]["link"]
        assert "token=" in student_reset_link
        raw_student_token = student_reset_link.split("token=")[1].split("&")[0]

        student_reset = await client.post("/api/auth/reset-password", json={
            "token": raw_student_token,
            "new_password": new_student_pw,
        })
        assert student_reset.status_code == 200
        assert student_reset.json()["message"] == "Password reset successfully."

        # 10. Verify student old password fails and new password works
        old_stu_login = await client.post("/api/worker/login", json={
            "login_id": student_login,
            "password": old_student_pw,
        })
        assert old_stu_login.status_code == 401

        new_stu_login = await client.post("/api/worker/login", json={
            "login_id": student_login,
            "password": new_student_pw,
        })
        assert new_stu_login.status_code == 200


@pytest.mark.asyncio
async def test_password_validation_and_malformed_requests():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        # Invalid email format in forgot-password
        bad_email = await client.post("/api/auth/forgot-password", json={"email": "not-an-email"})
        assert bad_email.status_code == 422

        # Missing token in reset-password
        no_token = await client.post("/api/auth/reset-password", json={
            "token": "",
            "new_password": "ValidPassword123!",
        })
        assert no_token.status_code in {400, 422}

        # Too short new password (< 6 chars)
        short_pw = await client.post("/api/auth/reset-password", json={
            "token": "valid_length_token_123456",
            "new_password": "123",
        })
        assert short_pw.status_code in {400, 422}


@pytest.mark.asyncio
async def test_email_service_fallback(monkeypatch):
    from backend.services.email import BrevoEmailService
    service = BrevoEmailService()

    # When EMAIL_USER / EMAIL_PASSWORD is empty, it simulates and returns True gracefully without crashing
    monkeypatch.setenv("EMAIL_USER", "")
    monkeypatch.setenv("EMAIL_PASSWORD", "")
    res = await service.send_password_reset_email("test@example.com", "Tester", "http://localhost:3000/reset-password?token=abc")
    assert res is True
    assert service.host == "smtp-relay.brevo.com"
    assert service.port == 587
    assert service.sender_email == "ayushmankitchen@gmail.com"
    assert service.sender_name == "Ayushman Kitchen"


@pytest.mark.asyncio
async def test_smtp_send_mocked(monkeypatch):
    from backend.services.email import BrevoEmailService
    import backend.services.email as email_mod

    sent_calls = []

    def mock_smtp_sync(host, port, user, password, from_name, from_email, to_name, to_email, subject, reset_link, timeout):
        sent_calls.append({
            "host": host,
            "port": port,
            "user": user,
            "from_name": from_name,
            "from_email": from_email,
            "to_name": to_name,
            "to_email": to_email,
            "subject": subject,
            "reset_link": reset_link,
        })
        return True

    monkeypatch.setattr(email_mod, "_send_smtp_sync", mock_smtp_sync)
    monkeypatch.setenv("EMAIL_USER", "mock_brevo_user")
    monkeypatch.setenv("EMAIL_PASSWORD", "mock_brevo_smtp_key")

    service = BrevoEmailService()
    success = await service.send_password_reset_email(
        "recipient@example.com",
        "Test Student",
        "http://localhost:3000/reset-password?token=test_smtp_token"
    )
    assert success is True
    assert len(sent_calls) == 1
    assert sent_calls[0]["host"] == "smtp-relay.brevo.com"
    assert sent_calls[0]["port"] == 587
    assert sent_calls[0]["user"] == "mock_brevo_user"
    assert sent_calls[0]["to_email"] == "recipient@example.com"
    assert sent_calls[0]["from_email"] == "ayushmankitchen@gmail.com"
    assert "token=test_smtp_token" in sent_calls[0]["reset_link"]


