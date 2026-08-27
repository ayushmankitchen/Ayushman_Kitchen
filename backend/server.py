from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).resolve().parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, UploadFile, File, Form, Query, Body
from fastapi.responses import FileResponse, RedirectResponse, JSONResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import IndexModel, ASCENDING
from pymongo.errors import DuplicateKeyError
from pydantic import BaseModel, Field, field_validator
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
import uuid
import logging
import bcrypt
import jwt
import httpx
import time
import secrets
import hashlib
import re
import asyncio
from collections import defaultdict, deque
import urllib.parse
from urllib.parse import urlparse, quote_plus

from backend.services.timezone import (
    get_today_date,
    get_yesterday_date,
    get_month_bounds,
    validate_past_or_today,
    now_tz,
    BUSINESS_TIMEZONE_NAME,
)
from backend.services.payroll import PayrollService
from backend.services.storage import VoiceStorage, ProfilePhotoStorage, PHOTO_UPLOAD_DIR
from backend.services.email import email_service
from backend.services.salary_slip_pdf import generate_salary_slip_pdf, sanitize_filename
from backend.services import push

# MongoDB connection
mongo_url = os.environ.get('MONGO_URL')
if not mongo_url:
    raise RuntimeError('MONGO_URL environment variable is required. See backend/.env.example')
try:
    import certifi
    _ca_file = certifi.where()
except Exception:
    _ca_file = None

_client_kwargs: dict[str, Any] = {
    "serverSelectionTimeoutMS": int(os.environ.get("MONGO_SERVER_SELECTION_TIMEOUT_MS", "5000")),
    "connectTimeoutMS": int(os.environ.get("MONGO_CONNECT_TIMEOUT_MS", "5000")),
}
if _ca_file and ("mongodb+srv://" in mongo_url or "ssl=true" in mongo_url.lower() or "tls=true" in mongo_url.lower()):
    _client_kwargs["tlsCAFile"] = _ca_file

client = AsyncIOMotorClient(mongo_url, **_client_kwargs)
_db_name = os.environ.get('DB_NAME')
if not _db_name:
    raise RuntimeError('DB_NAME environment variable is required. See backend/.env.example')
db = client[_db_name]

JWT_SECRET = os.environ.get('JWT_SECRET')
if not JWT_SECRET:
    raise RuntimeError('JWT_SECRET environment variable is required. See backend/.env.example')
JWT_ALGORITHM = "HS256"

ENVIRONMENT = os.environ.get("ENVIRONMENT", "development").strip().lower()
IS_PRODUCTION = ENVIRONMENT == "production"
COOKIE_SECURE = IS_PRODUCTION or os.environ.get("COOKIE_SECURE", "false").lower() == "true"
COOKIE_SAMESITE = os.environ.get("COOKIE_SAMESITE", "none" if IS_PRODUCTION else "lax").lower()
SESSION_MAX_AGE = int(os.environ.get("SESSION_MAX_AGE_SECONDS", "5184000"))
MESSAGE_RETENTION = timedelta(hours=48)
NOTIFICATION_RETENTION = timedelta(days=3)
RENEWAL_ACTIVITY_TYPES = {"SUBSCRIPTION_RENEWED", "RENEWAL", "RENEW", "SUBSCRIPTION_RENEW"}
voice_storage = VoiceStorage()
photo_storage = ProfilePhotoStorage()

app = FastAPI(title="WorkForce API")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
_rate_buckets: dict[str, deque] = defaultdict(deque)
_voice_expiration_task = None
_meal_cleanup_task = None
_meal_reminder_task = None


