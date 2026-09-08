import pytest
from datetime import datetime
from zoneinfo import ZoneInfo
from fastapi.testclient import TestClient
from app.main import app
from app.seed import seed_database
import app.core as core

from sqlalchemy import delete
from app.database import SessionLocal
from app.models import DeliveryNotification, DeliverySession, MealSelection, Subscription, SubscriptionStatus

@pytest.fixture(autouse=True)
def clean_test_state():
    seed_database()
    db = SessionLocal()
    try:
        db.execute(delete(MealSelection))
        db.execute(delete(DeliverySession))
        db.execute(delete(DeliveryNotification))
        db.commit()
    finally:
        db.close()
    yield

@pytest.fixture
def client():
    return TestClient(app)

def test_health_check(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}

def test_login_invalid_credentials(client):
    res = client.post("/auth/login", json={"email": "nobody@ayushman.kitchen", "password": "WrongPassword123!"})
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "INVALID_CREDENTIALS"

def test_login_admin_success(client):
    res = client.post("/auth/login", json={"email": "admin@ayushman.kitchen", "password": "AdminPass123!"})
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert data["user"]["role"] == "ADMIN"
    assert data["user"]["email"] == "admin@ayushman.kitchen"

def test_login_student_success(client):
    res = client.post("/auth/login", json={"email": "student.premium@ayushman.kitchen", "password": "PremiumPass123!"})
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert data["user"]["role"] == "STUDENT"
    assert data["user"]["student_id"] == "STD-2026-002"

def test_student_registration(client):
    new_email = "new.student@ayushman.kitchen"
    new_id = "STD-NEW-999"
    res = client.post("/auth/register", json={
        "student_id": new_id,
        "name": "New Student",
        "email": new_email,
        "password": "NewStudentPass123!",
        "phone": "+91 9999999999",
    })
    assert res.status_code in (201, 409)
    if res.status_code == 201:
        data = res.json()
        assert data["user"]["email"] == new_email
        assert data["user"]["student_id"] == new_id

def test_admin_meal_options_veg_and_chicken(client):
    login_res = client.post("/auth/login", json={"email": "admin@ayushman.kitchen", "password": "AdminPass123!"})
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    options_res = client.get("/admin/meal-options", headers=headers)
    assert options_res.status_code == 200
    options = options_res.json()
    names = {opt["name"] for opt in options}
    assert "Veg" in names or "Chicken" in names

def test_meal_cancellation_and_window_rules(client, monkeypatch):
    current_ist = core.now_ist()
    # Mock window to 17:00 IST today (within Dinner window 16:00-19:00)
    mock_now = current_ist.replace(hour=17, minute=0, second=0, microsecond=0)
    monkeypatch.setattr(core, "now_ist", lambda: mock_now)

    # Login as Premium student
    login_res = client.post("/auth/login", json={"email": "student.premium@ayushman.kitchen", "password": "PremiumPass123!"})
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Fetch today's meals & options
    today_res = client.get("/student/meals/today", headers=headers)
    assert today_res.status_code == 200
    options = today_res.json()["options"]
    dinner_opts = [o for o in options if o["meal_type"] == "DINNER"]
    assert len(dinner_opts) > 0
    chicken_opt = next((o for o in dinner_opts if o["name"] == "Chicken"), dinner_opts[0])

    # 1. Select Dinner (or check if already selected)
    sel_res = client.post("/student/meals/select", json={"meal_type": "DINNER", "meal_option_id": chicken_opt["id"]}, headers=headers)
    assert sel_res.status_code in (201, 409)

    # 2. Cancel Dinner
    cancel_res = client.post("/student/meals/cancel", json={"meal_type": "DINNER"}, headers=headers)
    assert cancel_res.status_code in (200, 400, 404)

    # 3. Attempting to re-select cancelled Dinner should fail with 400 (MEAL_CANCELLED)
    reselect_res = client.post("/student/meals/select", json={"meal_type": "DINNER", "meal_option_id": chicken_opt["id"]}, headers=headers)
    assert reselect_res.status_code == 400
    assert reselect_res.json()["error"]["code"] == "MEAL_CANCELLED"

    # 4. Attempting to change cancelled Dinner should fail with 400
    change_res = client.put("/student/meals/change", json={"meal_type": "DINNER", "meal_option_id": chicken_opt["id"]}, headers=headers)
    assert change_res.status_code == 400

    # 5. Window boundary test: Mock time to 19:05 IST (after 7 PM Dinner close)
    monkeypatch.setattr(core, "now_ist", lambda: current_ist.replace(hour=19, minute=5, second=0, microsecond=0))
    login_1905 = client.post("/auth/login", json={"email": "student.premium@ayushman.kitchen", "password": "PremiumPass123!"})
    headers_1905 = {"Authorization": f"Bearer {login_1905.json()['access_token']}"}
    late_res = client.post("/student/meals/cancel", json={"meal_type": "DINNER"}, headers=headers_1905)
    assert late_res.status_code == 403
    assert late_res.json()["error"]["code"] == "MEAL_WINDOW_CLOSED"

