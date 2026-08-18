from datetime import date, datetime
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from .models import MealType, Plan, Role, SelectionStatus, SubscriptionStatus

class LoginIn(BaseModel): email: EmailStr; password: str = Field(min_length=8)
class TokenOut(BaseModel): access_token: str; token_type: str="bearer"; user: "UserOut"
class UserOut(BaseModel):
    model_config=ConfigDict(from_attributes=True)
    id:int; student_id:str; name:str; email:EmailStr; phone:str|None; role:Role; is_active:bool
class SubscriptionOut(BaseModel):
    model_config=ConfigDict(from_attributes=True)
    id:int; plan:Plan; start_date:date; expiry_date:date; status:SubscriptionStatus
class MealOptionIn(BaseModel): name:str=Field(min_length=2,max_length=100); meal_type:MealType; available:bool=True
class MealOptionOut(MealOptionIn):
    model_config=ConfigDict(from_attributes=True)
    id:int
class MealActionIn(BaseModel): meal_type:MealType; meal_option_id:int|None=None
class MealSelectionOut(BaseModel):
    model_config=ConfigDict(from_attributes=True)
    id:int; date:date; meal_type:MealType; meal_option_id:int|None; status:SelectionStatus; selected_at:datetime; cancelled_at:datetime|None
class StudentCreate(BaseModel):
    student_id:str=Field(min_length=1,max_length=50); name:str=Field(min_length=2,max_length=120); email:EmailStr; phone:str|None=None; password:str=Field(min_length=8); plan:Plan; start_date:date; expiry_date:date
class StudentUpdate(BaseModel): name:str|None=None; email:EmailStr|None=None; phone:str|None=None; is_active:bool|None=None
class PlanUpdate(BaseModel): plan:Plan
class RenewIn(BaseModel): start_date:date; expiry_date:date; plan:Plan|None=None
