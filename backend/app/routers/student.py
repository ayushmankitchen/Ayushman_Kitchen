from datetime import timedelta
from fastapi import APIRouter
from sqlalchemy import select
from ..core import now_ist, error
from ..deps import CurrentUser, Db
from ..models import MealOption, MealSelection, MealType, Role, SelectionStatus
from ..schemas import MealActionIn, MealOptionOut, MealSelectionOut
from ..services import assert_window, audit, current_subscription, meal_option_for_user, require_active_subscription, selection_for_today, subscription_payload

router=APIRouter(prefix="/student",tags=["student"])
def student(user:CurrentUser):
    if user.role != Role.STUDENT: error("FORBIDDEN","Student access is required.",403)
    return user
@router.get("/dashboard")
def dashboard(db:Db,user:CurrentUser):
    user=student(user); sub=current_subscription(db,user); today=now_ist().date()
    items=db.scalars(select(MealSelection).where(MealSelection.user_id==user.id,MealSelection.date==today)).all()
    return {"user":user,"subscription":subscription_payload(sub),"today":{"date":today,"lunch":next((x for x in items if x.meal_type==MealType.LUNCH),None),"dinner":next((x for x in items if x.meal_type==MealType.DINNER),None)}}
@router.get("/subscription")
def subscription(db:Db,user:CurrentUser): return subscription_payload(current_subscription(db,student(user)))
@router.get("/meals/today")
def today_meals(db:Db,user:CurrentUser):
    user=student(user); sub=current_subscription(db,user); options=[]
    if sub.plan.value=="PREMIUM": options=db.scalars(select(MealOption).where(MealOption.available==True)).all() # noqa
    records=db.scalars(select(MealSelection).where(MealSelection.user_id==user.id,MealSelection.date==now_ist().date())).all()
    return {"date":now_ist().date(),"plan":sub.plan,"subscription_status":sub.status,"options":options,"selections":records}
@router.post("/meals/select",response_model=MealSelectionOut,status_code=201)
def select_meal(body:MealActionIn,db:Db,user:CurrentUser):
    user=student(user); sub=require_active_subscription(db,user); assert_window(body.meal_type)
    existing=selection_for_today(db,user.id,body.meal_type)
    if existing: error("MEAL_ALREADY_SELECTED","A meal selection already exists for this meal.",409)
    selection=MealSelection(user_id=user.id,date=now_ist().date(),meal_type=body.meal_type,meal_option_id=meal_option_for_user(db,sub,body.meal_type,body.meal_option_id))
    db.add(selection); audit(db,user.id,"MEAL_SELECTED","MealSelection","new",{"meal_type":body.meal_type.value}); db.commit(); db.refresh(selection); return selection
@router.post("/meals/cancel",response_model=MealSelectionOut)
def cancel_meal(body:MealActionIn,db:Db,user:CurrentUser):
    user=student(user); require_active_subscription(db,user); assert_window(body.meal_type); selection=selection_for_today(db,user.id,body.meal_type)
    if not selection or selection.status==SelectionStatus.CANCELLED: error("MEAL_NOT_FOUND","No active meal selection exists to cancel.",404)
    selection.status=SelectionStatus.CANCELLED; selection.cancelled_at=now_ist(); audit(db,user.id,"MEAL_CANCELLED","MealSelection",str(selection.id)); db.commit(); db.refresh(selection); return selection
@router.put("/meals/change",response_model=MealSelectionOut)
def change_meal(body:MealActionIn,db:Db,user:CurrentUser):
    user=student(user); sub=require_active_subscription(db,user); assert_window(body.meal_type); selection=selection_for_today(db,user.id,body.meal_type)
    if not selection or selection.status==SelectionStatus.CANCELLED: error("MEAL_NOT_FOUND","No active meal selection exists to change.",404)
    selection.meal_option_id=meal_option_for_user(db,sub,body.meal_type,body.meal_option_id); audit(db,user.id,"MEAL_CHANGED","MealSelection",str(selection.id)); db.commit(); db.refresh(selection); return selection
@router.get("/meals/history",response_model=list[MealSelectionOut])
def history(db:Db,user:CurrentUser):
    user=student(user); return db.scalars(select(MealSelection).where(MealSelection.user_id==user.id).order_by(MealSelection.date.desc()).limit(100)).all()
