"""Synthetic capacity check using ASGI + a real, isolated local MongoDB.

No production URL/URI option is provided deliberately. Run MongoDB on :27019,
then run backend/venv/bin/python scripts/load_test.py --concurrency 400.
Results exclude network, Render CPU constraints, Atlas latency and paid services.
"""
import argparse
import asyncio
from collections import Counter
from datetime import datetime, timedelta, timezone
import json
import logging
import os
from pathlib import Path
import resource
import sys
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
DB_NAME = "ayushman_load_" + uuid.uuid4().hex
os.environ.update({
    "MONGO_URL": "mongodb://127.0.0.1:27019", "DB_NAME": DB_NAME,
    "ENVIRONMENT": "test", "JWT_SECRET": "isolated-capacity-test-secret-never-use-live",
    "MEDIA_STORAGE": "local", "COOKIE_SECURE": "false", "COOKIE_SAMESITE": "lax",
    "ADMIN_PASSWORD": "IsolatedTestAdminPassword123!", "ALLOW_ADMIN_SIGNUP": "true",
    "BREVO_API_KEY": "", "VAPID_PRIVATE_KEY": "", "VAPID_PUBLIC_KEY": "", "VAPID_SUBJECT": "",
    "ENABLE_MEAL_DATA_CLEANUP": "false",
})

from httpx import ASGITransport, AsyncClient
from backend import server


def percentiles(values):
    values = sorted(values)
    return {label: round(values[min(len(values)-1, int((len(values)-1)*fraction))], 2)
            for label, fraction in [("p50_ms", .5), ("p95_ms", .95), ("p99_ms", .99), ("max_ms", 1)]} if values else {}