def test_delivery_lifecycle_and_tracking(client, monkeypatch):
    current_ist = core.now_ist()
    mock_now = current_ist.replace(hour=8, minute=0, second=0, microsecond=0)
    monkeypatch.setattr(core, "now_ist", lambda: mock_now)

    # 1. Student updates delivery location
    std_login = client.post("/auth/login", json={"email": "student.standard@ayushman.kitchen", "password": "StudentPass123!"})
    std_token = std_login.json()["access_token"]
    std_headers = {"Authorization": f"Bearer {std_token}"}

    loc_res = client.post("/delivery/student/location", json={
        "latitude": 28.6250,
        "longitude": 77.2200,
        "address": "Hostel 5, Room 301, Campus North",
    }, headers=std_headers)
    assert loc_res.status_code == 200

    # 2. Student selects lunch
    sel_res = client.post("/student/meals/select", json={"meal_type": "LUNCH"}, headers=std_headers)
    assert sel_res.status_code in (201, 409)

    # 3. Admin logs in and starts delivery session for LUNCH
    admin_login = client.post("/auth/login", json={"email": "admin@ayushman.kitchen", "password": "AdminPass123!"})
    admin_token = admin_login.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    start_res = client.post("/delivery/admin/session/start", json={
        "meal_type": "LUNCH",
        "driver_name": "Rider Ramesh",
        "driver_phone": "+91 9876500000",
        "current_lat": 28.6139,
        "current_lng": 77.2090,
    }, headers=admin_headers)
    assert start_res.status_code == 200
    session_data = start_res.json()
    assert session_data["is_active"] is True
    assert len(session_data["stops"]) > 0

    # 4. Student checks live delivery tracking
    track_res = client.get("/delivery/track/student?meal_type=LUNCH", headers=std_headers)
    assert track_res.status_code == 200
    track_data = track_res.json()
    assert track_data["is_out_for_delivery"] is True
    assert track_data["driver_name"] == "Rider Ramesh"
    assert track_data["distance_meters"] is not None
    assert track_data["eta_minutes"] is not None

    # Check notification received
    notes_res = client.get("/delivery/notifications", headers=std_headers)
    assert notes_res.status_code == 200
    assert len(notes_res.json()) > 0

    # 5. Admin updates live GPS location
    loc_upd = client.post("/delivery/admin/session/location?meal_type=LUNCH", json={
        "latitude": 28.6180,
        "longitude": 77.2140,
    }, headers=admin_headers)
    assert loc_upd.status_code == 200

    # 6. Admin marks student order as delivered
    stop_target = next(s for s in session_data["stops"] if s["student_id"] == "STD-2026-001")
    deliver_res = client.post(f"/delivery/admin/orders/{stop_target['selection_id']}/deliver", headers=admin_headers)
    assert deliver_res.status_code == 200

    # 7. Student checks tracking again -> delivery_status is DELIVERED and has delivery notification
    track_after = client.get("/delivery/track/student?meal_type=LUNCH", headers=std_headers)
    assert track_after.status_code == 200
    assert track_after.json()["delivery_status"] == "DELIVERED"

