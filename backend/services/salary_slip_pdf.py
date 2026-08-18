import io
import re
from html import escape
from datetime import datetime
from typing import Dict, Any, List, Optional
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    KeepTogether,
    HRFlowable,
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch

from backend.services.timezone import now_tz


def format_indian_currency(amount: float) -> str:
    """Formats a number into Indian currency style: e.g. 1,25,000.00"""
    try:
        val = float(amount or 0)
    except (ValueError, TypeError):
        val = 0.0

    is_negative = val < 0
    val = abs(val)
    
    parts = f"{val:.2f}".split(".")
    integer_part = parts[0]
    decimal_part = parts[1]

    if len(integer_part) > 3:
        last3 = integer_part[-3:]
        remaining = integer_part[:-3]
        groups = []
        while len(remaining) > 2:
            groups.insert(0, remaining[-2:])
            remaining = remaining[:-2]
        if remaining:
            groups.insert(0, remaining)
        formatted_int = ",".join(groups) + "," + last3
    else:
        formatted_int = integer_part

    prefix = "-" if is_negative else ""
    return f"{prefix}Rs. {formatted_int}"


def sanitize_filename(name: str) -> str:
    """Sanitizes worker and business strings for safe Content-Disposition filenames."""
    clean = re.sub(r"[^a-zA-Z0-9_-]+", "_", name.strip())
    return clean[:50] or "Worker"


def safe_pdf_text(value: Any, fallback: str = "-") -> str:
    """Return escaped ASCII text that ReportLab's built-in Helvetica can render."""
    text = str(value or "").strip()
    if not text:
        return fallback
    return escape(text.encode("ascii", "replace").decode("ascii"))


