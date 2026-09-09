import uuid

import pytest

from backend import server


@pytest.mark.asyncio
async def test_delivery_run_is_business_scoped_and_reaches_delivered_state():
    tag = uuid.uuid4().hex
    business_id = f"delivery-biz-{tag}"
    other_business_id = f"delivery-other-{tag}"
    worker_id = f"delivery-worker-{tag}"
    selection_id = f"delivery-selection-{tag}"
    today = server.get_today_date()
    admin = {"id": f"admin-{tag}", "business_id": business_id}
    worker = {"worker_id": worker_id, "business_id": business_id, "delivery_address": "Hostel A, Room 12"}

    await server.db.workers.insert_one({
        "id": worker_id, "business_id": business_id, "name": "Delivery Test Student",
        "mobile": "9999999999", "delivery_address": "Hostel A, Room 12", "status": "ACTIVE",
    })
    await server.db.meal_selections.insert_many([
        {
            "id": selection_id, "business_id": business_id, "worker_id": worker_id,
            "student_name": "Delivery Test Student", "date": today, "meal_slot": "lunch",
            "action": "CONFIRM", "delivery_option": "DELIVERY", "selection_type": "VEG",
        },
        {
            "id": f"other-{tag}", "business_id": other_business_id, "worker_id": f"other-worker-{tag}",
            "date": today, "meal_slot": "lunch", "action": "CONFIRM",
            "delivery_option": "DELIVERY", "selection_type": "VEG",
        },
    ])

    try:
        await server.update_student_delivery_location(
            server.DeliveryLocationUpdate(latitude=28.62, longitude=77.21, address="Hostel A, Room 12"), worker
        )
        session = await server.start_delivery_session(server.DeliverySessionStart(
            meal_slot="lunch", driver_name="Test Rider", driver_phone="9000000000",
            current_lat=28.61, current_lng=77.20,
        ), admin)
        assert session["is_active"] is True
        assert session["total_stops"] == 1
        assert session["stops"][0]["selection_id"] == selection_id
        assert session["stops"][0]["delivery_status"] == "OUT_FOR_DELIVERY"
        assert session["stops"][0]["eta_minutes"] is not None

        await server.update_delivery_location(
            server.DeliveryLocationUpdate(latitude=28.619, longitude=77.209), "lunch", admin
        )
        tracking = await server.track_student_delivery("lunch", worker)
        assert tracking["has_delivery_order"] is True
        assert tracking["is_out_for_delivery"] is True
        assert tracking["driver_name"] == "Test Rider"

        await server.mark_delivery_complete(selection_id, admin)
        delivered = await server.track_student_delivery("lunch", worker)
        assert delivered["delivery_status"] == "DELIVERED"
        assert delivered["delivered_at"]
        assert delivered["notifications"][0]["type"] == "DELIVERED"

        untouched = await server.db.meal_selections.find_one({"id": f"other-{tag}"})
        assert "delivery_status" not in untouched
    finally:
        await server.db.workers.delete_many({"id": {"$in": [worker_id, f"other-worker-{tag}"]}})
        await server.db.meal_selections.delete_many({"id": {"$in": [selection_id, f"other-{tag}"]}})
        await server.db.delivery_sessions.delete_many({"business_id": business_id})
        await server.db.delivery_notifications.delete_many({"business_id": business_id})
        await server.db.activity_logs.delete_many({"business_id": business_id})