def parse_utc_datetime(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    else:
        return None
    return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed.astimezone(timezone.utc)


def message_expiry_from_created_at(created_at: Any) -> Optional[datetime]:
    parsed = parse_utc_datetime(created_at)
    return parsed + MESSAGE_RETENTION if parsed else None


def visible_message_filter(now: Optional[datetime] = None) -> dict:
    cutoff = now or datetime.now(timezone.utc)
    cutoff_iso = (cutoff - MESSAGE_RETENTION).isoformat()
    return {
        "$and": [
            {"$or": [{"expires_at": {"$exists": False}}, {"expires_at": {"$gt": cutoff}}]},
            {"created_at": {"$gt": cutoff_iso}}
        ]
    }


def _populate_cloudinary_from_url() -> None:
    c_url = os.environ.get("CLOUDINARY_URL", "").strip()
    if c_url.startswith("cloudinary://"):
        try:
            from urllib.parse import urlparse
            parsed = urlparse(c_url)
            if parsed.username and not os.environ.get("CLOUDINARY_API_KEY"):
                os.environ["CLOUDINARY_API_KEY"] = parsed.username
            if parsed.password and not os.environ.get("CLOUDINARY_API_SECRET"):
                os.environ["CLOUDINARY_API_SECRET"] = parsed.password
            if parsed.hostname and not os.environ.get("CLOUDINARY_CLOUD_NAME"):
                os.environ["CLOUDINARY_CLOUD_NAME"] = parsed.hostname
        except Exception:
            pass

_populate_cloudinary_from_url()


def validate_environment() -> None:
    _populate_cloudinary_from_url()
    if voice_storage.provider not in {"local", "cloudinary"}:
        raise RuntimeError("MEDIA_STORAGE must be either 'local' or 'cloudinary'")

    required = []
    if voice_storage.provider == "cloudinary":
        required += ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"]
    if IS_PRODUCTION:
        required += ["MONGO_URL", "DB_NAME", "JWT_SECRET"]
    for name in required:
        if not os.environ.get(name, "").strip():
            raise RuntimeError(f"Missing required environment variable: {name}")
    if not IS_PRODUCTION:
        return
    if len(JWT_SECRET) < 16:
        raise RuntimeError("JWT_SECRET must be at least 16 characters in production")


def set_session_cookie(response: Response, name: str, value: str, csrf_token: Optional[str] = None) -> str:
    response.set_cookie(name, value, httponly=True, secure=COOKIE_SECURE, samesite=COOKIE_SAMESITE,
                        max_age=SESSION_MAX_AGE, path="/")
    csrf = csrf_token or secrets.token_urlsafe(24)
    response.set_cookie("csrf_token", csrf, httponly=False, secure=COOKIE_SECURE, samesite=COOKIE_SAMESITE,
                        max_age=SESSION_MAX_AGE, path="/")
    return csrf


def rate_limit(request: Request, scope: str, limit: int, window: int = 60) -> None:
    key = f"{scope}:{request.client.host if request.client else 'unknown'}"
    now = time.monotonic()
    bucket = _rate_buckets[key]
    while bucket and bucket[0] <= now - window:
        bucket.popleft()
    if len(bucket) >= limit:
        raise HTTPException(status_code=429, detail="Too many requests. Please try again shortly.")
    bucket.append(now)


# ---------------- Helpers & Auth Dependencies ----------------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(admin_id: str, email: str, business_id: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": admin_id,
        "email": email,
        "business_id": business_id,
        "type": "access",
        "iat": now,
        "exp": now + timedelta(seconds=SESSION_MAX_AGE),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_or_create_business_for_admin(admin: dict) -> dict:
    """Ensures the admin has an associated business workspace."""
    biz = await db.businesses.find_one({"owner_admin_id": admin["id"]}, {"_id": 0})
    if not biz:
        biz_id = str(uuid.uuid4())
        name = f"{admin.get('name', 'My')} Workspace"
        biz_doc = {
            "id": biz_id,
            "name": name,
            "owner_admin_id": admin["id"],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.businesses.insert_one(biz_doc)
        biz = {k: v for k, v in biz_doc.items() if k != "_id"}
        logger.info(f"Created new business workspace {biz_id} for admin {admin['id']}")
    return biz


async def get_current_admin(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid session")
        token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        if await db.revoked_admin_tokens.find_one({"token_hash": token_hash}):
            raise HTTPException(status_code=401, detail="Session expired")
        admin = await db.admins.find_one(
            {"id": payload["sub"], "is_active": {"$ne": False}, "disabled_at": {"$in": [None, ""]}},
            {"_id": 0, "password_hash": 0}
        )
        if not admin:
            raise HTTPException(status_code=401, detail="Admin not found or deactivated")
        changed_at = admin.get("password_changed_at")
        issued_at = payload.get("iat")
        if changed_at and issued_at:
            changed = datetime.fromisoformat(changed_at) if isinstance(changed_at, str) else changed_at
            if changed.tzinfo is None:
                changed = changed.replace(tzinfo=timezone.utc)
            if datetime.fromtimestamp(issued_at, timezone.utc) < changed:
                raise HTTPException(status_code=401, detail="Session expired")
        
        # Verify and attach business ownership
        business = await get_or_create_business_for_admin(admin)
        admin["business_id"] = business["id"]
        admin["business"] = business
        return admin
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def get_current_worker(request: Request) -> dict:
    token = request.cookies.get("session_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    session = await db.worker_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    expires_at = session.get("expires_at")
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at and expires_at < datetime.now(timezone.utc):
        await db.worker_sessions.delete_one({"session_token": token})
        raise HTTPException(status_code=401, detail="Session expired")

    worker = await db.workers.find_one(
        {"id": session["worker_id"], "business_id": session["business_id"]},
        {"_id": 0, "password_hash": 0}
    )
    if not worker:
        await db.worker_sessions.delete_one({"session_token": token})
        raise HTTPException(status_code=401, detail="Worker profile not found")
    if worker.get("status", "ACTIVE") == "INACTIVE":
        await db.worker_sessions.delete_many({"worker_id": worker["id"]})
        raise HTTPException(
            status_code=403,
            detail="Your account is currently inactive. Please contact your mess management."
        )
    if not worker.get("portal_enabled", False):
        await db.worker_sessions.delete_many({"worker_id": worker["id"]})
        raise HTTPException(status_code=403, detail="Portal access is disabled for this worker")

    # A valid authenticated request renews the server-side session window.
    await db.worker_sessions.update_one(
        {"session_token": token},
        {"$set": {"expires_at": (datetime.now(timezone.utc) + timedelta(seconds=SESSION_MAX_AGE)).isoformat(),
                  "last_seen_at": datetime.now(timezone.utc).isoformat()}},
    )

    worker["worker_id"] = worker["id"]
    worker["user_id"] = worker["id"]
    return worker


# ---------------- Pydantic Models ----------------
class AdminSignup(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    business_name: str = Field(min_length=2, max_length=100)
    username: str = Field(min_length=3, max_length=50)
    email: str
    password: str = Field(min_length=8, max_length=128)

    @field_validator("username")
    @classmethod
    def valid_username(cls, value: str) -> str:
        norm = value.strip().lower()
        if not re.match(r"^[a-z0-9_-]{3,50}$", norm):
            raise ValueError("Username must be 3-50 characters (letters, numbers, underscores, hyphens)")
        return norm

    @field_validator("email")
    @classmethod
    def valid_email(cls, value: str) -> str:
        norm = value.strip().lower()
        if "@" not in norm or "." not in norm.rsplit("@", 1)[-1]:
            raise ValueError("Enter a valid email address")
        return norm


class AdminLogin(BaseModel):
    identifier: str = Field(min_length=2, max_length=100)
    password: str = Field(min_length=1, max_length=128)


class ForgotPasswordRequest(BaseModel):
    email: str

    @field_validator("email")
    @classmethod
    def valid_email(cls, value: str) -> str:
        norm = value.strip().lower()
        if "@" not in norm or "." not in norm.rsplit("@", 1)[-1]:
            raise ValueError("Enter a valid email address")
        return norm


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=10, max_length=256)
    new_password: str = Field(min_length=6, max_length=128)


ForgotPasswordIn = ForgotPasswordRequest
ResetPasswordIn = ResetPasswordRequest


class AdminChangePassword(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=6, max_length=128)


class BusinessUpdate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    timezone: str = "Asia/Kolkata"
    logo_url: Optional[str] = None
    admin_email: Optional[str] = None
    notice_ticker: Optional[dict] = None
    showcase_boxes: Optional[List[dict]] = None
    meal_plans: Optional[List[dict]] = None

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, value: str) -> str:
        from zoneinfo import ZoneInfo
        try:
            ZoneInfo(value)
        except Exception as exc:
            raise ValueError("Unknown timezone") from exc
        return value


class WorkerLogin(BaseModel):
    login_id: str = Field(min_length=2, max_length=50)
    password: str = Field(min_length=1, max_length=128)


def normalize_indian_phone_identifier(identifier: str) -> Optional[str]:
    """Return a valid ten-digit Indian mobile number, without touching Worker IDs."""
    compact = re.sub(r"[\s-]+", "", identifier.strip())
    if compact.startswith("+91"):
        compact = compact[3:]
    elif compact.startswith("91") and len(compact) == 12:
        compact = compact[2:]
    if re.fullmatch(r"[6-9]\d{9}", compact):
        return compact
    return None


class WorkerChangePassword(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=6, max_length=128)


class WorkerSetEmail(BaseModel):
    email: str

    @field_validator("email")
    @classmethod
    def valid_email(cls, value: str) -> str:
        norm = value.strip().lower()
        if "@" not in norm or "." not in norm.rsplit("@", 1)[-1]:
            raise ValueError("Enter a valid email address")
        return norm


class WorkerForgotPasswordRequest(BaseModel):
    identifier: str = Field(min_length=2, max_length=100)


class WorkerResetPasswordAdmin(BaseModel):
    new_password: str = Field(min_length=6, max_length=128)


class WorkerStatusUpdate(BaseModel):
    status: str

    @field_validator("status")
    @classmethod
    def valid_status(cls, value: str) -> str:
        val = value.strip().upper()
        if val not in {"ACTIVE", "INACTIVE"}:
            raise ValueError("Status must be ACTIVE or INACTIVE")
        return val


class WorkTypeCreate(BaseModel):
    name: str = Field(min_length=2, max_length=50)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = " ".join(value.split())
        if not value:
            raise ValueError("Work Type name is required")
        return value


class WorkTypeUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=50)
    is_active: Optional[bool] = None

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        value = " ".join(value.split())
        if not value:
            raise ValueError("Work Type name is required")
        return value


class WorkerCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    mobile: str = Field(default="", max_length=20)
    work_type: str = Field(min_length=2, max_length=50)
    joining_date: str
    salary: float = Field(ge=0, le=100000000)
    email: Optional[str] = ""
    status: str = "ACTIVE"
    diet_preference: Optional[str] = "VEG"
    delivery_preference: Optional[str] = "DINE_IN"  # DINE_IN | PICKUP | DELIVERY
    delivery_address: Optional[str] = ""            # Hostel / Room / Landmark
    delivery_notes: Optional[str] = ""              # Delivery instructions
    portal_enabled: bool = True
    login_id: Optional[str] = ""
    password: Optional[str] = ""
    profile_photo_url: Optional[str] = None
    profile_photo_asset_id: Optional[str] = None
    profile_photo_provider: Optional[str] = None
    profile_photo_updated_at: Optional[str] = None
    meal_plan_type: Optional[str] = "BOTH"   # BOTH | LUNCH_ONLY | DINNER_ONLY
    total_quota: Optional[int] = 60          # 60 for BOTH, 30 for Single (0 = unlimited)
    lunch_quota: Optional[int] = 30          # backwards compat
    dinner_quota: Optional[int] = 30         # backwards compat
    lunch_start_date: Optional[str] = None   # optional separate start date for lunch
    dinner_start_date: Optional[str] = None  # optional separate start date for dinner

    @field_validator("name", "mobile", "work_type")
    @classmethod
    def clean_text(cls, value: str) -> str:
        return value.strip()

    @field_validator("joining_date")
    @classmethod
    def valid_joining_date(cls, value: str) -> str:
        datetime.strptime(value, "%Y-%m-%d")
        return value

    @field_validator("status")
    @classmethod
    def valid_status(cls, value: str) -> str:
        val = (value or "ACTIVE").strip().upper()
        if val not in {"ACTIVE", "INACTIVE"}:
            raise ValueError("Status must be ACTIVE or INACTIVE")
        return val

    @field_validator("diet_preference")
    @classmethod
    def valid_diet_preference(cls, value: Optional[str]) -> str:
        val = (value or "VEG").strip().upper()
        if val not in {"VEG", "NON_VEG"}:
            return "VEG"
        return val

    @field_validator("delivery_preference")
    @classmethod
    def valid_delivery_preference(cls, value: Optional[str]) -> str:
        val = (value or "DINE_IN").strip().upper()
        if val not in {"DINE_IN", "DELIVERY", "PICKUP"}:
            return "DINE_IN"
        return val

    @field_validator("email")
    @classmethod
    def valid_email(cls, value: Optional[str]) -> str:
        email = (value or "").strip().lower()
        if email and ("@" not in email or "." not in email.rsplit("@", 1)[-1]):
            raise ValueError("Enter a valid email address")
        return email

    @field_validator("login_id")
    @classmethod
    def valid_login_id(cls, value: Optional[str]) -> str:
        login_id = (value or "").strip().upper()
        if login_id and not re.match(r"^WF-[A-Z0-9]{6,20}$", login_id):
            raise ValueError("Worker ID must use format WF-XXXXXX with uppercase letters or numbers")
        return login_id


class WorkerUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    mobile: Optional[str] = Field(None, max_length=20)
    work_type: Optional[str] = Field(None, min_length=2, max_length=50)
    joining_date: Optional[str] = None
    salary: Optional[float] = Field(None, ge=0, le=100000000)
    email: Optional[str] = None
    status: Optional[str] = None
    diet_preference: Optional[str] = None
    delivery_preference: Optional[str] = None
    delivery_address: Optional[str] = None
    delivery_notes: Optional[str] = None
    portal_enabled: Optional[bool] = None
    login_id: Optional[str] = None
    password: Optional[str] = None
    profile_photo_url: Optional[str] = None
    profile_photo_asset_id: Optional[str] = None
    profile_photo_provider: Optional[str] = None
    profile_photo_updated_at: Optional[str] = None
    meal_plan_type: Optional[str] = None     # BOTH | LUNCH_ONLY | DINNER_ONLY
    total_quota: Optional[int] = None        # 0 = unlimited
    lunch_quota: Optional[int] = None        # 0 = unlimited
    dinner_quota: Optional[int] = None       # 0 = unlimited
    lunch_start_date: Optional[str] = None   # optional separate start date for lunch
    dinner_start_date: Optional[str] = None  # optional separate start date for dinner

    @field_validator("diet_preference")
    @classmethod
    def valid_diet_preference(cls, value: Optional[str]) -> Optional[str]:
        if value:
            val = value.strip().upper()
            if val not in {"VEG", "NON_VEG"}:
                return "VEG"
            return val
        return value

    @field_validator("delivery_preference")
    @classmethod
    def valid_delivery_preference(cls, value: Optional[str]) -> Optional[str]:
        if value:
            val = value.strip().upper()
            if val not in {"DINE_IN", "DELIVERY", "PICKUP"}:
                return "DINE_IN"
            return val
        return value

    @field_validator("joining_date")
    @classmethod
    def valid_joining_date(cls, value: Optional[str]) -> Optional[str]:
        if value:
            datetime.strptime(value, "%Y-%m-%d")
        return value

    @field_validator("status")
    @classmethod
    def valid_status(cls, value: Optional[str]) -> Optional[str]:
        if value:
            val = value.strip().upper()
            if val not in {"ACTIVE", "INACTIVE"}:
                raise ValueError("Status must be ACTIVE or INACTIVE")
            return val
        return value

    @field_validator("login_id")
    @classmethod
    def valid_login_id(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        login_id = value.strip().upper()
        if login_id and not re.match(r"^WF-[A-Z0-9]{6,20}$", login_id):
            raise ValueError("Worker ID must use format WF-XXXXXX with uppercase letters or numbers")
        return login_id


class AttendanceMark(BaseModel):
    worker_id: str
    date: str
    status: str  # Present, Absent, Half Day

    @field_validator("date")
    @classmethod
    def valid_date(cls, value: str) -> str:
        datetime.strptime(value, "%Y-%m-%d")
        return value

    @field_validator("status")
    @classmethod
    def valid_status(cls, value: str) -> str:
        if value not in {"Present", "Absent", "Half Day"}:
            raise ValueError("Status must be Present, Absent, or Half Day")
        return value


class PaymentCreate(BaseModel):
    worker_id: str
    amount: float = Field(gt=0, le=100000000)
    date: str
    type: str = "SALARY_PAYMENT"  # SALARY_PAYMENT, ADVANCE, EXTRA_WORK_PAYMENT, ADJUSTMENT
    note: Optional[str] = ""

    @field_validator("type")
    @classmethod
    def valid_type(cls, value: str) -> str:
        valid_types = {"SALARY_PAYMENT", "ADVANCE", "EXTRA_WORK_PAYMENT", "ADJUSTMENT"}
        if value not in valid_types:
            raise ValueError(f"Type must be one of {valid_types}")
        return value

    @field_validator("date")
    @classmethod
    def valid_date(cls, value: str) -> str:
        datetime.strptime(value, "%Y-%m-%d")
        return value


class PaymentUpdate(BaseModel):
    amount: Optional[float] = Field(None, gt=0, le=100000000)
    date: Optional[str] = None
    type: Optional[str] = None
    note: Optional[str] = None


class ExtraWorkCreate(BaseModel):
    worker_id: str
    description: str = Field(min_length=2, max_length=500)
    date: str
    amount: float = Field(gt=0, le=100000000)


class MessageCreate(BaseModel):
    conversation_id: Optional[str] = None
    worker_id: Optional[str] = None
    message_type: str = "text"  # text or audio
    text: Optional[str] = Field("", max_length=4000)
    audio_asset_id: Optional[str] = None
    duration: Optional[float] = 0.0


class BroadcastMessageCreate(BaseModel):
    recipient_mode: str = "ALL"  # ALL | SELECTED | PREMIUM | STANDARD
    worker_ids: Optional[List[str]] = []
    text: str = Field(min_length=1, max_length=4000)


class PushSubscriptionCreate(BaseModel):
    endpoint: str = Field(min_length=1, max_length=2048)
    keys: Dict[str, str]

    @field_validator("keys")
    @classmethod
    def valid_keys(cls, value: Dict[str, str]) -> Dict[str, str]:
        if not value.get("p256dh") or not value.get("auth"):
            raise ValueError("Push subscription keys are incomplete")
        return value


def generate_unique_worker_id() -> str:
    """Generates an alphanumeric Worker ID like WF-7F3K92."""
    suffix = secrets.token_hex(3).upper()
    return f"WF-{suffix}"


def clean_worker_document(worker: dict) -> dict:
    """Return the admin-safe worker representation without any password material."""
    return {k: v for k, v in worker.items() if k not in {"_id", "password", "password_hash", "temporary_password"}}


# ---------------- Admin Authentication Routes ----------------
@api_router.post("/admin/signup")
async def admin_signup(body: AdminSignup, response: Response, request: Request):
    rate_limit(request, "admin-signup", 10, 60)
    if os.environ.get("ALLOW_ADMIN_SIGNUP", "").lower() != "true" and os.environ.get("ENVIRONMENT", "").lower() == "production":
        admin_count = await db.admins.count_documents({})
        if admin_count > 0:
            raise HTTPException(status_code=403, detail="Public registration is disabled. Single admin configuration.")

    username = body.username
    email = body.email

    existing_username = await db.admins.find_one({"username": username})
    if existing_username:
        raise HTTPException(status_code=409, detail="This username is already taken. Please choose another.")

    existing_email = await db.admins.find_one({"email": email})
    if existing_email:
        raise HTTPException(status_code=409, detail="An account with this email address already exists.")

    admin_id = str(uuid.uuid4())
    biz_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()

    admin_doc = {
        "id": admin_id,
        "name": body.name.strip(),
        "username": username,
        "email": email,
        "password_hash": hash_password(body.password),
        "is_active": True,
        "created_at": now_iso,
        "updated_at": now_iso,
        "last_login_at": now_iso,
    }
    await db.admins.insert_one(admin_doc)

    biz_doc = {
        "id": biz_id,
        "name": body.business_name.strip(),
        "owner_admin_id": admin_id,
        "timezone": "Asia/Kolkata",
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    await db.businesses.insert_one(biz_doc)

    token = create_access_token(admin_id, email, biz_id)
    csrf_token = set_session_cookie(response, "access_token", token)

    return {
        "admin": {
            "id": admin_id,
            "name": admin_doc["name"],
            "username": username,
            "email": email,
            "business_id": biz_id,
            "business_name": biz_doc["name"],
        },
        "business": {k: v for k, v in biz_doc.items() if k != "_id"},
        "csrf_token": csrf_token,
    }


@app.get("/")
@api_router.get("/health")
async def root_health():
    return {
        "status": "ok",
        "service": "Ayushman Kitchen API",
        "version": "1.0.0",
        "environment": ENVIRONMENT,
        "timezone": "Asia/Kolkata",
    }


@api_router.get("/public/business")
async def get_public_business():
    """Returns business branding, logo, notice ticker and showcase boxes for the public home/landing page."""
    biz = await db.businesses.find_one({}, {"_id": 0})
    if not biz:
        return {
            "name": "Ayushman Kitchen",
            "logo_url": "",
            "notice_ticker": {
                "enabled": True,
                "badge": "LATEST ANNOUNCEMENT",
                "text": "🎉 Welcome to Ayushman Kitchen! Fresh, hygienic, and home-style nutritious meals served daily."
            },
            "showcase_boxes": []
        }
    return {
        "name": biz.get("name", "Ayushman Kitchen"),
        "logo_url": biz.get("logo_url", ""),
        "notice_ticker": biz.get("notice_ticker", {
            "enabled": True,
            "badge": "LATEST ANNOUNCEMENT",
            "text": "🎉 Welcome to Ayushman Kitchen! Fresh, hygienic, and home-style nutritious meals served daily."
        }),
        "showcase_boxes": biz.get("showcase_boxes", []),
        "meal_plans": biz.get("meal_plans", [
            {"id": "standard", "name": "Standard Plan", "price": 3300,
             "description": "Wholesome lunch & dinner daily",
             "features": ["Lunch + Dinner Daily", "Homestyle Fresh Meals", "Monthly Billing", "Student Portal Access"]},
            {"id": "premium", "name": "Premium Plan", "price": 3800,
             "description": "Premium thali with extra choices",
             "features": ["Lunch + Dinner Daily", "Premium Gourmet Thali", "Extra Dish Options", "Priority Support", "Student Portal Access"]},
        ])
    }


@app.get("/manifest.json")
@api_router.get("/public/manifest.json")
async def get_dynamic_manifest():
    """Returns dynamic PWA web app manifest with the currently uploaded business logo and name."""
    biz = await db.businesses.find_one({}, {"_id": 0})
    name = (biz or {}).get("name") or "Ayushman Kitchen"
    logo = (biz or {}).get("logo_url") or "/workforce-logo.png"

    icons = [
        {"src": logo, "sizes": "192x192 512x512", "type": "image/png", "purpose": "any maskable"},
        {"src": "/workforce-icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable"},
        {"src": "/workforce-icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable"},
    ]
    return {
        "short_name": name,
        "name": f"{name} - Cloud Kitchen Management",
        "start_url": "/",
        "display": "standalone",
        "background_color": "#102f2c",
        "theme_color": "#102f2c",
        "icons": icons
    }


@api_router.post("/admin/login")
async def admin_login(body: AdminLogin, response: Response, request: Request):
    rate_limit(request, "admin-login", 15, 60)
    ident = body.identifier.strip().lower()

    admin = await db.admins.find_one(
        {"$or": [{"email": ident}, {"username": ident}], "disabled_at": {"$in": [None, ""]}}
    )
    if not admin or admin.get("is_active") is False or not admin.get("password_hash") or not verify_password(body.password, admin["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username/email or password")

    now_iso = datetime.now(timezone.utc).isoformat()
    await db.admins.update_one({"id": admin["id"]}, {"$set": {"last_login_at": now_iso}})

    business = await get_or_create_business_for_admin(admin)
    token = create_access_token(admin["id"], admin["email"], business["id"])
    csrf_token = set_session_cookie(response, "access_token", token)

    return {
        "admin": {
            "id": admin["id"],
            "name": admin.get("name", "Admin"),
            "username": admin.get("username", ""),
            "email": admin["email"],
            "business_id": business["id"],
            "business_name": business.get("name", ""),
        },
        "business": business,
        "csrf_token": csrf_token,
    }


# ---------------- Unified Auth & Password Reset Routes ----------------
@api_router.post("/auth/forgot-password")
async def auth_forgot_password(body: ForgotPasswordRequest, request: Request):
    """Unified forgot-password endpoint for both admins and students/workers."""
    rate_limit(request, "auth-forgot-password", 10, 60)
    email = body.email.strip().lower()

    # Search admins first
    admin = await db.admins.find_one({"email": email, "disabled_at": {"$in": [None, ""]}})
    worker = None
    if not admin:
        worker = await db.workers.find_one({
            "email": email,
            "archived_at": {"$in": [None, ""]},
            "deleted_at": {"$in": [None, ""]},
        })

    user = admin or worker
    if user and user.get("is_active") is not False and user.get("status", "ACTIVE") != "INACTIVE":
        is_admin = bool(admin)
        user_id = user["id"]
        role = "admin" if is_admin else "student"
        raw_token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
        expires_at = (datetime.now(timezone.utc) + timedelta(minutes=30)).isoformat()

        # Invalidate existing unused tokens for this user
        await db.password_reset_tokens.update_many(
            {"$or": [{"user_id": user_id}, {"admin_id": user_id}, {"worker_id": user_id}], "used_at": None},
            {"$set": {"used_at": "invalidated_by_new_request"}},
        )

        await db.password_reset_tokens.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "admin_id": user_id if is_admin else None,
            "worker_id": user_id if not is_admin else None,
            "role": role,
            "token_type": "password_reset",
            "token_hash": token_hash,
            "expires_at": expires_at,
            "used_at": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

        reset_base = os.environ.get("PASSWORD_RESET_URL", "http://localhost:3000/reset-password").strip()
        encoded_token = urllib.parse.quote_plus(raw_token)
        reset_link = f"{reset_base}?token={encoded_token}"
        if not is_admin:
            reset_link += "&role=student"

        user_name = user.get("name") or ("Admin" if is_admin else "Student")
        await email_service.send_password_reset_email(email, user_name, reset_link)

    # Always return safe generic response to prevent user enumeration
    return {"message": "If an account exists for this email, a password reset link has been sent."}


@api_router.post("/auth/reset-password")
async def auth_reset_password(body: ResetPasswordRequest, request: Request):
    """Unified password reset endpoint validating secure token and updating user password."""
    rate_limit(request, "auth-reset-password", 10, 60)
    token_str = body.token.strip()
    if not token_str:
        raise HTTPException(status_code=400, detail="Reset token is required")

    if len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters long")

    token_hash = hashlib.sha256(token_str.encode("utf-8")).hexdigest()
    reset_doc = await db.password_reset_tokens.find_one({"token_hash": token_hash, "used_at": None})
    if not reset_doc:
        raise HTTPException(status_code=400, detail="Invalid or expired password reset link")

    if reset_doc.get("token_type") and reset_doc.get("token_type") != "password_reset":
        raise HTTPException(status_code=400, detail="Invalid reset token type")

    expires_at = reset_doc.get("expires_at")
    if isinstance(expires_at, str):
        try:
            expires_at = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        except ValueError:
            expires_at = None
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if not expires_at or expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Password reset link has expired. Please request a new one.")

    now_iso = datetime.now(timezone.utc).isoformat()
    new_hash = hash_password(body.new_password)

    admin_id = reset_doc.get("admin_id")
    worker_id = reset_doc.get("worker_id")
    user_id = reset_doc.get("user_id")

    if admin_id or reset_doc.get("role") == "admin":
        target_id = admin_id or user_id
        await db.admins.update_one(
            {"id": target_id},
            {"$set": {"password_hash": new_hash, "updated_at": now_iso, "password_changed_at": now_iso}},
        )
    elif worker_id or reset_doc.get("role") in {"student", "worker"}:
        target_id = worker_id or user_id
        await db.workers.update_one(
            {"id": target_id},
            {"$set": {"password_hash": new_hash, "updated_at": now_iso}},
        )
        await db.students.update_one(
            {"id": target_id},
            {"$set": {"password_hash": new_hash, "updated_at": now_iso}},
        )
        await db.worker_sessions.delete_many({"worker_id": target_id})
    elif user_id:
        if await db.admins.find_one({"id": user_id}):
            await db.admins.update_one(
                {"id": user_id},
                {"$set": {"password_hash": new_hash, "updated_at": now_iso, "password_changed_at": now_iso}},
            )
        else:
            await db.workers.update_one(
                {"id": user_id},
                {"$set": {"password_hash": new_hash, "updated_at": now_iso}},
            )
            await db.students.update_one(
                {"id": user_id},
                {"$set": {"password_hash": new_hash, "updated_at": now_iso}},
            )
            await db.worker_sessions.delete_many({"worker_id": user_id})

    await db.password_reset_tokens.update_one(
        {"id": reset_doc["id"]},
        {"$set": {"used_at": now_iso}},
    )
    return {"message": "Password reset successfully."}


@api_router.post("/admin/forgot-password")
async def admin_forgot_password(body: ForgotPasswordRequest, request: Request):
    rate_limit(request, "admin-forgot-password", 10, 60)
    email = body.email.strip().lower()

    admin = await db.admins.find_one({"email": email, "disabled_at": {"$in": [None, ""]}})
    if admin and admin.get("is_active") is not False:
        raw_token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
        expires_at = (datetime.now(timezone.utc) + timedelta(minutes=30)).isoformat()

        # Invalidate existing unused tokens for this admin
        await db.password_reset_tokens.update_many(
            {"admin_id": admin["id"], "used_at": None},
            {"$set": {"used_at": "invalidated_by_new_request"}},
        )

        await db.password_reset_tokens.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": admin["id"],
            "admin_id": admin["id"],
            "role": "admin",
            "token_type": "password_reset",
            "token_hash": token_hash,
            "expires_at": expires_at,
            "used_at": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

        reset_base = os.environ.get("PASSWORD_RESET_URL", "http://localhost:3000/reset-password").strip()
        encoded_token = urllib.parse.quote_plus(raw_token)
        reset_link = f"{reset_base}?token={encoded_token}"
        await email_service.send_password_reset_email(email, admin.get("name", "Admin"), reset_link)

    # Always return safe generic response
    return {"message": "If an account exists for this email, a reset link has been sent."}


@api_router.post("/admin/reset-password")
async def admin_reset_password(body: ResetPasswordRequest, request: Request):
    rate_limit(request, "admin-reset-password", 10, 60)
    token_str = body.token.strip()
    if not token_str:
        raise HTTPException(status_code=400, detail="Reset token is required")

    token_hash = hashlib.sha256(token_str.encode("utf-8")).hexdigest()

    reset_doc = await db.password_reset_tokens.find_one({"token_hash": token_hash, "used_at": None})
    if not reset_doc:
        raise HTTPException(status_code=400, detail="Invalid or expired password reset link")

    if reset_doc.get("token_type") and reset_doc.get("token_type") != "password_reset":
        raise HTTPException(status_code=400, detail="Invalid reset token type")

    expires_at = reset_doc.get("expires_at")
    if isinstance(expires_at, str):
        try:
            expires_at = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        except ValueError:
            expires_at = None
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if not expires_at or expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Password reset link has expired. Please request a new one.")

    now_iso = datetime.now(timezone.utc).isoformat()
    new_hash = hash_password(body.new_password)
    target_admin_id = reset_doc.get("admin_id") or reset_doc.get("user_id")

    if target_admin_id:
        await db.admins.update_one(
            {"id": target_admin_id},
            {"$set": {"password_hash": new_hash, "updated_at": now_iso, "password_changed_at": now_iso}},
        )
    await db.password_reset_tokens.update_one(
        {"id": reset_doc["id"]},
        {"$set": {"used_at": now_iso}},
    )

    return {"message": "Password successfully reset. You can now login with your new password."}


@api_router.get("/admin/me")
async def admin_me(request: Request, response: Response, admin: dict = Depends(get_current_admin)):
    # Renew the secure cookie only after a valid authenticated request.
    csrf_token = set_session_cookie(
        response,
        "access_token",
        create_access_token(admin["id"], admin["email"], admin["business_id"]),
        request.cookies.get("csrf_token"),
    )
    return {**admin, "csrf_token": csrf_token}


@api_router.put("/admin/business")
async def update_business(body: BusinessUpdate, admin: dict = Depends(get_current_admin)):
    biz_id = admin["business_id"]
    now_iso = datetime.now(timezone.utc).isoformat()
    
    update_doc = {
        "name": body.name.strip(),
        "timezone": body.timezone,
        "updated_at": now_iso,
    }
    if body.logo_url is not None:
        update_doc["logo_url"] = body.logo_url.strip()
    if body.notice_ticker is not None:
        update_doc["notice_ticker"] = body.notice_ticker
    if body.showcase_boxes is not None:
        update_doc["showcase_boxes"] = body.showcase_boxes
    if body.meal_plans is not None:
        update_doc["meal_plans"] = body.meal_plans
    if body.admin_email is not None:
        clean_email = body.admin_email.strip().lower()
        update_doc["admin_email"] = clean_email
        # Sync email to admins table so forgot-password / recovery link uses this new email
        await db.admins.update_one(
            {"id": admin["id"]},
            {"$set": {"email": clean_email, "updated_at": now_iso}}
        )

    await db.businesses.update_one(
        {"id": biz_id, "owner_admin_id": admin["id"]},
        {"$set": update_doc}
    )
    return await db.businesses.find_one({"id": biz_id}, {"_id": 0})


@api_router.post("/admin/business/upload-image")
async def upload_business_image(
    file: UploadFile = File(...),
    admin: dict = Depends(get_current_admin),
):
    """Uploads a logo or showcase box image for the business branding."""
    upload_result = await photo_storage.upload_profile_photo(file, worker_id=admin["id"])
    return {
        "url": upload_result["secure_url"],
        "public_id": upload_result["public_id"],
    }


@api_router.post("/admin/change-password")
async def admin_change_password(
    body: AdminChangePassword,
    admin: dict = Depends(get_current_admin),
):
    admin_doc = await db.admins.find_one({"id": admin["id"]})
    if not admin_doc or not admin_doc.get("password_hash") or not verify_password(body.current_password, admin_doc["password_hash"]):
        raise HTTPException(status_code=400, detail="Incorrect current password")

    now_iso = datetime.now(timezone.utc).isoformat()
    await db.admins.update_one(
        {"id": admin["id"]},
        {"$set": {"password_hash": hash_password(body.new_password), "updated_at": now_iso, "password_changed_at": now_iso}}
    )
    return {"message": "Password changed successfully"}



@api_router.post("/admin/logout")
async def admin_logout(request: Request, response: Response):
    token = request.cookies.get("access_token") or ""
    if token:
        await db.revoked_admin_tokens.update_one(
            {"token_hash": hashlib.sha256(token.encode("utf-8")).hexdigest()},
            {"$set": {"token_hash": hashlib.sha256(token.encode("utf-8")).hexdigest(), "expires_at": datetime.now(timezone.utc) + timedelta(seconds=SESSION_MAX_AGE)}},
            upsert=True,
        )
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("csrf_token", path="/")
    return {"ok": True}


# ---------------- Worker Authentication Routes ----------------
@api_router.post("/worker/login")
async def worker_login(body: WorkerLogin, response: Response, request: Request):
    rate_limit(request, "worker-login", 15, 60)
    identifier = body.login_id.strip()
    phone = normalize_indian_phone_identifier(identifier)
    base_query = {"archived_at": {"$in": [None, ""]}, "deleted_at": {"$in": [None, ""]}}
    if phone:
        # Existing data may use several phone display formats. Normalize candidates in
        # Python and refuse ambiguous matches instead of crossing tenant boundaries.
        candidates = await db.workers.find(base_query).to_list(10000)
        matches = [worker for worker in candidates if normalize_indian_phone_identifier(str(worker.get("mobile", ""))) == phone]
        if len(matches) > 1:
            raise HTTPException(status_code=401, detail="Multiple accounts found with this phone number. Please login with your Student ID.")
    else:
        matches = await db.workers.find({
            **base_query,
            "login_id": {"$regex": f"^{re.escape(identifier)}$", "$options": "i"},
        }).to_list(2)
    worker = matches[0] if len(matches) == 1 else None
    if not worker or not worker.get("portal_enabled", False) or not worker.get("password_hash") or not verify_password(body.password, worker["password_hash"]):
        raise HTTPException(
            status_code=401,
            detail="Invalid Student ID / Phone Number or Password."
        )

    if worker.get("status", "ACTIVE") == "INACTIVE":
        raise HTTPException(
            status_code=403,
            detail="Your account is currently inactive. Please contact Ayushman Kitchen management."
        )

    biz_id = worker["business_id"]
    business = await db.businesses.find_one({"id": biz_id}, {"_id": 0})

    session_token = str(uuid.uuid4())
    now_dt = datetime.now(timezone.utc)
    await db.worker_sessions.insert_one({
        "session_token": session_token,
        "worker_id": worker["id"],
        "business_id": biz_id,
        "expires_at": (now_dt + timedelta(seconds=SESSION_MAX_AGE)).isoformat(),
        "created_at": now_dt.isoformat(),
    })

    csrf_token = set_session_cookie(response, "session_token", session_token)
    clean_worker = {k: v for k, v in worker.items() if k not in {"_id", "password_hash"}}

    return {
        "user": {"user_id": worker["id"], "worker_id": worker["id"], "name": worker.get("name")},
        "worker": clean_worker,
        "business": business,
        "csrf_token": csrf_token,
    }


@api_router.get("/worker/auth/me")
@api_router.get("/worker/me")
async def worker_me(request: Request, response: Response, worker: dict = Depends(get_current_worker)):
    biz_id = worker.get("business_id")
    business = await db.businesses.find_one({"id": biz_id}, {"_id": 0}) if biz_id else None
    csrf_token = set_session_cookie(
        response,
        "session_token",
        request.cookies.get("session_token", ""),
        request.cookies.get("csrf_token"),
    )
    return {
        "user": {"user_id": worker["id"], "worker_id": worker["id"], "name": worker.get("name")},
        "worker": worker,
        "business": business,
        "csrf_token": csrf_token,
    }


@api_router.post("/worker/auth/logout")
@api_router.post("/worker/logout")
async def worker_logout(request: Request, response: Response):
    token = request.cookies.get("session_token") or ""
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if token:
        await db.worker_sessions.delete_many({"session_token": token})
    response.delete_cookie("session_token", path="/")
    response.delete_cookie("csrf_token", path="/")
    return {"ok": True}


@api_router.post("/worker/change-password")
async def worker_change_password(body: WorkerChangePassword, worker: dict = Depends(get_current_worker)):
    worker_doc = await db.workers.find_one({"id": worker["id"], "business_id": worker["business_id"]})
    if not worker_doc or not worker_doc.get("password_hash") or not verify_password(body.current_password, worker_doc["password_hash"]):
        raise HTTPException(status_code=400, detail="Incorrect current password")

    now_iso = datetime.now(timezone.utc).isoformat()
    await db.workers.update_one(
        {"id": worker["id"]},
        {"$set": {"password_hash": hash_password(body.new_password), "updated_at": now_iso}}
    )
    await db.worker_sessions.delete_many({"worker_id": worker["id"]})
    return {"message": "Password changed successfully"}


@api_router.put("/worker/me/email")
async def worker_update_email(body: WorkerSetEmail, worker: dict = Depends(get_current_worker)):
    """Allows authenticated student to set or update their registered email address."""
    email = body.email.strip().lower()
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.workers.update_one(
        {"id": worker["id"]},
        {"$set": {"email": email, "updated_at": now_iso}}
    )
    await db.students.update_one(
        {"id": worker["id"]},
        {"$set": {"email": email, "updated_at": now_iso}}
    )
    return {"message": "Email updated successfully", "email": email}


@api_router.post("/worker/forgot-password")
async def worker_forgot_password(body: WorkerForgotPasswordRequest, request: Request):
    """Sends a password reset link to student's registered email."""
    rate_limit(request, "worker-forgot-password", 10, 60)
    raw_ident = body.identifier.strip()
    phone = normalize_indian_phone_identifier(raw_ident)

    query = {"archived_at": {"$in": [None, ""]}, "deleted_at": {"$in": [None, ""]}}
    if "@" in raw_ident:
        student = await db.workers.find_one({**query, "email": raw_ident.lower()})
    elif phone:
        candidates = await db.workers.find(query).to_list(10000)
        matches = [w for w in candidates if normalize_indian_phone_identifier(str(w.get("mobile", ""))) == phone]
        student = matches[0] if len(matches) == 1 else None
    else:
        student = await db.workers.find_one({
            **query,
            "login_id": {"$regex": f"^{re.escape(raw_ident)}$", "$options": "i"},
        })

    if not student:
        raise HTTPException(
            status_code=404,
            detail="No student account found with the provided Student ID or Mobile Number."
        )

    student_email = (student.get("email") or "").strip().lower()
    if not student_email or "@" not in student_email:
        return {
            "ok": False,
            "has_email": False,
            "message": "No email is currently set for your student account. Please contact the Ayushman Kitchen mess manager to set your password or update your email address."
        }

    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=30)).isoformat()

    # Invalidate existing unused tokens for this student
    await db.password_reset_tokens.update_many(
        {"$or": [{"worker_id": student["id"]}, {"user_id": student["id"]}], "used_at": None},
        {"$set": {"used_at": "invalidated_by_new_request"}},
    )

    await db.password_reset_tokens.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": student["id"],
        "worker_id": student["id"],
        "role": "student",
        "token_type": "password_reset",
        "token_hash": token_hash,
        "expires_at": expires_at,
        "used_at": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    reset_base = os.environ.get("PASSWORD_RESET_URL", "http://localhost:3000/reset-password").strip()
    encoded_token = urllib.parse.quote_plus(raw_token)
    reset_link = f"{reset_base}?token={encoded_token}&role=student"
    await email_service.send_password_reset_email(student_email, student.get("name", "Student"), reset_link)

    masked_email = f"{student_email[:3]}***@{student_email.split('@')[-1]}"
    return {
        "ok": True,
        "has_email": True,
        "masked_email": masked_email,
        "message": f"Password reset link has been sent to your registered email ({masked_email})."
    }


@api_router.post("/worker/reset-password")
async def worker_reset_password(body: ResetPasswordRequest, request: Request):
    rate_limit(request, "worker-reset-password", 10, 60)
    token_str = body.token.strip()
    if not token_str:
        raise HTTPException(status_code=400, detail="Reset token is required")

    token_hash = hashlib.sha256(token_str.encode("utf-8")).hexdigest()

    reset_doc = await db.password_reset_tokens.find_one({"token_hash": token_hash, "used_at": None})
    target_worker_id = reset_doc.get("worker_id") or reset_doc.get("user_id") if reset_doc else None
    if not reset_doc or not target_worker_id:
        raise HTTPException(status_code=400, detail="Invalid or expired password reset link")

    if reset_doc.get("token_type") and reset_doc.get("token_type") != "password_reset":
        raise HTTPException(status_code=400, detail="Invalid reset token type")

    expires_at = reset_doc.get("expires_at")
    if isinstance(expires_at, str):
        try:
            expires_at = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        except ValueError:
            expires_at = None
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if not expires_at or expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Password reset link has expired (valid for 30 mins)")

    now_iso = datetime.now(timezone.utc).isoformat()
    new_hash = hash_password(body.new_password)
    await db.workers.update_one(
        {"id": target_worker_id},
        {"$set": {"password_hash": new_hash, "updated_at": now_iso}}
    )
    await db.students.update_one(
        {"id": target_worker_id},
        {"$set": {"password_hash": new_hash, "updated_at": now_iso}}
    )
    await db.password_reset_tokens.update_one(
        {"id": reset_doc["id"]},
        {"$set": {"used_at": now_iso}}
    )
    await db.worker_sessions.delete_many({"worker_id": target_worker_id})
    return {"message": "Student password reset successfully. You can now login with your new password."}


# ---------------- Business Work Types (Admin Isolated) ----------------
DEFAULT_WORK_TYPES = ("Standard", "Premium")


def normalize_work_type(name: str) -> str:
    return " ".join((name or "").split()).casefold()


def clean_work_type_document(document: dict | None) -> dict | None:
    """Return the public Work Type shape without MongoDB's private ObjectId."""
    if not document:
        return None
    return {
        "id": document.get("id"),
        "name": document.get("name"),
        "normalized_name": document.get("normalized_name"),
        "is_active": document.get("is_active", True),
        "created_at": document.get("created_at"),
        "updated_at": document.get("updated_at"),
    }


async def ensure_default_work_types(business_id: str) -> None:
    """Idempotently provide useful choices without touching worker records."""
    now = datetime.now(timezone.utc).isoformat()
    for name in DEFAULT_WORK_TYPES:
        await db.work_types.update_one(
            {"business_id": business_id, "normalized_name": normalize_work_type(name)},
            {"$setOnInsert": {"id": str(uuid.uuid4()), "business_id": business_id, "name": name,
                              "normalized_name": normalize_work_type(name), "is_active": True,
                              "created_at": now, "updated_at": now}},
            upsert=True,
        )


async def require_active_work_type(business_id: str, name: str) -> None:
    await ensure_default_work_types(business_id)
    work_type = await db.work_types.find_one({
        "business_id": business_id, "normalized_name": normalize_work_type(name), "is_active": True,
    })
    if not work_type:
        raise HTTPException(status_code=422, detail="Select an active Work Type or add a new one first")


@api_router.get("/work-types")
async def list_work_types(include_inactive: bool = False, admin: dict = Depends(get_current_admin)):
    biz_id = admin["business_id"]
    await ensure_default_work_types(biz_id)
    query = {"business_id": biz_id}
    if not include_inactive:
        query["is_active"] = True
    documents = await db.work_types.find(query, {"_id": 0}).sort("name", 1).to_list(200)
    return [clean_work_type_document(document) for document in documents]


@api_router.post("/work-types")
async def create_work_type(body: WorkTypeCreate, admin: dict = Depends(get_current_admin)):
    biz_id = admin["business_id"]
    await ensure_default_work_types(biz_id)
    normalized = normalize_work_type(body.name)
    if await db.work_types.find_one({"business_id": biz_id, "normalized_name": normalized}):
        raise HTTPException(status_code=409, detail="This Work Type already exists.")
    now = datetime.now(timezone.utc).isoformat()
    doc = {"id": str(uuid.uuid4()), "business_id": biz_id, "name": body.name,
           "normalized_name": normalized, "is_active": True, "created_at": now, "updated_at": now}
    try:
        await db.work_types.insert_one(doc)
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=409, detail="This Work Type already exists.") from exc
    return clean_work_type_document(doc)


@api_router.put("/work-types/{work_type_id}")
async def update_work_type(work_type_id: str, body: WorkTypeUpdate, admin: dict = Depends(get_current_admin)):
    biz_id = admin["business_id"]
    current = await db.work_types.find_one({"id": work_type_id, "business_id": biz_id})
    if not current:
        raise HTTPException(status_code=404, detail="Work Type not found")
    update = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if body.name is not None:
        normalized = normalize_work_type(body.name)
        duplicate = await db.work_types.find_one({"business_id": biz_id, "normalized_name": normalized, "id": {"$ne": work_type_id}})
        if duplicate:
            raise HTTPException(status_code=409, detail="This Work Type already exists.")
        update.update({"name": body.name, "normalized_name": normalized})
    if body.is_active is not None:
        update["is_active"] = body.is_active
    await db.work_types.update_one({"id": work_type_id, "business_id": biz_id}, {"$set": update})
    document = await db.work_types.find_one({"id": work_type_id, "business_id": biz_id}, {"_id": 0})
    return clean_work_type_document(document)


@api_router.delete("/work-types/{work_type_id}")
async def delete_work_type(work_type_id: str, admin: dict = Depends(get_current_admin)):
    biz_id = admin["business_id"]
    current = await db.work_types.find_one({"id": work_type_id, "business_id": biz_id})
    if not current:
        raise HTTPException(status_code=404, detail="Work Type not found")
    assigned = await db.workers.count_documents({"business_id": biz_id, "work_type": {"$regex": f"^{re.escape(current['name'])}$", "$options": "i"}})
    if assigned:
        raise HTTPException(status_code=409, detail=f"Cannot delete this Work Type because {assigned} workers are using it. Deactivate it instead.")
    await db.work_types.delete_one({"id": work_type_id, "business_id": biz_id})
    return {"ok": True}


# ---------------- Worker CRUD & Management (Admin Isolated) ----------------
@api_router.get("/workers")
async def list_workers(
    search: str = "",
    status: str = "ALL",
    limit: int = 100,
    skip: int = 0,
    admin: dict = Depends(get_current_admin),
):
    biz_id = admin["business_id"]
    limit = min(max(limit, 1), 500)
    q: dict[str, Any] = {"business_id": biz_id}

    if status.upper() in {"ACTIVE", "INACTIVE"}:
        q["status"] = status.upper()

    if search.strip():
        safe = re.escape(search.strip())
        q["$or"] = [{k: {"$regex": safe, "$options": "i"}} for k in ("name", "mobile", "email", "work_type", "login_id")]

    return await db.workers.find(q, {"_id": 0, "password_hash": 0}).sort("created_at", -1).skip(max(skip, 0)).to_list(limit)


@api_router.post("/workers")
async def create_worker(body: WorkerCreate, admin: dict = Depends(get_current_admin)):
    biz_id = admin["business_id"]
    doc = body.model_dump()
    await require_active_work_type(biz_id, doc["work_type"])
    doc["email"] = (doc.get("email") or "").strip().lower()
    doc["status"] = (doc.get("status") or "ACTIVE").strip().upper()

    # Check duplicates within business
    dup_or = []
    if doc.get("mobile"):
        dup_or.append({"mobile": doc["mobile"]})
    if doc.get("email"):
        dup_or.append({"email": doc["email"]})
    if doc.get("portal_enabled") and doc.get("login_id"):
        dup_or.append({"login_id": doc["login_id"]})

    if dup_or:
        existing = await db.workers.find_one({"business_id": biz_id, "$or": dup_or})
        if existing:
            if doc.get("mobile") and existing.get("mobile") == doc["mobile"]:
                raise HTTPException(status_code=409, detail="A worker with this mobile number already exists in your workspace")
            if doc.get("email") and existing.get("email") == doc["email"]:
                raise HTTPException(status_code=409, detail="A worker with this email address already exists in your workspace")
            if doc.get("login_id") and existing.get("login_id") == doc["login_id"]:
                raise HTTPException(status_code=409, detail="A worker with this Worker ID already exists in your workspace")

    raw_pwd = (doc.pop("password", "") or "").strip()
    if doc.get("portal_enabled") and len(raw_pwd) < 6:
        raise HTTPException(status_code=422, detail="A password of at least 6 characters is required when Worker Login is enabled")
    if not doc.get("portal_enabled"):
        doc["login_id"] = None

    # If portal enabled but no login_id provided, generate unique Worker ID
    if doc.get("portal_enabled") and not doc.get("login_id"):
        for _ in range(10):
            cand = generate_unique_worker_id()
            if not await db.workers.find_one({"business_id": biz_id, "login_id": cand}):
                doc["login_id"] = cand
                break
        if not doc.get("login_id"):
            raise HTTPException(status_code=503, detail="Could not generate a unique Worker ID. Please try again.")

    if doc.get("portal_enabled") and raw_pwd:
        doc["password_hash"] = hash_password(raw_pwd)
    else:
        doc["password_hash"] = None

    doc["id"] = str(uuid.uuid4())
    doc["business_id"] = biz_id
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    doc["updated_at"] = doc["created_at"]

    try:
        await db.workers.insert_one(doc)
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=409, detail="Worker ID already exists. Generate another Worker ID and try again.") from exc
    result = clean_worker_document(doc)
    if doc.get("portal_enabled"):
        result["one_time_credentials"] = {"login_id": doc["login_id"], "password": raw_pwd}
    return result


@api_router.put("/workers/{worker_id}")
async def update_worker(worker_id: str, body: WorkerUpdate, admin: dict = Depends(get_current_admin)):
    biz_id = admin["business_id"]
    current_worker = await db.workers.find_one({"id": worker_id, "business_id": biz_id})
    if not current_worker:
        raise HTTPException(status_code=404, detail="Worker not found")

    update_data = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if "work_type" in update_data and normalize_work_type(update_data["work_type"]) != normalize_work_type(current_worker.get("work_type", "")):
        await require_active_work_type(biz_id, update_data["work_type"])
    if "email" in update_data:
        update_data["email"] = (update_data["email"] or "").strip().lower()
    if "status" in update_data:
        update_data["status"] = (update_data["status"] or "ACTIVE").strip().upper()

    # Duplicate check excluding this worker
    dup_or = []
    if update_data.get("mobile"):
        dup_or.append({"mobile": update_data["mobile"]})
    if update_data.get("email"):
        dup_or.append({"email": update_data["email"]})
    if update_data.get("login_id"):
        dup_or.append({"login_id": update_data["login_id"]})

    if dup_or:
        existing = await db.workers.find_one({"business_id": biz_id, "id": {"$ne": worker_id}, "$or": dup_or})
        if existing:
            if update_data.get("mobile") and existing.get("mobile") == update_data["mobile"]:
                raise HTTPException(status_code=409, detail="Another worker already uses this mobile number")
            if update_data.get("email") and existing.get("email") == update_data["email"]:
                raise HTTPException(status_code=409, detail="Another worker already uses this email address")
            if update_data.get("login_id") and existing.get("login_id") == update_data["login_id"]:
                raise HTTPException(status_code=409, detail="Another worker already uses this Worker ID")

    # Portal enablement logic
    portal_on = update_data.get("portal_enabled", current_worker.get("portal_enabled", False))
    if portal_on and not update_data.get("login_id") and not current_worker.get("login_id"):
        for _ in range(10):
            cand = generate_unique_worker_id()
            if not await db.workers.find_one({"business_id": biz_id, "login_id": cand}):
                update_data["login_id"] = cand
                break
        if not update_data.get("login_id"):
            raise HTTPException(status_code=503, detail="Could not generate a unique Worker ID. Please try again.")

    # Password update
    raw_pwd = (update_data.pop("password", None) or "").strip()
    enabling_portal = portal_on and not current_worker.get("portal_enabled", False)
    if enabling_portal and not raw_pwd:
        raise HTTPException(status_code=422, detail="Generate or enter a temporary password to enable Worker Login")
    if raw_pwd and len(raw_pwd) < 6:
        raise HTTPException(status_code=422, detail="Worker password must be at least 6 characters")
    if raw_pwd:
        update_data["password_hash"] = hash_password(raw_pwd)

    # Invalidate sessions if deactivated or portal disabled
    if update_data.get("status") == "INACTIVE" or update_data.get("portal_enabled") is False or raw_pwd:
        await db.worker_sessions.delete_many({"worker_id": worker_id})

    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    try:
        await db.workers.update_one({"id": worker_id, "business_id": biz_id}, {"$set": update_data})
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=409, detail="Worker ID already exists. Generate another Worker ID and try again.") from exc
    result = await db.workers.find_one({"id": worker_id, "business_id": biz_id}, {"_id": 0, "password_hash": 0})
    if portal_on and raw_pwd:
        result["one_time_credentials"] = {"login_id": result["login_id"], "password": raw_pwd}
    return result


