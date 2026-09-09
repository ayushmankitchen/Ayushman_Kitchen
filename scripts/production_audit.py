"""Read-only production evidence. Never prints credentials or student records.

Run from repository root: backend/venv/bin/python scripts/production_audit.py
Add --database to inspect the database configured in backend/.env (read-only).
"""
import argparse
import json
import time
from datetime import datetime, timezone
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--database", action="store_true")
    parser.add_argument("--output", default="audit/production-evidence.json")
    args = parser.parse_args()
    import httpx
    report = {"checked_at_utc": datetime.now(timezone.utc).isoformat(), "http": []}
    urls = [
        "https://ayushman-kitchen.vercel.app/",
        "https://ayushman-kitchen.vercel.app/student/login",
        "https://ayushman-kitchen.vercel.app/api/health",
        "https://ayushman-kitchen.vercel.app/api/ready",
        "https://ayushman-kitchen.vercel.app/api/public/business",
        "https://ayushman-kitchen.vercel.app/api/workers",
        "https://ayushman-kitchen.onrender.com/api/health",
        "https://ayushman-kitchen.onrender.com/api/ready",
    ]
    with httpx.Client(timeout=30, follow_redirects=False) as client:
        for url in urls:
            started = time.perf_counter()
            row = {"url": url}
            try:
                response = client.get(url)
                row.update(status=response.status_code, elapsed_ms=round((time.perf_counter()-started)*1000),
                           headers={key: response.headers.get(key) for key in
                                    ["content-type", "cache-control", "x-request-id", "x-frame-options", "x-content-type-options"]})
                if url.endswith(("/health", "/ready")):
                    row["body"] = response.json()
            except Exception as exc:
                row["error_type"] = type(exc).__name__
            report["http"].append(row)
    if args.database:
        from dotenv import dotenv_values
        from pymongo import MongoClient
        from backend.services.production_indexes import INDEXES
        cfg = dotenv_values(ROOT / "backend/.env")
        database_report = {}
        report["database"] = database_report
        try:
            with MongoClient(cfg["MONGO_URL"], serverSelectionTimeoutMS=10000, timeoutMS=10000) as client:
                db = client[cfg["DB_NAME"]]
                db.command("ping")
                database_report["ping"] = "ok"
                database_report["workers_total"] = db.workers.count_documents({}, maxTimeMS=5000)
                database_report["workers_active"] = db.workers.count_documents({"status": "ACTIVE"}, maxTimeMS=5000)
                database_report["business_count"] = db.businesses.count_documents({}, maxTimeMS=5000)
                database_report["missing_business_workers"] = db.workers.count_documents({"$or": [{"business_id": None}, {"business_id": ""}]}, maxTimeMS=5000)
                database_report["indexes"] = {}
                database_report["duplicate_groups"] = {}
                for collection, specs in INDEXES.items():
                    database_report["indexes"][collection] = [
                        {"name": index["name"], "keys": dict(index["key"]), "unique": index.get("unique", False), "ttl": index.get("expireAfterSeconds")}
                        for index in db[collection].list_indexes()
                    ]
                    for keys, options in specs:
                        if options.get("unique"):
                            groups = list(db[collection].aggregate([
                                {"$group": {"_id": {key: "$"+key for key, _ in keys}, "n": {"$sum": 1}}},
                                {"$match": {"n": {"$gt": 1}}}, {"$count": "groups"},
                            ], maxTimeMS=5000))
                            database_report["duplicate_groups"][collection+":"+",".join(key for key,_ in keys)] = groups[0]["groups"] if groups else 0
        except Exception as exc:
            database_report["error_type"] = type(exc).__name__
    out = ROOT / args.output
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2)+"\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
