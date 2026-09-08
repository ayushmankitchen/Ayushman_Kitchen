from datetime import timedelta
from fastapi import APIRouter, Cookie, Response
from sqlalchemy import select
from ..core import decode_token, error, hash_password, make_token, now_ist, settings, verify_password
from ..deps import CurrentUser, Db
from ..models import Plan, Role, Subscription, SubscriptionStatus, User
from ..schemas import LoginIn, RegisterIn, TokenOut, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])

def token_response(response: Response, user: User):
    refresh = make_token(str(user.id), "refresh", timedelta(days=settings.refresh_token_days))
    response.set_cookie(
        "refresh_token",
        refresh,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=settings.refresh_token_days * 86400,
        path="/auth",
    )
    return {
        "access_token": make_token(str(user.id), "access", timedelta(minutes=settings.access_token_minutes)),
        "token_type": "bearer",
        "user": user,
    }

@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, response: Response, db: Db):
    user = db.scalar(select(User).where(User.email == body.email))
    if not user or not verify_password(body.password, user.password_hash):
        error("INVALID_CREDENTIALS", "Email or password is incorrect.", 401)
    if not user.is_active:
        error("FORBIDDEN", "This account is disabled.", 403)
    return token_response(response, user)

@router.post("/register", response_model=TokenOut, status_code=201)
def register(body: RegisterIn, response: Response, db: Db):
    existing = db.scalar(
        select(User).where((User.email == body.email) | (User.student_id == body.student_id))
    )
    if existing:
        error("CONFLICT", "A user with that email or student ID already exists.", 409)

    today = now_ist().date()
    user = User(
        student_id=body.student_id,
        name=body.name,
        email=body.email,
        phone=body.phone,
        password_hash=hash_password(body.password),
        role=Role.STUDENT,
        is_active=True,
    )
    db.add(user)
    db.flush()

    sub = Subscription(
        user_id=user.id,
        plan=Plan.STANDARD,
        start_date=today,
        expiry_date=today + timedelta(days=30),
        status=SubscriptionStatus.ACTIVE,
    )
    db.add(sub)
    db.commit()
    db.refresh(user)
    return token_response(response, user)

@router.post("/refresh", response_model=TokenOut)
def refresh(response: Response, db: Db, refresh_token: str | None = Cookie(None)):
    if not refresh_token:
        error("UNAUTHORIZED", "Refresh token is required.", 401)
    user_id = decode_token(refresh_token, "refresh")
    user = db.get(User, int(user_id))
    if not user or not user.is_active:
        error("UNAUTHORIZED", "Account is unavailable.", 401)
    return token_response(response, user)

@router.post("/logout", status_code=204)
def logout(response: Response):
    response.delete_cookie("refresh_token", path="/auth")

@router.get("/me", response_model=UserOut)
def me(user: CurrentUser):
    return user
