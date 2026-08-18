import hashlib
import uuid
import secrets
from datetime import datetime, timezone, timedelta
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

from backend.server import app, db


async def cleanup_test_data(prefix: str):
    businesses = await db.businesses.find({"name": {"$regex": f"^{prefix}"}}, {"_id": 0, "id": 1}).to_list(20)
    business_ids = [business["id"] for business in businesses]
    admins = await db.admins.find({"username": {"$regex": f"^{prefix}"}}, {"_id": 0, "id": 1}).to_list(20)
    admin_ids = [admin["id"] for admin in admins]
    await db.admins.delete_many({"username": {"$regex": f"^{prefix}"}})
    await db.businesses.delete_many({"name": {"$regex": f"^{prefix}"}})
    await db.workers.delete_many({"name": {"$regex": f"^{prefix}"}})
    await db.work_types.delete_many({"business_id": {"$in": business_ids}})
    await db.conversations.delete_many({"business_id": {"$in": business_ids}})
    await db.messages.delete_many({"business_id": {"$in": business_ids}})
    await db.worker_sessions.delete_many({"business_id": {"$in": business_ids}})
    await db.password_reset_tokens.delete_many({"admin_id": {"$in": admin_ids}})


@pytest.mark.asyncio
async def test_admin_signup_and_login_both_ways():
    tag = uuid.uuid4().hex[:6]
    prefix = f"test_auth_{tag}"
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        username = f"{prefix}_admin"
        email = f"{prefix}@example.com"
        password = "SecurePassword123!"

        # 1. Admin Signup
        signup_res = await client.post("/api/admin/signup", json={
            "name": f"{prefix}_Name",
            "business_name": f"{prefix}_Biz",
            "username": username,
            "email": email,
            "password": password,
        })
        assert signup_res.status_code == 200
        signup_data = signup_res.json()
        assert signup_data["admin"]["username"] == username
        assert signup_data["admin"]["email"] == email
        assert "password_hash" not in signup_data["admin"]
        assert signup_data["business"]["name"] == f"{prefix}_Biz"
        assert "access_token" in signup_res.cookies

        # 2. Reject duplicate username
        dup_user_res = await client.post("/api/admin/signup", json={
            "name": "Other Name",
            "business_name": "Other Biz",
            "username": username,
            "email": f"other_{tag}@example.com",
            "password": password,
        })
        assert dup_user_res.status_code == 409
        assert "username is already taken" in dup_user_res.json()["detail"]

        # 3. Reject duplicate email
        dup_email_res = await client.post("/api/admin/signup", json={
            "name": "Other Name",
            "business_name": "Other Biz",
            "username": f"other_{tag}",
            "email": email,
            "password": password,
        })
        assert dup_email_res.status_code == 409
        assert "email address already exists" in dup_email_res.json()["detail"]

        # 4. Login via Username + Password
        login_user_res = await client.post("/api/admin/login", json={
            "identifier": username,
            "password": password,
        })
        assert login_user_res.status_code == 200
        assert login_user_res.json()["admin"]["username"] == username
        assert "access_token" in login_user_res.cookies

        # 5. Login via Email + Password
        login_email_res = await client.post("/api/admin/login", json={
            "identifier": email,
            "password": password,
        })
        assert login_email_res.status_code == 200
        assert login_email_res.json()["admin"]["email"] == email
        assert "access_token" in login_email_res.cookies

        # 6. Reject wrong password
        bad_pw_res = await client.post("/api/admin/login", json={
            "identifier": username,
            "password": "WrongPassword123",
        })
        assert bad_pw_res.status_code == 401
        assert bad_pw_res.json()["detail"] == "Invalid username/email or password"

        # 7. Reject wrong identifier
        bad_id_res = await client.post("/api/admin/login", json={
            "identifier": "nonexistent_admin_123",
            "password": password,
        })
        assert bad_id_res.status_code == 401
        assert bad_id_res.json()["detail"] == "Invalid username/email or password"

    await cleanup_test_data(prefix)


