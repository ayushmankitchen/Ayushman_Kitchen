from datetime import date, timedelta
from sqlalchemy import select
from sqlalchemy.orm import Session
from .core import now_ist, subscription_state, window_is_open, error
from .models import AuditLog, MealOption, MealSelection, MealType, Plan, SelectionStatus, Subscription, SubscriptionStatus, User

def audit(db: Session, user_id: int|None, action: str, entity_type: str, entity_id: str, metadata: dict|None=None):
    db.add(AuditLog(user_id=user_id, action=action, entity_type=entity_type, entity_id=entity_id, metadata_=metadata))
def current_subscription(db: Session, user: User) -> Subscription:
    sub = user.subscription
    if not sub: error("SUBSCRIPTION_EXPIRED", "No subscription is assigned to this account.", 403)
    actual = subscription_state(sub.expiry_date)
    if sub.status != SubscriptionStatus.SUSPENDED and sub.status.value != actual:
        sub.status = SubscriptionStatus(actual); db.commit(); db.refresh(sub)
    return sub
def require_active_subscription(db: Session, user: User) -> Subscription:
    sub = current_subscription(db, user)
    if sub.status == SubscriptionStatus.SUSPENDED: error("SUBSCRIPTION_SUSPENDED", "Your subscription is suspended.", 403)
    if sub.status == SubscriptionStatus.EXPIRED: error("SUBSCRIPTION_EXPIRED", "Your subscription has expired.", 403)
    return sub
def assert_window(meal_type: MealType):
    if not window_is_open(meal_type.value): error("MEAL_WINDOW_NOT_OPEN", f"{meal_type.value.title()} selection is not open right now.", 403)
def selection_for_today(db: Session, user_id: int, meal_type: MealType):
    return db.scalar(select(MealSelection).where(MealSelection.user_id==user_id, MealSelection.date==now_ist().date(), MealSelection.meal_type==meal_type, MealSelection.status==SelectionStatus.SELECTED))
def meal_option_for_user(db: Session, sub: Subscription, meal_type: MealType, option_id: int|None) -> int|None:
    if sub.plan == Plan.STANDARD:
        if option_id is not None: error("PREMIUM_REQUIRED", "Custom meal options require a Premium subscription.", 403)
        return None
    if option_id is None: error("MEAL_NOT_FOUND", "Choose an available meal option.")
    option = db.get(MealOption, option_id)
    if not option or option.meal_type != meal_type: error("MEAL_NOT_FOUND", "The requested meal option was not found.", 404)
    if not option.available: error("MEAL_NOT_AVAILABLE", "This meal option is not available.", 409)
    return option.id
def subscription_payload(sub: Subscription):
    return {"id":sub.id,"plan":sub.plan,"start_date":sub.start_date,"expiry_date":sub.expiry_date,"status":sub.status,"expiring_soon":sub.status==SubscriptionStatus.ACTIVE and 0 <= (sub.expiry_date-now_ist().date()).days <=3}
