import asyncio
import os
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "ayushman_kitchen")

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

DEFAULT_SHOWCASE_BOXES = [
    {
        "id": 1,
        "title": "Special Deluxe Thali",
        "subtitle": "Paneer Butter Masala, Dal Makhani, 4 Butter Rotis, Steamed Rice, Salad & Sweet",
        "image_url": "https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=500&auto=format&fit=crop&q=60",
        "badge": "Popular Thali",
    },
    {
        "id": 2,
        "title": "Sunday Special Biryani",
        "subtitle": "Fragrant Dum Biryani served with spiced Mirchi Ka Salan, Boondi Raita & Gulab Jamun",
        "image_url": "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=500&auto=format&fit=crop&q=60",
        "badge": "Sunday Feast",
    },
    {
        "id": 3,
        "title": "High-Protein Diet Bowl",
        "subtitle": "Sprouted pulses, boiled eggs, fresh curd, roasted paneer cubes and crunchy green salad",
        "image_url": "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=500&auto=format&fit=crop&q=60",
        "badge": "Healthy Choice",
    },
    {
        "id": 4,
        "title": "Evening Snacks & Tea",
        "subtitle": "Hot crispy Samosas, Poha, Bread Pakoras & steaming hot Ginger Masala Chai daily",
        "image_url": "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=500&auto=format&fit=crop&q=60",
        "badge": "Snacks & Chai",
    },
]

DEFAULT_PREMIUM_ITEMS = [
    {
        "id": "prem-01",
        "name": "Chicken Dum Biryani Special",
        "type": "NON_VEG",
        "description": "Slow cooked dum biryani with 2 tender chicken pieces, aromatic basmati rice, spiced salan, boondi raita and sweet gulab jamun",
        "is_active": True,
    },
    {
        "id": "prem-02",
        "name": "Butter Chicken with Garlic Naan",
        "type": "NON_VEG",
        "description": "Rich tomato cashew gravy with tender boneless chicken tikka, 2 crisp butter garlic naans, jeera rice and dessert",
        "is_active": True,
    },
    {
        "id": "prem-03",
        "name": "Paneer Lababdar Deluxe Thali",
        "type": "VEG",
        "description": "Cottage cheese in rich creamy onion gravy, Dal Makhani, 2 Laccha Parathas, fragrant Pulao, Raita and Rasgulla",
        "is_active": True,
    },
    {
        "id": "prem-04",
        "name": "Mushroom Tikka Masala Feast",
        "type": "VEG",
        "description": "Char-grilled spiced mushrooms in thick tandoori masala gravy, Dal Tadka, 2 Butter Naan, Steamed Basmati Rice and Sweet",
        "is_active": True,
    },
]

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

