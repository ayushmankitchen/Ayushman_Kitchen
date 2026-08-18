from datetime import timedelta
from fastapi import APIRouter, Cookie, Response
from sqlalchemy import select
from ..core import decode_token, error, make_token, settings, verify_password
from ..deps import CurrentUser, Db
from ..models import User
from ..schemas import LoginIn, TokenOut, UserOut

router=APIRouter(prefix="/auth",tags=["auth"])
def token_response(response: Response, user: User):
    refresh=make_token(str(user.id),"refresh",timedelta(days=settings.refresh_token_days)); response.set_cookie("refresh_token",refresh,httponly=True,secure=False,samesite="lax",max_age=settings.refresh_token_days*86400,path="/auth")
    return {"access_token":make_token(str(user.id),"access",timedelta(minutes=settings.access_token_minutes)),"user":user}
@router.post("/login",response_model=TokenOut)
def login(body:LoginIn,response:Response,db:Db):
    user=db.scalar(select(User).where(User.email==body.email))
    if not user or not verify_password(body.password,user.password_hash): error("INVALID_CREDENTIALS","Email or password is incorrect.",401)
    if not user.is_active: error("FORBIDDEN","This account is disabled.",403)
    return token_response(response,user)
@router.post("/refresh",response_model=TokenOut)
def refresh(response:Response,db:Db,refresh_token:str|None=Cookie(None)):
    if not refresh_token:error("UNAUTHORIZED","Refresh token is required.",401)
    user=db.get(User,int(decode_token(refresh_token,"refresh")))
    if not user or not user.is_active:error("UNAUTHORIZED","Account is unavailable.",401)
    return token_response(response,user)
@router.post("/logout",status_code=204)
def logout(response:Response): response.delete_cookie("refresh_token",path="/auth")
@router.get("/me",response_model=UserOut)
def me(user:CurrentUser): return user
