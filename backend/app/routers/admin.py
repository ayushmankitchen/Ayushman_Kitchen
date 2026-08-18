from datetime import date
from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from ..core import error, hash_password, now_ist
from ..deps import CurrentUser, Db, require_roles
from ..models import AuditLog, MealOption, MealSelection, Plan, Role, Subscription, SubscriptionStatus, User
from ..schemas import MealOptionIn, MealOptionOut, PlanUpdate, RenewIn, StudentCreate, StudentUpdate, SubscriptionOut, UserOut
from ..services import audit, subscription_payload

router=APIRouter(prefix="/admin",tags=["admin"])
Admin=Depends(require_roles(Role.ADMIN))
def student_details(user:User): return {"user":user,"subscription":subscription_payload(user.subscription) if user.subscription else None}
@router.get("/dashboard")
def dashboard(db:Db,_=Admin):
    return {"students":db.scalar(select(func.count(User.id)).where(User.role==Role.STUDENT)),"active_subscriptions":db.scalar(select(func.count(Subscription.id)).where(Subscription.status==SubscriptionStatus.ACTIVE,Subscription.expiry_date>=now_ist().date())),"today_confirmed":db.scalar(select(func.count(MealSelection.id)).where(MealSelection.date==now_ist().date(),MealSelection.status=="SELECTED"))}
@router.get("/students")
def students(db:Db,search:str|None=None, _=Admin):
    q=select(User).where(User.role==Role.STUDENT).order_by(User.name)
    if search:q=q.where((User.name.ilike(f"%{search}%"))|(User.student_id.ilike(f"%{search}%")))
    return [student_details(s) for s in db.scalars(q).all()]
@router.post("/students",status_code=201)
def create_student(body:StudentCreate,db:Db,admin=Admin):
    if db.scalar(select(User).where((User.email==body.email)|(User.student_id==body.student_id))):error("CONFLICT","A student with that email or ID already exists.",409)
    if body.expiry_date<body.start_date:error("INVALID_DATE","Expiry date must be on or after start date.")
    user=User(student_id=body.student_id,name=body.name,email=body.email,phone=body.phone,password_hash=hash_password(body.password)); db.add(user); db.flush()
    sub=Subscription(user_id=user.id,plan=body.plan,start_date=body.start_date,expiry_date=body.expiry_date); db.add(sub); audit(db,admin.id,"STUDENT_CREATED","User",str(user.id)); db.commit(); db.refresh(user); return student_details(user)
@router.get("/students/{user_id}")
def get_student(user_id:int,db:Db,_=Admin):
    user=db.get(User,user_id)
    if not user or user.role!=Role.STUDENT:error("MEAL_NOT_FOUND","Student not found.",404)
    return student_details(user)
@router.put("/students/{user_id}")
def update_student(user_id:int,body:StudentUpdate,db:Db,admin=Admin):
    user=db.get(User,user_id)
    if not user or user.role!=Role.STUDENT:error("MEAL_NOT_FOUND","Student not found.",404)
    for key,value in body.model_dump(exclude_none=True).items():setattr(user,key,value)
    audit(db,admin.id,"STUDENT_UPDATED","User",str(user.id));db.commit();db.refresh(user);return student_details(user)
@router.put("/students/{user_id}/plan")
def update_plan(user_id:int,body:PlanUpdate,db:Db,admin=Admin):
    user=db.get(User,user_id)
    if not user or not user.subscription:error("MEAL_NOT_FOUND","Student subscription not found.",404)
    user.subscription.plan=body.plan;audit(db,admin.id,"PLAN_CHANGED","Subscription",str(user.subscription.id));db.commit();return subscription_payload(user.subscription)
@router.post("/students/{user_id}/renew")
def renew(user_id:int,body:RenewIn,db:Db,admin=Admin):
    user=db.get(User,user_id)
    if not user or not user.subscription:error("MEAL_NOT_FOUND","Student subscription not found.",404)
    sub=user.subscription;sub.start_date=body.start_date;sub.expiry_date=body.expiry_date;sub.status=SubscriptionStatus.ACTIVE
    if body.plan:sub.plan=body.plan
    audit(db,admin.id,"SUBSCRIPTION_RENEWED","Subscription",str(sub.id));db.commit();return subscription_payload(sub)
@router.post("/students/{user_id}/suspend")
def suspend(user_id:int,db:Db,admin=Admin):
    user=db.get(User,user_id)
    if not user or not user.subscription:error("MEAL_NOT_FOUND","Student subscription not found.",404)
    user.subscription.status=SubscriptionStatus.SUSPENDED;audit(db,admin.id,"SUBSCRIPTION_SUSPENDED","Subscription",str(user.subscription.id));db.commit();return subscription_payload(user.subscription)
@router.get("/meal-options",response_model=list[MealOptionOut])
def list_options(db:Db,_=Admin):return db.scalars(select(MealOption).order_by(MealOption.meal_type,MealOption.name)).all()
@router.post("/meal-options",response_model=MealOptionOut,status_code=201)
def create_option(body:MealOptionIn,db:Db,admin=Admin):
    option=MealOption(**body.model_dump());db.add(option);audit(db,admin.id,"MEAL_OPTION_CREATED","MealOption","new");db.commit();db.refresh(option);return option
@router.put("/meal-options/{option_id}",response_model=MealOptionOut)
def update_option(option_id:int,body:MealOptionIn,db:Db,admin=Admin):
    option=db.get(MealOption,option_id)
    if not option:error("MEAL_NOT_FOUND","Meal option not found.",404)
    for key,value in body.model_dump().items():setattr(option,key,value)
    audit(db,admin.id,"MEAL_OPTION_UPDATED","MealOption",str(option.id));db.commit();db.refresh(option);return option
@router.get("/audit-logs")
def audit_logs(db:Db,_=Admin):return db.scalars(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(200)).all()