@pytest.mark.asyncio
async def test_csrf_survives_admin_and_worker_bootstrap_for_work_types_and_chat():
    tag = uuid.uuid4().hex[:6]
    prefix = f"test_csrf_{tag}"
    transport = ASGITransport(app=app)
    worker_id = None
    conversation_id = None

    async with AsyncClient(transport=transport, base_url="http://testserver") as admin_client:
        signup = await admin_client.post("/api/admin/signup", json={
            "name": f"{prefix}_Owner",
            "business_name": f"{prefix}_Biz",
            "username": f"{prefix}_admin",
            "email": f"{prefix}@example.com",
            "password": "AdminPass123!",
        })
        assert signup.status_code == 200
        initial_csrf = signup.cookies.get("csrf_token")
        admin_client.headers["X-CSRF-Token"] = initial_csrf

        for _ in range(3):
            me = await admin_client.get("/api/admin/me")
            assert me.status_code == 200
            assert me.json()["csrf_token"] == initial_csrf
            assert admin_client.cookies.get("csrf_token") == initial_csrf

        for role in ("Salesman", "Barber"):
            created_role = await admin_client.post("/api/work-types", json={"name": role})
            assert created_role.status_code == 200
            assert created_role.json()["name"] == role

        worker = await admin_client.post("/api/workers", json={
            "name": f"{prefix}_Worker",
            "mobile": f"97{secrets.randbelow(100000000):08d}",
            "work_type": "Salesman",
            "joining_date": "2026-08-01",
            "salary": 15000,
            "status": "ACTIVE",
            "portal_enabled": True,
            "login_id": f"WF-CSRF{tag.upper()}",
            "password": "WorkerPass123!",
        })
        assert worker.status_code == 200
        worker_id = worker.json()["id"]

        admin_message = await admin_client.post("/api/chat/messages", json={
            "worker_id": worker_id,
            "message_type": "text",
            "text": "Admin CSRF message",
        })
        assert admin_message.status_code == 200
        assert admin_message.json()["sender_type"] == "owner"
        assert admin_message.json()["sender_id"] == signup.json()["admin"]["id"]
        conversation_id = admin_message.json()["conversation_id"]

        original_header = admin_client.headers.pop("X-CSRF-Token")
        missing = await admin_client.post("/api/work-types", json={"name": "Must Not Be Added"})
        assert missing.status_code == 403
        admin_client.headers["X-CSRF-Token"] = "invalid-token"
        invalid = await admin_client.post("/api/work-types", json={"name": "Must Not Be Added Either"})
        assert invalid.status_code == 403
        admin_client.headers["X-CSRF-Token"] = original_header

    async with AsyncClient(transport=transport, base_url="http://testserver") as worker_client:
        login = await worker_client.post("/api/worker/login", json={
            "login_id": f"WF-CSRF{tag.upper()}",
            "password": "WorkerPass123!",
        })
        assert login.status_code == 200
        worker_csrf = login.cookies.get("csrf_token")
        worker_client.headers["X-CSRF-Token"] = worker_csrf

        me = await worker_client.get("/api/worker/me")
        assert me.status_code == 200
        assert me.json()["csrf_token"] == worker_csrf

        reply = await worker_client.post("/api/chat/messages", json={
            "conversation_id": conversation_id,
            "worker_id": worker_id,
            "message_type": "text",
            "text": "Worker CSRF reply",
        })
        assert reply.status_code == 200
        assert reply.json()["sender_type"] == "worker"
        assert reply.json()["sender_id"] == worker_id

        worker_client.headers["X-CSRF-Token"] = "invalid-token"
        rejected = await worker_client.post("/api/chat/messages", json={
            "conversation_id": conversation_id,
            "worker_id": worker_id,
            "message_type": "text",
            "text": "Must not be saved",
        })
        assert rejected.status_code == 403
        worker_client.headers["X-CSRF-Token"] = worker_csrf

        password = await worker_client.post("/api/worker/change-password", json={
            "current_password": "WorkerPass123!",
            "new_password": "NewWorkerPass456!",
        })
        assert password.status_code == 200

    messages = await db.messages.find(
        {"conversation_id": conversation_id},
        {"_id": 0, "sender_type": 1, "sender_id": 1, "worker_id": 1, "text": 1},
    ).sort("created_at", 1).to_list(10)
    assert messages == [
        {"worker_id": worker_id, "sender_type": "owner", "sender_id": signup.json()["admin"]["id"], "text": "Admin CSRF message"},
        {"worker_id": worker_id, "sender_type": "worker", "sender_id": worker_id, "text": "Worker CSRF reply"},
    ]

    await cleanup_test_data(prefix)