DAYS_MENU = {
    "monday": {
        "day_name": "Monday",
        "lunch": {
            "is_closed": False,
            "standard_mode": "VEG_ONLY",
            "standard_veg_title": "Paneer Butter Masala & Dal Tadka (Lunch)",
            "standard_veg_desc": "Paneer Butter Masala, Yellow Dal Tadka, Steamed Rice, 4 Butter Rotis, Fresh Green Salad, Gulab Jamun",
            "standard_non_veg_title": "",
            "standard_non_veg_desc": "",
            "premium_options": DEFAULT_PREMIUM_ITEMS,
        },
        "dinner": {
            "is_closed": False,
            "standard_mode": "VEG_ONLY",
            "standard_veg_title": "Mix Veg Curry & Dal Fry (Dinner)",
            "standard_veg_desc": "Homestyle Mix Veg, Arhar Dal Fry, Jeera Rice, 4 Tawa Rotis, Green Salad, Rice Kheer",
            "standard_non_veg_title": "",
            "standard_non_veg_desc": "",
            "premium_options": DEFAULT_PREMIUM_ITEMS,
        },
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
            "premium_options": DEFAULT_PREMIUM_ITEMS,
        },
        "dinner": {
            "is_closed": False,
            "standard_mode": "VEG_ONLY",
            "standard_veg_title": "Aloo Gobhi Masala & Moong Dal (Dinner)",
            "standard_veg_desc": "Fresh Aloo Gobhi, Yellow Moong Dal, Steamed Rice, 4 Tawa Rotis, Salad, Halwa",
            "standard_non_veg_title": "",
            "standard_non_veg_desc": "",
            "premium_options": DEFAULT_PREMIUM_ITEMS,
        },
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
            "premium_options": DEFAULT_PREMIUM_ITEMS,
        },
        "dinner": {
            "is_closed": False,
            "standard_mode": "VEG_AND_NON_VEG",
            "standard_veg_title": "Paneer Bhurji Gravy & Dal Fry (Dinner)",
            "standard_veg_desc": "Paneer Bhurji, Dal Fry, Peas Pulao, 4 Butter Rotis, Salad, Sweet",
            "standard_non_veg_title": "Special Egg Curry (Dinner)",
            "standard_non_veg_desc": "Egg Curry (2 Eggs in Rich Masala Gravy), Steamed Rice, 4 Rotis, Salad",
            "premium_options": DEFAULT_PREMIUM_ITEMS,
        },
    },
    "thursday": {
        "day_name": "Thursday",
        "lunch": {
            "is_closed": False,
            "standard_mode": "VEG_ONLY",
            "standard_veg_title": "Rajma Masala & Jeera Rice (Lunch)",
            "standard_veg_desc": "Punjabi Rajma, Jeera Rice, 4 Butter Rotis, Boondi Raita, Onion Salad, Sweet",
            "standard_non_veg_title": "",
            "standard_non_veg_desc": "",
            "premium_options": DEFAULT_PREMIUM_ITEMS,
        },
        "dinner": {
            "is_closed": False,
            "standard_mode": "VEG_ONLY",
            "standard_veg_title": "Sev Tamatar & Dal Tadka (Dinner)",
            "standard_veg_desc": "Kathiyawadi Sev Tamatar, Dal Tadka, Steamed Rice, 4 Rotis, Salad",
            "standard_non_veg_title": "",
            "standard_non_veg_desc": "",
            "premium_options": DEFAULT_PREMIUM_ITEMS,
        },
    },
    "friday": {
        "day_name": "Friday",
        "lunch": {
            "is_closed": False,
            "standard_mode": "VEG_AND_NON_VEG",
            "standard_veg_title": "Shahi Paneer & Dal Makhani (Lunch)",
            "standard_veg_desc": "Shahi Paneer, Dal Makhani, Steamed Rice, 4 Rotis, Salad, Gulab Jamun",
            "standard_non_veg_title": "Chicken Korma Delight (Lunch)",
            "standard_non_veg_desc": "Chicken Korma (3 Pcs), Jeera Rice, 4 Butter Rotis, Salad, Sweet",
            "premium_options": DEFAULT_PREMIUM_ITEMS,
        },
        "dinner": {
            "is_closed": False,
            "standard_mode": "VEG_AND_NON_VEG",
            "standard_veg_title": "Dum Aloo Kashmiri & Dal Fry (Dinner)",
            "standard_veg_desc": "Dum Aloo, Dal Fry, Steamed Rice, 4 Rotis, Salad, Kheer",
            "standard_non_veg_title": "Egg Bhurji Curry (Dinner)",
            "standard_non_veg_desc": "Egg Bhurji Curry, Steamed Rice, 4 Rotis, Salad",
            "premium_options": DEFAULT_PREMIUM_ITEMS,
        },
    },
    "saturday": {
        "day_name": "Saturday",
        "lunch": {
            "is_closed": False,
            "standard_mode": "VEG_ONLY",
            "standard_veg_title": "Chole Bhature / Chole Rice (Lunch)",
            "standard_veg_desc": "Amritsari Chole, Steamed Rice, 4 Butter Rotis or 2 Bhature, Fried Green Chilli, Halwa",
            "standard_non_veg_title": "",
            "standard_non_veg_desc": "",
            "premium_options": DEFAULT_PREMIUM_ITEMS,
        },
        "dinner": {
            "is_closed": False,
            "standard_mode": "VEG_ONLY",
            "standard_veg_title": "Palak Paneer & Dal Tadka (Dinner)",
            "standard_veg_desc": "Fresh Palak Paneer, Dal Tadka, Jeera Rice, 4 Rotis, Salad, Sweet",
            "standard_non_veg_title": "",
            "standard_non_veg_desc": "",
            "premium_options": DEFAULT_PREMIUM_ITEMS,
        },
    },
    "sunday": {
        "day_name": "Sunday",
        "lunch": {
            "is_closed": False,
            "standard_mode": "VEG_AND_NON_VEG",
            "standard_veg_title": "Sunday Special Paneer Pulao & Kofta (Lunch)",
            "standard_veg_desc": "Malai Kofta, Paneer Pulao, Dal Makhani, 4 Butter Rotis, Boondi Raita, Gulab Jamun",
            "standard_non_veg_title": "Sunday Special Hyderabadi Chicken Biryani (Lunch)",
            "standard_non_veg_desc": "Hyderabadi Dum Chicken Biryani (2 Pcs), Spiced Salan, Boondi Raita, Onion Salad, Gulab Jamun",
            "premium_options": DEFAULT_PREMIUM_ITEMS,
        },
        "dinner": {
            "is_closed": False,
            "standard_mode": "VEG_ONLY",
            "standard_veg_title": "Light Khichdi / Dal Fry & Seasonal Veg (Dinner)",
            "standard_veg_desc": "Comfort Dal Khichdi with Ghee & Papad, or Dal Fry, Steamed Rice, 4 Rotis, Salad",
            "standard_non_veg_title": "",
            "standard_non_veg_desc": "",
            "premium_options": DEFAULT_PREMIUM_ITEMS,
        },
    },
}

