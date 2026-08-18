from __future__ import annotations
import enum
from datetime import date, datetime
from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, Index, Integer, JSON, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .database import Base

class Role(str, enum.Enum): STUDENT="STUDENT"; ADMIN="ADMIN"; KITCHEN_STAFF="KITCHEN_STAFF"
class Plan(str, enum.Enum): STANDARD="STANDARD"; PREMIUM="PREMIUM"
class SubscriptionStatus(str, enum.Enum): ACTIVE="ACTIVE"; EXPIRED="EXPIRED"; SUSPENDED="SUSPENDED"
class MealType(str, enum.Enum): LUNCH="LUNCH"; DINNER="DINNER"
class SelectionStatus(str, enum.Enum): SELECTED="SELECTED"; CANCELLED="CANCELLED"
class User(Base):
    __tablename__="users"
    id: Mapped[int]=mapped_column(primary_key=True); student_id: Mapped[str]=mapped_column(String(50), unique=True, index=True)
    name: Mapped[str]=mapped_column(String(120)); email: Mapped[str]=mapped_column(String(255), unique=True, index=True); phone: Mapped[str|None]=mapped_column(String(30))
    password_hash: Mapped[str]=mapped_column(String(255)); role: Mapped[Role]=mapped_column(Enum(Role), default=Role.STUDENT); is_active: Mapped[bool]=mapped_column(Boolean, default=True)
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), server_default=func.now()); updated_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    subscription=relationship("Subscription", back_populates="user", uselist=False)
class Subscription(Base):
    __tablename__="subscriptions"
    id: Mapped[int]=mapped_column(primary_key=True); user_id: Mapped[int]=mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True)
    plan: Mapped[Plan]=mapped_column(Enum(Plan)); start_date: Mapped[date]=mapped_column(Date); expiry_date: Mapped[date]=mapped_column(Date, index=True); status: Mapped[SubscriptionStatus]=mapped_column(Enum(SubscriptionStatus), default=SubscriptionStatus.ACTIVE)
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), server_default=func.now()); updated_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now()); user=relationship("User", back_populates="subscription")
class MealOption(Base):
    __tablename__="meal_options"
    id: Mapped[int]=mapped_column(primary_key=True); name: Mapped[str]=mapped_column(String(100)); meal_type: Mapped[MealType]=mapped_column(Enum(MealType), index=True); available: Mapped[bool]=mapped_column(Boolean, default=True)
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), server_default=func.now()); updated_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    __table_args__=(UniqueConstraint("name", "meal_type", name="uq_meal_option_name_type"),)
class MealSelection(Base):
    __tablename__="meal_selections"
    id: Mapped[int]=mapped_column(primary_key=True); user_id: Mapped[int]=mapped_column(ForeignKey("users.id"), index=True); date: Mapped[date]=mapped_column(Date, index=True); meal_type: Mapped[MealType]=mapped_column(Enum(MealType)); meal_option_id: Mapped[int|None]=mapped_column(ForeignKey("meal_options.id")); status: Mapped[SelectionStatus]=mapped_column(Enum(SelectionStatus), default=SelectionStatus.SELECTED)
    selected_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), server_default=func.now()); cancelled_at: Mapped[datetime|None]=mapped_column(DateTime(timezone=True)); created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), server_default=func.now()); updated_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    __table_args__=(Index("uq_active_selection_user_date_meal", "user_id", "date", "meal_type", unique=True, postgresql_where=(status == SelectionStatus.SELECTED), sqlite_where=(status == SelectionStatus.SELECTED)),)
class AuditLog(Base):
    __tablename__="audit_logs"
    id: Mapped[int]=mapped_column(primary_key=True); user_id: Mapped[int|None]=mapped_column(ForeignKey("users.id"), index=True); action: Mapped[str]=mapped_column(String(100)); entity_type: Mapped[str]=mapped_column(String(80)); entity_id: Mapped[str]=mapped_column(String(80)); metadata_: Mapped[dict|None]=mapped_column("metadata", JSON); created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), server_default=func.now())
    __table_args__=(Index("ix_audit_action_created", "action", "created_at"),)