@api_router.patch("/workers/{worker_id}/status")
async def set_worker_status(worker_id: str, body: WorkerStatusUpdate, admin: dict = Depends(get_current_admin)):
    biz_id = admin["business_id"]
    worker = await db.workers.find_one({"id": worker_id, "business_id": biz_id})
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")

    new_status = body.status
    now_iso = datetime.now(timezone.utc).isoformat()

    if new_status == "INACTIVE":
        await db.worker_sessions.delete_many({"worker_id": worker_id})

    await db.workers.update_one(
        {"id": worker_id, "business_id": biz_id},
        {"$set": {"status": new_status, "updated_at": now_iso}}
    )
    return await db.workers.find_one({"id": worker_id, "business_id": biz_id}, {"_id": 0, "password_hash": 0})


@api_router.post("/workers/{worker_id}/reset-password")
async def reset_worker_password_by_admin(
    worker_id: str,
    body: WorkerResetPasswordAdmin,
    admin: dict = Depends(get_current_admin),
):
    biz_id = admin["business_id"]
    worker = await db.workers.find_one({"id": worker_id, "business_id": biz_id})
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")

    now_iso = datetime.now(timezone.utc).isoformat()
    login_id = worker.get("login_id")
    if not login_id:
        for _ in range(10):
            cand = generate_unique_worker_id()
            if not await db.workers.find_one({"business_id": biz_id, "login_id": cand}):
                login_id = cand
                break

    await db.workers.update_one(
        {"id": worker_id, "business_id": biz_id},
        {
            "$set": {
                "password_hash": hash_password(body.new_password),
                "portal_enabled": True,
                "login_id": login_id,
                "updated_at": now_iso,
            }
        }
    )
    await db.worker_sessions.delete_many({"worker_id": worker_id})
    return {
        "message": "Student password updated successfully",
        "worker_id": worker_id,
        "login_id": login_id,
        "one_time_credentials": {"login_id": login_id, "password": body.new_password},
    }


@api_router.get("/workers/photos/{filename}")
async def serve_worker_photo(filename: str):
    """Safely serves locally stored profile photos."""
    safe_name = os.path.basename(filename)
    if not safe_name or safe_name != filename:
        raise HTTPException(status_code=400, detail="Invalid photo filename")
    photo_path = PHOTO_UPLOAD_DIR / safe_name
    if not photo_path.is_file():
        raise HTTPException(status_code=404, detail="Profile photo not found")
    media_type = "image/jpeg"
    if safe_name.lower().endswith(".png"):
        media_type = "image/png"
    elif safe_name.lower().endswith(".webp"):
        media_type = "image/webp"
    return FileResponse(
        path=photo_path,
        media_type=media_type,
        headers={"Cache-Control": "public, max-age=86400"},
    )


@api_router.post("/workers/{worker_id}/profile-photo")
async def upload_worker_profile_photo(
    worker_id: str,
    file: UploadFile = File(...),
    admin: dict = Depends(get_current_admin),
):
    """Uploads/updates a profile photo for a worker within the admin's business."""
    biz_id = admin["business_id"]
    worker = await db.workers.find_one({"id": worker_id, "business_id": biz_id})
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")

    # If the worker already has a photo asset, delete it safely
    old_asset = worker.get("profile_photo_asset_id")
    if old_asset:
        await photo_storage.delete_profile_photo(worker)

    upload_result = await photo_storage.upload_profile_photo(file, worker_id=worker_id)
    now_iso = datetime.now(timezone.utc).isoformat()

    update_data = {
        "profile_photo_url": upload_result["secure_url"],
        "profile_photo_asset_id": upload_result["public_id"],
        "profile_photo_provider": upload_result["storage_provider"],
        "profile_photo_updated_at": now_iso,
        "updated_at": now_iso,
    }

    await db.workers.update_one(
        {"id": worker_id, "business_id": biz_id},
        {"$set": update_data},
    )

    updated_worker = await db.workers.find_one(
        {"id": worker_id, "business_id": biz_id},
        {"_id": 0, "password_hash": 0},
    )
    return clean_worker_document(updated_worker)


@api_router.delete("/workers/{worker_id}/profile-photo")
async def remove_worker_profile_photo(
    worker_id: str,
    admin: dict = Depends(get_current_admin),
):
    """Removes a worker's profile photo while preserving history and records."""
    biz_id = admin["business_id"]
    worker = await db.workers.find_one({"id": worker_id, "business_id": biz_id})
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")

    if worker.get("profile_photo_asset_id"):
        await photo_storage.delete_profile_photo(worker)

    now_iso = datetime.now(timezone.utc).isoformat()
    await db.workers.update_one(
        {"id": worker_id, "business_id": biz_id},
        {
            "$unset": {
                "profile_photo_url": "",
                "profile_photo_asset_id": "",
                "profile_photo_provider": "",
                "profile_photo_updated_at": "",
            },
            "$set": {"updated_at": now_iso},
        },
    )

    updated_worker = await db.workers.find_one(
        {"id": worker_id, "business_id": biz_id},
        {"_id": 0, "password_hash": 0},
    )
    return clean_worker_document(updated_worker)


@api_router.delete("/workers/{worker_id}")
async def delete_worker(worker_id: str, admin: dict = Depends(get_current_admin)):
    biz_id = admin["business_id"]
    worker = await db.workers.find_one({"id": worker_id, "business_id": biz_id})
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")

    if worker.get("profile_photo_asset_id"):
        await photo_storage.delete_profile_photo(worker)

    await db.workers.delete_one({"id": worker_id, "business_id": biz_id})
    await db.worker_sessions.delete_many({"worker_id": worker_id})
    await db.attendance.delete_many({"worker_id": worker_id, "business_id": biz_id})
    await db.payments.delete_many({"worker_id": worker_id, "business_id": biz_id})
    await db.extra_work.delete_many({"worker_id": worker_id, "business_id": biz_id})
    await db.conversations.delete_many({"worker_id": worker_id, "business_id": biz_id})
    await db.messages.delete_many({"worker_id": worker_id, "business_id": biz_id})
    return {"ok": True}


# ---------------- Attendance (Admin - Business Isolated) ----------------
@api_router.post("/attendance")
async def mark_attendance(body: AttendanceMark, admin: dict = Depends(get_current_admin)):
    biz_id = admin["business_id"]
    
    # Validate date is past or today in Asia/Kolkata
    try:
        validate_past_or_today(body.date)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    worker = await db.workers.find_one({"id": body.worker_id, "business_id": biz_id})
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found in your workspace")

    await db.attendance.update_one(
        {"business_id": biz_id, "worker_id": body.worker_id, "date": body.date},
        {
            "$set": {
                "status": body.status,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
            "$setOnInsert": {
                "id": str(uuid.uuid4()),
                "business_id": biz_id,
            }
        },
        upsert=True,
    )
    return await db.attendance.find_one(
        {"business_id": biz_id, "worker_id": body.worker_id, "date": body.date},
        {"_id": 0}
    )


@api_router.get("/attendance")
async def get_attendance(
    date: Optional[str] = None,
    worker_id: Optional[str] = None,
    admin: dict = Depends(get_current_admin),
):
    biz_id = admin["business_id"]
    q = {"business_id": biz_id}
    if date:
        q["date"] = date
    if worker_id:
        q["worker_id"] = worker_id
    return await db.attendance.find(q, {"_id": 0}).sort("date", -1).to_list(5000)


@api_router.get("/workers/{worker_id}/attendance/month")
async def get_worker_month_attendance(
    worker_id: str,
    year: int = Query(..., ge=1900, le=2100),
    month: int = Query(..., ge=1, le=12),
    admin: dict = Depends(get_current_admin),
):
    """
    Returns monthly attendance calendar data and authoritative summary for a worker.
    Strictly scoped to the authenticated admin's business.
    """
    biz_id = admin["business_id"]
    worker = await db.workers.find_one({"id": worker_id, "business_id": biz_id}, {"_id": 0, "password_hash": 0})
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found in your workspace")

    prefix = f"{year:04d}-{month:02d}-"
    attendance_records = await db.attendance.find(
        {"business_id": biz_id, "worker_id": worker_id, "date": {"$regex": f"^{prefix}"}},
        {"_id": 0},
    ).to_list(100)

    result = PayrollService.calculate_worker_month_attendance(
        worker=worker,
        attendance_records=attendance_records,
        year=year,
        month=month,
        today_date_str=get_today_date(),
    )
    result["worker"] = clean_worker_document(worker)
    return result


@api_router.get("/workers/{worker_id}/salary-slip")
async def get_worker_salary_slip_pdf(
    worker_id: str,
    year: int = Query(..., ge=1900, le=2100),
    month: int = Query(..., ge=1, le=12),
    admin: dict = Depends(get_current_admin),
):
    """
    Generates and streams an authoritative Salary Slip PDF for a worker.
    Strictly scoped to the authenticated admin's business.
    """
    biz_id = admin["business_id"]
    worker = await db.workers.find_one({"id": worker_id, "business_id": biz_id}, {"_id": 0, "password_hash": 0})
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found in your workspace")

    business = await db.businesses.find_one({"id": biz_id}, {"_id": 0})

    prefix = f"{year:04d}-{month:02d}-"
    m_start = f"{prefix}01"
    if month == 12:
        m_end = f"{year + 1:04d}-01-01"
    else:
        m_end = f"{year:04d}-{month + 1:02d}-01"

    attendance_records = await db.attendance.find(
        {"business_id": biz_id, "worker_id": worker_id, "date": {"$regex": f"^{prefix}"}},
        {"_id": 0},
    ).sort("date", 1).to_list(100)

    payments = await db.payments.find(
        {"business_id": biz_id, "worker_id": worker_id, "deleted_at": None, "date": {"$gte": m_start, "$lt": m_end}},
        {"_id": 0},
    ).sort("date", 1).to_list(500)

    extra_work = await db.extra_work.find(
        {"business_id": biz_id, "worker_id": worker_id, "deleted_at": None, "date": {"$gte": m_start, "$lt": m_end}},
        {"_id": 0},
    ).sort("date", 1).to_list(500)

    summary = PayrollService.calculate_worker_month_summary(
        worker=worker,
        attendance_list=attendance_records,
        payments_list=payments,
        extra_work_list=extra_work,
        date_str=m_start,
    )

    attendance_summary = PayrollService.calculate_worker_month_attendance(
        worker=worker,
        attendance_records=attendance_records,
        year=year,
        month=month,
        today_date_str=get_today_date(),
    )

    pdf_bytes = generate_salary_slip_pdf(
        worker=worker,
        business=business,
        summary=summary,
        attendance_summary=attendance_summary.get("summary", {}),
        year=year,
        month=month,
        recent_payments=payments,
    )

    month_names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
    m_name = month_names[month - 1] if 1 <= month <= 12 else str(month)
    safe_worker_name = sanitize_filename(worker.get("name", "Worker"))
    filename = f"WorkForce_Salary_Slip_{safe_worker_name}_{m_name}_{year}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store, private",
        },
    )



# ---------------- Payments & Advances (Admin - Business Isolated) ----------------
@api_router.post("/payments")
async def create_payment(body: PaymentCreate, admin: dict = Depends(get_current_admin)):
    biz_id = admin["business_id"]
    worker = await db.workers.find_one({"id": body.worker_id, "business_id": biz_id})
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found in your workspace")
    try:
        validate_past_or_today(body.date)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    doc = body.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["business_id"] = biz_id
    doc["created_by"] = admin["id"]
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    doc["updated_at"] = doc["created_at"]
    doc["deleted_at"] = None
    
    await db.payments.insert_one(doc)
    doc.pop("_id", None)

    amt = doc.get("amount", 0)
    wname = worker.get("name", "Student")
    asyncio.create_task(deliver_student_push(
        business_id=biz_id,
        worker_id=body.worker_id,
        title="💳 Payment Added - Ayushman Kitchen",
        body=f"Hello {wname}, payment of ₹{amt:,.0f} has been recorded for your mess account.",
        url="/student",
        tag=f"payment-{doc['id']}"
    ))

    return doc


@api_router.get("/payments")
async def list_payments(
    worker_id: Optional[str] = None,
    limit: int = 200,
    skip: int = 0,
    admin: dict = Depends(get_current_admin),
):
    biz_id = admin["business_id"]
    q = {"business_id": biz_id, "deleted_at": None}
    if worker_id:
        q["worker_id"] = worker_id
    return await db.payments.find(q, {"_id": 0}).sort("date", -1).skip(max(skip, 0)).to_list(min(max(limit, 1), 500))


