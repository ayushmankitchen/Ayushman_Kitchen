from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo
import jwt
from fastapi import HTTPException, status
from passlib.context import CryptContext
from pydantic_settings import BaseSettings, SettingsConfigDict

IST = ZoneInfo("Asia/Kolkata")

class Settings(BaseSettings):
    database_url: str = "sqlite:///./ayushman.db"
    secret_key: str = "development-only-change-me"
    access_token_minutes: int = 15
    refresh_token_days: int = 30
    cors_origins: str = "http://localhost:5173"
    model_config = SettingsConfigDict(env_file="../.env", extra="ignore")
settings = Settings()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def now_ist() -> datetime: return datetime.now(IST)
def error(code: str, message: str, http_status: int = 400):
    raise HTTPException(http_status, {"error": {"code": code, "message": message}})
def hash_password(password: str) -> str: return pwd_context.hash(password)
def verify_password(password: str, hashed: str) -> bool: return pwd_context.verify(password, hashed)
def make_token(subject: str, kind: str, expires: timedelta) -> str:
    return jwt.encode({"sub": subject, "kind": kind, "exp": now_ist() + expires}, settings.secret_key, algorithm="HS256")
def decode_token(token: str, kind: str) -> str:
    try:
        value = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
        if value.get("kind") != kind: raise ValueError
        return value["sub"]
    except Exception: error("UNAUTHORIZED", "Your session is invalid or has expired.", 401)
def window_is_open(meal_type: str, current: datetime | None = None) -> bool:
    t = (current or now_ist()).astimezone(IST).time()
    return time(6) <= t < time(11) if meal_type == "LUNCH" else time(16) <= t < time(19)
def subscription_state(expiry: date, current: date | None = None) -> str:
    return "EXPIRED" if (current or now_ist().date()) > expiry else "ACTIVE"
