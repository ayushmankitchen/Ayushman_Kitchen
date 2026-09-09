"""Required access paths. Unique constraints deliberately fail on existing duplicates.

Review duplicate groups with scripts/production_audit.py before deployment; never
silently delete student records to make an index build succeed.
"""

INDEXES = {
    "admins": [([("id", 1)], {"unique": True})],
    "businesses": [([("id", 1)], {"unique": True})],
    "workers": [([("id", 1)], {"unique": True}), ([("business_id", 1), ("status", 1)], {})],
    "meal_settings": [([("business_id", 1)], {"unique": True})],
    "meal_selections": [
        ([("business_id", 1), ("worker_id", 1), ("date", 1), ("meal_slot", 1)], {"unique": True}),
        ([("business_id", 1), ("date", 1)], {}),
        ([("date", 1)], {}),
    ],
    "worker_leaves": [
        ([("business_id", 1), ("worker_id", 1), ("status", 1)], {}),
        ([("business_id", 1), ("status", 1), ("start_date", 1), ("end_date", 1)], {}),
    ],
    "activity_logs": [([("business_id", 1), ("created_at", -1)], {})],
    "conversations": [([("id", 1)], {"unique": True})],
    "messages": [([("business_id", 1), ("sender_type", 1), ("read_at", 1), ("conversation_id", 1)], {})],
    "attendance": [([("date", 1)], {})],
    "worker_sessions": [([("expires_at", 1)], {"expireAfterSeconds": 0})],
    "delivery_sessions": [
        ([("business_id", 1), ("date", 1), ("meal_slot", 1)], {"unique": True}),
    ],
    "delivery_notifications": [
        ([("business_id", 1), ("worker_id", 1), ("created_at", -1)], {}),
        ([("expires_at", 1)], {"expireAfterSeconds": 0}),
    ],
}


async def ensure_production_indexes(db):
    for collection, indexes in INDEXES.items():
        for keys, options in indexes:
            await db[collection].create_index(keys, **options)
