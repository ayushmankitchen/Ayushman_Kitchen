from datetime import datetime
from zoneinfo import ZoneInfo
from app.core import window_is_open
def at(hour,minute):return datetime(2026,1,1,hour,minute,tzinfo=ZoneInfo("Asia/Kolkata"))
def test_lunch_boundaries():
    assert not window_is_open("LUNCH",at(5,59));assert window_is_open("LUNCH",at(6,0));assert window_is_open("LUNCH",at(10,59));assert not window_is_open("LUNCH",at(11,0))
def test_dinner_boundaries():
    assert not window_is_open("DINNER",at(15,59));assert window_is_open("DINNER",at(16,0));assert window_is_open("DINNER",at(18,59));assert not window_is_open("DINNER",at(19,0))
