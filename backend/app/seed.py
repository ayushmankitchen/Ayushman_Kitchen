"""Database seeding script for Ayushman Kitchen.
Creates initial admin, demo students, kitchen staff, and meal options (Veg / Chicken).
"""
from datetime import date, timedelta
from sqlalchemy import select, delete, text
from .core import hash_password, now_ist
from .database import Base, SessionLocal, engine
from .models import (
    DeliveryNotification,
    DeliverySession,
    MealOption,
    MealSelection,
    MealType,
    Plan,
    Role,
    SelectionStatus,
    Subscription,
    SubscriptionStatus,
    User,
)

def auto_migrate():
    """Ensure newly added columns exist in sqlite tables."""
    with engine.connect() as conn:
        # Check users columns
        try:
            res = conn.execute(text("PRAGMA table_info(users)")).fetchall()
            col_names = [r[1] for r in res]
            if "latitude" not in col_names:
                conn.execute(text("ALTER TABLE users ADD COLUMN latitude FLOAT"))
            if "longitude" not in col_names:
                conn.execute(text("ALTER TABLE users ADD COLUMN longitude FLOAT"))
            if "delivery_address" not in col_names:
                conn.execute(text("ALTER TABLE users ADD COLUMN delivery_address VARCHAR(255)"))
            conn.commit()
        except Exception as e:
            print("Users migration note:", e)

        # Check meal_selections columns
        try:
            res = conn.execute(text("PRAGMA table_info(meal_selections)")).fetchall()
            col_names = [r[1] for r in res]
            if "delivery_status" not in col_names:
                conn.execute(text("ALTER TABLE meal_selections ADD COLUMN delivery_status VARCHAR(50) DEFAULT 'CONFIRMED'"))
            if "delivery_lat" not in col_names:
                conn.execute(text("ALTER TABLE meal_selections ADD COLUMN delivery_lat FLOAT"))
            if "delivery_lng" not in col_names:
                conn.execute(text("ALTER TABLE meal_selections ADD COLUMN delivery_lng FLOAT"))
            if "delivery_address" not in col_names:
                conn.execute(text("ALTER TABLE meal_selections ADD COLUMN delivery_address VARCHAR(255)"))
            if "delivered_at" not in col_names:
                conn.execute(text("ALTER TABLE meal_selections ADD COLUMN delivered_at DATETIME"))
            conn.commit()
        except Exception as e:
            print("Meal selections migration note:", e)

