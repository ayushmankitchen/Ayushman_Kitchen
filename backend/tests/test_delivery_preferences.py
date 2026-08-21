import pytest
from backend.server import WorkerCreate, WorkerUpdate, check_meal_slot_window, compute_student_meal_calendar

def test_worker_create_delivery_fields():
    # Default is DINE_IN
    w1 = WorkerCreate(
        name="Student One",
        work_type="Standard",
        joining_date="2026-08-19",
        salary=0.0
    )
    assert w1.delivery_preference == "DINE_IN"
    assert w1.delivery_address == ""
    assert w1.delivery_notes == ""

    # Custom DELIVERY
    w2 = WorkerCreate(
        name="Student Two",
        work_type="Standard",
        joining_date="2026-08-19",
        salary=0.0,
        delivery_preference="DELIVERY",
        delivery_address="Hostel B, Room 204",
        delivery_notes="Leave with warden"
    )
    assert w2.delivery_preference == "DELIVERY"
    assert w2.delivery_address == "Hostel B, Room 204"
    assert w2.delivery_notes == "Leave with warden"

    # Custom PICKUP
    w3 = WorkerCreate(
        name="Student Three",
        work_type="Standard",
        joining_date="2026-08-19",
        salary=0.0,
        delivery_preference="PICKUP"
    )
    assert w3.delivery_preference == "PICKUP"

def test_worker_update_delivery_fields():
    up = WorkerUpdate(
        delivery_preference="DELIVERY",
        delivery_address="Girls Hostel 1, Room 102",
        delivery_notes="Call before delivery"
    )
    assert up.delivery_preference == "DELIVERY"
    assert up.delivery_address == "Girls Hostel 1, Room 102"
    assert up.delivery_notes == "Call before delivery"

    up_pickup = WorkerUpdate(
        delivery_preference="PICKUP"
    )
    assert up_pickup.delivery_preference == "PICKUP"

def test_cutoff_window_check():
    windows = {
        "lunch": {"start_time": "08:00", "end_time": "11:00", "is_enabled": True},
        "dinner": {"start_time": "16:00", "end_time": "19:00", "is_enabled": True},
    }

    # Kitchen closed
    closed_res = check_meal_slot_window("lunch", windows, {"is_closed": True}, "2026-08-19")
    assert closed_res["is_open"] is False
    assert closed_res["status"] == "HOLIDAY"

    # Past date
    past_res = check_meal_slot_window("lunch", windows, {}, "2020-01-01")
    assert past_res["is_open"] is False
    assert past_res["status"] == "PAST_DATE"

    # Future date
    future_res = check_meal_slot_window("lunch", windows, {}, "2099-12-31")
    assert future_res["is_open"] is True
    assert future_res["status"] == "FUTURE_DATE"
