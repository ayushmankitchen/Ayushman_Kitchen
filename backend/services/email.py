"""Email delivery service using Brevo SMTP."""
from __future__ import annotations

import asyncio
import logging
import os
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr, formatdate, make_msgid
from typing import Any

logger = logging.getLogger(__name__)


def _send_smtp_sync(
    host: str,
    port: int,
    user: str,
    password: str,
    from_name: str,
    from_email: str,
    to_name: str,
    to_email: str,
    subject: str,
    reset_link: str,
    timeout: float = 15.0,
) -> bool:
    """Synchronous SMTP sender executed in a thread pool."""
    if not user or not password:
        logger.warning(
            "Brevo SMTP credentials (EMAIL_USER / EMAIL_PASSWORD) not configured. Reset email simulated for %s",
            to_email,
        )
        return True

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = formataddr((from_name, from_email))
    msg["To"] = formataddr((to_name, to_email))
    msg["Date"] = formatdate(localtime=True)
    msg["Message-ID"] = make_msgid(domain="ayushmankitchen.com")

    plain_text = f"""Ayushman Kitchen - Password Reset Request

Hello {to_name},

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
    <p>Hello {to_name},</p>
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

    msg.attach(MIMEText(plain_text, "plain", "utf-8"))
    msg.attach(MIMEText(html_content, "html", "utf-8"))

    context = ssl.create_default_context()
    try:
        with smtplib.SMTP(host=host, port=port, timeout=timeout) as server:
            server.ehlo()
            if server.has_extn("STARTTLS") or port == 587:
                server.starttls(context=context)
                server.ehlo()
            server.login(user, password)
            server.sendmail(from_email, [to_email], msg.as_string())
            logger.info("Password reset email successfully sent via Brevo SMTP to %s", to_email)
            return True
    except smtplib.SMTPAuthenticationError:
        logger.error(
            "Brevo SMTP authentication failed for user %s. Please verify EMAIL_USER and EMAIL_PASSWORD (must be Brevo SMTP key).",
            f"{user[:4]}***" if len(user) > 4 else "***",
        )
        return False
    except smtplib.SMTPConnectError:
        logger.error("Brevo SMTP connection failed to %s:%s.", host, port)
        return False
    except Exception as exc:
        logger.exception("Brevo SMTP email delivery failed to %s: %s", to_email, exc.__class__.__name__)
        return False


class BrevoEmailService:
    """Delivers transactional emails (e.g., password reset) via Brevo SMTP."""

    @property
    def host(self) -> str:
        return os.getenv("EMAIL_HOST", "smtp-relay.brevo.com").strip()

    @property
    def port(self) -> int:
        val = os.getenv("EMAIL_PORT", "587").strip()
        try:
            return int(val)
        except ValueError:
            return 587

    @property
    def user(self) -> str:
        return os.getenv("EMAIL_USER", "").strip()

    @property
    def password(self) -> str:
        return os.getenv("EMAIL_PASSWORD", "").strip()

    @property
    def sender_email(self) -> str:
        return (
            os.getenv("EMAIL_FROM", "").strip()
            or os.getenv("BREVO_SENDER_EMAIL", "").strip()
            or "ayushmankitchen@gmail.com"
        )

    @property
    def sender_name(self) -> str:
        return (
            os.getenv("EMAIL_FROM_NAME", "").strip()
            or os.getenv("BREVO_SENDER_NAME", "").strip()
            or "Ayushman Kitchen"
        )

    async def send_password_reset_email(self, recipient_email: str, recipient_name: str, reset_link: str) -> bool:
        """Sends a password reset email asynchronously using Brevo SMTP."""
        greeting_name = recipient_name.strip() if recipient_name and recipient_name.strip() else "Ayushman Kitchen User"
        return await asyncio.to_thread(
            _send_smtp_sync,
            self.host,
            self.port,
            self.user,
            self.password,
            self.sender_name,
            self.sender_email,
            greeting_name,
            recipient_email,
            "Reset your Ayushman Kitchen Password",
            reset_link,
            15.0,
        )


email_service = BrevoEmailService()
