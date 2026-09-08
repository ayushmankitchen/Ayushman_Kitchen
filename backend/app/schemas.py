from datetime import date, datetime
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from .models import DeliveryStatus, MealType, Plan, Role, SelectionStatus, SubscriptionStatus

class LoginIn(BaseModel): email: EmailStr; password: str = Field(min_length=8)
class TokenOut(BaseModel): access_token: str; token_type: str="bearer"; user: "UserOut"
class UserOut(BaseModel):
    model_config=ConfigDict(from_attributes=True)
    id:int; student_id:str; name:str; email:EmailStr; phone:str|None; role:Role; is_active:bool
    latitude:float|None=None; longitude:float|None=None; delivery_address:str|None=None
class SubscriptionOut(BaseModel):
    model_config=ConfigDict(from_attributes=True)
    id:int; plan:Plan; start_date:date; expiry_date:date; status:SubscriptionStatus
class MealOptionIn(BaseModel): name:str=Field(min_length=2,max_length=100); meal_type:MealType; available:bool=True
class MealOptionOut(MealOptionIn):
    model_config=ConfigDict(from_attributes=True)
    id:int
class MealActionIn(BaseModel): meal_type:MealType; meal_option_id:int|None=None; delivery_address:str|None=None; latitude:float|None=None; longitude:float|None=None
class MealSelectionOut(BaseModel):
    model_config=ConfigDict(from_attributes=True)
    id:int; date:date; meal_type:MealType; meal_option_id:int|None; status:SelectionStatus; selected_at:datetime; cancelled_at:datetime|None
    delivery_status:DeliveryStatus; delivery_lat:float|None=None; delivery_lng:float|None=None; delivery_address:str|None=None; delivered_at:datetime|None=None
class StudentCreate(BaseModel):
    student_id:str=Field(min_length=1,max_length=50); name:str=Field(min_length=2,max_length=120); email:EmailStr; phone:str|None=None; password:str=Field(min_length=8); plan:Plan; start_date:date; expiry_date:date
    latitude:float|None=None; longitude:float|None=None; delivery_address:str|None=None
class StudentUpdate(BaseModel): name:str|None=None; email:EmailStr|None=None; phone:str|None=None; is_active:bool|None=None; latitude:float|None=None; longitude:float|None=None; delivery_address:str|None=None
class RegisterIn(BaseModel):
    student_id: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8)
    phone: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    delivery_address: str | None = None
class PlanUpdate(BaseModel): plan:Plan
class RenewIn(BaseModel): start_date:date; expiry_date:date; plan:Plan|None=None

# Delivery Schemas
class StudentLocationIn(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    address: str = Field(min_length=2, max_length=255)

class DeliverySessionStartIn(BaseModel):
    meal_type: MealType
    driver_name: str = "Kitchen Delivery Team"
    driver_phone: str = "+91 9876543210"
    current_lat: float = 28.6139
    current_lng: float = 77.2090

class DeliveryLocationUpdateIn(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)

class DeliveryNotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    message: str
    type: str
    is_read: bool
    created_at: datetime

class DeliveryStopOut(BaseModel):
    selection_id: int
    student_id: str
    student_name: str
    student_phone: str | None
    meal_type: MealType
    option_name: str
    delivery_address: str | None
    delivery_lat: float | None
    delivery_lng: float | None
    delivery_status: DeliveryStatus
    delivered_at: datetime | None
    distance_meters: float | None = None
    eta_minutes: int | None = None

class AdminDeliverySessionOut(BaseModel):
    session_id: int | None
    date: date
    meal_type: MealType
    is_active: bool
    driver_name: str
    driver_phone: str
    current_lat: float
    current_lng: float
    started_at: datetime | None
    stops: list[DeliveryStopOut]
    total_stops: int
    pending_stops: int
    delivered_stops: int

class StudentDeliveryTrackingOut(BaseModel):
    meal_id: int | None
    date: date
    meal_type: MealType
    delivery_status: DeliveryStatus
    option_name: str
    delivery_address: str | None
    student_lat: float | None
    student_lng: float | None
    kitchen_lat: float
    kitchen_lng: float
    driver_lat: float | None
    driver_lng: float | None
    driver_name: str | None
    driver_phone: str | None
    is_out_for_delivery: bool
    distance_meters: float | None
    eta_minutes: int | None
    delivered_at: datetime | None
    notifications: list[DeliveryNotificationOut]


