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
        await asyncio.to_thread(
            webpush,
            subscription_info={"endpoint": subscription["endpoint"], "keys": subscription["keys"]},
            data=json.dumps(payload),
            vapid_private_key=os.environ["VAPID_PRIVATE_KEY"],
            vapid_claims={"sub": os.environ["VAPID_SUBJECT"]},
        )
        return True
    except Exception as exc:
        # Expired subscriptions are removed by the caller; all other failures are non-fatal.
        logger.warning("Web Push delivery failed: %s", exc)
        return False