def seed_database():
    auto_migrate()
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        today = now_ist().date()

        # 1. Seed Admin User
        admin = db.scalar(select(User).where(User.email == "admin@ayushman.kitchen"))
        if not admin:
            admin = User(
                student_id="ADMIN-001",
                name="Ayushman Admin",
                email="admin@ayushman.kitchen",
                phone="+91 9876543210",
                password_hash=hash_password("AdminPass123!"),
                role=Role.ADMIN,
                is_active=True,
            )
            db.add(admin)
            print("✓ Created Admin: admin@ayushman.kitchen / AdminPass123!")

        # 2. Seed Kitchen Staff User
        staff = db.scalar(select(User).where(User.email == "staff@ayushman.kitchen"))
        if not staff:
            staff = User(
                student_id="STAFF-001",
                name="Chef Rajesh Kumar",
                email="staff@ayushman.kitchen",
                phone="+91 9876543214",
                password_hash=hash_password("StaffPass123!"),
                role=Role.KITCHEN_STAFF,
                is_active=True,
            )
            db.add(staff)
            print("✓ Created Staff: staff@ayushman.kitchen / StaffPass123!")

        # 3. Seed Standard Student
        std_user = db.scalar(select(User).where(User.email == "student.standard@ayushman.kitchen"))
        if not std_user:
            std_user = User(
                student_id="STD-2026-001",
                name="Rahul Sharma",
                email="student.standard@ayushman.kitchen",
                phone="+91 9876543211",
                password_hash=hash_password("StudentPass123!"),
                role=Role.STUDENT,
                latitude=28.6185,
                longitude=77.2130,
                delivery_address="Boys Hostel 3, Room 204, North Campus",
                is_active=True,
            )
            db.add(std_user)
            db.flush()
            sub_std = Subscription(
                user_id=std_user.id,
                plan=Plan.STANDARD,
                start_date=today - timedelta(days=5),
                expiry_date=today + timedelta(days=25),
                status=SubscriptionStatus.ACTIVE,
            )
            db.add(sub_std)
            print("✓ Created Standard Student: student.standard@ayushman.kitchen / StudentPass123!")
        else:
            std_user.latitude = 28.6185
            std_user.longitude = 77.2130
            std_user.delivery_address = "Boys Hostel 3, Room 204, North Campus"
            if std_user.subscription:
                std_user.subscription.start_date = today - timedelta(days=5)
                std_user.subscription.expiry_date = today + timedelta(days=25)
                std_user.subscription.status = SubscriptionStatus.ACTIVE

        # 4. Seed Premium Student
        prem_user = db.scalar(select(User).where(User.email == "student.premium@ayushman.kitchen"))
        if not prem_user:
            prem_user = User(
                student_id="STD-2026-002",
                name="Priya Patel",
                email="student.premium@ayushman.kitchen",
                phone="+91 9876543212",
                password_hash=hash_password("PremiumPass123!"),
                role=Role.STUDENT,
                latitude=28.6210,
                longitude=77.2165,
                delivery_address="Girls Hostel Block A, Room 108, East Campus",
                is_active=True,
            )
            db.add(prem_user)
            db.flush()
            sub_prem = Subscription(
                user_id=prem_user.id,
                plan=Plan.PREMIUM,
                start_date=today - timedelta(days=5),
                expiry_date=today + timedelta(days=25),
                status=SubscriptionStatus.ACTIVE,
            )
            db.add(sub_prem)
            print("✓ Created Premium Student: student.premium@ayushman.kitchen / PremiumPass123!")
        else:
            prem_user.latitude = 28.6210
            prem_user.longitude = 77.2165
            prem_user.delivery_address = "Girls Hostel Block A, Room 108, East Campus"
            if prem_user.subscription:
                prem_user.subscription.start_date = today - timedelta(days=5)
                prem_user.subscription.expiry_date = today + timedelta(days=25)
                prem_user.subscription.status = SubscriptionStatus.ACTIVE

        # 5. Seed Expired Student
        exp_user = db.scalar(select(User).where(User.email == "student.expired@ayushman.kitchen"))
        if not exp_user:
            exp_user = User(
                student_id="STD-2026-003",
                name="Amit Verma",
                email="student.expired@ayushman.kitchen",
                phone="+91 9876543213",
                password_hash=hash_password("StudentPass123!"),
                role=Role.STUDENT,
                latitude=28.6110,
                longitude=77.2050,
                delivery_address="PG Tower 2, Flat 3B, South Gate",
                is_active=True,
            )
            db.add(exp_user)
            db.flush()
            sub_exp = Subscription(
                user_id=exp_user.id,
                plan=Plan.STANDARD,
                start_date=today - timedelta(days=60),
                expiry_date=today - timedelta(days=1),
                status=SubscriptionStatus.EXPIRED,
            )
            db.add(sub_exp)
            print("✓ Created Expired Student: student.expired@ayushman.kitchen / StudentPass123!")
        else:
            exp_user.latitude = 28.6110
            exp_user.longitude = 77.2050
            exp_user.delivery_address = "PG Tower 2, Flat 3B, South Gate"

        # 6. Seed ONLY Veg and Chicken for Lunch & Dinner
        valid_options = [
            ("Veg", MealType.LUNCH),
            ("Chicken", MealType.LUNCH),
            ("Veg", MealType.DINNER),
            ("Chicken", MealType.DINNER),
        ]

        # Remove any other old meal options
        all_options = db.scalars(select(MealOption)).all()
        for opt in all_options:
            if (opt.name, opt.meal_type) not in valid_options:
                db.delete(opt)

        for name, m_type in valid_options:
            existing = db.scalar(select(MealOption).where(MealOption.name == name, MealOption.meal_type == m_type))
            if not existing:
                opt = MealOption(name=name, meal_type=m_type, available=True)
                db.add(opt)
            else:
                existing.available = True

        db.commit()
        print("✓ Verified options: Veg and Chicken for Lunch & Dinner.")
        print("Database seeded successfully!")
    finally:
        db.close()

if __name__ == "__main__":
    seed_database()