@api_router.put("/payments/{payment_id}")
async def update_payment(payment_id: str, body: PaymentUpdate, admin: dict = Depends(get_current_admin)):
    biz_id = admin["business_id"]
    payment = await db.payments.find_one({"id": payment_id, "business_id": biz_id, "deleted_at": None})
    if not payment:
        raise HTTPException(status_code=404, detail="Payment transaction not found")

    update_fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if not update_fields:
        return payment

    if "date" in update_fields:
        try:
            validate_past_or_today(update_fields["date"])
        except (ValueError, TypeError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    if "type" in update_fields and update_fields["type"] not in {"SALARY_PAYMENT", "ADVANCE", "EXTRA_WORK_PAYMENT", "ADJUSTMENT"}:
        raise HTTPException(status_code=400, detail="Invalid transaction type")
    update_fields["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_fields["updated_by"] = admin["id"]
    await db.payments.update_one({"id": payment_id, "business_id": biz_id}, {"$set": update_fields})
    return await db.payments.find_one({"id": payment_id, "business_id": biz_id}, {"_id": 0})


@api_router.delete("/payments/{payment_id}")
async def delete_payment(payment_id: str, admin: dict = Depends(get_current_admin)):
    biz_id = admin["business_id"]
    payment = await db.payments.find_one({"id": payment_id, "business_id": biz_id, "deleted_at": None})
    if not payment:
        raise HTTPException(status_code=404, detail="Payment transaction not found")

    # Soft-delete for financial audit trail
    await db.payments.update_one(
        {"id": payment_id, "business_id": biz_id},
        {"$set": {"deleted_at": datetime.now(timezone.utc).isoformat(), "updated_by": admin["id"], "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"ok": True, "message": "Transaction soft-deleted"}


# ---------------- Extra Work (Admin - Business Isolated) ----------------
@api_router.post("/extra-work")
async def create_extra_work(body: ExtraWorkCreate, admin: dict = Depends(get_current_admin)):
    biz_id = admin["business_id"]
    worker = await db.workers.find_one({"id": body.worker_id, "business_id": biz_id})
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found in your workspace")
    
    doc = body.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["business_id"] = biz_id
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    doc["deleted_at"] = None
    
    await db.extra_work.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/extra-work")
async def list_extra_work(
    worker_id: Optional[str] = None,
    limit: int = 200,
    skip: int = 0,
    admin: dict = Depends(get_current_admin),
):
    biz_id = admin["business_id"]
    q = {"business_id": biz_id, "deleted_at": None}
    if worker_id:
        q["worker_id"] = worker_id
    return await db.extra_work.find(q, {"_id": 0}).sort("date", -1).skip(max(skip, 0)).to_list(min(max(limit, 1), 500))


# ---------------- Summary & Dashboard Endpoints ----------------
async def calculate_summary_for_worker(worker: dict, biz_id: str, date_str: Optional[str] = None) -> dict:
    wid = worker["id"]
    att = await db.attendance.find({"business_id": biz_id, "worker_id": wid}, {"_id": 0}).to_list(5000)
    payments = await db.payments.find({"business_id": biz_id, "worker_id": wid, "deleted_at": None}, {"_id": 0}).to_list(5000)
    extra = await db.extra_work.find({"business_id": biz_id, "worker_id": wid, "deleted_at": None}, {"_id": 0}).to_list(5000)
    return PayrollService.calculate_worker_month_summary(worker, att, payments, extra, date_str=date_str)


@api_router.get("/workers/{worker_id}/summary")
async def get_worker_summary(worker_id: str, admin: dict = Depends(get_current_admin)):
    biz_id = admin["business_id"]
    worker = await db.workers.find_one({"id": worker_id, "business_id": biz_id}, {"_id": 0})
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")
    return await calculate_summary_for_worker(worker, biz_id)


@api_router.get("/workers/{worker_id}/details")
async def get_worker_full_details(worker_id: str, admin: dict = Depends(get_current_admin)):
    """Provides full data for Owner's Worker View display mode."""
    biz_id = admin["business_id"]
    worker = await db.workers.find_one({"id": worker_id, "business_id": biz_id}, {"_id": 0})
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")
    
    attendance = await db.attendance.find({"business_id": biz_id, "worker_id": worker_id}, {"_id": 0}).sort("date", -1).to_list(5000)
    payments = await db.payments.find({"business_id": biz_id, "worker_id": worker_id, "deleted_at": None}, {"_id": 0}).sort("date", -1).to_list(5000)
    extra = await db.extra_work.find({"business_id": biz_id, "worker_id": worker_id, "deleted_at": None}, {"_id": 0}).sort("date", -1).to_list(5000)
    summary = await calculate_summary_for_worker(worker, biz_id)
    
    # Check if worker portal is enabled
    is_connected = bool(worker.get("portal_enabled"))

    return {
        "worker": worker,
        "connected": is_connected,
        "attendance": attendance,
        "payments": payments,
        "extra_work": extra,
        "summary": summary,
    }


@api_router.get("/admin/stats")
async def admin_stats(admin: dict = Depends(get_current_admin)):
    biz_id = admin["business_id"]
    workers = await db.workers.find({"business_id": biz_id}, {"_id": 0}).to_list(1000)
    today = get_today_date()
    yesterday = get_yesterday_date()
    
    m_start, m_end, _, _ = get_month_bounds(today)
    attendance, payments, extra_works = await asyncio.gather(
        db.attendance.find({"business_id": biz_id, "date": {"$gte": m_start, "$lt": m_end}}, {"_id": 0}).to_list(50000),
        db.payments.find({"business_id": biz_id, "deleted_at": None}, {"_id": 0}).to_list(10000),
        db.extra_work.find({"business_id": biz_id, "deleted_at": None}, {"_id": 0}).to_list(10000),
    )
    att_today = [item for item in attendance if item.get("date") == today]
    month_payments = [p for p in payments if m_start <= p.get("date", "") < m_end]
    month_extra = [e for e in extra_works if m_start <= e.get("date", "") < m_end]

    total_monthly_salary = sum(float(w.get("salary", 0) or 0) for w in workers)
    
    present = sum(1 for a in att_today if a["status"] == "Present")
    half = sum(1 for a in att_today if a["status"] == "Half Day")
    absent = sum(1 for a in att_today if a["status"] == "Absent")
    marked_workers = {a["worker_id"] for a in att_today}
    not_marked = len([w for w in workers if w["id"] not in marked_workers])

    attendance_by_worker: dict[str, list[dict]] = defaultdict(list)
    payments_by_worker: dict[str, list[dict]] = defaultdict(list)
    extra_work_by_worker: dict[str, list[dict]] = defaultdict(list)
    for item in attendance:
        attendance_by_worker[item.get("worker_id", "")].append(item)
    for item in payments:
        payments_by_worker[item.get("worker_id", "")].append(item)
    for item in extra_works:
        extra_work_by_worker[item.get("worker_id", "")].append(item)

    # Reuse the canonical payroll service with batched, tenant-scoped records.
    earned_salary_month = 0.0
    for w in workers:
        s = PayrollService.calculate_worker_month_summary(
            w,
            attendance_by_worker.get(w["id"], []),
            payments_by_worker.get(w["id"], []),
            extra_work_by_worker.get(w["id"], []),
            date_str=today,
        )
        earned_salary_month += s["earned_salary"]

    salary_paid_month = sum(float(p.get("amount", 0)) for p in month_payments if p.get("type", "SALARY_PAYMENT") == "SALARY_PAYMENT")
    advances_month = sum(float(p.get("amount", 0)) for p in month_payments if p.get("type") == "ADVANCE")
    extra_work_paid_month = sum(float(p.get("amount", 0)) for p in month_payments if p.get("type") == "EXTRA_WORK_PAYMENT")
    adjustments_month = sum(float(p.get("amount", 0)) for p in month_payments if p.get("type") == "ADJUSTMENT")
    total_paid_month = salary_paid_month + advances_month + extra_work_paid_month + adjustments_month
    extra_earned_month = sum(float(e.get("amount", 0)) for e in month_extra)
    gross_earned_month = earned_salary_month + extra_earned_month
    remaining_payable = max(0.0, gross_earned_month - total_paid_month)
    today_payments = sum(float(p.get("amount", 0) or 0) for p in month_payments if p.get("date") == today)

    month_trend = {}
    for item in attendance:
        day = item.get("date")
        if not day:
            continue
        point = month_trend.setdefault(day, {"date": day, "present": 0, "absent": 0, "half_day": 0})
        if item.get("status") == "Present":
            point["present"] += 1
        elif item.get("status") == "Absent":
            point["absent"] += 1
        elif item.get("status") == "Half Day":
            point["half_day"] += 1

    worker_names = {worker["id"]: worker.get("name", "Worker") for worker in workers}
    activity = []
    for item in att_today:
        activity.append({
            "kind": "attendance", "worker_name": worker_names.get(item.get("worker_id"), "Worker"),
            "status": item.get("status"), "date": item.get("date"), "time": item.get("updated_at") or item.get("date"),
        })
    for item in month_payments:
        activity.append({
            "kind": "payment", "worker_name": worker_names.get(item.get("worker_id"), "Worker"),
            "amount": float(item.get("amount", 0) or 0), "payment_type": item.get("type", "SALARY_PAYMENT"),
            "date": item.get("date"), "time": item.get("updated_at") or item.get("created_at") or item.get("date"),
        })
    for item in month_extra:
        activity.append({
            "kind": "extra_work", "worker_name": worker_names.get(item.get("worker_id"), "Worker"),
            "amount": float(item.get("amount", 0) or 0), "description": item.get("description", "Extra work"),
            "date": item.get("date"), "time": item.get("created_at") or item.get("date"),
        })
    activity.sort(key=lambda item: item.get("time") or "", reverse=True)

    return {
        "total_workers": len(workers),
        "present_today": present,
        "half_day_today": half,
        "absent_today": absent,
        "not_marked_today": not_marked,
        "today_date": today,
        "yesterday_date": yesterday,
        "total_monthly_salary": total_monthly_salary,
        "earned_salary_month": round(earned_salary_month, 2),
        "gross_earned_month": round(gross_earned_month, 2),
        "paid_this_month": round(salary_paid_month, 2),
        "advances_this_month": round(advances_month, 2),
        "adjustments_this_month": round(adjustments_month, 2),
        "total_paid_month": round(total_paid_month, 2),
        "remaining_this_month": round(remaining_payable, 2),
        "remaining_payable": round(remaining_payable, 2),
        "today_payments": round(today_payments, 2),
        "payment_count_this_month": len(month_payments),
        "extra_work_paid_this_month": round(extra_work_paid_month, 2),
        "attendance_rate": round(((present + (half * 0.5)) / len(workers) * 100) if workers else 0, 1),
        "monthly_attendance": [month_trend[key] for key in sorted(month_trend)],
        "recent_activity": activity[:8],
    }


# ---------------- Worker Self Endpoints ----------------
@api_router.get("/worker/me/data")
async def worker_self_data(request: Request, response: Response, user: dict = Depends(get_current_worker)):
    worker = await db.workers.find_one({"id": user["worker_id"], "business_id": user["business_id"]}, {"_id": 0})
    if not worker:
        raise HTTPException(
            status_code=404,
            detail="No worker profile linked to your account. Ask your employer / admin to enable portal access."
        )
    
    biz_id = worker.get("business_id")
    wid = worker["id"]
    
    attendance = await db.attendance.find({"business_id": biz_id, "worker_id": wid}, {"_id": 0}).sort("date", -1).to_list(500)
    payments = await db.payments.find({"business_id": biz_id, "worker_id": wid, "deleted_at": None}, {"_id": 0}).sort("date", -1).to_list(500)
    extra = await db.extra_work.find({"business_id": biz_id, "worker_id": wid, "deleted_at": None}, {"_id": 0}).sort("date", -1).to_list(500)
    
    summary = PayrollService.calculate_worker_month_summary(worker, attendance, payments, extra)
    
    # Get business name if available
    business = None
    if biz_id:
        business = await db.businesses.find_one({"id": biz_id}, {"_id": 0})

    csrf_token = set_session_cookie(
        response,
        "session_token",
        request.cookies.get("session_token", ""),
        request.cookies.get("csrf_token"),
    )

    return {
        "worker": clean_worker_document(worker),
        "business": business,
        "attendance": attendance,
        "payments": payments,
        "extra_work": extra,
        "summary": summary,
        "csrf_token": csrf_token,
    }


@api_router.get("/worker/me/attendance/month")
async def get_worker_self_month_attendance(
    year: int = Query(..., ge=1900, le=2100),
    month: int = Query(..., ge=1, le=12),
    user: dict = Depends(get_current_worker),
):
    """
    Returns monthly attendance calendar data for the authenticated worker.
    Identity and business isolation are derived strictly from the session.
    """
    biz_id = user["business_id"]
    worker_id = user["worker_id"]
    worker = await db.workers.find_one({"id": worker_id, "business_id": biz_id}, {"_id": 0, "password_hash": 0})
    if not worker:
        raise HTTPException(
            status_code=404,
            detail="No worker profile linked to your account. Ask your employer / admin to enable portal access."
        )

    prefix = f"{year:04d}-{month:02d}-"
    attendance_records = await db.attendance.find(
        {"business_id": biz_id, "worker_id": worker_id, "date": {"$regex": f"^{prefix}"}},
        {"_id": 0},
    ).to_list(100)

    result = PayrollService.calculate_worker_month_attendance(
        worker=worker,
        attendance_records=attendance_records,
        year=year,
        month=month,
        today_date_str=get_today_date(),
    )
    result["worker"] = clean_worker_document(worker)
    return result


@api_router.get("/worker/me/salary-slip")
async def get_worker_self_salary_slip_pdf(
    year: int = Query(..., ge=1900, le=2100),
    month: int = Query(..., ge=1, le=12),
    user: dict = Depends(get_current_worker),
):
    """
    Generates and streams an authoritative Salary Slip PDF for the authenticated worker.
    Worker identity and business scoping are derived strictly from the verified session.
    """
    biz_id = user["business_id"]
    worker_id = user["worker_id"]
    worker = await db.workers.find_one({"id": worker_id, "business_id": biz_id}, {"_id": 0, "password_hash": 0})
    if not worker:
        raise HTTPException(
            status_code=404,
            detail="No worker profile linked to your account. Ask your employer / admin to enable portal access."
        )

    business = await db.businesses.find_one({"id": biz_id}, {"_id": 0})

    prefix = f"{year:04d}-{month:02d}-"
    m_start = f"{prefix}01"
    if month == 12:
        m_end = f"{year + 1:04d}-01-01"
    else:
        m_end = f"{year:04d}-{month + 1:02d}-01"

    attendance_records = await db.attendance.find(
        {"business_id": biz_id, "worker_id": worker_id, "date": {"$regex": f"^{prefix}"}},
        {"_id": 0},
    ).sort("date", 1).to_list(100)

    payments = await db.payments.find(
        {"business_id": biz_id, "worker_id": worker_id, "deleted_at": None, "date": {"$gte": m_start, "$lt": m_end}},
        {"_id": 0},
    ).sort("date", 1).to_list(500)

    extra_work = await db.extra_work.find(
        {"business_id": biz_id, "worker_id": worker_id, "deleted_at": None, "date": {"$gte": m_start, "$lt": m_end}},
        {"_id": 0},
    ).sort("date", 1).to_list(500)

    summary = PayrollService.calculate_worker_month_summary(
        worker=worker,
        attendance_list=attendance_records,
        payments_list=payments,
        extra_work_list=extra_work,
        date_str=m_start,
    )

    attendance_summary = PayrollService.calculate_worker_month_attendance(
        worker=worker,
        attendance_records=attendance_records,
        year=year,
        month=month,
        today_date_str=get_today_date(),
    )

    pdf_bytes = generate_salary_slip_pdf(
        worker=worker,
        business=business,
        summary=summary,
        attendance_summary=attendance_summary.get("summary", {}),
        year=year,
        month=month,
        recent_payments=payments,
    )

    month_names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
    m_name = month_names[month - 1] if 1 <= month <= 12 else str(month)
    safe_worker_name = sanitize_filename(worker.get("name", "Worker"))
    filename = f"WorkForce_Salary_Slip_{safe_worker_name}_{m_name}_{year}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store, private",
        },
    )




# ---------------- Owner ↔ Worker Chat Endpoints ----------------
@api_router.get("/push/public-key")
async def push_public_key():
    """Exposes only the VAPID public key; the private key never leaves the server."""
    return {"public_key": push.public_key()}


@api_router.post("/push/subscribe")
async def subscribe_to_push(body: PushSubscriptionCreate, request: Request):
    """Store a subscription for the authenticated principal only."""
    try:
        actor = await get_current_admin(request)
        recipient_type, recipient_id = "admin", actor["id"]
    except Exception:
        try:
            actor = await get_current_worker(request)
            recipient_type, recipient_id = "worker", actor["worker_id"]
        except Exception:
            raise HTTPException(status_code=401, detail="Not authenticated")
    await db.push_subscriptions.update_one(
        {"endpoint": body.endpoint},
        {"$set": {
            "endpoint": body.endpoint, "keys": body.keys, "business_id": actor["business_id"],
            "recipient_type": recipient_type, "recipient_id": recipient_id,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return {"ok": True}


async def deliver_chat_push(*, business_id: str, worker_id: str, sender_type: str,
                            conversation_id: str, preview: str) -> None:
    """Deliver best-effort push only to the server-selected other participant."""
    if not push.configured():
        return
    if sender_type == "owner":
        worker = await db.workers.find_one({"id": worker_id, "business_id": business_id}, {"_id": 0, "status": 1})
        if not worker or worker.get("status", "ACTIVE") == "INACTIVE":
            return
        query = {"business_id": business_id, "recipient_type": "worker", "recipient_id": worker_id}
        unread_query = {"business_id": business_id, "worker_id": worker_id, "sender_type": "owner", "read_at": None}
        url = f"/worker?conversation={conversation_id}"
        title = "💬 Message from Kitchen Admin"
    else:
        worker = await db.workers.find_one({"id": worker_id, "business_id": business_id}, {"_id": 0, "name": 1})
        wname = (worker or {}).get("name", "Student")
        query = {"business_id": business_id, "recipient_type": "admin"}
        unread_query = {"business_id": business_id, "sender_type": "worker", "read_at": None}
        url = f"/admin?conversation={conversation_id}"
        title = f"💬 New message from {wname}"

    subscriptions = await db.push_subscriptions.find(query, {"_id": 0}).to_list(100)
    unread_count = await db.messages.count_documents(unread_query)
    payload = {
        "title": title,
        "body": preview[:160] if preview else "You have a new message.",
        "url": url,
        "conversation_id": conversation_id,
        "unread_count": unread_count,
        "tag": conversation_id or "chat-message",
    }
    for subscription in subscriptions:
        await push.send(subscription, payload)


@api_router.post("/push/test")
async def send_test_push(request: Request):
    """Send an immediate test push notification to the calling user's registered devices."""
    try:
        actor = await get_current_admin(request)
        recipient_type, recipient_id = "admin", actor["id"]
        title = "🔔 Ayushman Kitchen Test"
        body = "Push notifications are working perfectly on this device! 🎉"
        url = "/admin"
    except Exception:
        try:
            actor = await get_current_worker(request)
            recipient_type, recipient_id = "worker", actor["worker_id"]
            title = "🔔 Ayushman Kitchen Test"
            body = "Push notifications are working perfectly on your phone! 🎉"
            url = "/worker"
        except Exception:
            raise HTTPException(status_code=401, detail="Not authenticated")

    biz_id = actor["business_id"]
    query = {"business_id": biz_id, "recipient_type": recipient_type, "recipient_id": recipient_id}
    subs = await db.push_subscriptions.find(query, {"_id": 0}).to_list(10)
    if not subs:
        return {"ok": False, "sent_count": 0, "message": "No active device subscriptions found. Please enable notifications in your browser first."}

    sent = 0
    for s in subs:
        ok = await push.send(s, {"title": title, "body": body, "url": url, "tag": "test-push"})
        if ok:
            sent += 1

    return {"ok": True, "sent_count": sent, "message": f"Test push sent to {sent} device(s)!"}


async def deliver_admin_push(*, business_id: str, title: str, body: str, url: str = "/admin", tag: str = "admin-alert") -> None:
    """Deliver push notification to all admin subscriptions for a business."""
    if not push.configured():
        return
    query = {"business_id": business_id, "recipient_type": "admin"}
    subscriptions = await db.push_subscriptions.find(query, {"_id": 0}).to_list(100)
    if not subscriptions:
        return
    payload = {
        "title": title,
        "body": body[:160],
        "url": url,
        "tag": tag,
        "conversation_id": None,
    }
    for subscription in subscriptions:
        await push.send(subscription, payload)


async def deliver_student_push(*, business_id: str, worker_id: str, title: str, body: str, url: str = "/worker", tag: str = "student-alert") -> None:
    """Deliver push notification directly to a specific student's registered devices."""
    if not push.configured():
        return
    query = {"business_id": business_id, "recipient_type": "worker", "recipient_id": worker_id}
    subscriptions = await db.push_subscriptions.find(query, {"_id": 0}).to_list(20)
    if not subscriptions:
        return
    payload = {
        "title": title,
        "body": body[:160],
        "url": url,
        "tag": tag,
        "conversation_id": None,
    }
    for subscription in subscriptions:
        await push.send(subscription, payload)



async def deliver_student_broadcast_push(*, business_id: str, meal_slot: str, title: str, body: str, url: str = "/worker", tag: str = "meal-reminder") -> None:
    """Deliver meal reminder push notification to active students eligible for this meal slot (excluding vacation)."""
    if not push.configured():
        return
    today = get_today_date()
    # Find active leaves
    leaves = await db.worker_leaves.find(
        {"business_id": business_id, "status": "ACTIVE", "start_date": {"$lte": today}, "end_date": {"$gte": today}},
        {"worker_id": 1, "_id": 0}
    ).to_list(1000)
    on_leave_wids = {lv["worker_id"] for lv in leaves}

    # Find active students eligible for meal_slot
    active_students = await db.workers.find(
        {
            "business_id": business_id,
            "status": {"$ne": "INACTIVE"},
            "$or": [
                {"meal_plan_type": {"$exists": False}},
                {"meal_plan_type": None},
                {"meal_plan_type": {"$in": ["BOTH", "both", f"{meal_slot.upper()}_ONLY", f"{meal_slot.lower()}_only"]}},
            ]
        },
        {"id": 1, "_id": 0}
    ).to_list(2000)

    target_wids = [s["id"] for s in active_students if s["id"] not in on_leave_wids]
    if not target_wids:
        return

    subscriptions = await db.push_subscriptions.find(
        {"business_id": business_id, "recipient_type": "worker", "recipient_id": {"$in": target_wids}},
        {"_id": 0}
    ).to_list(2000)

    if not subscriptions:
        return

    payload = {
        "title": title,
        "body": body[:160],
        "url": url,
        "tag": tag,
        "conversation_id": None,
    }
    for subscription in subscriptions:
        await push.send(subscription, payload)


async def deliver_student_slots_push(*, business_id: str, slots: list, title: str, body: str, url: str = "/worker", tag: str = "mess-notice") -> None:
    """Broadcast an admin notice (mess closure, college holiday) to every active student
    whose plan covers any of `slots`. Unlike the meal reminder, students on vacation are
    included — closures and holiday mode affect them too."""
    if not push.configured():
        return

    slot_set = {str(s).strip().lower() for s in (slots or []) if str(s).strip()} or {"lunch", "dinner"}
    plan_values = ["BOTH", "both"]
    for slot in slot_set:
        plan_values += [f"{slot.upper()}_ONLY", f"{slot.lower()}_only"]

    active_students = await db.workers.find(
        {
            "business_id": business_id,
            "status": {"$ne": "INACTIVE"},
            "$or": [
                {"meal_plan_type": {"$exists": False}},
                {"meal_plan_type": None},
                {"meal_plan_type": {"$in": plan_values}},
            ]
        },
        {"id": 1, "_id": 0}
    ).to_list(2000)

    target_wids = [s["id"] for s in active_students]
    if not target_wids:
        return

    subscriptions = await db.push_subscriptions.find(
        {"business_id": business_id, "recipient_type": "worker", "recipient_id": {"$in": target_wids}},
        {"_id": 0}
    ).to_list(2000)
    if not subscriptions:
        return

    payload = {
        "title": title,
        "body": body[:160],
        "url": url,
        "tag": tag,
        "conversation_id": None,
    }
    for subscription in subscriptions:
        await push.send(subscription, payload)


@api_router.get("/chat/conversations")
async def list_admin_conversations(admin: dict = Depends(get_current_admin)):
    """Returns conversation list for all workers in the admin's business."""
    biz_id = admin["business_id"]
    workers = await db.workers.find({"business_id": biz_id}, {"_id": 0}).to_list(1000)
    
    results = []
    for w in workers:
        wid = w["id"]
        conv = await db.conversations.find_one({"business_id": biz_id, "worker_id": wid}, {"_id": 0})
        if not conv:
            conv_id = str(uuid.uuid4())
            conv_doc = {
                "id": conv_id,
                "business_id": biz_id,
                "worker_id": wid,
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "last_message": None,
            }
            await db.conversations.insert_one(conv_doc)
            conv = conv_doc

        # Calculate unread count from worker to owner
        unread_count = await db.messages.count_documents({
            "conversation_id": conv["id"],
            "sender_type": "worker",
            "read_at": None,
        })

        results.append({
            "conversation_id": conv["id"],
            "worker": w,
            "unread_count": unread_count,
            "last_message": conv.get("last_message"),
            "updated_at": conv.get("updated_at", ""),
        })

    # Sort by most recent updated_at
    results.sort(key=lambda x: x.get("updated_at", "") or "", reverse=True)
    return results


@api_router.get("/chat/worker-conversation")
async def get_worker_conversation(user: dict = Depends(get_current_worker)):
    """Returns or creates the private conversation for the current logged-in worker."""
    worker = await db.workers.find_one({"id": user["worker_id"], "business_id": user["business_id"]}, {"_id": 0})
    if not worker:
        raise HTTPException(status_code=404, detail="Worker profile not linked.")

    biz_id = worker.get("business_id")
    wid = worker["id"]
    
    conv = await db.conversations.find_one({"business_id": biz_id, "worker_id": wid}, {"_id": 0})
    if not conv:
        conv_id = str(uuid.uuid4())
        conv_doc = {
            "id": conv_id,
            "business_id": biz_id,
            "worker_id": wid,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "last_message": None,
        }
        await db.conversations.insert_one(conv_doc)
        conv = conv_doc

    unread_count = await db.messages.count_documents({
        "conversation_id": conv["id"],
        "sender_type": "owner",
        "read_at": None,
    })

    return {
        "conversation_id": conv["id"],
        "worker": worker,
        "unread_count": unread_count,
        "last_message": conv.get("last_message"),
    }


async def resolve_conversation_actor(conversation_id: str, request: Request):
    """Resolve and tenant-check the current chat actor and conversation."""
    is_admin = False
    is_worker = False
    auth_user = None

    try:
        auth_user = await get_current_admin(request)
        is_admin = True
    except Exception:
        try:
            auth_user = await get_current_worker(request)
            is_worker = True
        except Exception:
            raise HTTPException(status_code=401, detail="Not authenticated")

    conv = await db.conversations.find_one({"id": conversation_id}, {"_id": 0})
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    if is_admin and conv.get("business_id") != auth_user["business_id"]:
        raise HTTPException(status_code=403, detail="Unauthorized")

    if is_worker:
        if conv.get("worker_id") != auth_user["worker_id"] or conv.get("business_id") != auth_user["business_id"]:
            raise HTTPException(status_code=403, detail="Unauthorized")

    return is_admin, is_worker, auth_user, conv


async def persist_conversation_read(conversation_id: str, is_admin: bool, conv: dict):
    """Persist incoming-message read state and return authoritative unread totals."""
    incoming_sender = "worker" if is_admin else "owner"
    unread_query = {
        "conversation_id": conversation_id,
        "business_id": conv["business_id"],
        "worker_id": conv["worker_id"],
        "sender_type": incoming_sender,
        "read_at": None,
    }
    first_unread = await db.messages.find_one(
        unread_query,
        {"_id": 0, "id": 1},
        sort=[("created_at", ASCENDING)],
    )
    now_iso = datetime.now(timezone.utc).isoformat()
    result = await db.messages.update_many(
        unread_query,
        {"$set": {"read_at": now_iso}},
    )

    total_query = {
        "business_id": conv["business_id"],
        "sender_type": incoming_sender,
        "read_at": None,
    }
    if not is_admin:
        total_query["worker_id"] = conv["worker_id"]

    unread_count = await db.messages.count_documents(unread_query)
    total_unread_count = await db.messages.count_documents(total_query)
    return {
        "conversation_id": conversation_id,
        "marked_read": result.modified_count,
        "read_at": now_iso,
        "first_unread_message_id": first_unread.get("id") if first_unread else None,
        "unread_count": unread_count,
        "total_unread_count": total_unread_count,
    }


async def migrate_message_expirations() -> int:
    """Backfill creation-based expiry for old messages without touching unrelated data."""
    migrated = 0
    cursor = db.messages.find(
        {"created_at": {"$nin": [None, ""]}, "expires_at": {"$exists": False}},
        {"_id": 1, "id": 1, "business_id": 1, "conversation_id": 1, "audio_asset_id": 1, "created_at": 1},
    )
    async for message in cursor:
        expires_at = message_expiry_from_created_at(message.get("created_at"))
        if not expires_at:
            logger.warning("Skipping message with invalid created_at during expiry migration id=%s", message.get("id"))
            continue
        selector = {"_id": message["_id"]} if message.get("_id") is not None else {
            "id": message.get("id"),
            "business_id": message.get("business_id"),
            "conversation_id": message.get("conversation_id"),
        }
        result = await db.messages.update_one(
            {**selector, "expires_at": {"$exists": False}},
            {"$set": {"expires_at": expires_at}},
        )
        migrated += result.modified_count
        if result.modified_count and message.get("audio_asset_id"):
            await db.voice_assets.update_one(
                {
                    "id": message["audio_asset_id"],
                    "business_id": message.get("business_id"),
                    "conversation_id": message.get("conversation_id"),
                },
                {"$set": {"expires_at": expires_at}},
            )
    return migrated


async def cleanup_expired_voice_assets() -> int:
    """Delete expired private voice binaries, audio metadata, and chat messages older than 2 days."""
    removed = 0
    now = datetime.now(timezone.utc)
    cutoff_iso = (now - MESSAGE_RETENTION).isoformat()

    # 1. Delete voice binary files from storage
    cursor = db.voice_assets.find(
        {"$or": [
            {"expires_at": {"$lte": now}},
            {"created_at": {"$lte": cutoff_iso}}
        ]},
        {"_id": 0},
    )
    async for asset in cursor:
        try:
            await voice_storage.delete_voice_message(asset)
            removed += 1
        except Exception:
            logger.exception("Expired voice asset cleanup failed id=%s", asset.get("id"))

    # 2. Delete voice metadata from database
    await db.voice_assets.delete_many({
        "$or": [
            {"expires_at": {"$lte": now}},
            {"created_at": {"$lte": cutoff_iso}}
        ]
    })

    # 3. Automatically delete all chat messages older than 2 days (48 hours)
    deleted_msgs = await db.messages.delete_many({
        "$or": [
            {"expires_at": {"$lte": now}},
            {"created_at": {"$lte": cutoff_iso}}
        ]
    })
    if deleted_msgs.deleted_count > 0:
        logger.info("Auto-cleanup: Deleted %d chat messages older than 2 days.", deleted_msgs.deleted_count)

    return removed


async def cleanup_expired_notifications() -> int:
    """Delete regular activity notifications older than 3 days, keeping renewal notifications safe."""
    cutoff_3days = (datetime.now(timezone.utc) - NOTIFICATION_RETENTION).isoformat()
    try:
        result = await db.activity_logs.delete_many({
            "created_at": {"$lte": cutoff_3days},
            "type": {"$nin": list(RENEWAL_ACTIVITY_TYPES)},
        })
        if result.deleted_count > 0:
            logger.info("Auto-cleanup: Removed %d regular activity notifications older than 3 days.", result.deleted_count)
        return result.deleted_count
    except Exception:
        logger.exception("Notification auto-cleanup failed")
        return 0


async def voice_expiration_loop() -> None:
    while True:
        await asyncio.sleep(30)
        await cleanup_expired_voice_assets()
        await cleanup_expired_notifications()


async def cleanup_old_meal_data() -> int:
    """Delete meal_selections and attendance records older than 2 calendar months."""
    cutoff_dt = datetime.now(timezone.utc).replace(day=1) - timedelta(days=1)
    cutoff_dt = cutoff_dt.replace(day=1)  # first day of the month 2 months ago
    cutoff_dt = cutoff_dt - timedelta(days=31)  # go back one more month
    cutoff_dt = cutoff_dt.replace(day=1)  # first day of month, 2 months back
    cutoff_date_str = cutoff_dt.strftime("%Y-%m-%d")  # e.g. "2026-06-01"

    try:
        sel_result = await db.meal_selections.delete_many({"date": {"$lt": cutoff_date_str}})
        att_result = await db.attendance.delete_many({"date": {"$lt": cutoff_date_str}})
        total = sel_result.deleted_count + att_result.deleted_count
        if total > 0:
            logger.info(
                f"Auto-cleanup: removed {sel_result.deleted_count} meal selections and "
                f"{att_result.deleted_count} attendance records older than {cutoff_date_str}"
            )
        return total
    except Exception:
        logger.exception("Meal data auto-cleanup failed")
        return 0


async def meal_cleanup_loop() -> None:
    """Run meal data cleanup once every 24 hours."""
    while True:
        await asyncio.sleep(24 * 60 * 60)  # 24 hours
        await cleanup_old_meal_data()


async def check_and_send_meal_reminders() -> None:
    """Check current time against meal window schedules and trigger automated student reminders & admin cutoff alerts."""
    if not push.configured():
        return

    today = get_today_date()
    current_time = now_tz().strftime("%H:%M")

    try:
        settings_list = await db.meal_settings.find({}, {"_id": 0}).to_list(100)
        # If no meal settings found in db, query distinct businesses from workers
        if not settings_list:
            biz_ids = await db.workers.distinct("business_id")
            settings_list = [{"business_id": bid, "windows": DEFAULT_MEAL_WINDOWS} for bid in biz_ids]

        for menu_doc in settings_list:
            biz_id = menu_doc.get("business_id")
            if not biz_id:
                continue

            windows = menu_doc.get("windows", DEFAULT_MEAL_WINDOWS)
            lunch_win = windows.get("lunch", {})
            dinner_win = windows.get("dinner", {})

            l_start = (lunch_win.get("start_time") or "08:00").strip() or "08:00"
            l_end = (lunch_win.get("end_time") or "11:00").strip() or "11:00"
            d_start = (dinner_win.get("start_time") or "16:00").strip() or "16:00"
            d_end = (dinner_win.get("end_time") or "19:00").strip() or "19:00"

            # Calculate 30 minutes before cutoff
            try:
                l_end_dt = datetime.strptime(l_end, "%H:%M")
                l_30m = (l_end_dt - timedelta(minutes=30)).strftime("%H:%M")
            except Exception:
                l_30m = "10:30"

            try:
                d_end_dt = datetime.strptime(d_end, "%H:%M")
                d_30m = (d_end_dt - timedelta(minutes=30)).strftime("%H:%M")
            except Exception:
                d_30m = "18:30"

            events = [
                # 1. Lunch Portal Start -> Student Reminder
                {
                    "event_type": "LUNCH_START",
                    "trigger_time": l_start,
                    "target": "STUDENT",
                    "slot": "lunch",
                    "title": "☀️ Lunch Menu is Open!",
                    "body": f"Check today's lunch specials & confirm your Veg/Non-Veg or Room Delivery choice before {l_end}.",
                    "tag": "lunch-start",
                },
                # 2. Lunch 30-min Before Cutoff -> Student Reminder
                {
                    "event_type": "LUNCH_30M_WARNING",
                    "trigger_time": l_30m,
                    "target": "STUDENT",
                    "slot": "lunch",
                    "title": "⏰ 30 Mins Left for Lunch!",
                    "body": f"Lunch window closes at {l_end}. Please confirm your meal or cancel now if not eating.",
                    "tag": "lunch-warning",
                },
                # 3. Lunch Cutoff Closed -> Admin PDF Roster Reminder
                {
                    "event_type": "LUNCH_CLOSED_ADMIN",
                    "trigger_time": l_end,
                    "target": "ADMIN",
                    "slot": "lunch",
                    "title": "📋 Lunch Portal Closed!",
                    "body": f"Lunch cutoff ({l_end}) is locked. Final meal count is ready. Open dashboard to download today's Lunch PDF dispatch roster.",
                    "tag": "lunch-closed-admin",
                },
                # 4. Dinner Portal Start -> Student Reminder
                {
                    "event_type": "DINNER_START",
                    "trigger_time": d_start,
                    "target": "STUDENT",
                    "slot": "dinner",
                    "title": "🌙 Dinner Menu is Open!",
                    "body": f"Check today's dinner specials & confirm your Veg/Non-Veg or Room Delivery choice before {d_end}.",
                    "tag": "dinner-start",
                },
                # 5. Dinner 30-min Before Cutoff -> Student Reminder
                {
                    "event_type": "DINNER_30M_WARNING",
                    "trigger_time": d_30m,
                    "target": "STUDENT",
                    "slot": "dinner",
                    "title": "⏰ 30 Mins Left for Dinner!",
                    "body": f"Dinner window closes at {d_end}. Please confirm your meal or cancel now if not eating.",
                    "tag": "dinner-warning",
                },
                # 6. Dinner Cutoff Closed -> Admin PDF Roster Reminder
                {
                    "event_type": "DINNER_CLOSED_ADMIN",
                    "trigger_time": d_end,
                    "target": "ADMIN",
                    "slot": "dinner",
                    "title": "📋 Dinner Portal Closed!",
                    "body": f"Dinner cutoff ({d_end}) is locked. Final meal count is ready. Open dashboard to download today's Dinner PDF dispatch roster.",
                    "tag": "dinner-closed-admin",
                },
            ]

            closure_cfg = menu_doc.get("mess_closure")
            closure_cfg = closure_cfg if isinstance(closure_cfg, dict) else {}

            for ev in events:
                if current_time == ev["trigger_time"]:
                    # Skip reminders for a slot the admin has closed today (no menu to open / no roster to prep)
                    if get_mess_closure_status(closure_cfg, ev["slot"], today)["is_closed"]:
                        continue
                    # Check if already triggered today
                    log_exists = await db.meal_reminder_logs.find_one({
                        "business_id": biz_id,
                        "date": today,
                        "event_type": ev["event_type"]
                    })
                    if not log_exists:
                        await db.meal_reminder_logs.insert_one({
                            "business_id": biz_id,
                            "date": today,
                            "event_type": ev["event_type"],
                            "triggered_at": datetime.now(timezone.utc).isoformat(),
                        })
                        if ev["target"] == "ADMIN":
                            asyncio.create_task(deliver_admin_push(
                                business_id=biz_id,
                                title=ev["title"],
                                body=ev["body"],
                                url="/admin",
                                tag=ev["tag"]
                            ))
                        else:
                            asyncio.create_task(deliver_student_broadcast_push(
                                business_id=biz_id,
                                meal_slot=ev["slot"],
                                title=ev["title"],
                                body=ev["body"],
                                url="/worker",
                                tag=ev["tag"]
                            ))
    except Exception:
        logger.exception("Error executing meal reminder scheduler")


async def meal_reminder_loop() -> None:
    """Run meal reminder scheduler every 30 seconds to catch exact HH:MM minute triggers."""
    while True:
        try:
            await check_and_send_meal_reminders()
        except Exception:
            logger.exception("Error in meal reminder loop")
        await asyncio.sleep(30)



@api_router.post("/chat/conversations/{conversation_id}/read")
async def mark_conversation_read(conversation_id: str, request: Request):
    """Mark only incoming messages read and return persisted backend unread totals."""
    is_admin, _, _, conv = await resolve_conversation_actor(conversation_id, request)
    return await persist_conversation_read(conversation_id, is_admin, conv)


@api_router.get("/chat/conversations/{conversation_id}/messages")
async def get_messages(conversation_id: str, request: Request, limit: int = 50, before: Optional[str] = None):
    """Loads message history; legacy callers also mark incoming messages as read."""
    is_admin, _, _, conv = await resolve_conversation_actor(conversation_id, request)

    await persist_conversation_read(conversation_id, is_admin, conv)

    q = {
        "conversation_id": conversation_id,
        "business_id": conv["business_id"],
        "worker_id": conv["worker_id"],
        **visible_message_filter(),
    }
    if before:
        q["created_at"] = {"$lt": before}
    messages = await db.messages.find(q, {"_id": 0}).sort("created_at", -1).to_list(min(max(limit, 1), 100))
    messages.reverse()
    for message in messages:
        if message.get("message_type") == "audio":
            message["audio_url"] = f"/api/chat/audio/{message['id']}"
    return messages


@api_router.post("/chat/worker-messages")
async def worker_send_message(body: MessageCreate, user: dict = Depends(get_current_worker)):
    """Sends a chat message as a worker. Uses ONLY worker auth — prevents cookie collision with admin session."""
    biz_id = user["business_id"]
    worker_id = user["worker_id"]

    conv_id = body.conversation_id
    if not conv_id:
        conv = await db.conversations.find_one({"business_id": biz_id, "worker_id": worker_id})
        if not conv:
            conv_id = str(uuid.uuid4())
            await db.conversations.insert_one({
                "id": conv_id, "business_id": biz_id, "worker_id": worker_id,
                "updated_at": datetime.now(timezone.utc).isoformat(), "last_message": None,
            })
        else:
            conv_id = conv["id"]
    else:
        conv = await db.conversations.find_one({"id": conv_id})
        if not conv or conv.get("business_id") != biz_id or conv.get("worker_id") != worker_id:
            raise HTTPException(status_code=404, detail="Conversation not found")

    if body.message_type not in {"text", "audio"}:
        raise HTTPException(status_code=400, detail="Invalid message type")
    if body.message_type == "text" and not (body.text or "").strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    audio_asset = None
    if body.message_type == "audio":
        if not body.audio_asset_id:
            raise HTTPException(status_code=400, detail="Audio asset is required")
        audio_asset = await db.voice_assets.find_one({
            "id": body.audio_asset_id, "business_id": biz_id, "worker_id": worker_id,
            "conversation_id": conv_id, "uploaded_by": user["user_id"], "message_id": None,
        }, {"_id": 0})
        if not audio_asset:
            raise HTTPException(status_code=404, detail="Audio asset not found")

    msg_id = str(uuid.uuid4())
    now_dt = datetime.now(timezone.utc)
    now_iso = now_dt.isoformat()
    expires_at = now_dt + MESSAGE_RETENTION

    msg_doc = {
        "id": msg_id, "business_id": biz_id, "conversation_id": conv_id,
        "worker_id": worker_id, "sender_type": "worker", "sender_id": user["user_id"],
        "message_type": body.message_type, "text": (body.text or "").strip(),
        "audio_asset_id": body.audio_asset_id,
        "audio_url": f"/api/chat/audio/{msg_id}" if body.message_type == "audio" else None,
        "duration": (audio_asset or {}).get("duration") or body.duration or 0.0,
        "created_at": now_iso, "read_at": None, "expires_at": expires_at,
    }
    await db.messages.insert_one(msg_doc)
    if audio_asset:
        await db.voice_assets.update_one(
            {"id": audio_asset["id"]},
            {"$set": {"message_id": msg_id, "expires_at": expires_at}},
        )

    preview = body.text if body.message_type == "text" else "🎤 Audio Message"
    await db.conversations.update_one(
        {"id": conv_id},
        {"$set": {"updated_at": now_iso, "last_message": {"text": preview, "sender_type": "worker", "created_at": now_iso}}}
    )
    asyncio.create_task(deliver_chat_push(
        business_id=biz_id, worker_id=worker_id, sender_type="worker",
        conversation_id=conv_id, preview=preview,
    ))
    msg_doc.pop("_id", None)
    return msg_doc


@api_router.post("/chat/messages")
async def send_message(body: MessageCreate, request: Request):
    """Sends a text or audio chat message."""
    is_admin = False
    is_worker = False
    auth_user = None

    try:
        auth_user = await get_current_admin(request)
        is_admin = True
    except Exception:
        try:
            auth_user = await get_current_worker(request)
            is_worker = True
        except Exception:
            raise HTTPException(status_code=401, detail="Not authenticated")

    rate_limit(request, "chat-message", 60, 60)
    conv_id = body.conversation_id
    worker_id = body.worker_id

    if not conv_id:
        if not worker_id:
            raise HTTPException(status_code=400, detail="conversation_id or worker_id required")
        
        if is_worker and worker_id != auth_user["worker_id"]:
            raise HTTPException(status_code=404, detail="Conversation not found")
        biz_id = auth_user["business_id"]
        owned_worker = await db.workers.find_one({"id": worker_id, "business_id": biz_id})
        if not owned_worker:
            raise HTTPException(status_code=404, detail="Worker not found")
        conv = await db.conversations.find_one({"business_id": biz_id, "worker_id": worker_id})
        if not conv:
            conv_id = str(uuid.uuid4())
            await db.conversations.insert_one({
                "id": conv_id,
                "business_id": biz_id,
                "worker_id": worker_id,
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "last_message": None,
            })
        else:
            conv_id = conv["id"]
    else:
        conv = await db.conversations.find_one({"id": conv_id})
        if not conv:
            raise HTTPException(status_code=404, detail="Conversation not found")
        worker_id = conv["worker_id"]
        biz_id = conv.get("business_id")

    if is_admin and biz_id != auth_user["business_id"]:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if is_worker and (biz_id != auth_user["business_id"] or worker_id != auth_user["worker_id"]):
        raise HTTPException(status_code=404, detail="Conversation not found")
    if body.message_type not in {"text", "audio"}:
        raise HTTPException(status_code=400, detail="Invalid message type")
    if body.message_type == "text" and not (body.text or "").strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    audio_asset = None
    if body.message_type == "audio":
        if not body.audio_asset_id:
            raise HTTPException(status_code=400, detail="Audio asset is required")
        audio_asset = await db.voice_assets.find_one({
            "id": body.audio_asset_id, "business_id": biz_id, "worker_id": worker_id,
            "conversation_id": conv_id, "uploaded_by": auth_user["id"] if is_admin else auth_user["user_id"],
        }, {"_id": 0})
        if not audio_asset:
            raise HTTPException(status_code=404, detail="Audio asset not found")

    if is_admin:
        sender_type = "owner"
        sender_id = auth_user["id"]
    else:
        sender_type = "worker"
        sender_id = auth_user["user_id"]

    msg_id = str(uuid.uuid4())
    now_dt = datetime.now(timezone.utc)
    now_iso = now_dt.isoformat()
    expires_at = now_dt + MESSAGE_RETENTION

    msg_doc = {
        "id": msg_id,
        "business_id": biz_id,
        "conversation_id": conv_id,
        "worker_id": worker_id,
        "sender_type": sender_type,
        "sender_id": sender_id,
        "message_type": body.message_type,
        "text": (body.text or "").strip(),
        "audio_asset_id": body.audio_asset_id,
        "audio_url": f"/api/chat/audio/{msg_id}" if body.message_type == "audio" else None,
        "duration": (audio_asset or {}).get("duration") or body.duration or 0.0,
        "created_at": now_iso,
        "read_at": None,
        "expires_at": expires_at,
    }

    await db.messages.insert_one(msg_doc)
    if audio_asset:
        await db.voice_assets.update_one(
            {"id": audio_asset["id"]},
            {"$set": {"message_id": msg_id, "expires_at": expires_at}},
        )

    # Update conversation's last message
    preview = body.text if body.message_type == "text" else "🎤 Audio Message"
    await db.conversations.update_one(
        {"id": conv_id},
        {
            "$set": {
                "updated_at": now_iso,
                "last_message": {
                    "text": preview,
                    "sender_type": sender_type,
                    "created_at": now_iso,
                }
            }
        }
    )

    # Notification delivery is deliberately detached from the successful chat write.
    asyncio.create_task(deliver_chat_push(
        business_id=biz_id, worker_id=worker_id, sender_type=sender_type,
        conversation_id=conv_id, preview=preview,
    ))

    msg_doc.pop("_id", None)
    return msg_doc


@api_router.post("/chat/broadcast")
async def broadcast_message(body: BroadcastMessageCreate, admin: dict = Depends(get_current_admin)):
    """Broadcasts a message to all active students, specific selected students, or plan groups."""
    biz_id = admin["business_id"]
    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    filter_q: dict[str, Any] = {"business_id": biz_id, "status": "ACTIVE"}
    if body.recipient_mode == "SELECTED":
        if not body.worker_ids:
            raise HTTPException(status_code=400, detail="Please select at least one student to message.")
        filter_q["id"] = {"$in": body.worker_ids}
    elif body.recipient_mode == "PREMIUM":
        filter_q["work_type"] = {"$regex": "^premium$", "$options": "i"}
    elif body.recipient_mode == "STANDARD":
        filter_q["work_type"] = {"$ne": "Premium"}

    workers = await db.workers.find(filter_q, {"_id": 0, "id": 1, "name": 1}).to_list(1000)
    if not workers:
        raise HTTPException(status_code=400, detail="No active students found matching the selected criteria.")

    now_dt = datetime.now(timezone.utc)
    now_iso = now_dt.isoformat()
    expires_at = now_dt + MESSAGE_RETENTION

    sent_count = 0
    for w in workers:
        wid = w["id"]
        conv = await db.conversations.find_one({"business_id": biz_id, "worker_id": wid})
        if not conv:
            conv_id = str(uuid.uuid4())
            await db.conversations.insert_one({
                "id": conv_id,
                "business_id": biz_id,
                "worker_id": wid,
                "created_at": now_iso,
                "updated_at": now_iso,
                "last_message": None
            })
        else:
            conv_id = conv["id"]

        msg_id = str(uuid.uuid4())
        msg_doc = {
            "id": msg_id,
            "business_id": biz_id,
            "conversation_id": conv_id,
            "worker_id": wid,
            "sender_type": "owner",
            "sender_id": admin["id"],
            "message_type": "text",
            "text": text,
            "audio_asset_id": None,
            "audio_url": None,
            "duration": 0.0,
            "created_at": now_iso,
            "read_at": None,
            "expires_at": expires_at,
        }
        await db.messages.insert_one(msg_doc)

        await db.conversations.update_one(
            {"id": conv_id},
            {
                "$set": {
                    "updated_at": now_iso,
                    "last_message": {
                        "text": text,
                        "sender_type": "owner",
                        "created_at": now_iso
                    }
                }
            }
        )

        asyncio.create_task(deliver_chat_push(
            business_id=biz_id,
            worker_id=wid,
            sender_type="owner",
            conversation_id=conv_id,
            preview=text
        ))
        sent_count += 1

    # Log Activity
    await db.activity_logs.insert_one({
        "id": str(uuid.uuid4()),
        "business_id": biz_id,
        "type": "BROADCAST_SENT",
        "title": f"📢 Broadcast sent to {sent_count} student(s)",
        "created_at": now_iso,
    })

    return {
        "ok": True,
        "sent_count": sent_count,
        "recipient_mode": body.recipient_mode
    }


@api_router.post("/chat/upload-audio")
async def upload_audio(conversation_id: str = Form(...), file: UploadFile = File(...), request: Request = None):
    """Uploads an audio recording for chat."""
    # Verify auth
    is_admin = False
    try:
        actor = await get_current_admin(request)
        is_admin = True
    except Exception:
        try:
            actor = await get_current_worker(request)
        except Exception:
            raise HTTPException(status_code=401, detail="Not authenticated")
    rate_limit(request, "chat-audio", 20, 60)
    conv = await db.conversations.find_one({"id": conversation_id}, {"_id": 0})
    if not conv or (is_admin and conv.get("business_id") != actor["business_id"]) or (
        not is_admin and (conv.get("business_id") != actor["business_id"] or conv.get("worker_id") != actor["worker_id"])
    ):
        raise HTTPException(status_code=404, detail="Conversation not found")
    metadata = await voice_storage.upload_voice_message(file)
    asset_id = str(uuid.uuid4())
    asset = {
        "id": asset_id, "business_id": conv["business_id"], "worker_id": conv["worker_id"],
        "conversation_id": conversation_id, "uploaded_by": actor["id"] if is_admin else actor["user_id"],
        "message_id": None, "created_at": datetime.now(timezone.utc).isoformat(), **metadata,
    }
    await db.voice_assets.insert_one(asset)
    return {"audio_asset_id": asset_id, "duration": metadata.get("duration", 0)}


@api_router.get("/chat/audio/{message_id}")
async def get_audio_file(message_id: str, request: Request):
    actor = None
    is_admin = False
    try:
        actor, is_admin = await get_current_admin(request), True
    except Exception:
        try:
            actor, is_admin = await get_current_worker(request), False
        except Exception:
            # Query param token fallback for HTML5 <audio> elements
            q_token = request.query_params.get("token") or request.query_params.get("session_token")
            if q_token:
                try:
                    payload = jwt.decode(q_token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
                    admin = await db.admins.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
                    if admin:
                        biz = await get_or_create_business_for_admin(admin)
                        admin["business_id"] = biz["id"]
                        actor, is_admin = admin, True
                except Exception:
                    pass
                if not actor:
                    session = await db.worker_sessions.find_one({"session_token": q_token}, {"_id": 0})
                    if session:
                        worker = await db.workers.find_one({"id": session["worker_id"], "business_id": session["business_id"]}, {"_id": 0})
                        if worker:
                            worker["worker_id"] = worker["id"]
                            actor, is_admin = worker, False

    if not actor:
        raise HTTPException(status_code=401, detail="Not authenticated")

    message = await db.messages.find_one(
        {"id": message_id, "message_type": "audio", **visible_message_filter()},
        {"_id": 0},
    )
    if not message or (is_admin and message.get("business_id") != actor["business_id"]) or (
        not is_admin and (message.get("business_id") != actor["business_id"] or message.get("worker_id") != actor["worker_id"])
    ):
        raise HTTPException(status_code=404, detail="Audio message not found")

    asset = await db.voice_assets.find_one({"id": message.get("audio_asset_id")}, {"_id": 0})
    if not asset:
        raise HTTPException(status_code=404, detail="Audio file asset not found")

    target = voice_storage.get_voice_message_url(asset)
    mime_type = asset.get("mime_type", "audio/webm")

    if isinstance(target, Path):
        return FileResponse(
            target,
            media_type=mime_type,
            headers={
                "Accept-Ranges": "bytes",
                "Cache-Control": "public, max-age=86400",
            }
        )

    async with httpx.AsyncClient(follow_redirects=True, timeout=20.0) as http:
        upstream = await http.get(target)
    if upstream.status_code != 200:
        raise HTTPException(status_code=502, detail="Audio storage is temporarily unavailable")

    return Response(
        content=upstream.content,
        media_type=mime_type,
        headers={
            "Accept-Ranges": "bytes",
            "Cache-Control": "public, max-age=86400",
        }
    )


# ---------------- Base & Health ----------------
@api_router.get("/")
async def root():
    return {
        "message": "WorkForce Management API",
        "timezone": BUSINESS_TIMEZONE_NAME,
        "status": "healthy",
    }


@api_router.get("/health")
async def health():
    return {"status": "ok"}


@api_router.get("/ready")
async def ready():
    try:
        await db.command("ping")
        return {"status": "ready"}
    except Exception as exc:
        logger.error("Readiness dependency check failed", exc_info=exc)
        raise HTTPException(status_code=503, detail="Database connection unavailable")
# ---------------- Student Leave / Vacation System ----------------

@api_router.post("/worker/leave/start-vacation")
async def start_student_vacation(user: dict = Depends(get_current_worker)):
    biz_id = user["business_id"]
    wid = user["worker_id"]
    worker = await db.workers.find_one({"id": wid, "business_id": biz_id}, {"_id": 0})
    if not worker:
        raise HTTPException(status_code=404, detail="Student not found")

    today = get_today_date()
    now_time = now_tz().strftime("%H:%M")

    # Smart Vacation Start Logic
    if now_time < "11:00":
        start_date = today
        pause_msg = "Meals paused starting from today's Lunch"
    elif now_time < "19:00":
        start_date = today
        pause_msg = "Meals paused starting from today's Dinner"
    else:
        start_date = (datetime.strptime(today, "%Y-%m-%d") + timedelta(days=1)).strftime("%Y-%m-%d")
        pause_msg = "Meals paused starting from Tomorrow"

    leave_id = str(uuid.uuid4())
    doc = {
        "id": leave_id,
        "business_id": biz_id,
        "worker_id": wid,
        "start_date": start_date,
        "end_date": "2099-12-31",
        "status": "ACTIVE",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.worker_leaves.insert_one(doc)

    # Cancel today's slots based on time
    if start_date == today:
        if now_time < "11:00":
            slots_to_cancel = ["lunch", "dinner"]
        else:
            slots_to_cancel = ["dinner"]
        for slot in slots_to_cancel:
            await db.meal_selections.update_one(
                {"business_id": biz_id, "worker_id": wid, "date": today, "meal_slot": slot},
                {"$set": {"selection_type": "CANCELLED", "action": "CANCEL",
                          "leave_id": leave_id, "updated_at": datetime.now(timezone.utc).isoformat()}},
                upsert=True
            )

    # Log Activity & Push Notification to Admin
    await db.activity_logs.insert_one({
        "id": str(uuid.uuid4()),
        "business_id": biz_id,
        "worker_id": wid,
        "worker_name": worker.get("name", "Student"),
        "type": "VACATION_START",
        "title": f"🏖️ {worker.get('name', 'Student')} went on Vacation / Paused Meals ({pause_msg})",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    asyncio.create_task(deliver_admin_push(
        business_id=biz_id,
        title="🏖️ Student On Vacation (Off)",
        body=f"{worker.get('name', 'Student')} went on Vacation / Paused Meals ({pause_msg}).",
        url="/admin",
        tag="vacation-alert"
    ))

    return {"ok": True, "message": pause_msg, "start_date": start_date, "leave_id": leave_id}


@api_router.post("/worker/leave")
async def create_student_leave(body: dict = Body(...), user: dict = Depends(get_current_worker)):
    biz_id = user["business_id"]
    wid = user["worker_id"]
    worker = await db.workers.find_one({"id": wid, "business_id": biz_id}, {"_id": 0})
    start_date = (body.get("start_date") or "").strip()
    end_date = (body.get("end_date") or "2099-12-31").strip()
    if not start_date:
        start_date = get_today_date()

    leave_id = str(uuid.uuid4())
    doc = {
        "id": leave_id,
        "business_id": biz_id,
        "worker_id": wid,
        "start_date": start_date,
        "end_date": end_date,
        "status": "ACTIVE",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.worker_leaves.insert_one(doc)

    await db.activity_logs.insert_one({
        "id": str(uuid.uuid4()),
        "business_id": biz_id,
        "worker_id": wid,
        "worker_name": (worker or {}).get("name", "Student"),
        "type": "VACATION_START",
        "title": f"🏖️ {(worker or {}).get('name', 'Student')} paused meals from {start_date}",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    asyncio.create_task(deliver_admin_push(
        business_id=biz_id,
        title="🏖️ Student On Vacation (Off)",
        body=f"{(worker or {}).get('name', 'Student')} paused meals from {start_date}.",
        url="/admin",
        tag="vacation-alert"
    ))

    return {"ok": True, "leave": {k: v for k, v in doc.items() if k != "_id"}}


@api_router.get("/worker/leaves")
async def get_student_leaves(user: dict = Depends(get_current_worker)):
    biz_id = user["business_id"]
    wid = user["worker_id"]
    today = get_today_date()
    leaves = await db.worker_leaves.find(
        {"business_id": biz_id, "worker_id": wid, "status": "ACTIVE", "end_date": {"$gte": today}},
        {"_id": 0}
    ).sort("start_date", -1).to_list(20)
    return leaves


@api_router.delete("/worker/leave/{leave_id}")
async def delete_student_leave(leave_id: str, user: dict = Depends(get_current_worker)):
    return await cancel_student_leave(leave_id=leave_id, user=user)


@api_router.post("/worker/leave/resume")
async def resume_student_vacation(user: dict = Depends(get_current_worker)):
    return await cancel_student_leave(leave_id=None, user=user)


async def cancel_student_leave(leave_id: Optional[str] = None, user: dict = Depends(get_current_worker)):
    biz_id = user["business_id"]
    wid = user["worker_id"]
    worker = await db.workers.find_one({"id": wid, "business_id": biz_id}, {"_id": 0})

    query = {"business_id": biz_id, "worker_id": wid, "status": "ACTIVE"}
    if leave_id and leave_id != "undefined":
        query["id"] = leave_id

    leave = await db.worker_leaves.find_one(query)
    if not leave:
        # Check if any active leave exists
        leave = await db.worker_leaves.find_one({"business_id": biz_id, "worker_id": wid, "status": "ACTIVE"})

    if leave:
        await db.worker_leaves.update_one({"id": leave["id"]}, {"$set": {"status": "CANCELLED"}})

    today = get_today_date()
    now_time = now_tz().strftime("%H:%M")

    # Resumption logic: before 11:00 → lunch + dinner; 11:00-19:00 → dinner only; after 19:00 → next day
    if now_time < "11:00":
        resume_date = today
        slots_today = ["lunch", "dinner"]
        msg = "Welcome back! Meals resumed starting from today's Lunch"
    elif now_time < "19:00":
        resume_date = today
        slots_today = ["dinner"]
        msg = "Welcome back! Meals resumed starting from today's Dinner"
    else:
        resume_date = (datetime.strptime(today, "%Y-%m-%d") + timedelta(days=1)).strftime("%Y-%m-%d")
        slots_today = []
        msg = "Welcome back! Meals resumed starting from Tomorrow"

    # Remove auto-cancelled meal selections for reinstated slots
    if leave:
        lid = leave["id"]
        for slot in slots_today:
            await db.meal_selections.delete_one(
                {"business_id": biz_id, "worker_id": wid, "date": today, "meal_slot": slot, "leave_id": lid}
            )
        await db.meal_selections.delete_many(
            {"business_id": biz_id, "worker_id": wid, "date": {"$gte": resume_date}, "leave_id": lid}
        )

    # Log Activity & Push Notification to Admin
    await db.activity_logs.insert_one({
        "id": str(uuid.uuid4()),
        "business_id": biz_id,
        "worker_id": wid,
        "worker_name": (worker or {}).get("name", "Student"),
        "type": "VACATION_END",
        "title": f"🏠 {(worker or {}).get('name', 'Student')} returned from vacation ({msg})",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    asyncio.create_task(deliver_admin_push(
        business_id=biz_id,
        title="🏠 Student Resumed Meals (On)",
        body=f"{(worker or {}).get('name', 'Student')} returned from Vacation ({msg}). Meals active.",
        url="/admin",
        tag="vacation-alert"
    ))

    return {"ok": True, "message": msg, "resume_date": resume_date}


# ---------------- Activity Notifications & Renewals ----------------

@api_router.get("/admin/activity-feed")
async def get_admin_activity_feed(admin: dict = Depends(get_current_admin)):
    biz_id = admin["business_id"]
    cutoff_3days = (datetime.now(timezone.utc) - NOTIFICATION_RETENTION).isoformat()
    q = {
        "business_id": biz_id,
        "$or": [
            {"type": {"$in": list(RENEWAL_ACTIVITY_TYPES)}},
            {"created_at": {"$gt": cutoff_3days}},
        ]
    }
    logs = await db.activity_logs.find(q, {"_id": 0}).sort("created_at", -1).to_list(50)
    return logs


@api_router.post("/admin/workers/{worker_id}/renew")
async def renew_student_subscription(
    worker_id: str,
    body: dict = Body(...),
    admin: dict = Depends(get_current_admin)
):
    biz_id = admin["business_id"]
    worker = await db.workers.find_one({"id": worker_id, "business_id": biz_id})
    if not worker:
        raise HTTPException(status_code=404, detail="Student not found")

    renewal_date = (body.get("renewal_start_date") or get_today_date()).strip()
    plan_type = body.get("meal_plan_type") or worker.get("meal_plan_type") or "BOTH"
    total_quota = int(body.get("total_quota") or (60 if plan_type == "BOTH" else 30))

    update_fields = {
        "joining_date": renewal_date,
        "lunch_start_date": renewal_date,
        "dinner_start_date": renewal_date,
        "meal_plan_type": plan_type,
        "total_quota": total_quota,
        "lunch_quota": 30 if plan_type in ("BOTH", "LUNCH_ONLY") else 0,
        "dinner_quota": 30 if plan_type in ("BOTH", "DINNER_ONLY") else 0,
        "renewed_at": datetime.now(timezone.utc).isoformat(),
    }

    await db.workers.update_one({"id": worker_id, "business_id": biz_id}, {"$set": update_fields})

    # Log Activity
    await db.activity_logs.insert_one({
        "id": str(uuid.uuid4()),
        "business_id": biz_id,
        "worker_id": worker_id,
        "worker_name": worker.get("name", "Student"),
        "type": "SUBSCRIPTION_RENEWED",
        "title": f"🔄 Renewed subscription for {worker.get('name')}: {total_quota} meals pool starting {renewal_date}",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    updated_worker = await db.workers.find_one({"id": worker_id, "business_id": biz_id}, {"_id": 0, "password_hash": 0})
    stats = await compute_worker_meal_consumption(biz_id, updated_worker)

    return {"ok": True, "worker": updated_worker, "stats": stats}


@api_router.get("/admin/low-balance-students")
async def get_low_balance_students(admin: dict = Depends(get_current_admin)):
    biz_id = admin["business_id"]
    students = await db.workers.find({"business_id": biz_id, "status": "ACTIVE"}, {"_id": 0, "password_hash": 0}).to_list(500)

    low_balance_list = []
    for s in students:
        stats = await compute_worker_meal_consumption(biz_id, s)
        rem = stats.get("total_remaining")
        is_exp = stats.get("is_expired", False)
        days_left = stats.get("validity_days_left", 45)
        holiday_frozen = bool(stats.get("holiday_mode_active"))
        # Alert if expired OR <= 4 meals remaining OR <= 5 validity days remaining.
        # During an active college holiday the 45-day validity is frozen, so the
        # days-left signal is meaningless — don't flag a student for that reason alone
        # (a genuinely low meal count or a real expiry still qualifies them).
        if is_exp or (rem is not None and rem <= 4) or (days_left <= 5 and not holiday_frozen):
            low_balance_list.append({
                "student": s,
                "stats": stats,
                "remaining": rem if rem is not None else 0,
                "total_quota": stats.get("total_quota", 60),
                "is_expired": is_exp,
                "is_validity_expired": stats.get("is_validity_expired", False),
                "validity_days_left": days_left,
                "validity_expiry_date": stats.get("validity_expiry_date"),
                "lapsed_meals": stats.get("lapsed_meals", 0),
            })

    # Sort expired / lowest days / lowest balance first
    low_balance_list.sort(key=lambda x: (not x["is_expired"], x["validity_days_left"], x["remaining"]))
    return low_balance_list


# ---------------- Meal Stats & Calendar ----------------

async def compute_worker_meal_consumption(biz_id: str, worker: dict):
    wid = worker["id"]
    joining_date = worker.get("joining_date") or get_today_date()
    meal_plan_type = worker.get("meal_plan_type") or "BOTH"

    lunch_start_date = worker.get("lunch_start_date") or joining_date
    dinner_start_date = worker.get("dinner_start_date") or joining_date

    today = get_today_date()

    # Combined Pool Quota: BOTH -> 60 total; LUNCH_ONLY -> 30 total; DINNER_ONLY -> 30 total
    # Quota calculation
    total_quota_val = worker.get("total_quota")
    if total_quota_val is not None and int(total_quota_val) > 0:
        total_quota = int(total_quota_val)
    elif worker.get("lunch_quota") or worker.get("dinner_quota"):
        total_quota = int(worker.get("lunch_quota") or 0) + int(worker.get("dinner_quota") or 0)
    else:
        total_quota = 60 if meal_plan_type == "BOTH" else 30

    has_lunch = meal_plan_type in ("BOTH", "LUNCH_ONLY")
    has_dinner = meal_plan_type in ("BOTH", "DINNER_ONLY")

    # Fetch meal window timings
    menu_doc = await db.meal_settings.find_one({"business_id": biz_id}, {"_id": 0})
    windows = menu_doc.get("windows", DEFAULT_MEAL_WINDOWS) if menu_doc else DEFAULT_MEAL_WINDOWS
    lunch_end = windows.get("lunch", {}).get("end_time", "11:00").strip() or "11:00"
    dinner_end = windows.get("dinner", {}).get("end_time", "19:00").strip() or "19:00"
    current_time_str = now_tz().strftime("%H:%M")

    # Admin mess controls: college holiday mode (validity pause) + mess closure (no quota burn)
    holiday_cfg = (menu_doc or {}).get("college_holiday")
    holiday_cfg = holiday_cfg if isinstance(holiday_cfg, dict) else {}
    closure_cfg = (menu_doc or {}).get("mess_closure")
    closure_cfg = closure_cfg if isinstance(closure_cfg, dict) else {}
    # Treat the holiday as active only once it has actually STARTED. A future-dated
    # holiday must not pause anything yet, otherwise the flag would claim "validity
    # paused" while contributing zero paused days.
    holiday_mode_active = bool(holiday_cfg.get("is_active")) and (holiday_cfg.get("start_date") or "9999-12-31") <= today

    # Earliest start date for queries
    starts = []
    if has_lunch:
        starts.append(lunch_start_date)
    if has_dinner:
        starts.append(dinner_start_date)
    if not starts:
        starts.append(joining_date)
    earliest_start = min(starts)

    # Days from earliest_start to today
    try:
        start_dt = datetime.strptime(earliest_start, "%Y-%m-%d")
        today_dt = datetime.strptime(today, "%Y-%m-%d")
    except Exception:
        start_dt = datetime.strptime(today, "%Y-%m-%d")
        today_dt = start_dt

    enrolled_dates = []
    cur = start_dt
    while cur <= today_dt:
        enrolled_dates.append(cur.strftime("%Y-%m-%d"))
        cur += timedelta(days=1)

    # Leaves
    leaves = await db.worker_leaves.find(
        {"business_id": biz_id, "worker_id": wid, "status": "ACTIVE"},
        {"_id": 0}
    ).to_list(100)
    leave_dates = set()
    for lv in leaves:
        try:
            c_lv = datetime.strptime(lv["start_date"], "%Y-%m-%d")
            e_lv = datetime.strptime(lv["end_date"], "%Y-%m-%d")
            while c_lv <= e_lv:
                leave_dates.add(c_lv.strftime("%Y-%m-%d"))
                c_lv += timedelta(days=1)
        except Exception:
            pass

    # Selections within enrolled dates
    selections = await db.meal_selections.find(
        {"business_id": biz_id, "worker_id": wid, "date": {"$in": enrolled_dates}},
        {"_id": 0}
    ).to_list(3000)

    sel_map = {(s["date"], s.get("meal_slot", "lunch")): s for s in selections}

    # Dates the admin closed the mess — those meals were never served, so they must not
    # be deducted from the student's quota.
    range_lo = enrolled_dates[0] if enrolled_dates else today
    range_hi = enrolled_dates[-1] if enrolled_dates else today
    mess_closed_lunch = closed_dates_for_slot(closure_cfg, "lunch", range_lo, range_hi)
    mess_closed_dinner = closed_dates_for_slot(closure_cfg, "dinner", range_lo, range_hi)

    lunch_used = 0
    dinner_used = 0
    lunch_skipped = 0
    dinner_skipped = 0
    mess_closed_days = 0

    for d in enrolled_dates:
        if d in leave_dates:
            continue

        if d in mess_closed_lunch or d in mess_closed_dinner:
            mess_closed_days += 1

        if has_lunch and d >= lunch_start_date and d not in mess_closed_lunch:
            sel = sel_map.get((d, "lunch"))
            is_cancelled = bool(sel and (sel.get("selection_type") == "CANCELLED" or sel.get("action") == "CANCEL"))
            if is_cancelled:
                lunch_skipped += 1
            else:
                # Past dates are eaten; today's meal is counted as eaten only AFTER cutoff window closes
                if d < today or (d == today and current_time_str >= lunch_end):
                    lunch_used += 1

        if has_dinner and d >= dinner_start_date and d not in mess_closed_dinner:
            sel = sel_map.get((d, "dinner"))
            is_cancelled = bool(sel and (sel.get("selection_type") == "CANCELLED" or sel.get("action") == "CANCEL"))
            if is_cancelled:
                dinner_skipped += 1
            else:
                # Past dates are eaten; today's meal is counted as eaten only AFTER cutoff window closes
                if d < today or (d == today and current_time_str >= dinner_end):
                    dinner_used += 1

    total_used = lunch_used + dinner_used
    raw_remaining = max(0, total_quota - total_used) if total_quota > 0 else 0

    # 45-Day Maximum Subscription Validity.
    # College-holiday days do not count against it: when the admin turns holiday mode on,
    # students go home and pause their meals, so those days are added back to the window.
    # Adding the paused days IS the freeze — while the holiday runs, days_elapsed and
    # holiday_paused_days both grow by 1 per day, so validity_days_left stays put and the
    # plan can then only end by exhausting the meal quota. Turning the toggle back off
    # resumes normal counting. Note we deliberately do NOT blanket-suppress expiry on the
    # holiday flag: that would revive a subscription that had already lapsed before the
    # holiday was declared and hand back its forfeited meals.
    SUBSCRIPTION_MAX_VALIDITY_DAYS = 45
    days_elapsed = (today_dt - start_dt).days
    holiday_paused_days = count_period_days(holiday_cfg, earliest_start, today)
    effective_validity_days = SUBSCRIPTION_MAX_VALIDITY_DAYS + holiday_paused_days
    validity_expiry_dt = start_dt + timedelta(days=effective_validity_days)
    validity_expiry_date = validity_expiry_dt.strftime("%Y-%m-%d")
    validity_days_left = max(0, effective_validity_days - days_elapsed)
    is_validity_expired = days_elapsed > effective_validity_days


    lapsed_meals = 0
    if is_validity_expired:
        lapsed_meals = raw_remaining
        total_remaining = 0
    else:
        total_remaining = raw_remaining

    is_expired = is_validity_expired or (total_remaining == 0 and total_quota > 0)
    expiry_reason = None
    if is_validity_expired:
        expiry_reason = "45_DAYS_EXPIRED"
    elif total_remaining == 0 and total_quota > 0:
        expiry_reason = "QUOTA_EXHAUSTED"

    total_skipped = lunch_skipped + dinner_skipped

    return {
        "joining_date": joining_date,
        "lunch_start_date": lunch_start_date,
        "dinner_start_date": dinner_start_date,
        "meal_plan_type": meal_plan_type,
        "total_quota": total_quota,
        "lunch_used": lunch_used,
        "dinner_used": dinner_used,
        "total_used": total_used,
        "lunch_skipped": lunch_skipped,
        "dinner_skipped": dinner_skipped,
        "total_skipped": total_skipped,
        "total_remaining": total_remaining,
        "raw_remaining": raw_remaining,
        "validity_days": effective_validity_days,
        "base_validity_days": SUBSCRIPTION_MAX_VALIDITY_DAYS,
        "validity_expiry_date": validity_expiry_date,
        "validity_days_left": validity_days_left,
        "days_elapsed": days_elapsed,
        "is_validity_expired": is_validity_expired,
        "is_expired": is_expired,
        "expiry_reason": expiry_reason,
        "lapsed_meals": lapsed_meals,
        "holiday_mode_active": holiday_mode_active,
        "holiday_reason": holiday_cfg.get("reason") or "",
        "holiday_start_date": holiday_cfg.get("start_date") or "",
        "holiday_paused_days": holiday_paused_days,
        "mess_closed_days": mess_closed_days,
    }


@api_router.get("/worker/meal-stats")
async def get_student_meal_stats(user: dict = Depends(get_current_worker)):
    biz_id = user["business_id"]
    wid = user["worker_id"]
    worker = await db.workers.find_one({"id": wid, "business_id": biz_id}, {"_id": 0})
    if not worker:
        raise HTTPException(status_code=404, detail="Student not found")

    stats = await compute_worker_meal_consumption(biz_id, worker)
    return stats


async def compute_student_meal_calendar(biz_id: str, wid: str, month: Optional[str] = None) -> dict:
    """Computes per-day meal attendance for a student for a given month (YYYY-MM)."""
    if not month:
        month = now_tz().strftime("%Y-%m")

    try:
        month_dt = datetime.strptime(month, "%Y-%m")
    except ValueError:
        raise HTTPException(status_code=422, detail="month must be YYYY-MM")

    # All days in month
    import calendar as cal_mod
    _, days_in_month = cal_mod.monthrange(month_dt.year, month_dt.month)
    dates = [(month_dt + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(days_in_month)]

    # Fetch all selections and leaves for this month
    selections = await db.meal_selections.find(
        {"business_id": biz_id, "worker_id": wid, "date": {"$in": dates}}, {"_id": 0}
    ).to_list(200)
    sel_map: dict = {}
    for s in selections:
        key = (s["date"], s.get("meal_slot", "lunch"))
        sel_map[key] = s

    leaves = await db.worker_leaves.find(
        {"business_id": biz_id, "worker_id": wid, "status": "ACTIVE",
         "start_date": {"$lte": dates[-1]}, "end_date": {"$gte": dates[0]}},
        {"_id": 0}
    ).to_list(50)

    leave_dates: set = set()
    for lv in leaves:
        try:
            cur = datetime.strptime(lv.get("start_date", ""), "%Y-%m-%d")
            end_lv = datetime.strptime(lv.get("end_date", ""), "%Y-%m-%d")
            while cur <= end_lv:
                leave_dates.add(cur.strftime("%Y-%m-%d"))
                cur += timedelta(days=1)
        except Exception:
            continue

    today = get_today_date()
    worker = await db.workers.find_one({"id": wid, "business_id": biz_id}, {"_id": 0})
    if not worker:
        raise HTTPException(status_code=404, detail="Student profile not found")

    stats = await compute_worker_meal_consumption(biz_id, worker)

    # Fetch meal window timings
    menu_doc = await db.meal_settings.find_one({"business_id": biz_id}, {"_id": 0})
    windows = menu_doc.get("windows", DEFAULT_MEAL_WINDOWS) if menu_doc else DEFAULT_MEAL_WINDOWS
    lunch_end = windows.get("lunch", {}).get("end_time", "11:00").strip() or "11:00"
    dinner_end = windows.get("dinner", {}).get("end_time", "19:00").strip() or "19:00"
    current_time_str = now_tz().strftime("%H:%M")

    joining_date = worker.get("joining_date") or get_today_date()
    meal_plan_type = worker.get("meal_plan_type", "BOTH")
    lunch_start_date = worker.get("lunch_start_date") or joining_date
    dinner_start_date = worker.get("dinner_start_date") or joining_date

    has_lunch = meal_plan_type in ("BOTH", "LUNCH_ONLY")
    has_dinner = meal_plan_type in ("BOTH", "DINNER_ONLY")

    result = []
    for d in dates:
        # Lunch status & details
        lunch_sel = sel_map.get((d, "lunch"))
        lunch_choice = lunch_sel.get("choice_detail") or lunch_sel.get("selection_type") if lunch_sel else None
        lunch_delivery = lunch_sel.get("delivery_option") if lunch_sel else worker.get("delivery_preference", "DINE_IN")

        if not has_lunch:
            lunch_status = "N_A"
        elif d < lunch_start_date:
            lunch_status = "BEFORE_JOIN"
        elif d in leave_dates:
            lunch_status = "LEAVE"
        else:
            is_cancelled = bool(lunch_sel and (lunch_sel.get("selection_type") == "CANCELLED" or lunch_sel.get("action") == "CANCEL"))
            if is_cancelled:
                lunch_status = "CANCELLED"
            elif d < today or (d == today and current_time_str >= lunch_end):
                lunch_status = "ATE"
            else:
                lunch_status = "SCHEDULED"

        # Dinner status & details
        dinner_sel = sel_map.get((d, "dinner"))
        dinner_choice = dinner_sel.get("choice_detail") or dinner_sel.get("selection_type") if dinner_sel else None
        dinner_delivery = dinner_sel.get("delivery_option") if dinner_sel else worker.get("delivery_preference", "DINE_IN")

        if not has_dinner:
            dinner_status = "N_A"
        elif d < dinner_start_date:
            dinner_status = "BEFORE_JOIN"
        elif d in leave_dates:
            dinner_status = "LEAVE"
        else:
            is_cancelled = bool(dinner_sel and (dinner_sel.get("selection_type") == "CANCELLED" or dinner_sel.get("action") == "CANCEL"))
            if is_cancelled:
                dinner_status = "CANCELLED"
            elif d < today or (d == today and current_time_str >= dinner_end):
                dinner_status = "ATE"
            else:
                dinner_status = "SCHEDULED"

        # Overall day status
        if d > today:
            day_status = "FUTURE"
        elif d < today:
            active_slots = []
            if has_lunch and lunch_status != "BEFORE_JOIN":
                active_slots.append(lunch_status)
            if has_dinner and dinner_status != "BEFORE_JOIN":
                active_slots.append(dinner_status)

            if not active_slots:
                day_status = "BEFORE_JOIN"
            elif all(s == "LEAVE" for s in active_slots):
                day_status = "ON_LEAVE"
            else:
                eating_slots = [s for s in active_slots if s != "LEAVE"]
                ate_count = sum(1 for s in eating_slots if s == "ATE")
                cancelled_count = sum(1 for s in eating_slots if s == "CANCELLED")

                if ate_count == len(eating_slots) and len(eating_slots) > 0:
                    day_status = "PRESENT"
                elif cancelled_count == len(eating_slots) and len(eating_slots) > 0:
                    day_status = "ABSENT"
                else:
                    day_status = "PARTIAL"
        else:
            # d == today
            active_slots = []
            if has_lunch and lunch_status != "BEFORE_JOIN":
                active_slots.append(lunch_status)
            if has_dinner and dinner_status != "BEFORE_JOIN":
                active_slots.append(dinner_status)

            if not active_slots:
                day_status = "BEFORE_JOIN"
            elif all(s == "LEAVE" for s in active_slots):
                day_status = "ON_LEAVE"
            elif all(s == "CANCELLED" for s in active_slots):
                day_status = "ABSENT"
            elif all(s == "ATE" for s in active_slots):
                day_status = "PRESENT"
            elif any(s == "SCHEDULED" for s in active_slots):
                day_status = "TODAY"
            else:
                day_status = "PARTIAL"

        result.append({
            "date": d,
            "status": day_status,
            "lunch": lunch_status,
            "dinner": dinner_status,
            "lunch_choice": lunch_choice,
            "dinner_choice": dinner_choice,
            "lunch_delivery": lunch_delivery,
            "dinner_delivery": dinner_delivery,
        })

    summary = {
        "joining_date": joining_date,
        "lunch_start_date": lunch_start_date,
        "dinner_start_date": dinner_start_date,
        "meal_plan_type": meal_plan_type,
        "total_quota": stats["total_quota"],
        "total_remaining": stats["total_remaining"],
        "raw_remaining": stats.get("raw_remaining", stats["total_remaining"]),
        "total_used": stats["total_used"],
        "total_skipped": stats["total_skipped"],
        "validity_days": stats.get("validity_days", 45),
        "validity_expiry_date": stats.get("validity_expiry_date"),
        "validity_days_left": stats.get("validity_days_left", 45),
        "is_validity_expired": stats.get("is_validity_expired", False),
        "is_expired": stats.get("is_expired", False),
        "expiry_reason": stats.get("expiry_reason"),
        "lapsed_meals": stats.get("lapsed_meals", 0),
        "present": len([d for d in result if d["status"] == "PRESENT"]),
        "partial": len([d for d in result if d["status"] == "PARTIAL"]),
        "absent": len([d for d in result if d["status"] == "ABSENT"]),
        "on_leave": len([d for d in result if d["status"] == "ON_LEAVE"]),
    }

    return {"month": month, "joining_date": joining_date, "days": result, "summary": summary, "worker": clean_worker_document(worker)}


@api_router.get("/worker/meal-calendar")
async def get_student_meal_calendar(
    month: Optional[str] = Query(default=None),
    user: dict = Depends(get_current_worker)
):
    """Returns per-day meal attendance for the logged-in student for a given month (YYYY-MM)."""
    return await compute_student_meal_calendar(user["business_id"], user["worker_id"], month)


@api_router.get("/admin/workers/{worker_id}/meal-calendar")
async def get_admin_student_meal_calendar(
    worker_id: str,
    month: Optional[str] = Query(default=None),
    admin: dict = Depends(get_current_admin)
):
    """Admin endpoint: returns per-day meal attendance calendar for a student."""
    return await compute_student_meal_calendar(admin["business_id"], worker_id, month)


@api_router.get("/admin/workers/{worker_id}/meal-stats")
async def get_admin_worker_meal_stats(worker_id: str, admin: dict = Depends(get_current_admin)):
    biz_id = admin["business_id"]
    worker = await db.workers.find_one({"id": worker_id, "business_id": biz_id}, {"_id": 0, "password_hash": 0})
    if not worker:
        raise HTTPException(status_code=404, detail="Student not found")

    stats = await compute_worker_meal_consumption(biz_id, worker)
    return {
        "worker": worker,
        **stats
    }


# ---------------- Meal Settings & Daily Student Selection (Ayushman Kitchen) ----------------

DEFAULT_MEAL_WINDOWS = {
    "lunch": {
        "start_time": "08:00",
        "end_time": "11:00",
        "label": "Lunch Window",
        "is_enabled": True,
    },
    "dinner": {
        "start_time": "16:00",
        "end_time": "19:00",
        "label": "Dinner Window",
        "is_enabled": True,
    },
}

DEFAULT_WEEKLY_MENU = {
    "monday": {
        "day_name": "Monday",
        "lunch": {
            "is_closed": False,
            "standard_mode": "VEG_ONLY",
            "standard_veg_title": "Paneer Butter Masala & Dal Tadka (Lunch)",
            "standard_veg_desc": "Paneer Butter Masala, Yellow Dal Tadka, Steamed Rice, 4 Butter Rotis, Fresh Green Salad, Gulab Jamun",
            "standard_non_veg_title": "",
            "standard_non_veg_desc": "",
            "premium_options": [
                {"id": "p-mon-l1", "name": "Shahi Paneer Deluxe Feast", "type": "VEG", "description": "Rich Shahi Paneer, Dal Makhani, Jeera Rice, 2 Butter Naan, Boondi Raita, Gulab Jamun"},
                {"id": "p-mon-l2", "name": "Mushroom Matar Royal Combo", "type": "VEG", "description": "Mushroom Matar Gravy, Dal Tadka, Peas Pulao, 2 Laccha Parathas, Salad, Kheer"}
            ]
        },
        "dinner": {
            "is_closed": False,
            "standard_mode": "VEG_ONLY",
            "standard_veg_title": "Mix Veg Curry & Dal Fry (Dinner)",
            "standard_veg_desc": "Homestyle Mix Veg, Arhar Dal Fry, Jeera Rice, 4 Tawa Rotis, Green Salad, Rice Kheer",
            "standard_non_veg_title": "",
            "standard_non_veg_desc": "",
            "premium_options": [
                {"id": "p-mon-d1", "name": "Kadhai Paneer Gourmet Dinner", "type": "VEG", "description": "Kadhai Paneer, Dal Makhani, 2 Butter Naan, Basmati Rice, Salad, Sweet"}
            ]
        }
    },
    "tuesday": {
        "day_name": "Tuesday",
        "lunch": {
            "is_closed": False,
            "standard_mode": "VEG_ONLY",
            "standard_veg_title": "Kadai Paneer & Chana Dal Fry (Lunch)",
            "standard_veg_desc": "Kadai Paneer, Chana Dal Fry, Jeera Rice, 4 Tawa Rotis, Green Salad, Rice Kheer",
            "standard_non_veg_title": "",
            "standard_non_veg_desc": "",
            "premium_options": [
                {"id": "p-tue-l1", "name": "Mushroom Do Pyaza Gourmet Thali", "type": "VEG", "description": "Gourmet Mushroom Do Pyaza, Dal Makhani, Basmati Pulao, 2 Garlic Butter Naan, Sweet"}
            ]
        },
        "dinner": {
            "is_closed": False,
            "standard_mode": "VEG_ONLY",
            "standard_veg_title": "Aloo Gobhi Masala & Moong Dal (Dinner)",
            "standard_veg_desc": "Fresh Aloo Gobhi, Yellow Moong Dal, Steamed Rice, 4 Tawa Rotis, Salad, Halwa",
            "standard_non_veg_title": "",
            "standard_non_veg_desc": "",
            "premium_options": [
                {"id": "p-tue-d1", "name": "Paneer Lababdar Special", "type": "VEG", "description": "Paneer Lababdar, Dal Tadka, Jeera Rice, 2 Laccha Paratha, Raita, Rasgulla"}
            ]
        }
    },
    "wednesday": {
        "day_name": "Wednesday",
        "lunch": {
            "is_closed": False,
            "standard_mode": "VEG_AND_NON_VEG",
            "standard_veg_title": "Matar Mushroom Masala (Lunch)",
            "standard_veg_desc": "Matar Mushroom Curry, Yellow Dal Fry, Steamed Rice, 4 Rotis, Salad, Sweet",
            "standard_non_veg_title": "Home Style Chicken Curry (Lunch)",
            "standard_non_veg_desc": "Home Style Chicken Curry (3 Pcs), Steamed Rice, 4 Rotis, Onion Salad",
            "premium_options": [
                {"id": "p-wed-l1", "name": "Butter Chicken with Butter Naan", "type": "NON_VEG", "description": "Creamy Punjabi Butter Chicken (Boneless), 2 Butter Naan, Jeera Rice, Salad, Sweet"},
                {"id": "p-wed-l2", "name": "Paneer Tikka Masala Banquet", "type": "VEG", "description": "Smoky Paneer Tikka Masala, Dal Makhani, 2 Butter Naan, Pulao, Raita, Sweet"}
            ]
        },
        "dinner": {
            "is_closed": False,
            "standard_mode": "VEG_AND_NON_VEG",
            "standard_veg_title": "Paneer Bhurji Gravy & Dal Fry (Dinner)",
            "standard_veg_desc": "Paneer Bhurji, Dal Fry, Peas Pulao, 4 Butter Rotis, Salad, Sweet",
            "standard_non_veg_title": "Special Egg Curry (Dinner)",
            "standard_non_veg_desc": "Egg Curry (2 Eggs in Rich Masala Gravy), Steamed Rice, 4 Rotis, Salad",
            "premium_options": [
                {"id": "p-wed-d1", "name": "Kadai Chicken Special Platter", "type": "NON_VEG", "description": "Spicy Kadai Chicken, Dal Tadka, 2 Laccha Paratha, Basmati Rice, Raita"},
                {"id": "p-wed-d2", "name": "Mushroom Rogan Josh Special", "type": "VEG", "description": "Aromatic Mushroom Rogan Josh, Dal Fry, 2 Naan, Jeera Rice, Salad, Sweet"}
            ]
        }
    },
    "thursday": {
        "day_name": "Thursday",
        "lunch": {
            "is_closed": False,
            "standard_mode": "VEG_ONLY",
            "standard_veg_title": "Palak Paneer & Kashmiri Rajma (Lunch)",
            "standard_veg_desc": "Fresh Palak Paneer, Kashmiri Rajma Masala, Jeera Rice, 4 Rotis, Salad, Sweet",
            "standard_non_veg_title": "",
            "standard_non_veg_desc": "",
            "premium_options": [
                {"id": "p-thu-l1", "name": "Paneer Makhani Deluxe Thali", "type": "VEG", "description": "Silky Paneer Makhani, Dal Makhani, Veg Pulao, 2 Butter Naan, Boondi Raita, Sweet"}
            ]
        },
        "dinner": {
            "is_closed": False,
            "standard_mode": "VEG_ONLY",
            "standard_veg_title": "Punjabi Kadhi Pakoda & Jeera Aloo (Dinner)",
            "standard_veg_desc": "Punjabi Kadhi Pakoda, Jeera Aloo, Steamed Basmati Rice, 4 Rotis, Salad",
            "standard_non_veg_title": "",
            "standard_non_veg_desc": "",
            "premium_options": [
                {"id": "p-thu-d1", "name": "Mushroom Masala Gourmet Platter", "type": "VEG", "description": "Spiced Mushroom Masala, Dal Tadka, 2 Laccha Parathas, Basmati Rice, Salad"}
            ]
        }
    },
    "friday": {
        "day_name": "Friday",
        "lunch": {
            "is_closed": False,
            "standard_mode": "VEG_AND_NON_VEG",
            "standard_veg_title": "Malai Kofta & Dal Fry (Lunch)",
            "standard_veg_desc": "Rich Malai Kofta, Yellow Dal, Peas Pulao, 4 Butter Rotis, Salad, Kheer",
            "standard_non_veg_title": "Chicken Masala Curry (Lunch)",
            "standard_non_veg_desc": "Spicy Chicken Masala (3 Pcs), Steamed Rice, 4 Rotis, Salad",
            "premium_options": [
                {"id": "p-fri-l1", "name": "Chicken Tikka Masala Grand Thali", "type": "NON_VEG", "description": "Grilled Chicken Tikka in Rich Gravy, Dal Tadka, 2 Butter Naan, Pulao, Raita"},
                {"id": "p-fri-l2", "name": "Kadhai Paneer & Mushroom Combo", "type": "VEG", "description": "Kadhai Paneer, Mushroom Malai Gravy, 2 Butter Naan, Peas Pulao, Sweet"}
            ]
        },
        "dinner": {
            "is_closed": False,
            "standard_mode": "VEG_AND_NON_VEG",
            "standard_veg_title": "Kashmiri Dum Aloo & Dal Makhani (Dinner)",
            "standard_veg_desc": "Kashmiri Dum Aloo, Dal Makhani, Jeera Rice, 4 Rotis, Salad, Sweet",
            "standard_non_veg_title": "Egg Masala Curry (Dinner)",
            "standard_non_veg_desc": "Egg Curry (2 Eggs) in Spicy Masala, Steamed Rice, 4 Rotis, Salad",
            "premium_options": [
                {"id": "p-fri-d1", "name": "Chicken Curry with Laccha Paratha", "type": "NON_VEG", "description": "Special Chicken Curry, Dal Makhani, 2 Laccha Parathas, Jeera Rice, Salad"}
            ]
        }
    },
    "saturday": {
        "day_name": "Saturday",
        "lunch": {
            "is_closed": False,
            "standard_mode": "VEG_ONLY",
            "standard_veg_title": "Amritsari Chana & Aloo Gobi (Lunch)",
            "standard_veg_desc": "Pindi Chana Masala, Aloo Gobi Matar, Jeera Rice, 4 Rotis, Boondi Raita, Halwa",
            "standard_non_veg_title": "",
            "standard_non_veg_desc": "",
            "premium_options": [
                {"id": "p-sat-l1", "name": "Royal Shahi Paneer Banquet", "type": "VEG", "description": "Shahi Paneer, Amritsari Chana, 2 Butter Naan, Veg Pulao, Raita, Gulab Jamun"}
            ]
        },
        "dinner": {
            "is_closed": False,
            "standard_mode": "VEG_ONLY",
            "standard_veg_title": "Matar Paneer & Yellow Dal (Dinner)",
            "standard_veg_desc": "Matar Paneer, Yellow Dal Tadka, Steamed Rice, 4 Rotis, Salad, Kheer",
            "standard_non_veg_title": "",
            "standard_non_veg_desc": "",
            "premium_options": [
                {"id": "p-sat-d1", "name": "Mushroom Do Pyaza Special", "type": "VEG", "description": "Rich Mushroom Do Pyaza, Dal Makhani, 2 Laccha Parathas, Basmati Rice, Sweet"}
            ]
        }
    },
    "sunday": {
        "day_name": "Sunday",
        "lunch": {
            "is_closed": False,
            "standard_mode": "VEG_AND_NON_VEG",
            "standard_veg_title": "Special Paneer Butter Masala (Sunday Lunch)",
            "standard_veg_desc": "Paneer Butter Masala, Creamy Dal Makhani, Peas Pulao, 4 Butter Rotis, Gulab Jamun",
            "standard_non_veg_title": "Special Chicken Dum Biryani (Sunday Lunch)",
            "standard_non_veg_desc": "Chicken Dum Biryani (3 pcs), Mirchi Salan, Boondi Raita, 2 Rotis, Gulab Jamun",
            "premium_options": [
                {"id": "p-sun-l1", "name": "Hyderabadi Chicken Dum Biryani Feast", "type": "NON_VEG", "description": "Authentic Chicken Dum Biryani, Mirchi Ka Salan, Boondi Raita, 2 Butter Naan, Gulab Jamun"},
                {"id": "p-sun-l2", "name": "Paneer Butter Masala & Veg Biryani Royal Thali", "type": "VEG", "description": "Paneer Butter Masala, Dal Makhani, Veg Dum Biryani, 2 Laccha Paratha, Raita, Sweet"}
            ]
        },
        "dinner": {
            "is_closed": False,
            "standard_mode": "VEG_AND_NON_VEG",
            "standard_veg_title": "Paneer Pasanda & Dal Tadka (Sunday Dinner)",
            "standard_veg_desc": "Paneer Pasanda, Dal Tadka, Jeera Rice, 4 Butter Rotis, Salad, Sweet",
            "standard_non_veg_title": "Mughlai Chicken Curry (Sunday Dinner)",
            "standard_non_veg_desc": "Mughlai Chicken Curry (3 Pcs), Steamed Rice, 4 Butter Rotis, Salad",
            "premium_options": [
                {"id": "p-sun-d1", "name": "Butter Chicken Royal Banquet", "type": "NON_VEG", "description": "Rich Butter Chicken, Dal Makhani, 2 Garlic Butter Naan, Jeera Rice, Raita, Sweet"},
                {"id": "p-sun-d2", "name": "Gourmet Mushroom Matar & Naan Platter", "type": "VEG", "description": "Mushroom Matar Masala, Dal Tadka, 2 Garlic Naan, Pulao, Raita, Gulab Jamun"}
            ]
        }
    }
}


# ---------------------------------------------------------------------------
# College Holiday Mode (pauses subscription validity) & Mess Closure controls
# ---------------------------------------------------------------------------

DEFAULT_COLLEGE_HOLIDAY = {
    "is_active": False,
    "start_date": "",
    "end_date": "",
    "reason": "",
    "history": [],
}

DEFAULT_MESS_CLOSURE = {
    "is_active": False,
    "slots": [],
    "start_date": "",
    "end_date": "",
    "reason": "",
    "history": [],
}

ALL_MEAL_SLOTS = ["lunch", "dinner"]


def normalize_closure_slots(raw) -> list:
    """Sanitize a slots payload into a subset of ['lunch', 'dinner'] (empty -> both)."""
    if isinstance(raw, str):
        raw = [raw]
    slots = []
    for item in (raw or []):
        val = str(item).strip().lower()
        if val == "both":
            return list(ALL_MEAL_SLOTS)
        if val in ALL_MEAL_SLOTS and val not in slots:
            slots.append(val)
    return slots or list(ALL_MEAL_SLOTS)


def period_list(config: dict) -> list:
    """Every period (completed history + the live one, if active) from a holiday/closure config."""
    if not isinstance(config, dict):
        return []
    periods = [p for p in (config.get("history") or []) if isinstance(p, dict)]
    if config.get("is_active") and (config.get("start_date") or "").strip():
        periods = periods + [{
            "start_date": (config.get("start_date") or "").strip(),
            "end_date": (config.get("end_date") or "").strip(),
            "slots": config.get("slots") or [],
            "reason": config.get("reason") or "",
        }]
    return periods


def count_period_days(config: dict, lo: str, hi: str) -> int:
    """Distinct calendar days inside [lo, hi] that are covered by any period of the config."""
    if not config or lo > hi:
        return 0
    covered = set()
    for p in period_list(config):
        start = (p.get("start_date") or "").strip()
        if not start:
            continue
        # An open-ended (still running) period extends up to `hi`
        end = (p.get("end_date") or "").strip() or hi
        start = max(start, lo)
        end = min(end, hi)
        if start > end:
            continue
        try:
            cur = datetime.strptime(start, "%Y-%m-%d")
            last = datetime.strptime(end, "%Y-%m-%d")
        except Exception:
            continue
        while cur <= last:
            covered.add(cur.strftime("%Y-%m-%d"))
            cur += timedelta(days=1)
    return len(covered)


def get_mess_closure_status(config: dict, slot_key: str, target_date_str: str) -> dict:
    """Whether the mess is administratively closed for `slot_key` on `target_date_str`."""
    slot = (slot_key or "").strip().lower()
    for p in period_list(config):
        start = (p.get("start_date") or "").strip()
        end = (p.get("end_date") or "").strip()
        if not start or target_date_str < start:
            continue
        if end and target_date_str > end:
            continue
        slots = normalize_closure_slots(p.get("slots"))
        if slot in slots:
            return {
                "is_closed": True,
                "reason": p.get("reason") or "Mess temporarily closed by admin",
                "start_date": start,
                "end_date": end,
                "slots": slots,
            }
    return {"is_closed": False, "reason": "", "start_date": "", "end_date": "", "slots": []}


def closed_dates_for_slot(config: dict, slot_key: str, lo: str, hi: str) -> set:
    """Set of dates in [lo, hi] where `slot_key` was closed by admin (so it must not burn quota)."""
    if not config or lo > hi:
        return set()
    slot = (slot_key or "").strip().lower()
    closed = set()
    for p in period_list(config):
        if slot not in normalize_closure_slots(p.get("slots")):
            continue
        start = (p.get("start_date") or "").strip()
        if not start:
            continue
        end = (p.get("end_date") or "").strip() or hi
        start = max(start, lo)
        end = min(end, hi)
        if start > end:
            continue
        try:
            cur = datetime.strptime(start, "%Y-%m-%d")
            last = datetime.strptime(end, "%Y-%m-%d")
        except Exception:
            continue
        while cur <= last:
            closed.add(cur.strftime("%Y-%m-%d"))
            cur += timedelta(days=1)
    return closed


def check_meal_slot_window(slot_key: str, windows: dict, day_slot_menu: dict, target_date_str: str, mess_closure: dict = None) -> dict:
    # Admin mess closure overrides everything else (lunch / dinner / both, for N days)
    closure = get_mess_closure_status(mess_closure or {}, slot_key, target_date_str)
    if closure["is_closed"]:
        span = closure["start_date"]
        if closure["end_date"]:
            span = f"{closure['start_date']} to {closure['end_date']}"
        return {
            "is_open": False,
            "status": "MESS_CLOSED",
            "message": f"Mess Closed by Admin ({span}) — {closure['reason']}",
            "start_time": "",
            "end_time": "",
            "closure": closure,
        }

    is_closed = day_slot_menu.get("is_closed", False) if isinstance(day_slot_menu, dict) else False
    if is_closed:
        return {
            "is_open": False,
            "status": "HOLIDAY",
            "message": "Kitchen Closed / Holiday",
            "start_time": "",
            "end_time": ""
        }

    win = windows.get(slot_key, DEFAULT_MEAL_WINDOWS.get(slot_key, {}))
    if not win.get("is_enabled", True):
        return {
            "is_open": True,
            "status": "ALWAYS_OPEN",
            "message": "Ordering Window Open",
            "start_time": "",
            "end_time": ""
        }
    
    start_str = win.get("start_time", "").strip()
    end_str = win.get("end_time", "").strip()

    # If admin hasn't set times, treat window as always open
    if not start_str or not end_str:

        return {
            "is_open": True,
            "status": "ALWAYS_OPEN",
            "message": "Ordering Window Open",
            "start_time": "",
            "end_time": ""
        }

    today_str = get_today_date()
    if target_date_str != today_str:
        if target_date_str > today_str:
            return {
                "is_open": True,
                "status": "FUTURE_DATE",
                "message": f"Advance Selection (Window: {start_str} - {end_str})",
                "start_time": start_str,
                "end_time": end_str
            }
        else:
            return {
                "is_open": False,
                "status": "PAST_DATE",
                "message": "Past Date (Closed)",
                "start_time": start_str,
                "end_time": end_str
            }
    
    tz = now_tz()
    current_time_str = tz.strftime("%H:%M")
    
    if start_str <= current_time_str <= end_str:
        return {
            "is_open": True,
            "status": "OPEN",
            "message": f"Window Open (Closes at {end_str})",
            "start_time": start_str,
            "end_time": end_str,
            "current_time": current_time_str
        }
    elif current_time_str < start_str:
        return {
            "is_open": False,
            "status": "NOT_STARTED",
            "message": f"Window Opens at {start_str}",
            "start_time": start_str,
            "end_time": end_str,
            "current_time": current_time_str
        }
    else:
        return {
            "is_open": False,
            "status": "CLOSED",
            "message": f"Window Closed at {end_str} (Prep in Progress)",
            "start_time": start_str,
            "end_time": end_str,
            "current_time": current_time_str
        }


DEFAULT_PREMIUM_ITEMS = [
    {"id": "p-1", "name": "🍗 Special Butter Chicken / Chicken Curry", "type": "NON_VEG", "description": "Tender chicken cooked in rich aromatic spiced gravy"},
    {"id": "p-2", "name": "🥦 Shahi Paneer / Paneer Butter Masala", "type": "VEG", "description": "Fresh paneer cubes in creamy royal gravy with butter rotis"},
    {"id": "p-3", "name": "🍄 Gourmet Mushroom Matar Masala", "type": "VEG", "description": "Fresh button mushrooms and green peas in rich spiced gravy"},
    {"id": "p-4", "name": "🍗 Royal Chicken Biryani with Raita", "type": "NON_VEG", "description": "Fragrant basmati rice dum cooked with marinated chicken and spices"},
    {"id": "p-5", "name": "🥦 Kadai Paneer & Dal Makhani Feast", "type": "VEG", "description": "Spiced kadai paneer, slow-cooked black dal makhani, and jeera rice"},
]

# Sunday is a special Biryani Day for lunch with Veg & Non-Veg choices. Sunday dinner uses regular menu.
DEFAULT_PREMIUM_SUNDAY = {
    "lunch_veg": {
        "id": "p-sun-lunch-veg",
        "name": "🥦 Special Sunday Veg Paneer Dum Biryani",
        "type": "VEG",
        "description": "Hyderabadi spiced Veg & Paneer Dum Biryani, Mirchi Ka Salan, Boondi Raita, Gulab Jamun",
    },
    "lunch_non_veg": {
        "id": "p-sun-lunch-non-veg",
        "name": "🍗 Special Sunday Chicken Dum Biryani",
        "type": "NON_VEG",
        "description": "Hyderabadi Chicken Dum Biryani, Mirchi Ka Salan, Boondi Raita, Gulab Jamun",
    },
}


def normalize_premium_sunday(raw) -> dict:
    """Coerce an admin-supplied premium Sunday payload into {lunch_veg: dish, lunch_non_veg: dish}."""
    if not isinstance(raw, dict):
        raw = {}

    # Handle lunch_veg
    raw_veg = raw.get("lunch_veg")
    if not isinstance(raw_veg, dict):
        if isinstance(raw.get("lunch"), dict) and raw.get("lunch", {}).get("type") == "VEG":
            raw_veg = raw.get("lunch")
        else:
            raw_veg = {}

    veg_name = str(raw_veg.get("name") or "").strip() or DEFAULT_PREMIUM_SUNDAY["lunch_veg"]["name"]
    veg_desc = str(raw_veg.get("description") or "").strip()
    if not veg_desc and veg_name == DEFAULT_PREMIUM_SUNDAY["lunch_veg"]["name"]:
        veg_desc = DEFAULT_PREMIUM_SUNDAY["lunch_veg"]["description"]

    # Handle lunch_non_veg
    raw_non_veg = raw.get("lunch_non_veg")
    if not isinstance(raw_non_veg, dict):
        if isinstance(raw.get("lunch"), dict) and raw.get("lunch", {}).get("type") != "VEG":
            raw_non_veg = raw.get("lunch")
        else:
            raw_non_veg = {}

    non_veg_name = str(raw_non_veg.get("name") or "").strip() or DEFAULT_PREMIUM_SUNDAY["lunch_non_veg"]["name"]
    non_veg_desc = str(raw_non_veg.get("description") or "").strip()
    if not non_veg_desc and non_veg_name == DEFAULT_PREMIUM_SUNDAY["lunch_non_veg"]["name"]:
        non_veg_desc = DEFAULT_PREMIUM_SUNDAY["lunch_non_veg"]["description"]

    return {
        "lunch_veg": {
            "id": "p-sun-lunch-veg",
            "name": veg_name,
            "type": "VEG",
            "description": veg_desc,
        },
        "lunch_non_veg": {
            "id": "p-sun-lunch-non-veg",
            "name": non_veg_name,
            "type": "NON_VEG",
            "description": non_veg_desc,
        },
    }


def sunday_lunch_premium_options(menu_doc: dict) -> list[dict]:
    """Returns the two Sunday lunch options: [lunch_veg, lunch_non_veg]."""
    raw = (menu_doc or {}).get("premium_sunday")
    normalized = normalize_premium_sunday(raw)
    return [normalized["lunch_veg"], normalized["lunch_non_veg"]]


@api_router.get("/meal-settings")
async def get_meal_settings(admin: dict = Depends(get_current_admin)):
    biz_id = admin["business_id"]
    doc = await db.meal_settings.find_one({"business_id": biz_id}, {"_id": 0})
    if not doc or not doc.get("days"):
        doc = {
            "business_id": biz_id,
            "days": DEFAULT_WEEKLY_MENU,
            "windows": DEFAULT_MEAL_WINDOWS,
            "premium_items": DEFAULT_PREMIUM_ITEMS,
            "premium_sunday": DEFAULT_PREMIUM_SUNDAY,
            "college_holiday": DEFAULT_COLLEGE_HOLIDAY,
            "mess_closure": DEFAULT_MESS_CLOSURE,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        await db.meal_settings.update_one({"business_id": biz_id}, {"$set": doc}, upsert=True)
    if "windows" not in doc:
        doc["windows"] = DEFAULT_MEAL_WINDOWS
    if "premium_items" not in doc or not doc["premium_items"]:
        doc["premium_items"] = DEFAULT_PREMIUM_ITEMS
    doc["premium_sunday"] = normalize_premium_sunday(doc.get("premium_sunday"))
    if not isinstance(doc.get("college_holiday"), dict):
        doc["college_holiday"] = dict(DEFAULT_COLLEGE_HOLIDAY)
    if not isinstance(doc.get("mess_closure"), dict):
        doc["mess_closure"] = dict(DEFAULT_MESS_CLOSURE)
    return doc


@api_router.put("/meal-settings")
async def update_meal_settings(body: dict = Body(...), admin: dict = Depends(get_current_admin)):
    biz_id = admin["business_id"]
    days = body.get("days", {})
    windows = body.get("windows", DEFAULT_MEAL_WINDOWS)
    premium_items = body.get("premium_items", DEFAULT_PREMIUM_ITEMS)
    if not isinstance(days, dict):
        raise HTTPException(status_code=422, detail="Invalid days format")

    update_doc = {
        "business_id": biz_id,
        "days": days,
        "windows": windows,
        "premium_items": premium_items if isinstance(premium_items, list) and len(premium_items) > 0 else DEFAULT_PREMIUM_ITEMS,
        "premium_sunday": normalize_premium_sunday(body.get("premium_sunday")),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    await db.meal_settings.update_one({"business_id": biz_id}, {"$set": update_doc}, upsert=True)
    await db.meal_reminder_logs.delete_many({"business_id": biz_id, "date": get_today_date()})
    return {"ok": True, "meal_settings": update_doc}


# ---------------------------------------------------------------------------
# Admin mess controls: college holiday mode + mess closure
# ---------------------------------------------------------------------------

async def load_mess_controls(biz_id: str) -> dict:
    """Current college-holiday and mess-closure state for a business."""
    doc = await db.meal_settings.find_one(
        {"business_id": biz_id},
        {"_id": 0, "college_holiday": 1, "mess_closure": 1}
    ) or {}
    holiday = doc.get("college_holiday")
    closure = doc.get("mess_closure")
    return {
        "college_holiday": holiday if isinstance(holiday, dict) else dict(DEFAULT_COLLEGE_HOLIDAY),
        "mess_closure": closure if isinstance(closure, dict) else dict(DEFAULT_MESS_CLOSURE),
    }


@api_router.get("/mess-controls")
async def get_mess_controls(admin: dict = Depends(get_current_admin)):
    biz_id = admin["business_id"]
    controls = await load_mess_controls(biz_id)
    today = get_today_date()
    controls["today"] = today
    controls["closed_today"] = {
        slot: get_mess_closure_status(controls["mess_closure"], slot, today)
        for slot in ALL_MEAL_SLOTS
    }
    return controls


@api_router.post("/mess-controls/college-holiday")
async def set_college_holiday(body: dict = Body(...), admin: dict = Depends(get_current_admin)):
    """Toggle college holiday mode. While ON, the 45-day subscription validity is frozen —
    a student's plan then ends only when the meal quota runs out."""
    biz_id = admin["business_id"]
    activate = bool(body.get("is_active"))
    reason = str(body.get("reason") or "").strip()[:200]
    today = get_today_date()

    controls = await load_mess_controls(biz_id)
    holiday = controls["college_holiday"]
    history = [p for p in (holiday.get("history") or []) if isinstance(p, dict)]
    was_active = bool(holiday.get("is_active"))

    if activate:
        if was_active:
            # Already on — only refresh the label
            holiday["reason"] = reason or holiday.get("reason") or "College holiday"
        else:
            holiday = {
                "is_active": True,
                "start_date": str(body.get("start_date") or today).strip() or today,
                "end_date": "",
                "reason": reason or "College holiday — subscription validity paused",
                "history": history,
            }
    else:
        if was_active:
            start = (holiday.get("start_date") or today).strip()
            end = today
            if start <= end:
                history = history + [{
                    "start_date": start,
                    "end_date": end,
                    "reason": holiday.get("reason") or "College holiday",
                }]
        holiday = {
            "is_active": False,
            "start_date": "",
            "end_date": "",
            "reason": "",
            "history": history,
        }

    now_iso = datetime.now(timezone.utc).isoformat()
    await db.meal_settings.update_one(
        {"business_id": biz_id},
        {"$set": {"business_id": biz_id, "college_holiday": holiday, "updated_at": now_iso}},
        upsert=True
    )

    paused_days = count_period_days(holiday, "1970-01-01", today)

    if activate != was_active:
        title = "🏫 College Holiday Mode ON" if activate else "🏫 College Holiday Mode OFF"
        msg = (
            "Your subscription validity is paused during the college holiday. Unused meals stay safe — "
            "your plan will now end only when your meal quota is finished."
            if activate else
            "College holiday has ended. Normal 45-day subscription validity has resumed (holiday days were not counted)."
        )
        await db.activity_logs.insert_one({
            "id": str(uuid.uuid4()),
            "business_id": biz_id,
            "worker_id": None,
            "worker_name": "Admin",
            "type": "COLLEGE_HOLIDAY_TOGGLED",
            "title": f"{title} {('(' + reason + ')') if reason else ''}".strip(),
            "created_at": now_iso,
        })
        asyncio.create_task(deliver_student_slots_push(
            business_id=biz_id,
            slots=ALL_MEAL_SLOTS,
            title=title,
            body=msg,
            url="/worker",
            tag="college-holiday",
        ))

    return {"ok": True, "college_holiday": holiday, "paused_days": paused_days}


@api_router.post("/mess-controls/mess-closure")
async def set_mess_closure(body: dict = Body(...), admin: dict = Depends(get_current_admin)):
    """Close the mess for lunch, dinner or both — for a single day or a date range.
    Students are push-notified and their meal-selection portal is cut off for that window."""
    biz_id = admin["business_id"]
    activate = bool(body.get("is_active"))
    today = get_today_date()

    controls = await load_mess_controls(biz_id)
    closure = controls["mess_closure"]
    history = [p for p in (closure.get("history") or []) if isinstance(p, dict)]
    was_active = bool(closure.get("is_active"))

    if activate:
        # Reject unrecognized slot tokens instead of letting them fall through to the
        # "empty -> both" default: a single typo would otherwise silently close the whole
        # mess, blocking a slot the admin meant to keep open and freeing its quota.
        raw_slots = body.get("slots")
        raw_slots = [raw_slots] if isinstance(raw_slots, str) else (raw_slots or [])
        bad_slots = [str(s) for s in raw_slots if str(s).strip().lower() not in ALL_MEAL_SLOTS + ["both"]]
        if bad_slots:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid meal slot(s): {', '.join(bad_slots)}. Use 'lunch', 'dinner' or 'both'."
            )
        slots = normalize_closure_slots(raw_slots)
        start_date = str(body.get("start_date") or today).strip() or today
        end_date = str(body.get("end_date") or "").strip()
        days_raw = body.get("days")

        for label, value in (("start_date", start_date), ("end_date", end_date)):
            if value:
                try:
                    datetime.strptime(value, "%Y-%m-%d")
                except ValueError:
                    raise HTTPException(status_code=422, detail=f"Invalid {label}. Use YYYY-MM-DD.")

        # "band karo N dino ke liye" — derive the end date from a day count
        if not end_date and days_raw not in (None, ""):
            try:
                num_days = int(days_raw)
            except (TypeError, ValueError):
                raise HTTPException(status_code=422, detail="Number of days must be a whole number.")
            if num_days < 1 or num_days > 180:
                raise HTTPException(status_code=422, detail="Number of days must be between 1 and 180.")
            end_date = (datetime.strptime(start_date, "%Y-%m-%d") + timedelta(days=num_days - 1)).strftime("%Y-%m-%d")

        if not end_date:
            end_date = start_date
        if end_date < start_date:
            raise HTTPException(status_code=422, detail="End date cannot be before the start date.")

        reason = str(body.get("reason") or "").strip()[:200] or "Mess closed by admin"

        # Archive the previous closure so past dates keep their closed status
        if was_active and (closure.get("start_date") or ""):
            prev_end = (closure.get("end_date") or "").strip() or today
            history = history + [{
                "start_date": closure.get("start_date"),
                "end_date": min(prev_end, today),
                "slots": normalize_closure_slots(closure.get("slots")),
                "reason": closure.get("reason") or "Mess closed by admin",
            }]

        closure = {
            "is_active": True,
            "slots": slots,
            "start_date": start_date,
            "end_date": end_date,
            "reason": reason,
            "history": history,
        }
    else:
        if was_active and (closure.get("start_date") or ""):
            start = closure.get("start_date")
            # Cut the closure short at today so future dates reopen, but keep the past accurate
            end = min((closure.get("end_date") or today), today)
            if start <= end:
                history = history + [{
                    "start_date": start,
                    "end_date": end,
                    "slots": normalize_closure_slots(closure.get("slots")),
                    "reason": closure.get("reason") or "Mess closed by admin",
                }]
        closure = {
            "is_active": False,
            "slots": [],
            "start_date": "",
            "end_date": "",
            "reason": "",
            "history": history,
        }

    now_iso = datetime.now(timezone.utc).isoformat()
    await db.meal_settings.update_one(
        {"business_id": biz_id},
        {"$set": {"business_id": biz_id, "mess_closure": closure, "updated_at": now_iso}},
        upsert=True
    )
    # Reminder pushes for a closed slot would be misleading
    await db.meal_reminder_logs.delete_many({"business_id": biz_id, "date": today})

    if activate:
        slot_label = " & ".join(s.capitalize() for s in closure["slots"])
        span = closure["start_date"] if closure["start_date"] == closure["end_date"] else f"{closure['start_date']} → {closure['end_date']}"
        title = f"🚫 Mess Closed: {slot_label}"
        msg = f"{slot_label} service is closed ({span}). Reason: {closure['reason']}. Meal selection is disabled and these meals will not be deducted from your quota."
        act_title = f"🚫 Admin closed {slot_label} ({span}) — {closure['reason']}"
    else:
        title = "✅ Mess Reopened"
        msg = "The mess is open again. You can choose or cancel your meals as usual."
        act_title = "✅ Admin reopened the mess (closure cancelled)"

    await db.activity_logs.insert_one({
        "id": str(uuid.uuid4()),
        "business_id": biz_id,
        "worker_id": None,
        "worker_name": "Admin",
        "type": "MESS_CLOSURE_UPDATED",
        "title": act_title,
        "created_at": now_iso,
    })
    asyncio.create_task(deliver_student_slots_push(
        business_id=biz_id,
        slots=closure["slots"] or ALL_MEAL_SLOTS,
        title=title,
        body=msg,
        url="/worker",
        tag="mess-closure",
    ))

    return {
        "ok": True,
        "mess_closure": closure,
        "closed_today": {slot: get_mess_closure_status(closure, slot, today) for slot in ALL_MEAL_SLOTS},
    }



@api_router.get("/meal-headcount")
async def get_meal_headcount(
    date: str = Query(default_factory=lambda: get_today_date()),
    admin: dict = Depends(get_current_admin)
):
    biz_id = admin["business_id"]
    dt = datetime.strptime(date, "%Y-%m-%d")
    day_key = dt.strftime("%A").lower()

    menu_doc = await db.meal_settings.find_one({"business_id": biz_id}, {"_id": 0})
    days = menu_doc.get("days", DEFAULT_WEEKLY_MENU) if menu_doc else DEFAULT_WEEKLY_MENU
    windows = menu_doc.get("windows", DEFAULT_MEAL_WINDOWS) if menu_doc else DEFAULT_MEAL_WINDOWS
    day_data = days.get(day_key, DEFAULT_WEEKLY_MENU.get(day_key, {}))

    # Support legacy structure if day_data had standard_mode directly
    lunch_menu = day_data.get("lunch") or {
        "is_closed": False,
        "standard_mode": day_data.get("standard_mode", "VEG_ONLY"),
        "standard_veg_title": day_data.get("standard_veg_title", ""),
        "standard_veg_desc": day_data.get("standard_veg_desc", ""),
        "standard_non_veg_title": day_data.get("standard_non_veg_title", ""),
        "standard_non_veg_desc": day_data.get("standard_non_veg_desc", ""),
        "premium_options": day_data.get("premium_options", [])
    }
    dinner_menu = day_data.get("dinner") or {
        "is_closed": False,
        "standard_mode": day_data.get("standard_mode", "VEG_ONLY"),
        "standard_veg_title": day_data.get("standard_veg_title", ""),
        "standard_veg_desc": day_data.get("standard_veg_desc", ""),
        "standard_non_veg_title": day_data.get("standard_non_veg_title", ""),
        "standard_non_veg_desc": day_data.get("standard_non_veg_desc", ""),
        "premium_options": day_data.get("premium_options", [])
    }

    closure_cfg = (menu_doc or {}).get("mess_closure")
    closure_cfg = closure_cfg if isinstance(closure_cfg, dict) else {}
    holiday_cfg = (menu_doc or {}).get("college_holiday")
    holiday_cfg = holiday_cfg if isinstance(holiday_cfg, dict) else {}

    is_sunday = day_key == "sunday"
    if is_sunday:
        lunch_menu = {
            **lunch_menu,
            "premium_options": sunday_lunch_premium_options(menu_doc),
            "is_sunday_special": True,
        }
        dinner_menu = {
            **dinner_menu,
            "premium_options": (menu_doc.get("premium_items") or DEFAULT_PREMIUM_ITEMS),
            "is_sunday_special": False,
        }
    else:
        lunch_menu["premium_options"] = (menu_doc.get("premium_items") or DEFAULT_PREMIUM_ITEMS)
        dinner_menu["premium_options"] = (menu_doc.get("premium_items") or DEFAULT_PREMIUM_ITEMS)

    students = await db.workers.find({"business_id": biz_id, "status": "ACTIVE"}, {"_id": 0}).to_list(500)
    selections = await db.meal_selections.find({"business_id": biz_id, "date": date}, {"_id": 0}).to_list(1000)
    active_leaves = await db.worker_leaves.find({
        "business_id": biz_id,
        "status": "ACTIVE",
        "start_date": {"$lte": date},
        "end_date": {"$gte": date}
    }, {"_id": 0}).to_list(500)
    leave_worker_ids = {lv["worker_id"] for lv in active_leaves}

    # Map by (worker_id, meal_slot)
    selections_map = {}
    for s in selections:
        slot = (s.get("meal_slot") or "lunch").lower()
        selections_map[(s["worker_id"], slot)] = s

    def compute_slot_stats(slot_key: str, slot_menu: dict):
        closure_status = get_mess_closure_status(closure_cfg, slot_key, date)
        is_mess_closed = closure_status["is_closed"]
        is_closed = bool(slot_menu.get("is_closed", False)) or is_mess_closed
        standard_mode = slot_menu.get("standard_mode", "VEG_ONLY")

        total_veg = 0
        total_non_veg = 0
        total_cancelled = 0
        total_on_leave = 0
        total_eating = 0
        total_dine_in = 0
        total_delivery = 0
        total_pickup = 0
        premium_counts = {}
        student_list = []

        for s in students:
            sid = s["id"]
            plan = s.get("work_type", "Standard")
            meal_plan = s.get("meal_plan_type", "BOTH")
            default_pref = (s.get("diet_preference") or "VEG").upper()
            default_deliv_pref = (s.get("delivery_preference") or "DINE_IN").upper()
            default_deliv_addr = s.get("delivery_address") or ""
            default_deliv_notes = s.get("delivery_notes") or ""
            sel = selections_map.get((sid, slot_key))
            is_on_leave = sid in leave_worker_ids

            is_plan_included = True
            if meal_plan == "LUNCH_ONLY" and slot_key == "dinner":
                is_plan_included = False
            elif meal_plan == "DINNER_ONLY" and slot_key == "lunch":
                is_plan_included = False

            is_cancelled = False
            effective_choice = ""
            choice_detail = ""
            effective_delivery = default_deliv_pref if default_deliv_pref in {"DINE_IN", "DELIVERY", "PICKUP"} else "DINE_IN"
            delivery_address = default_deliv_addr
            delivery_notes = default_deliv_notes
            is_customized = bool(sel)

            if sel and sel.get("delivery_option"):
                opt = sel.get("delivery_option", "").strip().upper()
                if opt in {"DINE_IN", "DELIVERY", "PICKUP"}:
                    effective_delivery = opt
                if sel.get("delivery_address"):
                    delivery_address = sel.get("delivery_address")
                if sel.get("delivery_notes"):
                    delivery_notes = sel.get("delivery_notes")

            if not is_plan_included:
                is_cancelled = True
                effective_choice = "NOT_IN_PLAN"
                choice_detail = f"Not in Plan ({meal_plan})"
            elif is_on_leave:
                is_cancelled = True
                effective_choice = "ON_LEAVE"
                choice_detail = "On Vacation / Home Leave"
                total_on_leave += 1
            elif is_closed:
                is_cancelled = True
                effective_choice = "CLOSED"
                choice_detail = closure_status["reason"] if is_mess_closed else "Kitchen Closed / Holiday"
            elif sel and (sel.get("selection_type") == "CANCELLED" or sel.get("action") == "CANCEL"):
                is_cancelled = True
                effective_choice = "CANCELLED"
                choice_detail = "Cancelled by Student (Not Eating)"
                total_cancelled += 1
            else:
                total_eating += 1
                if effective_delivery == "DELIVERY":
                    total_delivery += 1
                elif effective_delivery == "PICKUP":
                    total_pickup += 1
                else:
                    total_dine_in += 1

                if plan.lower() == "premium":
                    if is_sunday and slot_key == "lunch":
                        sun_opts = slot_menu.get("premium_options") or []
                        veg_opt = next((o for o in sun_opts if o.get("type") == "VEG"), None) or (sun_opts[0] if len(sun_opts) > 0 else {})
                        non_veg_opt = next((o for o in sun_opts if o.get("type") == "NON_VEG"), None) or (sun_opts[1] if len(sun_opts) > 1 else veg_opt)
                        if sel and sel.get("selected_item_name"):
                            effective_choice = "PREMIUM"
                            choice_detail = sel["selected_item_name"]
                        else:
                            default_dish = non_veg_opt if default_pref == "NON_VEG" else veg_opt
                            effective_choice = "PREMIUM"
                            choice_detail = default_dish.get("name", "Sunday Biryani Special")
                    elif sel and sel.get("selected_item_name"):
                        effective_choice = "PREMIUM"
                        choice_detail = sel["selected_item_name"]
                    else:
                        first_opt = (slot_menu.get("premium_options") or [{}])[0]
                        effective_choice = "PREMIUM"
                        choice_detail = first_opt.get("name", "Chef Premium Special")
                    premium_counts[choice_detail] = premium_counts.get(choice_detail, 0) + 1
                else:
                    if standard_mode == "VEG_ONLY":
                        effective_choice = "VEG"
                        choice_detail = slot_menu.get("standard_veg_title") or "Standard Pure Veg Meal"
                        total_veg += 1
                    else:
                        if sel and sel.get("selection_type") in {"VEG", "NON_VEG"}:
                            chosen = sel["selection_type"]
                        else:
                            chosen = default_pref
                        effective_choice = chosen
                        if chosen == "NON_VEG":
                            choice_detail = slot_menu.get("standard_non_veg_title") or "Standard Non-Veg Meal"
                            total_non_veg += 1
                        else:
                            choice_detail = slot_menu.get("standard_veg_title") or "Standard Veg Meal"
                            total_veg += 1

            student_list.append({
                "worker_id": sid,
                "name": s.get("name", "Student"),
                "mobile": s.get("mobile", ""),
                "plan": plan,
                "meal_plan_type": meal_plan,
                "delivery_option": effective_delivery,
                "delivery_address": delivery_address,
                "delivery_notes": delivery_notes,
                "is_cancelled": is_cancelled,
                "is_on_leave": is_on_leave,
                "effective_choice": effective_choice,
                "choice_detail": choice_detail,
                "is_customized": is_customized,
            })

        window_status = check_meal_slot_window(slot_key, windows, slot_menu, date, closure_cfg)
        return {
            "slot": slot_key,
            "is_closed": is_closed,
            "is_mess_closed": is_mess_closed,
            "mess_closure": closure_status,
            "is_premium_fixed": False,
            "is_sunday_special": is_sunday and slot_key == "lunch",
            "window": window_status,
            "menu": slot_menu,
            "summary": {
                "total_students": len(students),
                "total_eating": total_eating,
                "total_dine_in": total_dine_in,
                "total_delivery": total_delivery,
                "total_pickup": total_pickup,
                "cancelled_count": total_cancelled,
                "on_leave_count": total_on_leave,
                "standard_veg": total_veg,
                "standard_non_veg": total_non_veg,
                "premium_total": sum(premium_counts.values()),
                "premium_breakdown": premium_counts,
            },
            "students": student_list
        }

    lunch_stats = compute_slot_stats("lunch", lunch_menu)
    dinner_stats = compute_slot_stats("dinner", dinner_menu)

    return {
        "date": date,
        "day_name": day_data.get("day_name", dt.strftime("%A")),
        "windows": windows,
        "college_holiday": holiday_cfg,
        "mess_closure": closure_cfg,
        "is_premium_fixed_day": False,
        "is_sunday": is_sunday,
        "lunch": lunch_stats,
        "dinner": dinner_stats,
    }


@api_router.get("/worker/today-meal")
async def get_student_today_meal(
    date: Optional[str] = Query(default=None),
    user: dict = Depends(get_current_worker)
):
    biz_id = user["business_id"]
    wid = user["worker_id"]
    worker = await db.workers.find_one({"id": wid, "business_id": biz_id}, {"_id": 0})
    if not worker:
        raise HTTPException(status_code=404, detail="Student profile not found")

    target_date = date or get_today_date()
    dt = datetime.strptime(target_date, "%Y-%m-%d")
    day_key = dt.strftime("%A").lower()

    menu_doc = await db.meal_settings.find_one({"business_id": biz_id}, {"_id": 0})
    days = menu_doc.get("days", DEFAULT_WEEKLY_MENU) if menu_doc else DEFAULT_WEEKLY_MENU
    windows = menu_doc.get("windows", DEFAULT_MEAL_WINDOWS) if menu_doc else DEFAULT_MEAL_WINDOWS
    day_data = days.get(day_key, DEFAULT_WEEKLY_MENU.get(day_key, {}))

    lunch_menu = day_data.get("lunch") or {
        "is_closed": False,
        "standard_mode": day_data.get("standard_mode", "VEG_ONLY"),
        "standard_veg_title": day_data.get("standard_veg_title", ""),
        "standard_veg_desc": day_data.get("standard_veg_desc", ""),
        "standard_non_veg_title": day_data.get("standard_non_veg_title", ""),
        "standard_non_veg_desc": day_data.get("standard_non_veg_desc", ""),
        "premium_options": day_data.get("premium_options", [])
    }
    dinner_menu = day_data.get("dinner") or {
        "is_closed": False,
        "standard_mode": day_data.get("standard_mode", "VEG_ONLY"),
        "standard_veg_title": day_data.get("standard_veg_title", ""),
        "standard_veg_desc": day_data.get("standard_veg_desc", ""),
        "standard_non_veg_title": day_data.get("standard_non_veg_title", ""),
        "standard_non_veg_desc": day_data.get("standard_non_veg_desc", ""),
        "premium_options": day_data.get("premium_options", [])
    }

    global_premium_items = menu_doc.get("premium_items") if menu_doc else None
    if not global_premium_items:
        global_premium_items = DEFAULT_PREMIUM_ITEMS

    closure_cfg = (menu_doc or {}).get("mess_closure")
    closure_cfg = closure_cfg if isinstance(closure_cfg, dict) else {}
    holiday_cfg = (menu_doc or {}).get("college_holiday")
    holiday_cfg = holiday_cfg if isinstance(holiday_cfg, dict) else {}

    is_sunday = day_key == "sunday"
    if is_sunday:
        lunch_menu["premium_options"] = sunday_lunch_premium_options(menu_doc)
        lunch_menu["is_sunday_special"] = True
        dinner_menu["premium_options"] = global_premium_items
        dinner_menu["is_sunday_special"] = False
    else:
        lunch_menu["premium_options"] = global_premium_items
        dinner_menu["premium_options"] = global_premium_items

    selections = await db.meal_selections.find({"business_id": biz_id, "worker_id": wid, "date": target_date}, {"_id": 0}).to_list(10)
    selections_map = {(s.get("meal_slot") or "lunch").lower(): s for s in selections}

    plan = worker.get("work_type", "Standard")
    meal_plan_type = worker.get("meal_plan_type") or "BOTH"
    default_pref = (worker.get("diet_preference") or "VEG").upper()
    default_delivery_pref = (worker.get("delivery_preference") or "DINE_IN").upper()
    default_delivery_addr = worker.get("delivery_address") or ""
    default_delivery_notes = worker.get("delivery_notes") or ""

    active_leave = await db.worker_leaves.find_one({
        "business_id": biz_id,
        "worker_id": wid,
        "status": "ACTIVE",
        "start_date": {"$lte": target_date},
        "end_date": {"$gte": target_date}
    }, {"_id": 0})

    def process_student_slot(slot_key: str, slot_menu: dict):
        is_plan_included = True
        if meal_plan_type == "LUNCH_ONLY" and slot_key == "dinner":
            is_plan_included = False
        elif meal_plan_type == "DINNER_ONLY" and slot_key == "lunch":
            is_plan_included = False

        selection = selections_map.get(slot_key)
        window_status = check_meal_slot_window(slot_key, windows, slot_menu, target_date, closure_cfg)
        closure_status = get_mess_closure_status(closure_cfg, slot_key, target_date)
        is_mess_closed = closure_status["is_closed"]
        is_closed = bool(slot_menu.get("is_closed", False)) or is_mess_closed
        standard_mode = slot_menu.get("standard_mode", "VEG_ONLY")

        is_cancelled = False
        is_on_leave = bool(active_leave)
        effective_choice = ""
        selected_item_id = ""
        selected_item_name = ""

        # Determine effective delivery option for this slot
        if selection and selection.get("delivery_option"):
            slot_delivery_opt = (selection.get("delivery_option") or "DINE_IN").upper()
            slot_delivery_addr = selection.get("delivery_address") or default_delivery_addr
            slot_delivery_notes = selection.get("delivery_notes") or default_delivery_notes
        else:
            slot_delivery_opt = default_delivery_pref
            slot_delivery_addr = default_delivery_addr
            slot_delivery_notes = default_delivery_notes

        if not is_plan_included:
            effective_choice = "NOT_IN_PLAN"
            selected_item_name = f"Not Included in Your Plan ({meal_plan_type})"
        elif is_on_leave:
            is_cancelled = True
            effective_choice = "ON_LEAVE"
            selected_item_name = "On Vacation / Home Leave"
        elif is_closed:
            is_cancelled = True
            effective_choice = "MESS_CLOSED" if is_mess_closed else "CLOSED"
            selected_item_name = closure_status["reason"] if is_mess_closed else "Kitchen Closed / Holiday"
        elif selection and (selection.get("selection_type") == "CANCELLED" or selection.get("action") == "CANCEL"):
            is_cancelled = True
            effective_choice = "CANCELLED"
            selected_item_name = "Cancelled (Not Eating)"
        else:
            if plan.lower() == "premium":
                options = slot_menu.get("premium_options") or []
                if is_sunday and slot_key == "lunch" and options:
                    veg_opt = next((o for o in options if o.get("type") == "VEG"), options[0])
                    non_veg_opt = next((o for o in options if o.get("type") == "NON_VEG"), options[-1])
                    if selection and selection.get("selected_item_name"):
                        effective_choice = "PREMIUM_ITEM"
                        selected_item_id = selection.get("selected_item_id", "")
                        selected_item_name = selection.get("selected_item_name", "")
                    else:
                        default_dish = non_veg_opt if default_pref == "NON_VEG" else veg_opt
                        effective_choice = "PREMIUM_ITEM"
                        selected_item_id = default_dish.get("id", "")
                        selected_item_name = default_dish.get("name", "")
                elif selection and selection.get("selected_item_name"):
                    effective_choice = "PREMIUM_ITEM"
                    selected_item_id = selection.get("selected_item_id", "")
                    selected_item_name = selection.get("selected_item_name", "")
                else:
                    first_opt = (options or [{}])[0]
                    effective_choice = "PREMIUM_ITEM"
                    selected_item_id = first_opt.get("id", "")
                    selected_item_name = first_opt.get("name", "")
            else:
                if standard_mode == "VEG_ONLY":
                    effective_choice = "VEG"
                    selected_item_name = slot_menu.get("standard_veg_title") or "Standard Pure Veg Meal"
                else:
                    if selection and selection.get("selection_type") in {"VEG", "NON_VEG"}:
                        chosen = selection["selection_type"]
                    else:
                        chosen = default_pref
                    effective_choice = chosen
                    if chosen == "NON_VEG":
                        selected_item_name = slot_menu.get("standard_non_veg_title") or "Standard Non-Veg Meal"
                    else:
                        selected_item_name = slot_menu.get("standard_veg_title") or "Standard Veg Meal"

        return {
            "slot": slot_key,
            "is_closed": is_closed,
            "is_mess_closed": is_mess_closed,
            "mess_closure": closure_status,
            "is_premium_fixed": False,
            "is_sunday_special": is_sunday and slot_key == "lunch",
            "is_plan_included": is_plan_included,
            "is_on_leave": is_on_leave,
            "leave_info": active_leave if is_on_leave else None,
            "window": window_status,
            "menu": slot_menu,
            "selection": selection,
            "delivery_option": slot_delivery_opt,
            "delivery_address": slot_delivery_addr,
            "delivery_notes": slot_delivery_notes,
            "is_cancelled": is_cancelled,
            "effective_choice": effective_choice,
            "selected_item_id": selected_item_id,
            "selected_item_name": selected_item_name,
            "is_customized": bool(selection)
        }

    stats = await compute_worker_meal_consumption(biz_id, worker)

    return {
        "date": target_date,
        "day_name": day_data.get("day_name", dt.strftime("%A")),
        "plan": plan,
        "meal_plan_type": meal_plan_type,
        "default_diet_preference": default_pref,
        "default_delivery_preference": default_delivery_pref,
        "delivery_address": default_delivery_addr,
        "delivery_notes": default_delivery_notes,
        "is_on_leave": bool(active_leave),
        "active_leave": active_leave,
        "subscription_stats": stats,
        "college_holiday": {
            "is_active": bool(holiday_cfg.get("is_active")),
            "reason": holiday_cfg.get("reason") or "",
            "start_date": holiday_cfg.get("start_date") or "",
        },
        "mess_closure": {
            "is_active": bool(closure_cfg.get("is_active")),
            "slots": normalize_closure_slots(closure_cfg.get("slots")) if closure_cfg.get("is_active") else [],
            "start_date": closure_cfg.get("start_date") or "",
            "end_date": closure_cfg.get("end_date") or "",
            "reason": closure_cfg.get("reason") or "",
        },
        "is_premium_fixed_day": False,
        "is_sunday": is_sunday,
        "lunch": process_student_slot("lunch", lunch_menu),
        "dinner": process_student_slot("dinner", dinner_menu),
    }


@api_router.post("/worker/select-meal")
async def save_student_meal_selection(
    body: dict = Body(...),
    user: dict = Depends(get_current_worker)
):
    biz_id = user["business_id"]
    wid = user["worker_id"]
    worker = await db.workers.find_one({"id": wid, "business_id": biz_id}, {"_id": 0})
    if not worker:
        raise HTTPException(status_code=404, detail="Student profile not found")

    target_date = body.get("date") or get_today_date()
    slot_key = (body.get("meal_slot") or "lunch").strip().lower()
    if slot_key not in {"lunch", "dinner"}:
        slot_key = "lunch"

    action = (body.get("action") or "CONFIRM").upper()
    selection_type = (body.get("selection_type") or "VEG").upper()
    if action == "CANCEL":
        selection_type = "CANCELLED"

    selected_item_id = body.get("selected_item_id")
    selected_item_name = body.get("selected_item_name")
    notes = (body.get("notes") or "").strip()

    # Delivery fields
    delivery_option = (body.get("delivery_option") or worker.get("delivery_preference") or "DINE_IN").strip().upper()
    if delivery_option not in {"DINE_IN", "DELIVERY", "PICKUP"}:
        delivery_option = "DINE_IN"
    delivery_address = (body.get("delivery_address") if body.get("delivery_address") is not None else worker.get("delivery_address", "")).strip()
    delivery_notes = (body.get("delivery_notes") if body.get("delivery_notes") is not None else worker.get("delivery_notes", "")).strip()

    meal_plan_type = worker.get("meal_plan_type") or "BOTH"
    if meal_plan_type == "LUNCH_ONLY" and slot_key == "dinner":
        raise HTTPException(status_code=400, detail="Your subscription only includes Lunch service.")
    if meal_plan_type == "DINNER_ONLY" and slot_key == "lunch":
        raise HTTPException(status_code=400, detail="Your subscription only includes Dinner service.")

    # Subscription Validity and Quota Exhaustion Check.
    # Validity is frozen while the admin has college holiday mode ON — only quota matters then.
    stats = await compute_worker_meal_consumption(biz_id, worker)
    if action != "CANCEL":
        if stats.get("is_validity_expired"):
            raise HTTPException(
                status_code=403,
                detail=f"Your subscription validity has expired ({stats.get('validity_days', 45)}-day validity period ended on {stats.get('validity_expiry_date')}). Please renew your subscription to order meals."
            )
        if stats.get("total_remaining") == 0:
            raise HTTPException(
                status_code=403,
                detail="All meals in your current subscription pool have been completed. Please renew your subscription to order meals."
            )

    # Check if student is on active vacation/leave
    active_leave = await db.worker_leaves.find_one({
        "business_id": biz_id,
        "worker_id": wid,
        "status": "ACTIVE",
        "start_date": {"$lte": target_date},
        "end_date": {"$gte": target_date}
    })
    if active_leave and action != "CANCEL":
        raise HTTPException(status_code=400, detail="You are marked on vacation/home leave for this date. End your leave first to resume meals.")

    # Window check & cutoff enforcement
    menu_doc = await db.meal_settings.find_one({"business_id": biz_id}, {"_id": 0})
    days = menu_doc.get("days", DEFAULT_WEEKLY_MENU) if menu_doc else DEFAULT_WEEKLY_MENU
    windows = menu_doc.get("windows", DEFAULT_MEAL_WINDOWS) if menu_doc else DEFAULT_MEAL_WINDOWS
    
    dt = datetime.strptime(target_date, "%Y-%m-%d")
    day_key = dt.strftime("%A").lower()
    day_data = days.get(day_key, {})
    slot_menu = day_data.get(slot_key, {})

    closure_cfg = (menu_doc or {}).get("mess_closure")
    closure_cfg = closure_cfg if isinstance(closure_cfg, dict) else {}
    closure_status = get_mess_closure_status(closure_cfg, slot_key, target_date)
    if closure_status["is_closed"]:
        span = closure_status["start_date"]
        if closure_status["end_date"]:
            span = f"{closure_status['start_date']} to {closure_status['end_date']}"
        raise HTTPException(
            status_code=403,
            detail=f"The mess is closed for {slot_key.capitalize()} ({span}). {closure_status['reason']}. This meal will not be deducted from your quota."
        )

    window_check = check_meal_slot_window(slot_key, windows, slot_menu, target_date, closure_cfg)
    if not window_check.get("is_open", False):
        raise HTTPException(
            status_code=400,
            detail=f"The {slot_key.capitalize()} cutoff window is closed. Choices cannot be modified after cutoff time. {window_check.get('message', '')}"
        )

    now_iso = datetime.now(timezone.utc).isoformat()
    doc = {
        "business_id": biz_id,
        "worker_id": wid,
        "student_name": worker.get("name", "Student"),
        "date": target_date,
        "meal_slot": slot_key,
        "action": action,
        "plan": worker.get("work_type", "Standard"),
        "selection_type": selection_type,
        "selected_item_id": selected_item_id,
        "selected_item_name": selected_item_name,
        "delivery_option": delivery_option,
        "delivery_address": delivery_address,
        "delivery_notes": delivery_notes,
        "notes": notes,
        "updated_at": now_iso
    }

    await db.meal_selections.update_one(
        {"business_id": biz_id, "worker_id": wid, "date": target_date, "meal_slot": slot_key},
        {"$set": doc, "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": now_iso}},
        upsert=True
    )

    # If delivery address is supplied and worker didn't have one saved, update default
    if delivery_address and not worker.get("delivery_address"):
        await db.workers.update_one(
            {"id": wid, "business_id": biz_id},
            {"$set": {"delivery_address": delivery_address, "updated_at": now_iso}}
        )

    # Log Activity
    sname = worker.get("name", "Student")
    mode_text = " (🛵 Delivery)" if delivery_option == "DELIVERY" else " (🧳 Pickup)" if delivery_option == "PICKUP" else " (🍽️ Dine-in)"
    if action == "CANCEL":
        act_title = f"❌ {sname} cancelled {slot_key.upper()} ({target_date})"
        act_type = "MEAL_CANCELLED"
    else:
        act_title = f"🍽️ {sname} chose {selected_item_name or selection_type}{mode_text} for {slot_key.upper()} ({target_date})"
        act_type = "MEAL_CUSTOMIZED"

    await db.activity_logs.insert_one({
        "id": str(uuid.uuid4()),
        "business_id": biz_id,
        "worker_id": wid,
        "worker_name": sname,
        "type": act_type,
        "title": act_title,
        "created_at": now_iso,
    })

    asyncio.create_task(deliver_admin_push(
        business_id=biz_id,
        title=f"🍽️ Meal Update: {sname}",
        body=act_title,
        url="/admin",
        tag=f"meal-{wid}-{target_date}"
    ))

    return {"ok": True, "selection": doc}


app.include_router(api_router)


@app.middleware("http")
async def production_security(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID", "")[:100] or str(uuid.uuid4())
    started = time.monotonic()
    try:
        if request.method in {"POST", "PUT", "PATCH", "DELETE"} and request.url.path not in {
            "/api/admin/signup", "/api/admin/login", "/api/admin/forgot-password",
            "/api/admin/reset-password", "/api/worker/login", "/api/worker/forgot-password",
            "/api/worker/reset-password", "/api/auth/forgot-password", "/api/auth/reset-password"
        } and (request.cookies.get("access_token") or request.cookies.get("session_token")):
            cookie_token = request.cookies.get("csrf_token")
            header_token = request.headers.get("X-CSRF-Token")
            if not cookie_token or not header_token or not secrets.compare_digest(cookie_token, header_token):
                return JSONResponse({"detail": "CSRF validation failed", "request_id": request_id}, status_code=403)
        response = await call_next(request)
    except Exception as exc:
        logger.exception("Unhandled request error request_id=%s", request_id)
        response = JSONResponse({"detail": "Internal server error", "request_id": request_id}, status_code=500)
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Permissions-Policy"] = "camera=(), geolocation=(), microphone=(self)"
    logger.info("request_id=%s method=%s path=%s status=%s duration_ms=%d", request_id, request.method,
                request.url.path, response.status_code, (time.monotonic() - started) * 1000)
    return response

_cors_origins = os.environ.get('CORS_ORIGINS', '*')
_frontend_url = os.environ.get('FRONTEND_URL', '').strip()
_vercel_origin = "https://ayushman-kitchen.vercel.app"

if _cors_origins.strip() == '*':
    _allow_origins = [
        _vercel_origin,
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://localhost:3003",
    ]
    if _frontend_url and _frontend_url not in _allow_origins:
        _allow_origins.insert(0, _frontend_url)
else:
    _allow_origins = [o.strip() for o in _cors_origins.split(',') if o.strip()]
    if _vercel_origin not in _allow_origins:
        _allow_origins.append(_vercel_origin)
    if _frontend_url and _frontend_url not in _allow_origins:
        _allow_origins.insert(0, _frontend_url)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=_allow_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    global _voice_expiration_task, _meal_cleanup_task, _meal_reminder_task
    validate_environment()
    logger.info("Initializing database indexes and migrations...")
    try:
        await db.command("ping")
    except Exception as exc:
        logger.error("MongoDB is unavailable; backend startup aborted")
        raise RuntimeError("MongoDB is unavailable. Check MONGO_URL and database network access.") from exc

    # Backfill only chat-message expiry state before enabling TTL. Every message
    # expires from its creation time, whether it was read or not.
    migrated_messages = await migrate_message_expirations()
    removed_voice_assets = await cleanup_expired_voice_assets()
    if migrated_messages or removed_voice_assets:
        logger.info(
            "Message expiration migration completed migrated=%d voice_assets_removed=%d",
            migrated_messages,
            removed_voice_assets,
        )

    # These indexes are required for the retention guarantee. Fail startup rather
    # than silently run without expiry or with an unindexed cleanup scan.
    await db.messages.create_index("expires_at", expireAfterSeconds=0, name="messages_expires_at_ttl")
    await db.voice_assets.create_index("expires_at", name="voice_assets_expiration_cleanup")
    
    # 1. Ensure safe MongoDB indexes
    try:
        await db.admins.create_index("username", unique=True, sparse=True)
        await db.admins.create_index("email", unique=True, sparse=True)
        await db.businesses.create_index("owner_admin_id")
        await db.workers.create_index([("business_id", ASCENDING), ("mobile", ASCENDING)], unique=True,
                                      partialFilterExpression={"mobile": {"$type": "string", "$gt": ""}})
        await db.workers.create_index([("business_id", ASCENDING), ("email", ASCENDING)], unique=True,
                                      partialFilterExpression={"email": {"$type": "string", "$gt": ""}})
        await db.workers.create_index([("business_id", ASCENDING), ("login_id", ASCENDING)], unique=True,
                                      partialFilterExpression={"login_id": {"$type": "string", "$gt": ""}})
        await db.work_types.create_index([("business_id", ASCENDING), ("normalized_name", ASCENDING)], unique=True)
        await db.work_types.create_index([("business_id", ASCENDING), ("is_active", ASCENDING), ("name", ASCENDING)])
        await db.attendance.create_index([("business_id", ASCENDING), ("worker_id", ASCENDING), ("date", ASCENDING)], unique=True)
        await db.payments.create_index([("business_id", ASCENDING), ("worker_id", ASCENDING), ("date", ASCENDING)])
        await db.extra_work.create_index([("business_id", ASCENDING), ("worker_id", ASCENDING), ("date", ASCENDING)])
        await db.conversations.create_index([("business_id", ASCENDING), ("worker_id", ASCENDING)], unique=True)
        await db.messages.create_index([("conversation_id", ASCENDING), ("created_at", ASCENDING)])
        await db.messages.create_index([("business_id", ASCENDING), ("worker_id", ASCENDING)])
        await db.worker_sessions.create_index("session_token", unique=True)
        await db.worker_sessions.create_index("worker_id")
        await db.password_reset_tokens.create_index("token_hash", unique=True)
        await db.password_reset_tokens.create_index("expires_at")
        await db.voice_assets.create_index([("business_id", ASCENDING), ("conversation_id", ASCENDING)])
        await db.push_subscriptions.create_index("endpoint", unique=True)
        await db.push_subscriptions.create_index([("business_id", ASCENDING), ("recipient_type", ASCENDING), ("recipient_id", ASCENDING)])
        await db.revoked_admin_tokens.create_index("token_hash", unique=True)
        await db.revoked_admin_tokens.create_index("expires_at", expireAfterSeconds=0)
        logger.info("Database indexes successfully verified.")
    except Exception as e:
        logger.warning(f"Index creation notice: {e}")

    # 2. Backward-compatibility data migration: backfill records created before
    #    multi-business support. Any records missing a business_id are assigned
    #    to the first admin's primary business if one exists. This is a no-op
    #    when all records already have a business_id.
    try:
        orphan_worker = await db.workers.find_one(
            {"$or": [{"business_id": {"$exists": False}}, {"business_id": None}, {"business_id": ""}]},
            {"_id": 0}
        )
        if orphan_worker:
            # Find the oldest admin to use as the reference owner for orphaned records
            ref_admin = await db.admins.find_one({}, sort=[("created_at", ASCENDING)])
            if ref_admin:
                primary_biz = await get_or_create_business_for_admin(ref_admin)
                primary_biz_id = primary_biz["id"]

                workers_bf = await db.workers.update_many(
                    {"$or": [{"business_id": {"$exists": False}}, {"business_id": None}, {"business_id": ""}]},
                    {"$set": {"business_id": primary_biz_id}}
                )
                if workers_bf.modified_count > 0:
                    logger.info(f"Backfilled {workers_bf.modified_count} workers to business {primary_biz_id}")

                att_bf = await db.attendance.update_many(
                    {"$or": [{"business_id": {"$exists": False}}, {"business_id": None}, {"business_id": ""}]},
                    {"$set": {"business_id": primary_biz_id}}
                )
                if att_bf.modified_count > 0:
                    logger.info(f"Backfilled {att_bf.modified_count} attendance records to business {primary_biz_id}")

                pay_bf = await db.payments.update_many(
                    {"$or": [{"business_id": {"$exists": False}}, {"business_id": None}, {"business_id": ""}]},
                    {"$set": {"business_id": primary_biz_id, "type": "SALARY_PAYMENT", "deleted_at": None}}
                )
                if pay_bf.modified_count > 0:
                    logger.info(f"Backfilled {pay_bf.modified_count} payment records to business {primary_biz_id}")

                extra_bf = await db.extra_work.update_many(
                    {"$or": [{"business_id": {"$exists": False}}, {"business_id": None}, {"business_id": ""}]},
                    {"$set": {"business_id": primary_biz_id, "deleted_at": None}}
                )
                if extra_bf.modified_count > 0:
                    logger.info(f"Backfilled {extra_bf.modified_count} extra-work records to business {primary_biz_id}")
    except Exception as e:
        logger.warning(f"Backfill migration notice: {e}")

    # 3. Ensure default single admin exists for Ayushman Kitchen
    try:
        admin_count = await db.admins.count_documents({})
        if admin_count == 0:
            default_email = os.environ.get("ADMIN_EMAIL", "admin@ayushmankitchen.com").strip().lower()
            default_user = os.environ.get("ADMIN_USERNAME", "admin").strip().lower()
            default_pwd = os.environ.get("ADMIN_PASSWORD", "admin123")
            admin_name = os.environ.get("ADMIN_NAME", "Ayushman Kitchen Admin")
            biz_name = os.environ.get("BUSINESS_NAME", "Ayushman Kitchen")

            admin_id = str(uuid.uuid4())
            biz_id = str(uuid.uuid4())
            now_iso = datetime.now(timezone.utc).isoformat()

            admin_doc = {
                "id": admin_id,
                "name": admin_name,
                "username": default_user,
                "email": default_email,
                "password_hash": hash_password(default_pwd),
                "is_active": True,
                "created_at": now_iso,
                "updated_at": now_iso,
                "last_login_at": now_iso,
            }
            await db.admins.insert_one(admin_doc)

            biz_doc = {
                "id": biz_id,
                "name": biz_name,
                "owner_admin_id": admin_id,
                "timezone": "Asia/Kolkata",
                "created_at": now_iso,
                "updated_at": now_iso,
            }
            await db.businesses.insert_one(biz_doc)
            logger.info(f"Default admin initialized with email: {default_email}, username: {default_user}")
    except Exception as e:
        logger.warning(f"Admin initialization notice: {e}")

    _voice_expiration_task = asyncio.create_task(voice_expiration_loop())
    _meal_cleanup_task = asyncio.create_task(meal_cleanup_loop())
    _meal_reminder_task = asyncio.create_task(meal_reminder_loop())
    # Run an immediate cleanup on startup to remove old data right away
    asyncio.create_task(cleanup_old_meal_data())
    logger.info("Meal data auto-cleanup scheduled: records older than 2 months will be deleted daily.")
    logger.info("Automated meal window reminders & admin cutoff push notifications loop started.")


@app.on_event("shutdown")
async def shutdown_db_client():
    for task in [_voice_expiration_task, _meal_cleanup_task, _meal_reminder_task]:
        if task and not task.done():
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass
    try:
        client.close()
    except Exception:
        pass
