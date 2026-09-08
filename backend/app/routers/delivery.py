import math
from datetime import date, datetime
from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, select
from ..core import error, now_ist
from ..deps import CurrentUser, Db, require_roles
from ..models import (
    AuditLog,
    DeliveryNotification,
    DeliverySession,
    DeliveryStatus,
    MealOption,
    MealSelection,
    MealType,
    Role,
    SelectionStatus,
    User,
)
from ..schemas import (
    AdminDeliverySessionOut,
    DeliveryLocationUpdateIn,
    DeliveryNotificationOut,
    DeliverySessionStartIn,
    DeliveryStopOut,
    StudentDeliveryTrackingOut,
    StudentLocationIn,
)
from ..services import audit

router = APIRouter(prefix="/delivery", tags=["delivery"])
Admin = Depends(require_roles(Role.ADMIN, Role.KITCHEN_STAFF))

# Central Campus Kitchen Base Coordinates
KITCHEN_LAT = 28.6139
KITCHEN_LNG = 77.2090

def haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate great-circle distance between two points in meters."""
    R = 6371000  # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def calculate_eta_minutes(distance_meters: float) -> int:
    """Estimate delivery arrival time (assuming avg speed 20 km/h + 2 min buffer)."""
    if distance_meters <= 50:
        return 1
    # 20 km/h = 333.3 meters per minute
    travel_mins = distance_meters / 333.3
    return max(1, math.ceil(travel_mins + 1))

def get_current_meal_slot() -> MealType:
    ist = now_ist()
    hours = ist.hour
    if hours < 14:
        return MealType.LUNCH
    return MealType.DINNER

# ==========================================
# STUDENT DELIVERY ENDPOINTS
# ==========================================

@router.post("/student/location")
def update_student_location(body: StudentLocationIn, db: Db, user: CurrentUser):
    if user.role != Role.STUDENT:
        error("FORBIDDEN", "Only students can update their delivery location.", 403)
    
    db_user = db.get(User, user.id)
    if not db_user:
        error("NOT_FOUND", "User not found.", 404)
    
    db_user.latitude = body.latitude
    db_user.longitude = body.longitude
    db_user.delivery_address = body.address

    # Also update any active meal selection for today
    today = now_ist().date()
    selections = db.scalars(
        select(MealSelection).where(
            MealSelection.user_id == user.id,
            MealSelection.date == today,
            MealSelection.status == SelectionStatus.SELECTED,
        )
    ).all()
    for s in selections:
        s.delivery_lat = body.latitude
        s.delivery_lng = body.longitude
        s.delivery_address = body.address

    db.commit()
    return {"message": "Location updated successfully!", "latitude": body.latitude, "longitude": body.longitude, "address": body.address}

@router.get("/track/student", response_model=StudentDeliveryTrackingOut)
def track_student_delivery(db: Db, user: CurrentUser, meal_type: MealType | None = None):
    if user.role != Role.STUDENT:
        error("FORBIDDEN", "Student access required.", 403)
    
    today = now_ist().date()
    target_slot = meal_type or get_current_meal_slot()

    # Get student's selection for today
    selection = db.scalar(
        select(MealSelection).where(
            MealSelection.user_id == user.id,
            MealSelection.date == today,
            MealSelection.meal_type == target_slot,
            MealSelection.status == SelectionStatus.SELECTED,
        )
    )

    # Fallback to any active meal today if target slot not chosen
    if not selection:
        selection = db.scalar(
            select(MealSelection).where(
                MealSelection.user_id == user.id,
                MealSelection.date == today,
                MealSelection.status == SelectionStatus.SELECTED,
            ).order_by(desc(MealSelection.id))
        )
        if selection:
            target_slot = selection.meal_type

    # Get Option name
    option_name = "Standard Campus Meal"
    if selection and selection.meal_option_id:
        opt = db.get(MealOption, selection.meal_option_id)
        if opt:
            option_name = opt.name

    # Get Active Delivery Session
    session = db.scalar(
        select(DeliverySession).where(
            DeliverySession.date == today,
            DeliverySession.meal_type == target_slot,
        ).order_by(desc(DeliverySession.id))
    )

    is_out_for_delivery = bool(session and session.is_active)
    driver_lat = session.current_lat if session else KITCHEN_LAT
    driver_lng = session.current_lng if session else KITCHEN_LNG
    driver_name = session.driver_name if session else "Kitchen Delivery Rider"
    driver_phone = session.driver_phone if session else "+91 9876543210"

    # Student coordinates
    student_lat = (selection.delivery_lat if selection and selection.delivery_lat else None) or user.latitude or (KITCHEN_LAT + 0.005)
    student_lng = (selection.delivery_lng if selection and selection.delivery_lng else None) or user.longitude or (KITCHEN_LNG + 0.006)
    delivery_address = (selection.delivery_address if selection and selection.delivery_address else None) or user.delivery_address or "Campus Hostel Block"

    distance_m = None
    eta_mins = None
    if student_lat and student_lng and driver_lat and driver_lng:
        distance_m = round(haversine_distance_meters(driver_lat, driver_lng, student_lat, student_lng), 1)
        eta_mins = calculate_eta_minutes(distance_m)

    delivery_status = selection.delivery_status if selection else DeliveryStatus.CONFIRMED
    if selection and is_out_for_delivery and selection.delivery_status == DeliveryStatus.CONFIRMED:
        delivery_status = DeliveryStatus.OUT_FOR_DELIVERY

    # Fetch recent unread or latest notifications
    notifications = db.scalars(
        select(DeliveryNotification).where(
            DeliveryNotification.user_id == user.id
        ).order_by(desc(DeliveryNotification.created_at)).limit(10)
    ).all()

    return StudentDeliveryTrackingOut(
        meal_id=selection.id if selection else None,
        date=today,
        meal_type=target_slot,
        delivery_status=delivery_status,
        option_name=option_name,
        delivery_address=delivery_address,
        student_lat=student_lat,
        student_lng=student_lng,
        kitchen_lat=KITCHEN_LAT,
        kitchen_lng=KITCHEN_LNG,
        driver_lat=driver_lat if is_out_for_delivery else None,
        driver_lng=driver_lng if is_out_for_delivery else None,
        driver_name=driver_name if is_out_for_delivery else None,
        driver_phone=driver_phone if is_out_for_delivery else None,
        is_out_for_delivery=is_out_for_delivery,
        distance_meters=distance_m if is_out_for_delivery else None,
        eta_minutes=eta_mins if is_out_for_delivery else None,
        delivered_at=selection.delivered_at if selection else None,
        notifications=notifications,
    )

@router.get("/notifications", response_model=list[DeliveryNotificationOut])
def get_notifications(db: Db, user: CurrentUser):
    return db.scalars(
        select(DeliveryNotification).where(
            DeliveryNotification.user_id == user.id
        ).order_by(desc(DeliveryNotification.created_at)).limit(20)
    ).all()

@router.post("/notifications/mark-read")
def mark_notifications_read(db: Db, user: CurrentUser):
    notes = db.scalars(
        select(DeliveryNotification).where(
            DeliveryNotification.user_id == user.id,
            DeliveryNotification.is_read == False,
        )
    ).all()
    for n in notes:
        n.is_read = True
    db.commit()
    return {"message": "All notifications marked as read."}

# ==========================================
# ADMIN DELIVERY DISPATCHER ENDPOINTS
# ==========================================

@router.get("/admin/session", response_model=AdminDeliverySessionOut)
def get_admin_delivery_session(db: Db, meal_type: MealType = MealType.LUNCH, _=Admin):
    today = now_ist().date()
    session = db.scalar(
        select(DeliverySession).where(
            DeliverySession.date == today,
            DeliverySession.meal_type == meal_type,
        ).order_by(desc(DeliverySession.id))
    )

    current_lat = session.current_lat if session else KITCHEN_LAT
    current_lng = session.current_lng if session else KITCHEN_LNG

    # Fetch all confirmed meal selections for this date & slot
    selections = db.scalars(
        select(MealSelection).where(
            MealSelection.date == today,
            MealSelection.meal_type == meal_type,
            MealSelection.status == SelectionStatus.SELECTED,
        )
    ).all()

    stops: list[DeliveryStopOut] = []
    total_stops = len(selections)
    delivered_stops = 0
    pending_stops = 0

    for s in selections:
        u = s.user
        opt_name = s.meal_option.name if s.meal_option else "Standard Meal"
        lat = s.delivery_lat or (u.latitude if u else None) or (KITCHEN_LAT + 0.004)
        lng = s.delivery_lng or (u.longitude if u else None) or (KITCHEN_LNG + 0.005)
        addr = s.delivery_address or (u.delivery_address if u else None) or "Campus Hostel"

        dist = None
        eta = None
        if lat and lng and current_lat and current_lng:
            dist = round(haversine_distance_meters(current_lat, current_lng, lat, lng), 1)
            eta = calculate_eta_minutes(dist)

        if s.delivery_status == DeliveryStatus.DELIVERED:
            delivered_stops += 1
        else:
            pending_stops += 1

        stops.append(
            DeliveryStopOut(
                selection_id=s.id,
                student_id=u.student_id if u else "—",
                student_name=u.name if u else "Student",
                student_phone=u.phone if u else None,
                meal_type=s.meal_type,
                option_name=opt_name,
                delivery_address=addr,
                delivery_lat=lat,
                delivery_lng=lng,
                delivery_status=s.delivery_status,
                delivered_at=s.delivered_at,
                distance_meters=dist,
                eta_minutes=eta,
            )
        )

    # Sort stops: pending stops closest to driver first, then delivered stops
    stops.sort(key=lambda x: (1 if x.delivery_status == DeliveryStatus.DELIVERED else 0, x.distance_meters or 999999))

    return AdminDeliverySessionOut(
        session_id=session.id if session else None,
        date=today,
        meal_type=meal_type,
        is_active=session.is_active if session else False,
        driver_name=session.driver_name if session else "Kitchen Delivery Team",
        driver_phone=session.driver_phone if session else "+91 9876543210",
        current_lat=current_lat,
        current_lng=current_lng,
        started_at=session.started_at if session else None,
        stops=stops,
        total_stops=total_stops,
        pending_stops=pending_stops,
        delivered_stops=delivered_stops,
    )

@router.post("/admin/session/start", response_model=AdminDeliverySessionOut)
def start_delivery_session(body: DeliverySessionStartIn, db: Db, admin=Admin):
    today = now_ist().date()
    session = db.scalar(
        select(DeliverySession).where(
            DeliverySession.date == today,
            DeliverySession.meal_type == body.meal_type,
        ).order_by(desc(DeliverySession.id))
    )

    if not session:
        session = DeliverySession(
            date=today,
            meal_type=body.meal_type,
            is_active=True,
            driver_name=body.driver_name,
            driver_phone=body.driver_phone,
            current_lat=body.current_lat,
            current_lng=body.current_lng,
            started_at=now_ist(),
        )
        db.add(session)
    else:
        session.is_active = True
        session.started_at = now_ist()
        session.driver_name = body.driver_name
        session.driver_phone = body.driver_phone
        session.current_lat = body.current_lat
        session.current_lng = body.current_lng

    # Update all confirmed meal selections for this slot to OUT_FOR_DELIVERY
    selections = db.scalars(
        select(MealSelection).where(
            MealSelection.date == today,
            MealSelection.meal_type == body.meal_type,
            MealSelection.status == SelectionStatus.SELECTED,
            MealSelection.delivery_status != DeliveryStatus.DELIVERED,
        )
    ).all()

    for s in selections:
        s.delivery_status = DeliveryStatus.OUT_FOR_DELIVERY
        # Dispatch notification to student
        db.add(
            DeliveryNotification(
                user_id=s.user_id,
                title="🛵 Out for Delivery!",
                message=f"Your {body.meal_type.value.title()} meal is on the way! Our delivery partner has started the trip.",
                type="OUT_FOR_DELIVERY",
            )
        )

    audit(db, admin.id, "DELIVERY_STARTED", "DeliverySession", f"{today}_{body.meal_type.value}")
    db.commit()
    db.refresh(session)
    return get_admin_delivery_session(db, body.meal_type, admin)

@router.post("/admin/session/stop")
def stop_delivery_session(meal_type: MealType, db: Db, admin=Admin):
    today = now_ist().date()
    session = db.scalar(
        select(DeliverySession).where(
            DeliverySession.date == today,
            DeliverySession.meal_type == meal_type,
        ).order_by(desc(DeliverySession.id))
    )
    if session:
        session.is_active = False
        session.ended_at = now_ist()
        audit(db, admin.id, "DELIVERY_STOPPED", "DeliverySession", str(session.id))
        db.commit()
    return {"message": "Delivery session stopped."}

@router.post("/admin/session/location")
def update_driver_location(body: DeliveryLocationUpdateIn, meal_type: MealType = MealType.LUNCH, db: Db = None, _=Admin):
    today = now_ist().date()
    session = db.scalar(
        select(DeliverySession).where(
            DeliverySession.date == today,
            DeliverySession.meal_type == meal_type,
        ).order_by(desc(DeliverySession.id))
    )
    if not session:
        session = DeliverySession(
            date=today,
            meal_type=meal_type,
            is_active=True,
            current_lat=body.latitude,
            current_lng=body.longitude,
            started_at=now_ist(),
        )
        db.add(session)
    else:
        session.current_lat = body.latitude
        session.current_lng = body.longitude

    db.commit()
    return {"status": "ok", "current_lat": session.current_lat, "current_lng": session.current_lng}

@router.post("/admin/orders/{selection_id}/deliver")
def mark_order_delivered(selection_id: int, db: Db, admin=Admin):
    selection = db.get(MealSelection, selection_id)
    if not selection:
        error("NOT_FOUND", "Meal order not found.", 404)

    selection.delivery_status = DeliveryStatus.DELIVERED
    selection.delivered_at = now_ist()

    # Create Delivery Notification for the student
    u = selection.user
    student_name = u.name if u else "Student"
    db.add(
        DeliveryNotification(
            user_id=selection.user_id,
            title="🎉 Food Arrived & Delivered!",
            message=f"Hi {student_name}, your {selection.meal_type.value.title()} meal has been delivered by the kitchen team. Enjoy your meal!",
            type="DELIVERED",
        )
    )

    audit(db, admin.id, "MEAL_DELIVERED", "MealSelection", str(selection.id), {"user_id": selection.user_id, "student_id": u.student_id if u else None})
    db.commit()
    return {"message": "Order marked as delivered successfully!", "selection_id": selection_id, "delivered_at": selection.delivered_at}