async def seed():
    print(f"Connecting to MongoDB Atlas at: {MONGO_URL[:35]}...")
    client = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=10000)
    db = client[DB_NAME]

    now_iso = datetime.now(timezone.utc).isoformat()
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # 1. Admin & Business
    admin_id = str(uuid.uuid4())
    biz_id = str(uuid.uuid4())

    existing_admin = await db.admins.find_one({"email": "admin@ayushmankitchen.com"})
    if existing_admin:
        admin_id = existing_admin["id"]
        existing_biz = await db.businesses.find_one({"owner_admin_id": admin_id})
        if existing_biz:
            biz_id = existing_biz["id"]
    else:
        admin_doc = {
            "id": admin_id,
            "name": "Ayushman Kitchen Admin",
            "username": "admin",
            "email": "admin@ayushmankitchen.com",
            "password_hash": hash_password("admin123"),
            "is_active": True,
            "created_at": now_iso,
            "updated_at": now_iso,
            "last_login_at": now_iso,
        }
        await db.admins.insert_one(admin_doc)
        print("✓ Created default admin: admin / admin123")

    biz_doc = {
        "id": biz_id,
        "name": "Ayushman Kitchen",
        "owner_admin_id": admin_id,
        "logo_url": "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=500&auto=format&fit=crop&q=60",
        "admin_email": "admin@ayushmankitchen.com",
        "timezone": "Asia/Kolkata",
        "notice_ticker": {
            "enabled": True,
            "badge": "LATEST ANNOUNCEMENT",
            "text": "🎉 Welcome to Ayushman Kitchen! Fresh, hygienic, and home-style nutritious meals served daily. Mark your meal preference before cutoff time (Lunch 11:00 AM • Dinner 7:00 PM).",
        },
        "showcase_boxes": DEFAULT_SHOWCASE_BOXES,
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    await db.businesses.update_one({"id": biz_id}, {"$set": biz_doc}, upsert=True)
    print("✓ Configured business branding, logo, ticker and 4 showcase boxes")

    # 2. Work Types
    for wt in ["Standard", "Premium"]:
        await db.work_types.update_one(
            {"business_id": biz_id, "normalized_name": wt.lower()},
            {"$set": {"id": str(uuid.uuid4()), "business_id": biz_id, "name": wt, "normalized_name": wt.lower(), "is_active": True, "created_at": now_iso}},
            upsert=True,
        )
    print("✓ Verified Work Types: Standard & Premium")

    # 3. Meal Settings
    meal_settings_doc = {
        "business_id": biz_id,
        "windows": DEFAULT_MEAL_WINDOWS,
        "days": DAYS_MENU,
        "premium_items": DEFAULT_PREMIUM_ITEMS,
        "updated_at": now_iso,
    }
    await db.meal_settings.update_one({"business_id": biz_id}, {"$set": meal_settings_doc}, upsert=True)
    print("✓ Configured full 7-Day Weekly Menu & Cutoff Windows in meal_settings")

    # 4. Sample Students
    sample_students = [
        {
            "name": "Nishant Kumar",
            "mobile": "9693905865",
            "login_id": "9693905865",
            "work_type": "Premium",
            "diet_preference": "NON_VEG",
            "meal_plan_type": "BOTH",
            "status": "ACTIVE",
            "joining_date": today_str,
            "monthly_rate": 4500,
        },
        {
            "name": "Rahul Sharma",
            "mobile": "9876543210",
            "login_id": "9876543210",
            "work_type": "Standard",
            "diet_preference": "VEG",
            "meal_plan_type": "BOTH",
            "status": "ACTIVE",
            "joining_date": today_str,
            "monthly_rate": 3500,
        },
        {
            "name": "Priya Patel",
            "mobile": "9812345678",
            "login_id": "9812345678",
            "work_type": "Standard",
            "diet_preference": "VEG",
            "meal_plan_type": "LUNCH_ONLY",
            "status": "ACTIVE",
            "joining_date": today_str,
            "monthly_rate": 2000,
        },
        {
            "name": "Amit Verma",
            "mobile": "9765432109",
            "login_id": "9765432109",
            "work_type": "Premium",
            "diet_preference": "NON_VEG",
            "meal_plan_type": "DINNER_ONLY",
            "status": "ACTIVE",
            "joining_date": today_str,
            "monthly_rate": 2500,
        },
        {
            "name": "Sneha Roy",
            "mobile": "9922334455",
            "login_id": "9922334455",
            "work_type": "Standard",
            "diet_preference": "NON_VEG",
            "meal_plan_type": "BOTH",
            "status": "ACTIVE",
            "joining_date": today_str,
            "monthly_rate": 3800,
        },
    ]

    worker_ids = []
    for s in sample_students:
        existing_w = await db.workers.find_one({"business_id": biz_id, "mobile": s["mobile"]})
        wid = existing_w["id"] if existing_w else str(uuid.uuid4())
        worker_ids.append((wid, s["name"]))

        worker_doc = {
            "id": wid,
            "business_id": biz_id,
            "name": s["name"],
            "mobile": s["mobile"],
            "login_id": s["login_id"],
            "work_type": s["work_type"],
            "diet_preference": s["diet_preference"],
            "meal_plan_type": s["meal_plan_type"],
            "status": s["status"],
            "joining_date": s["joining_date"],
            "wage_type": "monthly",
            "monthly_rate": s["monthly_rate"],
            "daily_rate": 0,
            "hourly_rate": 0,
            "password_hash": hash_password("password123"),
            "created_at": now_iso,
            "updated_at": now_iso,
        }
        await db.workers.update_one({"business_id": biz_id, "mobile": s["mobile"]}, {"$set": worker_doc}, upsert=True)

        # Ensure conversation exists
        conv_id = str(uuid.uuid4())
        await db.conversations.update_one(
            {"business_id": biz_id, "worker_id": wid},
            {"$setOnInsert": {
                "id": conv_id,
                "business_id": biz_id,
                "worker_id": wid,
                "created_at": now_iso,
                "updated_at": now_iso,
                "last_message": {
                    "text": f"Welcome to Ayushman Kitchen, {s['name']}!",
                    "sender_type": "owner",
                    "created_at": now_iso,
                }
            }},
            upsert=True
        )

    print(f"✓ Seeded {len(sample_students)} active students with credentials (Password: password123)")

    # 5. Today's Sample Meal Choices (so Headcount Dashboard has live data)
    for wid, name in worker_ids:
        # Confirm lunch
        await db.meal_selections.update_one(
            {"business_id": biz_id, "worker_id": wid, "date": today_str, "meal_slot": "lunch"},
            {"$set": {
                "id": str(uuid.uuid4()),
                "business_id": biz_id,
                "worker_id": wid,
                "date": today_str,
                "meal_slot": "lunch",
                "action": "CONFIRM",
                "selection_type": "NON_VEG" if "Nishant" in name or "Amit" in name or "Sneha" in name else "VEG",
                "selected_item_id": "prem-01" if "Nishant" in name else None,
                "selected_item_name": "Chicken Dum Biryani Special" if "Nishant" in name else None,
                "updated_at": now_iso,
            }},
            upsert=True
        )
        # Confirm dinner
        await db.meal_selections.update_one(
            {"business_id": biz_id, "worker_id": wid, "date": today_str, "meal_slot": "dinner"},
            {"$set": {
                "id": str(uuid.uuid4()),
                "business_id": biz_id,
                "worker_id": wid,
                "date": today_str,
                "meal_slot": "dinner",
                "action": "CONFIRM",
                "selection_type": "VEG",
                "updated_at": now_iso,
            }},
            upsert=True
        )

    print("✓ Seeded today's live meal choices for headcount reporting")
    print("\n🎉 ALL MongoDB Atlas collections populated successfully!")

if __name__ == "__main__":
    asyncio.run(seed())