@pytest.mark.asyncio
async def test_admin_brevo_forgot_and_reset_password(monkeypatch):
    sent_emails = []

    async def mock_send(recipient_email, recipient_name, reset_link):
        sent_emails.append({
            "email": recipient_email,
            "name": recipient_name,
            "link": reset_link,
        })
        return True

    from backend.services.email import email_service
    monkeypatch.setattr(email_service, "send_password_reset_email", mock_send)

    tag = uuid.uuid4().hex[:6]
    prefix = f"test_auth_{tag}"
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        username = f"{prefix}_admin"
        email = f"{prefix}@example.com"
        old_password = "InitialPassword123!"
        new_password = "NewlyResetPassword123!"

        # Create admin
        await client.post("/api/admin/signup", json={
            "name": f"{prefix}_Name",
            "business_name": f"{prefix}_Biz",
            "username": username,
            "email": email,
            "password": old_password,
        })

        # Request forgot password
        forgot_res = await client.post("/api/admin/forgot-password", json={"email": email})
        assert forgot_res.status_code == 200
        assert "If an account exists for this email" in forgot_res.json()["message"]
        assert len(sent_emails) == 1
        reset_link = sent_emails[0]["link"]
        assert "token=" in reset_link
        raw_token = reset_link.split("token=")[1]

        # Verify raw token is not stored in MongoDB; only token_hash is stored
        token_doc = await db.password_reset_tokens.find_one({"token_hash": hashlib.sha256(raw_token.encode("utf-8")).hexdigest()})
        assert token_doc is not None
        assert raw_token not in str(token_doc)

        # Reset password with valid token
        reset_res = await client.post("/api/admin/reset-password", json={
            "token": raw_token,
            "new_password": new_password,
        })
        assert reset_res.status_code == 200

        # Verify old password fails
        fail_old = await client.post("/api/admin/login", json={
            "identifier": username,
            "password": old_password,
        })
        assert fail_old.status_code == 401

        # Verify new password succeeds
        succ_new = await client.post("/api/admin/login", json={
            "identifier": username,
            "password": new_password,
        })
        assert succ_new.status_code == 200

        # Verify token is single-use and rejected on second attempt
        second_attempt = await client.post("/api/admin/reset-password", json={
            "token": raw_token,
            "new_password": "YetAnotherPassword123!",
        })
        assert second_attempt.status_code == 400

    await cleanup_test_data(prefix)


@pytest.mark.asyncio
async def test_worker_active_inactive_lifecycle_and_session_invalidation():
    tag = uuid.uuid4().hex[:6]
    prefix = f"test_auth_{tag}"
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        admin_user = f"{prefix}_admin"
        admin_email = f"{prefix}@example.com"
        admin_pw = "AdminPass123!"

        # Signup admin
        admin_signup = await client.post("/api/admin/signup", json={
            "name": f"{prefix}_Owner",
            "business_name": f"{prefix}_Biz",
            "username": admin_user,
            "email": admin_email,
            "password": admin_pw,
        })
        assert admin_signup.status_code == 200
        admin_csrf = admin_signup.cookies.get("csrf_token")
        client.headers["X-CSRF-Token"] = admin_csrf

        # Create worker with portal enabled
        worker_res = await client.post("/api/workers", json={
            "name": f"{prefix}_Ramesh",
            "mobile": f"98{secrets.randbelow(100000000):08d}",
            "work_type": "Mason",
            "joining_date": "2026-08-01",
            "salary": 15000,
            "status": "ACTIVE",
            "portal_enabled": True,
            "login_id": f"WF-RAMESH{tag.upper()}",
            "password": "WorkerPass123!",
        })
        assert worker_res.status_code == 200
        worker_data = worker_res.json()
        worker_id = worker_data["id"]
        login_id = worker_data["login_id"]
        assert worker_data["status"] == "ACTIVE"

        # Worker Login as ACTIVE
        async with AsyncClient(transport=transport, base_url="http://testserver") as worker_client:
            worker_login_res = await worker_client.post("/api/worker/login", json={
                "login_id": login_id,
                "password": "WorkerPass123!",
            })
            assert worker_login_res.status_code == 200
            assert worker_login_res.json()["worker"]["id"] == worker_id
            assert "session_token" in worker_login_res.cookies
            worker_csrf = worker_login_res.cookies.get("csrf_token")
            worker_client.headers["X-CSRF-Token"] = worker_csrf

            # Worker can access /worker/me
            me_res = await worker_client.get("/api/worker/me")
            assert me_res.status_code == 200
            assert me_res.json()["worker"]["name"] == f"{prefix}_Ramesh"

            # Worker change password
            chg_pw = await worker_client.post("/api/worker/change-password", json={
                "current_password": "WorkerPass123!",
                "new_password": "NewWorkerPass456!",
            })
            assert chg_pw.status_code == 200

            # Mark attendance & payment for Ramesh to verify data preservation
            await client.post("/api/attendance", json={
                "worker_id": worker_id,
                "date": "2026-08-10",
                "status": "Present",
            })
            await client.post("/api/payments", json={
                "worker_id": worker_id,
                "amount": 2000,
                "date": "2026-08-10",
                "type": "ADVANCE",
                "note": "Early advance",
            })

            # Admin sets Ramesh = INACTIVE
            deactivate_res = await client.patch(f"/api/workers/{worker_id}/status", json={"status": "INACTIVE"})
            assert deactivate_res.status_code == 200
            assert deactivate_res.json()["status"] == "INACTIVE"

            # Existing worker session was deleted upon deactivation, so accessing /worker/me returns 401/403
            me_inactive_res = await worker_client.get("/api/worker/me")
            assert me_inactive_res.status_code in {401, 403}

            # New worker login attempt must be rejected with 403 Forbidden
            new_login_res = await worker_client.post("/api/worker/login", json={
                "login_id": login_id,
                "password": "NewWorkerPass456!",
            })
            assert new_login_res.status_code == 403
            assert "inactive" in new_login_res.json()["detail"].lower()

            # Verify historical data remains intact
            att_records = await db.attendance.find({"worker_id": worker_id}, {"_id": 0}).to_list(10)
            assert len(att_records) == 1
            assert att_records[0]["status"] == "Present"

            pay_records = await db.payments.find({"worker_id": worker_id}, {"_id": 0}).to_list(10)
            assert len(pay_records) == 1
            assert pay_records[0]["amount"] == 2000

            # Reactivate Ramesh = ACTIVE
            reactivate_res = await client.patch(f"/api/workers/{worker_id}/status", json={"status": "ACTIVE"})
            assert reactivate_res.status_code == 200
            assert reactivate_res.json()["status"] == "ACTIVE"

            # Worker can now log in again
            relocked_login = await worker_client.post("/api/worker/login", json={
                "login_id": login_id,
                "password": "NewWorkerPass456!",
            })
            assert relocked_login.status_code == 200
            assert relocked_login.json()["worker"]["status"] == "ACTIVE"

    await cleanup_test_data(prefix)


