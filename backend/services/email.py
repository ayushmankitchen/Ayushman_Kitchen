"""Email delivery service using Brevo REST API."""
from __future__ import annotations

import logging
import os
from typing import Any
import httpx

logger = logging.getLogger(__name__)

BREVO_API_URL = "https://api.brevo.com/v3/smtp/email"


class BrevoEmailService:
    """Delivers transactional emails (e.g., password reset) via Brevo API."""

    def __init__(self) -> None:
        self.api_key = os.getenv("BREVO_API_KEY", "").strip()
        self.sender_email = os.getenv("BREVO_SENDER_EMAIL", "noreply@workforce.app").strip()
        self.sender_name = os.getenv("BREVO_SENDER_NAME", "WorkForce").strip()

    async def send_password_reset_email(self, recipient_email: str, recipient_name: str, reset_link: str) -> bool:
        """Sends a password reset email with the secure one-time link."""
        if not self.api_key:
            logger.info(
                "BREVO_API_KEY is not configured. Reset email simulated for %s with link: %s",
                recipient_email,
                reset_link,
            )
            return True

        payload: dict[str, Any] = {
            "sender": {
                "name": self.sender_name,
                "email": self.sender_email,
            },
            "to": [
                {
                    "email": recipient_email,
                    "name": recipient_name or "Ayushman Kitchen Admin",
                }
            ],
            "subject": "Reset your Ayushman Kitchen Admin Password",
            "htmlContent": f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #102f2c; padding: 24px; border-radius: 16px; text-align: center;">
    <h1 style="color: #fef08a; margin: 0; font-size: 26px; font-weight: 800;">Ayushman Kitchen</h1>
    <p style="color: #99f6e4; margin: 6px 0 0 0; font-size: 13px; font-weight: 600;">Student Meal & Mess Management Portal</p>
  </div>
  <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 28px; margin-top: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
    <h2 style="color: #0f172a; margin-top: 0; font-size: 20px;">Admin Password Reset Request</h2>
    <p>Hello {recipient_name or 'Admin'},</p>
    <p>We received a request to reset the password for your Ayushman Kitchen Admin account. Click the button below to set a new password:</p>
    <div style="text-align: center; margin: 28px 0;">
      <a href="{reset_link}" style="background-color: #102f2c; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-weight: bold; font-size: 15px; display: inline-block;">Reset Password</a>
    </div>
    <p style="font-size: 13px; color: #64748b;">This link is valid for <strong>30 minutes</strong> and can only be used once. If you did not request this password reset, your account is secure and you can safely ignore this email.</p>
    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
    <p style="font-size: 12px; color: #94a3b8; word-break: break-all;">If the button above does not work, copy and paste this link into your browser:<br><a href="{reset_link}" style="color: #0f766e;">{reset_link}</a></p>
  </div>
</body>
</html>""",
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    BREVO_API_URL,
                    headers={
                        "api-key": self.api_key,
                        "Content-Type": "application/json",
                        "Accept": "application/json",
                    },
                    json=payload,
                )
                if response.status_code in {200, 201, 202}:
                    logger.info("Password reset email successfully sent via Brevo to %s", recipient_email)
                    return True
                else:
                    logger.error("Brevo email failed with status %s: %s", response.status_code, response.text)
                    return False
        except Exception as exc:
            logger.exception("Failed to send password reset email via Brevo: %s", exc)
            return False


email_service = BrevoEmailService()