def generate_salary_slip_pdf(
    worker: Dict[str, Any],
    business: Optional[Dict[str, Any]],
    summary: Dict[str, Any],
    attendance_summary: Dict[str, Any],
    year: int,
    month: int,
    recent_payments: Optional[List[Dict[str, Any]]] = None,
) -> bytes:
    """
    Generates an authoritative, professional A4 Salary Slip PDF in memory.
    Uses existing PayrollService calculations as the single source of truth.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=36,
        rightMargin=36,
        topMargin=36,
        bottomMargin=36,
    )

    styles = getSampleStyleSheet()

    # Custom Palette
    PRIMARY = colors.HexColor("#102f2c")      # Deep Workforce Teal
    SECONDARY = colors.HexColor("#0f766e")    # Teal Accent
    AMBER_DARK = colors.HexColor("#b45309")   # Amber Dark
    AMBER_BG = colors.HexColor("#fef3c7")     # Amber Light Tint
    BG_LIGHT = colors.HexColor("#f8fafc")     # Light Slate Tint
    BORDER_COLOR = colors.HexColor("#cbd5e1") # Border Gray
    TEXT_MAIN = colors.HexColor("#0f172a")    # Slate 900
    TEXT_MUTED = colors.HexColor("#475569")   # Slate 600
    EMERALD_DARK = colors.HexColor("#047857") # Emerald Green
    ROSE_DARK = colors.HexColor("#be123c")    # Rose Red

    # Custom Typography Styles
    title_style = ParagraphStyle(
        "DocTitle",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=20,
        leading=24,
        textColor=PRIMARY,
        alignment=0,
    )
    subtitle_style = ParagraphStyle(
        "DocSubtitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=14,
        textColor=SECONDARY,
        alignment=0,
    )
    biz_header_style = ParagraphStyle(
        "BizHeader",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=15,
        textColor=TEXT_MAIN,
        alignment=2,
    )
    biz_sub_style = ParagraphStyle(
        "BizSub",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=12,
        textColor=TEXT_MUTED,
        alignment=2,
    )
    section_heading = ParagraphStyle(
        "SectionHeading",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=14,
        textColor=PRIMARY,
    )
    cell_bold = ParagraphStyle(
        "CellBold",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=9,
        leading=12,
        textColor=TEXT_MAIN,
    )
    cell_normal = ParagraphStyle(
        "CellNormal",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=12,
        textColor=TEXT_MUTED,
    )
    cell_right = ParagraphStyle(
        "CellRight",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=12,
        textColor=TEXT_MAIN,
        alignment=2,
    )
    cell_right_bold = ParagraphStyle(
        "CellRightBold",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=9.5,
        leading=12,
        textColor=TEXT_MAIN,
        alignment=2,
    )
    footer_text = ParagraphStyle(
        "FooterText",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        leading=10,
        textColor=TEXT_MUTED,
        alignment=1,
    )

    story = []

    # 1. Header Banner Table (WorkForce Title on left, Business details on right)
    month_names = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ]
    month_str = month_names[month - 1] if 1 <= month <= 12 else str(month)

    biz_name = safe_pdf_text((business.get("name") if business else None) or "WorkForce Workspace")
    biz_owner = safe_pdf_text((business.get("owner_name") if business else None) or "", fallback="")

    header_left = [
        Paragraph("WORKFORCE", title_style),
        Paragraph(f"SALARY SLIP &middot; {month_str.upper()} {year}", subtitle_style),
    ]

    header_right = [
        Paragraph(biz_name, biz_header_style),
        Paragraph(f"Employer: {biz_owner}" if biz_owner else "Authorized Workforce Payroll Statement", biz_sub_style),
    ]

    header_table = Table(
        [[header_left, header_right]],
        colWidths=[260, 263],
    )
    header_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 8))
    story.append(HRFlowable(width="100%", thickness=2, color=PRIMARY, spaceBefore=2, spaceAfter=12))

    # 2. Worker Identity Details
    story.append(Paragraph("WORKER INFORMATION", section_heading))
    story.append(Spacer(1, 4))

    worker_info_data = [
        [
            Paragraph("Worker Name:", cell_normal),
            Paragraph(f"<b>{safe_pdf_text(worker.get('name'))}</b>", cell_bold),
            Paragraph("Worker ID:", cell_normal),
            Paragraph(f"<b>{safe_pdf_text(worker.get('login_id'))}</b>", cell_bold),
        ],
        [
            Paragraph("Work Designation:", cell_normal),
            Paragraph(safe_pdf_text(worker.get("work_type")), cell_bold),
            Paragraph("Mobile Phone:", cell_normal),
            Paragraph(safe_pdf_text(worker.get("mobile")), cell_bold),
        ],
        [
            Paragraph("Joining Date:", cell_normal),
            Paragraph(safe_pdf_text(worker.get("joining_date")), cell_bold),
            Paragraph("Payroll Period:", cell_normal),
            Paragraph(f"{month_str} {year}", cell_bold),
        ],
    ]

    worker_table = Table(worker_info_data, colWidths=[110, 150, 110, 153])
    worker_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), BG_LIGHT),
        ("BOX", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(worker_table)
    story.append(Spacer(1, 10))

    # 3. Attendance Performance Summary
    story.append(Paragraph("ATTENDANCE PERFORMANCE", section_heading))
    story.append(Spacer(1, 4))

    att_present = attendance_summary.get("present", summary.get("present_days", 0))
    att_half = attendance_summary.get("half_day", summary.get("half_days", 0))
    att_absent = attendance_summary.get("absent", summary.get("absent_days", 0))
    att_units = attendance_summary.get("earned_units", att_present + (att_half * 0.5))
    att_rate = attendance_summary.get("attendance_rate", 0.0)
    days_in_m = summary.get("days_in_month", 30)

    attendance_data = [
        [
            Paragraph("Present Days (1.0x)", cell_normal),
            Paragraph("Half Days (0.5x)", cell_normal),
            Paragraph("Absent Days (0.0x)", cell_normal),
            Paragraph("Attendance Units", cell_normal),
            Paragraph("Attendance Rate", cell_normal),
        ],
        [
            Paragraph(f"<b>{att_present}</b>", cell_bold),
            Paragraph(f"<b>{att_half}</b>", cell_bold),
            Paragraph(f"<b>{att_absent}</b>", cell_bold),
            Paragraph(f"<b>{att_units:.1f} / {days_in_m}</b>", cell_bold),
            Paragraph(f"<b>{att_rate:.1f}%</b>", cell_bold),
        ],
    ]

    attendance_table = Table(attendance_data, colWidths=[104, 104, 104, 105, 106])
    attendance_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
        ("BACKGROUND", (0, 1), (-1, 1), colors.white),
        ("BOX", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(attendance_table)
    story.append(Spacer(1, 12))

    # 4. Salary Statement (Earnings vs Deductions/Payments)
    story.append(Paragraph("SALARY & FINANCIAL STATEMENT", section_heading))
    story.append(Spacer(1, 4))

    monthly_salary = summary.get("monthly_salary", 0.0)
    daily_rate = summary.get("daily_rate", 0.0)
    earned_salary = summary.get("earned_salary", 0.0)
    extra_work_earned = summary.get("extra_work_earned", 0.0)
    gross_earned = summary.get("gross_earned", earned_salary + extra_work_earned)

    salary_paid = summary.get("paid_this_month", 0.0)
    advances_taken = summary.get("advance_taken", 0.0)
    extra_work_paid = summary.get("extra_work_paid", 0.0)
    total_paid_month = summary.get("total_paid_month", salary_paid + advances_taken + extra_work_paid)
    remaining_payable = summary.get("remaining_payable", gross_earned - total_paid_month)

    # Payment Status Calculation
    if remaining_payable <= 0 and (gross_earned > 0 or total_paid_month > 0):
        status_label = "PAID"
        status_color = EMERALD_DARK
        status_bg = colors.HexColor("#dcfce7")
    elif total_paid_month > 0 and remaining_payable > 0:
        status_label = "PARTIALLY PAID"
        status_color = AMBER_DARK
        status_bg = AMBER_BG
    else:
        status_label = "UNPAID"
        status_color = ROSE_DARK
        status_bg = colors.HexColor("#ffe4e6")

    financial_data = [
        [
            Paragraph("<b>EARNINGS</b>", cell_bold),
            Paragraph("<b>AMOUNT</b>", cell_right_bold),
            Paragraph("<b>PAYMENTS & ADVANCES</b>", cell_bold),
            Paragraph("<b>AMOUNT</b>", cell_right_bold),
        ],
        [
            Paragraph(f"Monthly Base Salary Rate (Rs. {daily_rate:.2f}/day)", cell_normal),
            Paragraph(format_indian_currency(monthly_salary), cell_right),
            Paragraph("Advances Taken", cell_normal),
            Paragraph(format_indian_currency(advances_taken), cell_right),
        ],
        [
            Paragraph(f"Earned Salary ({att_units:.1f} units attendance)", cell_normal),
            Paragraph(format_indian_currency(earned_salary), cell_right),
            Paragraph("Salary Payments Paid", cell_normal),
            Paragraph(format_indian_currency(salary_paid), cell_right),
        ],
        [
            Paragraph("Extra Work Earnings", cell_normal),
            Paragraph(format_indian_currency(extra_work_earned), cell_right),
            Paragraph("Extra Work Payments Paid", cell_normal),
            Paragraph(format_indian_currency(extra_work_paid), cell_right),
        ],
        [
            Paragraph("<b>GROSS EARNINGS</b>", cell_bold),
            Paragraph(f"<b>{format_indian_currency(gross_earned)}</b>", cell_right_bold),
            Paragraph("<b>TOTAL PAID THIS MONTH</b>", cell_bold),
            Paragraph(f"<b>{format_indian_currency(total_paid_month)}</b>", cell_right_bold),
        ],
    ]

    financial_table = Table(financial_data, colWidths=[170, 91.5, 170, 91.5])
    financial_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
        ("BACKGROUND", (0, 4), (-1, 4), colors.HexColor("#f8fafc")),
        ("LINEBELOW", (0, 0), (-1, 0), 1, BORDER_COLOR),
        ("LINEABOVE", (0, 4), (-1, 4), 1, BORDER_COLOR),
        ("BOX", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(financial_table)
    story.append(Spacer(1, 10))

    # 5. Net Payable & Status Banner
    payable_banner_data = [
        [
            Paragraph(
                f"<font size=10><b>PAYMENT STATUS:</b></font> <font color='{status_color.hexval()}'><b>{status_label}</b></font>",
                cell_bold,
            ),
            Paragraph(
                f"<font size=11><b>REMAINING PAYABLE:</b></font> <font size=12 color='{PRIMARY.hexval()}'><b>{format_indian_currency(remaining_payable)}</b></font>",
                cell_right_bold,
            ),
        ]
    ]

    payable_table = Table(payable_banner_data, colWidths=[200, 323])
    payable_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, 0), status_bg),
        ("BACKGROUND", (1, 0), (1, 0), colors.HexColor("#f1f5f9")),
        ("BOX", (0, 0), (-1, -1), 1, PRIMARY),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(payable_table)
    story.append(Spacer(1, 12))

    # 6. Payment Transaction Ledger for the Month (if any payments exist)
    if recent_payments and len(recent_payments) > 0:
        story.append(Paragraph("PAYMENT TRANSACTION LOG", section_heading))
        story.append(Spacer(1, 4))
        
        log_rows = [
            [
                Paragraph("<b>Date</b>", cell_bold),
                Paragraph("<b>Transaction Type</b>", cell_bold),
                Paragraph("<b>Note / Remarks</b>", cell_bold),
                Paragraph("<b>Amount</b>", cell_right_bold),
            ]
        ]
        for p in recent_payments[:8]:
            ptype = p.get("type", "SALARY_PAYMENT")
            type_label = "Advance" if ptype == "ADVANCE" else ("Extra Work" if ptype == "EXTRA_WORK_PAYMENT" else "Salary")
            log_rows.append([
                Paragraph(safe_pdf_text(p.get("date")), cell_normal),
                Paragraph(type_label, cell_normal),
                Paragraph(safe_pdf_text(p.get("note")), cell_normal),
                Paragraph(format_indian_currency(p.get("amount", 0)), cell_right_bold),
            ])

        log_table = Table(log_rows, colWidths=[90, 130, 203, 100])
        log_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
            ("BOX", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ]))
        story.append(log_table)
        story.append(Spacer(1, 10))

    # 7. Authorization & Footer Signature Block
    current_time_str = now_tz().strftime("%d %B %Y, %I:%M %p")
    
    footer_block = KeepTogether([
        HRFlowable(width="100%", thickness=0.5, color=BORDER_COLOR, spaceBefore=8, spaceAfter=8),
        Table([
            [
                Paragraph(f"<b>Generated:</b> {current_time_str} (Asia/Kolkata Business Time)", cell_normal),
                Paragraph("<b>Authorized Signatory / Seal:</b> ____________________", cell_right),
            ]
        ], colWidths=[280, 243]),
        Spacer(1, 10),
        Paragraph("This is a computer-generated salary statement from WorkForce workforce management system.", footer_text),
        Spacer(1, 2),
        Paragraph("Developed by Nishant &middot; GitHub: https://github.com/Nishant20361", footer_text),
    ])
    story.append(footer_block)

    # Build Document
    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()
