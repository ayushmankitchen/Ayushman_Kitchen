from datetime import timedelta

import pytest

from backend.services import timezone as business_time


def test_today_and_past_are_accepted(monkeypatch):
    fixed = business_time.now_tz()
    monkeypatch.setattr(business_time, "now_tz", lambda: fixed)
    business_time.validate_past_or_today(fixed.date().isoformat())
    business_time.validate_past_or_today((fixed.date() - timedelta(days=30)).isoformat())


def test_future_attendance_is_rejected(monkeypatch):
    fixed = business_time.now_tz()
    monkeypatch.setattr(business_time, "now_tz", lambda: fixed)
    with pytest.raises(ValueError, match="future"):
        business_time.validate_past_or_today((fixed.date() + timedelta(days=1)).isoformat())