async def run(concurrency):
    logging.getLogger().setLevel(logging.WARNING)
    await server.startup()
    result = {"checked_at_utc": datetime.now(timezone.utc).isoformat(), "registered_students": 600,
              "max_in_flight_requests": concurrency, "transport": "in-process ASGI + real localhost MongoDB", "phases": []}
    try:
        db = server.db
        business = await db.businesses.find_one({})
        admin = await db.admins.find_one({})
        biz = business["id"]
        today = server.get_today_date()
        now = datetime.now(timezone.utc)
        joining = (datetime.strptime(today, "%Y-%m-%d")-timedelta(days=10)).strftime("%Y-%m-%d")
        password_hash = await server.run_in_threadpool(server.hash_password, "SyntheticPassword123!")
        await db.workers.insert_many([{
            "id": f"student-{i}", "business_id": biz, "name": f"Synthetic Student {i}",
            "login_id": f"WF-LOAD{i:06d}", "status": "ACTIVE", "portal_enabled": True,
            "password_hash": password_hash, "work_type": "Standard", "meal_plan_type": "BOTH",
            "joining_date": joining, "salary": 3300, "total_quota": 60, "created_at": now.isoformat(),
        } for i in range(600)])
        await db.worker_sessions.insert_many([{
            "session_token": f"load-session-{i}", "worker_id": f"student-{i}",
            "business_id": biz, "expires_at": now+timedelta(hours=1),
        } for i in range(600)])
        await db.meal_settings.insert_one({"business_id": biz, "days": server.DEFAULT_WEEKLY_MENU,
            "windows": {slot: {"is_enabled": False, "end_time": "23:59"} for slot in ["lunch", "dinner"]}})
        # Existing history is included to avoid testing only empty collections.
        history_dates = [(datetime.strptime(today, "%Y-%m-%d")-timedelta(days=offset)).strftime("%Y-%m-%d") for offset in range(1, 11)]
        await db.meal_selections.insert_many([{"id": f"old-{i}-{slot}-{date}", "business_id": biz,
            "worker_id": f"student-{i}", "date": date, "meal_slot": slot, "action": "CONFIRM", "selection_type": "VEG"}
            for i in range(600) for slot in ["lunch", "dinner"] for date in history_dates])
        token = server.create_access_token(admin["id"], admin["email"], biz)
        admin_headers = {"Authorization": "Bearer "+token, "Cookie": ""}
        async with AsyncClient(transport=ASGITransport(app=server.app), base_url="http://isolated-test") as client:
            sem = asyncio.Semaphore(concurrency)

            async def phase(name, method, path, count=400, admin_request=False, body=None, same_student=False):
                durations, statuses = [], Counter()
                started = time.perf_counter()
                async def request(i):
                    async with sem:
                        headers = admin_headers if admin_request else {"Authorization": f"Bearer load-session-{0 if same_student else i % 600}", "Cookie": ""}
                        tick = time.perf_counter()
                        try:
                            response = await asyncio.wait_for(client.request(method, path, headers=headers, json=body(i) if callable(body) else body), timeout=60)
                            statuses[str(response.status_code)] += 1
                        except Exception as exc:
                            statuses[type(exc).__name__] += 1
                        durations.append((time.perf_counter()-tick)*1000)
                await asyncio.gather(*(request(i) for i in range(count)))
                elapsed = time.perf_counter()-started
                entry = {"name": name, "requests": count, "statuses": dict(statuses), "duration_s": round(elapsed,2),
                         "requests_per_second": round(count/elapsed,2), **percentiles(durations)}
                result["phases"].append(entry)
                print(json.dumps(entry), flush=True)

            health_samples = []
            async def monitor_health():
                while True:
                    tick = time.perf_counter()
                    response = await client.get("/api/health", headers={"Cookie": ""})
                    health_samples.append((response.status_code, (time.perf_counter()-tick)*1000))
                    await asyncio.sleep(.1)
            monitor = asyncio.create_task(monitor_health())
            try:
                await phase("40 simultaneous password logins", "POST", "/api/worker/login", count=40,
                            body=lambda i: {"login_id": f"WF-LOAD{i:06d}", "password": "SyntheticPassword123!"})
            finally:
                monitor.cancel()
                try:
                    await monitor
                except asyncio.CancelledError:
                    pass
            result["health_during_logins"] = {"samples": len(health_samples),
                "statuses": dict(Counter(str(status) for status, _ in health_samples)),
                **percentiles([elapsed for _,elapsed in health_samples])}
            for path in ["/api/worker/today-meal", "/api/worker/meal-stats", "/api/worker/me/data", "/api/chat/worker-conversation"]:
                await phase(path, "GET", path)
            await phase("meal selection burst", "POST", "/api/worker/select-meal", body={"date": today, "meal_slot": "lunch", "action": "CONFIRM", "selection_type": "VEG"})
            for path in ["/api/meal-headcount", "/api/admin/low-balance-students", "/api/chat/conversations"]:
                await phase(path, "GET", path, count=10, admin_request=True)
            headcount = await client.get("/api/meal-headcount", headers=admin_headers)
            result["headcount_students"] = headcount.json()["lunch"]["summary"]["total_students"]
            result["persisted_lunch_selections"] = await db.meal_selections.count_documents({"date": today, "meal_slot": "lunch"})
            # Concurrent duplicate submissions for one meal must leave exactly one record.
            await phase("same-student duplicate submission", "POST", "/api/worker/select-meal", count=25, same_student=True,
                        body={"date": today, "meal_slot": "dinner", "action": "CONFIRM", "selection_type": "VEG"})
            result["same_student_dinner_records"] = await db.meal_selections.count_documents({"date": today, "worker_id": "student-0", "meal_slot": "dinner"})
            health = await client.get("/api/ready")
            result["final_readiness"] = health.status_code
        result["process_peak_rss_bytes"] = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * (1 if sys.platform == "darwin" else 1024)
        result["passed"] = all(set(p["statuses"]) == {"200"} for p in result["phases"]) and result["headcount_students"] == 600 and result["persisted_lunch_selections"] == 400 and result["same_student_dinner_records"] == 1
        out = ROOT / "audit" / f"load-test-{concurrency}.json"
        out.parent.mkdir(exist_ok=True)
        out.write_text(json.dumps(result, indent=2)+"\n")
        print(json.dumps({"passed": result["passed"], "report": str(out)}), flush=True)
        if not result["passed"]:
            raise RuntimeError("Synthetic load checks failed; inspect the report")
    finally:
        # Database name and host are hardcoded above; never accept a production target.
        assert DB_NAME.startswith("ayushman_load_")
        await server.client.drop_database(DB_NAME)
        await server.shutdown_db_client()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--concurrency", type=int, choices=[25, 100, 400], default=100)
    args = parser.parse_args()
    asyncio.run(run(args.concurrency))
