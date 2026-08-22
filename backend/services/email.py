"""Email delivery service using Brevo HTTPS REST API."""
from __future__ import annotations

import logging
import os
from typing import Any
import httpx

logger = logging.getLogger(__name__)

BREVO_API_URL = "https://api.brevo.com/v3/smtp/email"


class BrevoEmailService:
    """Delivers transactional emails (e.g., password reset) via Brevo HTTPS REST API (Render Free compatible)."""

    @property
    def api_key(self) -> str:
        return os.getenv("BREVO_API_KEY", "").strip()

    @property
    def sender_email(self) -> str:
        return os.getenv("BREVO_SENDER_EMAIL", "ayushmankitchen@gmail.com").strip()

    @property
    def sender_name(self) -> str:
        return os.getenv("BREVO_SENDER_NAME", "Ayushman Kitchen").strip()

    async def send_password_reset_email(self, recipient_email: str, recipient_name: str, reset_link: str) -> bool:
        """Sends a password reset email with the secure one-time link via Brevo HTTPS API."""
        api_key = self.api_key
        sender_email = self.sender_email
        sender_name = self.sender_name

        if not api_key:
            logger.warning(
                "BREVO_API_KEY is not configured. Reset email simulated for %s",
                recipient_email,
            )
            return True

        greeting_name = recipient_name.strip() if recipient_name and recipient_name.strip() else "Ayushman Kitchen User"

        text_content = f"""Ayushman Kitchen - Password Reset Request

Hello {greeting_name},

We received a request to reset the password for your Ayushman Kitchen account.
Use the following link to set a new password:
{reset_link}

This link is valid for 30 minutes and can only be used once. If you did not request a password reset, you can safely ignore this email.

Ayushman Kitchen - Student Meal & Mess Management Portal
"""

        html_content = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #102f2c; padding: 24px; border-radius: 16px; text-align: center;">
    <h1 style="color: #fef08a; margin: 0; font-size: 26px; font-weight: 800;">Ayushman Kitchen</h1>
    <p style="color: #99f6e4; margin: 6px 0 0 0; font-size: 13px; font-weight: 600;">Student Meal & Mess Management Portal</p>
  </div>
  <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 28px; margin-top: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
    <h2 style="color: #0f172a; margin-top: 0; font-size: 20px;">Password Reset Request</h2>
    <p>Hello {greeting_name},</p>
    <p>We received a request to reset the password for your Ayushman Kitchen account. Click the button below to set a new password:</p>
    <div style="text-align: center; margin: 28px 0;">
      <a href="{reset_link}" style="background-color: #102f2c; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-weight: bold; font-size: 15px; display: inline-block;">Reset Password</a>
    </div>
    <p style="font-size: 13px; color: #64748b;">This link is valid for <strong>30 minutes</strong> and can only be used once. If you did not request this password reset, your account is secure and you can safely ignore this email.</p>
    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
    <p style="font-size: 12px; color: #94a3b8; word-break: break-all;">If the button above does not work, copy and paste this link into your browser:<br><a href="{reset_link}" style="color: #0f766e;">{reset_link}</a></p>
  </div>
</body>
</html>"""

        payload: dict[str, Any] = {
            "sender": {
                "name": sender_name,
                "email": sender_email,
            },
            "to": [
                {
                    "email": recipient_email,
                    "name": greeting_name,
                }
            ],
            "subject": "Reset your Ayushman Kitchen password",
            "htmlContent": html_content,
            "textContent": text_content,
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    BREVO_API_URL,
                    headers={
                        "api-key": api_key,
                        "Content-Type": "application/json",
                        "Accept": "application/json",
                    },
                    json=payload,
                )
                if response.status_code in {200, 201, 202}:
                    logger.info("Brevo email accepted for %s (status=%s)", recipient_email, response.status_code)
                    return True
                else:
                    logger.error(
                        "Brevo email request failed: status=%s detail=%s",
                        response.status_code,
                        response.text[:300],
                    )
                    return False
        except Exception as exc:
            logger.exception("Failed to send password reset email via Brevo HTTPS API: %s", exc.__class__.__name__)
            return False


email_service = BrevoEmailService()
