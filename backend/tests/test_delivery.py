import uuid

import pytest

from backend import server


@pytest.mark.asyncio
async def test_delivery_run_is_business_scoped_and_reaches_delivered_state(monkeypatch):
    tag = uuid.uuid4().hex
    business_id = f"delivery-biz-{tag}"
    other_business_id = f"delivery-other-{tag}"
    worker_id = f"delivery-worker-{tag}"
    today = server.get_today_date()
    admin = {"id": f"admin-{tag}", "business_id": business_id}
    worker = {"worker_id": worker_id, "business_id": business_id, "delivery_address": "Hostel A, Room 12"}

    await server.db.workers.insert_one({
        "id": worker_id, "business_id": business_id, "name": "Delivery Test Student",
        "mobile": "9999999999", "delivery_address": "Hostel A, Room 12", "status": "ACTIVE",
        "joining_date": today, "meal_plan_type": "BOTH", "total_quota": 60,
    })
    await server.db.meal_selections.insert_one({
            "id": f"other-{tag}", "business_id": other_business_id, "worker_id": f"other-worker-{tag}",
            "date": today, "meal_slot": "lunch", "action": "CONFIRM",
            "delivery_option": "DELIVERY", "selection_type": "VEG",
    })
    monkeypatch.setattr(server, "check_meal_slot_window", lambda *args, **kwargs: {"is_open": True})

    try:
        with pytest.raises(server.HTTPException) as missing_gps:
            await server.save_student_meal_selection({
                "date": today, "meal_slot": "lunch", "action": "CONFIRM", "selection_type": "VEG",
                "delivery_option": "DELIVERY", "delivery_address": "Hostel A, Room 12",
            }, worker)
        assert missing_gps.value.status_code == 422

        await server.save_student_meal_selection({
            "date": today, "meal_slot": "lunch", "action": "CONFIRM", "selection_type": "VEG",
            "delivery_option": "DELIVERY", "delivery_address": "Hostel A, Room 12",
            "delivery_lat": 28.62, "delivery_lng": 77.21,
        }, worker)
        saved_selection = await server.db.meal_selections.find_one({"business_id": business_id, "worker_id": worker_id})
        selection_id = saved_selection["id"]
        assert saved_selection["delivery_lat"] == 28.62
        assert saved_selection["delivery_lng"] == 77.21
        saved_worker = await server.db.workers.find_one({"id": worker_id})
        assert saved_worker["delivery_lat"] == 28.62
        assert saved_worker["delivery_lng"] == 77.21

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
        await server.db.meal_selections.delete_many({"business_id": {"$in": [business_id, other_business_id]}})
        await server.db.delivery_sessions.delete_many({"business_id": business_id})
        await server.db.delivery_notifications.delete_many({"business_id": business_id})
        await server.db.activity_logs.delete_many({"business_id": business_id})


@pytest.mark.asyncio
async def test_next_stop_changes_with_gps_and_either_party_can_complete(monkeypatch):
    import asyncio
    from unittest.mock import AsyncMock

    biz = f"next-stop-{uuid.uuid4().hex}"
    admin = {"id": "rider", "business_id": biz}
    worker = {"worker_id": "student-a", "business_id": biz}
    monkeypatch.setattr(server, "deliver_student_push", AsyncMock())
    today = server.get_today_date()
    orders = [
        {"id": "a", "worker_id": "student-a", "delivery_lat": 28.61, "delivery_lng": 77.20},
        {"id": "b", "worker_id": "student-b", "delivery_lat": 28.62, "delivery_lng": 77.21},
        {"id": "missing-gps", "worker_id": "student-c"},
        {"id": "not-dispatched", "worker_id": "student-a", "meal_slot": "dinner", "delivery_status": "CONFIRMED"},
    ]
    try:
        await server.db.meal_selections.insert_many([
            {"business_id": biz, "date": today, "meal_slot": "lunch", "action": "CONFIRM",
             "delivery_option": "DELIVERY", "delivery_status": "OUT_FOR_DELIVERY", **order}
            for order in orders
        ])
        await server.db.delivery_sessions.insert_one({"id": biz, "business_id": biz, "date": today,
            "meal_slot": "lunch", "is_active": True, "current_lat": 28.61, "current_lng": 77.20})
        assert (await server.delivery_session_payload(biz, "lunch"))["next_stop"]["selection_id"] == "a"
        await server.update_delivery_location(server.DeliveryLocationUpdate(latitude=28.62, longitude=77.21), "lunch", admin)
        assert (await server.delivery_session_payload(biz, "lunch"))["next_stop"]["selection_id"] == "b"

        for selection_id, actor in [("b", worker), ("a", {**worker, "business_id": "different-business"})]:
            with pytest.raises(server.HTTPException) as denied:
                await server.confirm_student_delivery(selection_id, actor)
            assert denied.value.status_code == 404
        with pytest.raises(server.HTTPException) as not_dispatched:
            await server.confirm_student_delivery("not-dispatched", worker)
        assert not_dispatched.value.status_code == 409

        await server.mark_delivery_complete("b", admin)
        assert (await server.delivery_session_payload(biz, "lunch"))["next_stop"]["selection_id"] == "a"
        # Student and admin race: one receipt and notification, both receive success.
        results = await asyncio.gather(server.confirm_student_delivery("a", worker), server.mark_delivery_complete("a", admin))
        assert all(result["ok"] for result in results)
        assert sum(bool(result.get("already_delivered")) for result in results) == 1
        assert results[0]["delivered_at"] == results[1]["delivered_at"]
        assert await server.db.delivery_notifications.count_documents({"business_id": biz, "worker_id": "student-a", "type": "DELIVERED"}) == 1
        tracked = await server.track_student_delivery("lunch", worker)
        assert tracked["delivery_status"] == "DELIVERED"
        assert tracked["is_out_for_delivery"] is False
        assert tracked["can_confirm_receipt"] is False
        session = await server.delivery_session_payload(biz, "lunch")
        assert session["next_stop"] is None
        assert session["pending_stops"] == 1  # Missing GPS remains visible, never dropped.
        await server.mark_delivery_complete("missing-gps", admin)
        assert (await server.delivery_session_payload(biz, "lunch"))["pending_stops"] == 0
    finally:
        for collection in [server.db.meal_selections, server.db.delivery_sessions, server.db.delivery_notifications]:
            await collection.delete_many({"business_id": biz})


