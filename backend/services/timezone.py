import os
from datetime import datetime, timezone, timedelta
try:
    from zoneinfo import ZoneInfo
except ImportError:
    from backports.zoneinfo import ZoneInfo

# Business timezone configuration (default: Asia/Kolkata)
BUSINESS_TIMEZONE_NAME = os.environ.get("BUSINESS_TIMEZONE", "Asia/Kolkata")

try:
    BUSINESS_TZ = ZoneInfo(BUSINESS_TIMEZONE_NAME)
except Exception:
    BUSINESS_TZ = timezone(timedelta(hours=5, minutes=30))


def now_tz() -> datetime:
    """Returns the current datetime in the business timezone."""
    return datetime.now(BUSINESS_TZ)


def get_today_date() -> str:
    """Returns today's date in YYYY-MM-DD format using business timezone."""
    return now_tz().date().isoformat()


def get_yesterday_date() -> str:
    """Returns yesterday's date in YYYY-MM-DD format using business timezone."""
    return (now_tz().date() - timedelta(days=1)).isoformat()


def get_month_bounds(date_str: str | None = None) -> tuple[str, str, int, int]:
    """
    Returns (start_date_str, end_date_str, year, month) for a given date or current month.
    start_date is inclusive (e.g. '2026-08-01'), end_date is exclusive (e.g. '2026-09-01').
    """
    if date_str:
        dt = datetime.strptime(date_str[:10], "%Y-%m-%d")
    else:
        dt = now_tz()
    
    start = dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if start.month == 12:
        nxt = start.replace(year=start.year + 1, month=1)
    else:
        nxt = start.replace(month=start.month + 1)
    
    return start.date().isoformat(), nxt.date().isoformat(), start.year, start.month


def validate_past_or_today(date_str: str) -> None:
    """
    Validates that a date string (YYYY-MM-DD) is not in the future
    relative to the business timezone.
    Raises ValueError if date is invalid or in the future.
    """
    target = datetime.strptime(date_str, "%Y-%m-%d").date()
    today = now_tz().date()
    if target > today:
        raise ValueError(f"Attendance date cannot be in the future. Selected {date_str}, today is {today.isoformat()}.")
