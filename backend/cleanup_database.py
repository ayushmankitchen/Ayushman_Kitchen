import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "ayushman_kitchen")

async def clean_database():
    print(f"Connecting to MongoDB Atlas ({DB_NAME})...")
    client = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=10000)
    db = client[DB_NAME]

    cols = await db.list_collection_names()
    print("Existing collections in Atlas:", cols)

    # 1. Drop unnecessary legacy collections
    legacy_collections = ["extra_work", "salary_slips", "work_logs", "shift_logs"]
    for col in legacy_collections:
        if col in cols:
            await db.drop_collection(col)
            print(f"✓ Dropped legacy collection: {col}")

    # 2. Migrate / Sync `workers` to `students`
    workers_count = await db.workers.count_documents({})
    if workers_count > 0:
        docs = await db.workers.find({}).to_list(1000)
        cleaned_docs = []
        for d in docs:
            # Remove legacy payroll fields
            d.pop("daily_rate", None)
            d.pop("hourly_rate", None)
            d.pop("wage_type", None)
            d.pop("overtime_rate", None)
            d.pop("salary_type", None)
            d.pop("bank_details", None)
            d.pop("upi_id", None)
            cleaned_docs.append(d)

        # Update workers collection with cleaned schema
        await db.workers.delete_many({})
        await db.workers.insert_many(cleaned_docs)

        # Also mirror to students collection
        await db.students.delete_many({})
        await db.students.insert_many(cleaned_docs)
        print(f"✓ Cleaned and updated {len(cleaned_docs)} student profiles in 'students' & 'workers' collections")

    # 3. Clean up indexes
    try:
        await db.students.create_index([("business_id", 1), ("mobile", 1)], unique=True, sparse=True)
        await db.students.create_index([("business_id", 1), ("login_id", 1)], unique=True, sparse=True)
        print("✓ Created clean student indexes on MongoDB Atlas")
    except Exception as e:
        print("Index notice:", e)

    remaining_cols = await db.list_collection_names()
    print("\n✅ Clean Atlas Database Collections:", remaining_cols)
    for c in remaining_cols:
        cnt = await db[c].count_documents({})
        print(f"  • {c}: {cnt} items")

if __name__ == "__main__":
    asyncio.run(clean_database())
