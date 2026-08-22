"""Best-effort Web Push delivery. Push failures must never affect chat."""
from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any

logger = logging.getLogger(__name__)


def configured() -> bool:
    return all(os.getenv(name, "").strip() for name in ("VAPID_PRIVATE_KEY", "VAPID_SUBJECT"))


def public_key() -> str:
    return os.getenv("VAPID_PUBLIC_KEY", "").strip()


async def send(subscription: dict[str, Any], payload: dict[str, Any]) -> bool:
    if not configured():
        return False
    try:
        from pywebpush import WebPushException, webpush
        tag = str(payload.get("tag") or "notification")[:32]
        await asyncio.to_thread(
            webpush,
            subscription_info={"endpoint": subscription["endpoint"], "keys": subscription["keys"]},
            data=json.dumps(payload),
            vapid_private_key=os.environ["VAPID_PRIVATE_KEY"],
            vapid_claims={"sub": os.environ["VAPID_SUBJECT"]},
            ttl=86400,
            headers={
                "Urgency": "high",
            },
        )
        return True
    except Exception as exc:
        logger.warning("Web Push delivery failed for endpoint: %s", exc)
        return False

