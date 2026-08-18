from typing import Annotated
from fastapi import Depends, Header
from sqlalchemy.orm import Session
from .core import decode_token, error
from .database import get_db
from .models import Role, User

Db = Annotated[Session, Depends(get_db)]
def current_user(db: Db, authorization: Annotated[str|None, Header()] = None) -> User:
    if not authorization or not authorization.startswith("Bearer "): error("UNAUTHORIZED", "Authentication is required.", 401)
    user = db.get(User, int(decode_token(authorization[7:], "access")))
    if not user or not user.is_active: error("UNAUTHORIZED", "Account is unavailable.", 401)
    return user
CurrentUser = Annotated[User, Depends(current_user)]
def require_roles(*roles: Role):
    def dependency(user: CurrentUser) -> User:
        if user.role not in roles: error("FORBIDDEN", "You do not have permission for this action.", 403)
        return user
    return dependency