@pytest.mark.asyncio
async def test_worker_credentials_are_generated_hashed_and_shown_once():
    tag = uuid.uuid4().hex[:6]
    prefix = f"test_credential_{tag}"
    admin_password = "AdminPass123!"
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as admin_client:
        signup = await admin_client.post("/api/admin/signup", json={
            "name": f"{prefix}_Owner", "business_name": f"{prefix}_Biz",
            "username": f"{prefix}_admin", "email": f"{prefix}@example.com", "password": admin_password,
        })
        admin_client.headers["X-CSRF-Token"] = signup.cookies.get("csrf_token")

        temporary_password = "482751"
        created = await admin_client.post("/api/workers", json={
            "name": f"{prefix}_Worker", "mobile": "", "work_type": "Helper",
            "joining_date": "2026-08-01", "salary": 12000, "portal_enabled": True,
            "login_id": "", "password": temporary_password,
        })
        assert created.status_code == 200
        credentials = created.json()["one_time_credentials"]
        assert credentials["login_id"].startswith("WF-")
        assert credentials["password"] == temporary_password
        assert "password_hash" not in created.json()

        worker_doc = await db.workers.find_one({"id": created.json()["id"]})
        assert worker_doc.get("password_hash")
        assert worker_doc["password_hash"] != temporary_password
        assert "password" not in worker_doc and "temporary_password" not in worker_doc

        listed = await admin_client.get("/api/workers")
        listed_worker = next(w for w in listed.json() if w["id"] == created.json()["id"])
        assert "one_time_credentials" not in listed_worker
        assert "password_hash" not in listed_worker
        assert "password" not in listed_worker

        async with AsyncClient(transport=transport, base_url="http://testserver") as worker_client:
            initial_login = await worker_client.post("/api/worker/login", json={
                "login_id": credentials["login_id"], "password": temporary_password,
            })
            assert initial_login.status_code == 200

        reset_password = "735294"
        reset = await admin_client.post(f"/api/workers/{created.json()['id']}/reset-password", json={"new_password": reset_password})
        assert reset.status_code == 200
        assert reset.json()["one_time_credentials"]["password"] == reset_password

        async with AsyncClient(transport=transport, base_url="http://testserver") as worker_client:
            old_login = await worker_client.post("/api/worker/login", json={
                "login_id": credentials["login_id"], "password": temporary_password,
            })
            assert old_login.status_code == 401
            new_login = await worker_client.post("/api/worker/login", json={
                "login_id": credentials["login_id"], "password": reset_password,
            })
            assert new_login.status_code == 200

    await cleanup_test_data(prefix)
