from datetime import timedelta
from fastapi import APIRouter
from sqlalchemy import select
from .. import core
from ..core import error
from ..deps import CurrentUser, Db
from ..models import MealOption, MealSelection, MealType, Role, SelectionStatus, User
from ..schemas import MealActionIn, MealOptionOut, MealSelectionOut
from ..services import any_selection_for_today, assert_window, audit, current_subscription, meal_option_for_user, require_active_subscription, selection_for_today, subscription_payload

router = APIRouter(prefix="/student", tags=["student"])

def student(user: CurrentUser):
    if user.role != Role.STUDENT:
        error("FORBIDDEN", "Student access is required.", 403)
    return user

@router.get("/dashboard")
def dashboard(db: Db, user: CurrentUser):
    user = student(user)
    sub = current_subscription(db, user)
    today = core.now_ist().date()
    items = db.scalars(select(MealSelection).where(MealSelection.user_id == user.id, MealSelection.date == today)).all()
    return {
        "user": user,
        "subscription": subscription_payload(sub),
        "today": {
            "date": today,
            "lunch": next((x for x in items if x.meal_type == MealType.LUNCH), None),
            "dinner": next((x for x in items if x.meal_type == MealType.DINNER), None),
        },
    }

@router.get("/subscription")
def subscription(db: Db, user: CurrentUser):
    return subscription_payload(current_subscription(db, student(user)))

@router.get("/meals/today")
def today_meals(db: Db, user: CurrentUser):
    user = student(user)
    sub = current_subscription(db, user)
    options = []
    if sub.plan.value == "PREMIUM":
        options = db.scalars(select(MealOption).where(MealOption.available == True)).all() # noqa
    records = db.scalars(select(MealSelection).where(MealSelection.user_id == user.id, MealSelection.date == core.now_ist().date())).all()
    return {
        "date": core.now_ist().date(),
        "plan": sub.plan,
        "subscription_status": sub.status,
        "options": options,
        "selections": records,
    }

@router.post("/meals/select", response_model=MealSelectionOut, status_code=201)
def select_meal(body: MealActionIn, db: Db, user: CurrentUser):
    user = student(user)
    sub = require_active_subscription(db, user)
    assert_window(body.meal_type)
    
    existing = any_selection_for_today(db, user.id, body.meal_type)
    if existing:
        if existing.status == SelectionStatus.CANCELLED:
            error("MEAL_CANCELLED", f"You have already cancelled {body.meal_type.value.lower()} for today. Cancelled meals cannot be re-selected.", 400)
        else:
            error("MEAL_ALREADY_SELECTED", f"You have already confirmed {body.meal_type.value.lower()} for today.", 409)

    db_user = db.get(User, user.id)
    lat = body.latitude if body.latitude is not None else (db_user.latitude if db_user else None)
    lng = body.longitude if body.longitude is not None else (db_user.longitude if db_user else None)
    addr = body.delivery_address if body.delivery_address else (db_user.delivery_address if db_user else None)

    selection = MealSelection(
        user_id=user.id,
        date=core.now_ist().date(),
        meal_type=body.meal_type,
        meal_option_id=meal_option_for_user(db, sub, body.meal_type, body.meal_option_id),
        delivery_lat=lat,
        delivery_lng=lng,
        delivery_address=addr,
    )
    db.add(selection)
    audit(db, user.id, "MEAL_SELECTED", "MealSelection", "new", {"meal_type": body.meal_type.value})
    db.commit()
    db.refresh(selection)
    return selection

@router.post("/meals/cancel", response_model=MealSelectionOut)
def cancel_meal(body: MealActionIn, db: Db, user: CurrentUser):
    user = student(user)
    require_active_subscription(db, user)
    assert_window(body.meal_type)
    
    selection = selection_for_today(db, user.id, body.meal_type)
    if not selection:
        existing = any_selection_for_today(db, user.id, body.meal_type)
        if existing and existing.status == SelectionStatus.CANCELLED:
            error("MEAL_ALREADY_CANCELLED", f"{body.meal_type.value.capitalize()} is already cancelled for today.", 400)
        error("MEAL_NOT_FOUND", "No active meal selection exists to cancel.", 404)

    selection.status = SelectionStatus.CANCELLED
    selection.cancelled_at = core.now_ist()
    audit(db, user.id, "MEAL_CANCELLED", "MealSelection", str(selection.id))
    db.commit()
    db.refresh(selection)
    return selection

@router.put("/meals/change", response_model=MealSelectionOut)
def change_meal(body: MealActionIn, db: Db, user: CurrentUser):
    user = student(user)
    sub = require_active_subscription(db, user)
    assert_window(body.meal_type)
    
    selection = selection_for_today(db, user.id, body.meal_type)
    if not selection:
        existing = any_selection_for_today(db, user.id, body.meal_type)
        if existing and existing.status == SelectionStatus.CANCELLED:
            error("MEAL_CANCELLED", f"Cancelled {body.meal_type.value.lower()} cannot be changed.", 400)
        error("MEAL_NOT_FOUND", "No active meal selection exists to change.", 404)

    selection.meal_option_id = meal_option_for_user(db, sub, body.meal_type, body.meal_option_id)
    audit(db, user.id, "MEAL_CHANGED", "MealSelection", str(selection.id))
    db.commit()
    db.refresh(selection)
    return selection

@router.get("/meals/history", response_model=list[MealSelectionOut])
def history(db: Db, user: CurrentUser):
    user = student(user)
    return db.scalars(select(MealSelection).where(MealSelection.user_id == user.id).order_by(MealSelection.date.desc(), MealSelection.id.desc()).limit(100)).all()