@pytest.mark.asyncio
async def test_saved_room_is_fixed_until_explicit_replacement(monkeypatch):
    from unittest.mock import AsyncMock
    biz = f"fixed-room-{uuid.uuid4().hex}"
    worker = {"worker_id": biz, "business_id": biz}
    today = server.get_today_date()
    monkeypatch.setattr(server, "check_meal_slot_window", lambda *a, **kw: {"is_open": True})
    monkeypatch.setattr(server, "deliver_student_push", AsyncMock())
    try:
        await server.db.workers.insert_one({"id": biz, "business_id": biz, "name": "Test",
            "joining_date": today, "meal_plan_type": "BOTH", "total_quota": 60})
        meal = {"date": today, "meal_slot": "lunch", "action": "CONFIRM", "delivery_option": "DELIVERY"}
        await server.save_student_meal_selection({**meal, "delivery_address": "PG Room 204",
            "delivery_lat": 28.6, "delivery_lng": 77.2}, worker)
        # An older client sends the student's current outdoor GPS: keep the saved room.
        await server.save_student_meal_selection({**meal, "meal_slot": "dinner",
            "delivery_address": "Outside", "delivery_lat": 29, "delivery_lng": 78}, worker)
        # Daily ordering also works without any GPS request or address input.
        await server.save_student_meal_selection(meal, worker)
        orders = await server.db.meal_selections.find({"business_id": biz}).to_list(10)
        assert all(o["delivery_lat"] == 28.6 and o["delivery_address"] == "PG Room 204" for o in orders)
        with pytest.raises(server.HTTPException) as denied:
            await server.update_student_delivery_location(server.DeliveryLocationUpdate(
                latitude=29, longitude=78, address="Outside"), worker)
        assert denied.value.status_code == 409
        # Replacement from the meal popup updates other pending deliveries as well.
        await server.save_student_meal_selection({**meal, "delivery_address": "New PG",
            "delivery_lat": 28.7, "delivery_lng": 77.3, "replace_saved_location": True}, worker)
        dinner = await server.db.meal_selections.find_one({"business_id": biz, "meal_slot": "dinner"})
        assert dinner["delivery_address"] == "New PG"
        await server.db.meal_selections.update_one({"business_id": biz, "meal_slot": "lunch"}, {"$set": {"delivery_status": "DELIVERED"}})
        await server.update_student_delivery_location(server.DeliveryLocationUpdate(
            latitude=28.8, longitude=77.4, address="Final PG", replace_saved_location=True), worker)
        dinner = await server.db.meal_selections.find_one({"business_id": biz, "meal_slot": "dinner"})
        lunch = await server.db.meal_selections.find_one({"business_id": biz, "meal_slot": "lunch"})
        assert dinner["delivery_address"] == "Final PG"
        assert lunch["delivery_address"] == "New PG"  # Preserve completed delivery history.
        profile = await server.db.workers.find_one({"id": biz})
        tracked = await server.track_student_delivery("dinner", {**profile, **worker})
        assert tracked["saved_location"]["delivery_address"] == "Final PG"
        assert tracked["student_lat"] == 28.8
    finally:
        for collection in [server.db.workers, server.db.meal_selections, server.db.activity_logs]:
            await collection.delete_many({"business_id": biz})
