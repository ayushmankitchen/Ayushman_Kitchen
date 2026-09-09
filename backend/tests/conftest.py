"""Tests must never inherit the developer's live database or service keys."""
import os

import pytest

# Import-time dotenv loading must not reconnect tests to Atlas.
os.environ.update({
    "MONGO_URL": "mongodb://127.0.0.1:27019",
    "DB_NAME": "ayushman_test",
    "ENVIRONMENT": "test",
    "JWT_SECRET": "test-only-secret-never-use-in-production-123456",
    "MEDIA_STORAGE": "local",
    "COOKIE_SECURE": "false",
    "COOKIE_SAMESITE": "lax",
    "ALLOW_ADMIN_SIGNUP": "true",
    "BREVO_API_KEY": "",
    "VAPID_PRIVATE_KEY": "",
    "VAPID_PUBLIC_KEY": "",
    "VAPID_SUBJECT": "",
})


def pytest_addoption(parser):
    parser.addoption("--integration", action="store_true", help="Run DB tests against local MongoDB :27019 only")


def pytest_collection_modifyitems(config, items):
    for item in items:
        uses_database = item.path.name in {"test_auth.py", "test_delivery.py"} or item.name == "test_complete_forgot_and_reset_password_flow"
        if uses_database and not config.getoption("--integration"):
            item.add_marker(pytest.mark.skip(reason="Requires isolated MongoDB; run with --integration"))


@pytest.fixture(autouse=True)
def isolate_rate_limits():
    from backend import server
    server._rate_buckets.clear()
    yield
    server.app.dependency_overrides.clear()
