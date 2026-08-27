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

from backend.services.timezone import now_tz


def sanitize_filename(name: str) -> str:
    """Sanitizes student and business strings for safe Content-Disposition filenames."""
    clean = re.sub(r"[^a-zA-Z0-9_-]+", "_", name.strip())
    return clean[:50] or "Student"


def safe_pdf_text(value: Any, fallback: str = "-") -> str:
    """Return escaped ASCII text that ReportLab's built-in Helvetica can render."""
    text = str(value or "").strip()
    if not text:
        return fallback
    return escape(text.encode("ascii", "replace").decode("ascii"))


def format_currency(amount: float) -> str:
    try:
        val = float(amount or 0)
    except (ValueError, TypeError):
        val = 0.0
    return f"Rs. {val:,.2f}"


def generate_student_meal_statement_pdf(
    worker: Dict[str, Any],
    business: Optional[Dict[str, Any]],
    month: str,
    calendar_data: Dict[str, Any],
    payments: Optional[List[Dict[str, Any]]] = None,
) -> bytes:
    """
    Generates an authoritative, professional A4 Student Meal Consumption & Attendance Statement PDF.
    Uses compute_student_meal_calendar output as the single source of truth.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=32,
        rightMargin=32,
        topMargin=32,
        bottomMargin=32,
    )

    styles = getSampleStyleSheet()

    # Brand Colors
    PRIMARY = colors.HexColor("#102f2c")      # Deep Mess Forest Teal
    PRIMARY_LIGHT = colors.HexColor("#164e63")# Ocean Teal
    SECONDARY = colors.HexColor("#0f766e")    # Emerald Accent
    AMBER_DARK = colors.HexColor("#b45309")   # Amber Dark
    AMBER_BG = colors.HexColor("#fef3c7")     # Amber Tint
    GREEN_BG = colors.HexColor("#dcfce7")     # Light Emerald
    ROSE_BG = colors.HexColor("#ffe4e6")      # Light Rose
    BG_LIGHT = colors.HexColor("#f8fafc")     # Light Slate Tint
    BORDER_COLOR = colors.HexColor("#cbd5e1") # Slate Border
    TEXT_MAIN = colors.HexColor("#0f172a")    # Slate 900
    TEXT_MUTED = colors.HexColor("#64748b")   # Slate 500

    # Custom Typography Styles
    header_title_style = ParagraphStyle(
        "HeaderTitle",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=17,
        leading=21,
        textColor=PRIMARY,
        spaceAfter=2,
    )
    header_sub_style = ParagraphStyle(
        "HeaderSub",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=12,
        textColor=TEXT_MUTED,
    )
    section_heading = ParagraphStyle(
        "SectionHeading",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=15,
        textColor=PRIMARY,
        spaceBefore=6,
        spaceAfter=4,
    )
    cell_bold = ParagraphStyle(
        "CellBold",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8.5,
        leading=11,
        textColor=TEXT_MAIN,
    )
    cell_normal = ParagraphStyle(
        "CellNormal",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        leading=10.5,
        textColor=TEXT_MAIN,
    )
    cell_muted = ParagraphStyle(
        "CellMuted",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=7.5,
        leading=9.5,
        textColor=TEXT_MUTED,
    )
    cell_right = ParagraphStyle(
        "CellRight",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        leading=10.5,
        alignment=2,
        textColor=TEXT_MAIN,
    )
    cell_right_bold = ParagraphStyle(
        "CellRightBold",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8.5,
        leading=11,
        alignment=2,
        textColor=TEXT_MAIN,
    )
    badge_ate = ParagraphStyle(
        "BadgeAte",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=7.5,
        leading=9.5,
        textColor=colors.HexColor("#065f46"),
    )
    badge_cancelled = ParagraphStyle(
        "BadgeCancelled",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=7.5,
        leading=9.5,
        textColor=colors.HexColor("#991b1b"),
    )
    badge_leave = ParagraphStyle(
        "BadgeLeave",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=7.5,
        leading=9.5,
        textColor=colors.HexColor("#115e59"),
    )
    badge_scheduled = ParagraphStyle(
        "BadgeScheduled",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=7.5,
        leading=9.5,
        textColor=colors.HexColor("#0369a1"),
    )
    footer_text = ParagraphStyle(
        "FooterText",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=7.5,
        leading=10,
        alignment=1,
        textColor=TEXT_MUTED,
    )

    story = []

    # 1. Header Banner
    biz_name = safe_pdf_text((business.get("name") if business else None) or "Ayushman Kitchen & Mess")
    biz_contact = safe_pdf_text((business.get("phone") or business.get("mobile") if business else None) or "")
    biz_address = safe_pdf_text((business.get("address") if business else None) or "")

    try:
        month_dt = datetime.strptime(month, "%Y-%m")
        month_formatted = month_dt.strftime("%B %Y")
    except Exception:
        month_formatted = month

    header_left = [
        Paragraph(f"<b>{biz_name}</b>", header_title_style),
        Paragraph("<b>STUDENT MEAL ATTENDANCE & CONSUMPTION STATEMENT</b>", ParagraphStyle(
            "DocType", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=9.5, leading=13, textColor=AMBER_DARK
        )),
        Paragraph(f"Contact: {biz_contact} | Address: {biz_address}" if biz_contact or biz_address else "Nutritious & Hygienic Student Meal Service", header_sub_style),
    ]

    header_right = [
        Paragraph(f"<b>Month:</b> {month_formatted}", cell_right_bold),
        Paragraph(f"<b>Generated:</b> {now_tz().strftime('%d-%m-%Y %H:%M')}", cell_right),
        Paragraph(f"<b>Status:</b> Official Record", ParagraphStyle(
            "RecStatus", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=8, leading=10, alignment=2, textColor=SECONDARY
        )),
    ]

    header_table = Table([[header_left, header_right]], colWidths=[350, 181])
    header_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(header_table)
    story.append(HRFlowable(width="100%", thickness=1.5, color=PRIMARY, spaceBefore=4, spaceAfter=8))

    # 2. Student Information Table
    student_name = safe_pdf_text(worker.get("name"))
    student_id = safe_pdf_text(worker.get("login_id") or worker.get("id"))
    mobile = safe_pdf_text(worker.get("mobile") or worker.get("phone"))
    room_address = safe_pdf_text(worker.get("delivery_address") or worker.get("room_no") or worker.get("address"))
    meal_plan = safe_pdf_text(worker.get("meal_plan_type", "BOTH"))
    plan_label = "Lunch + Dinner (Both)" if meal_plan == "BOTH" else ("Lunch Only" if meal_plan == "LUNCH_ONLY" else "Dinner Only")
    diet_pref = safe_pdf_text(worker.get("dietary_preference", "VEG"))
    delivery_pref = safe_pdf_text(worker.get("delivery_preference", "DINE_IN"))
    delivery_label = "Room Delivery" if delivery_pref == "DELIVERY" else "Dine-In Mess"

    summary = calendar_data.get("summary", {})
    joining_date = safe_pdf_text(summary.get("lunch_start_date") or summary.get("joining_date") or worker.get("joining_date"))
    expiry_date = safe_pdf_text(summary.get("validity_expiry_date"))
    days_left = summary.get("validity_days_left", 0)

    student_info_data = [
        [
            Paragraph("<b>Student Name:</b>", cell_bold),
            Paragraph(student_name, cell_normal),
            Paragraph("<b>Student ID:</b>", cell_bold),
            Paragraph(student_id, cell_normal),
        ],
        [
            Paragraph("<b>Mobile Number:</b>", cell_bold),
            Paragraph(mobile, cell_normal),
            Paragraph("<b>Room / Address:</b>", cell_bold),
            Paragraph(room_address, cell_normal),
        ],
        [
            Paragraph("<b>Meal Plan:</b>", cell_bold),
            Paragraph(f"<b>{plan_label}</b>", cell_normal),
            Paragraph("<b>Diet / Delivery:</b>", cell_bold),
            Paragraph(f"{diet_pref} | {delivery_label}", cell_normal),
        ],
        [
            Paragraph("<b>Subscription Start:</b>", cell_bold),
            Paragraph(joining_date, cell_normal),
            Paragraph("<b>Plan Validity Expiry:</b>", cell_bold),
            Paragraph(f"{expiry_date} ({days_left} days left)", cell_normal),
        ],
    ]

    student_info_table = Table(student_info_data, colWidths=[110, 155, 110, 156])
    student_info_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), BG_LIGHT),
        ("BOX", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(student_info_table)
    story.append(Spacer(1, 8))

    # 3. Monthly Metrics / Quota Summary Box
    total_quota = summary.get("total_quota", 60)
    meals_eaten = summary.get("total_used", summary.get("present", 0))
    meals_skipped = summary.get("total_skipped", summary.get("absent", 0))
    leaves_count = summary.get("on_leave", 0)
    remaining_meals = summary.get("total_remaining", 0)

    summary_headers = [
        Paragraph("<b>Total Quota</b>", cell_bold),
        Paragraph("<b>Meals Eaten</b>", cell_bold),
        Paragraph("<b>Skipped / Cancelled</b>", cell_bold),
        Paragraph("<b>Leaves Paused</b>", cell_bold),
        Paragraph("<b>Remaining Balance</b>", cell_bold),
    ]
    summary_values = [
        Paragraph(f"<b>{total_quota}</b> Meals", ParagraphStyle("BigQ", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=10, textColor=PRIMARY)),
        Paragraph(f"<b>{meals_eaten}</b> Plates", ParagraphStyle("BigE", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=10, textColor=colors.HexColor("#065f46"))),
        Paragraph(f"<b>{meals_skipped}</b> Off", ParagraphStyle("BigS", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=10, textColor=colors.HexColor("#991b1b"))),
        Paragraph(f"<b>{leaves_count}</b> Days", ParagraphStyle("BigL", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=10, textColor=colors.HexColor("#115e59"))),
        Paragraph(f"<b>{remaining_meals}</b> Left", ParagraphStyle("BigR", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=10, textColor=AMBER_DARK)),
    ]

    metrics_table = Table([summary_headers, summary_values], colWidths=[106, 106, 106, 106, 107])
    metrics_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e2e8f0")),
        ("BACKGROUND", (0, 1), (-1, 1), colors.HexColor("#f8fafc")),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("BOX", (0, 0), (-1, -1), 0.75, PRIMARY),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(metrics_table)
    story.append(Spacer(1, 8))

    # 4. Day-by-Day Meal Log Table
    story.append(Paragraph(f"<b>Daily Meal Attendance & Selection Log ({month_formatted})</b>", section_heading))

    days = calendar_data.get("days", [])
    table_headers = [
        Paragraph("<b>Date</b>", cell_bold),
        Paragraph("<b>Day</b>", cell_bold),
        Paragraph("<b>Lunch Status & Selection</b>", cell_bold),
        Paragraph("<b>Dinner Status & Selection</b>", cell_bold),
        Paragraph("<b>Mode</b>", cell_bold),
    ]

    table_rows = [table_headers]

    for d in days:
        date_str = d.get("date", "")
        try:
            day_dt = datetime.strptime(date_str, "%Y-%m-%d")
            day_name = day_dt.strftime("%a")
            display_date = day_dt.strftime("%d-%b")
        except Exception:
            day_name = "-"
            display_date = date_str

        # Format Lunch
        l_stat = d.get("lunch", "N_A")
        l_choice = d.get("lunch_choice")
        if l_stat == "ATE":
            l_cell = Paragraph(f"<b>[✓ Ate]</b> {safe_pdf_text(l_choice or 'Standard')}", badge_ate)
        elif l_stat == "CANCELLED":
            l_cell = Paragraph("<b>[✕ Skipped/Off]</b>", badge_cancelled)
        elif l_stat == "LEAVE":
            l_cell = Paragraph("<b>[🏖️ On Leave]</b>", badge_leave)
        elif l_stat == "SCHEDULED":
            l_cell = Paragraph(f"<b>[⏳ Scheduled]</b> {safe_pdf_text(l_choice or 'Standard')}", badge_scheduled)
        elif l_stat == "BEFORE_JOIN":
            l_cell = Paragraph("[Pre-Start]", cell_muted)
        else:
            l_cell = Paragraph("—", cell_muted)

        # Format Dinner
        d_stat = d.get("dinner", "N_A")
        d_choice = d.get("dinner_choice")
        if d_stat == "ATE":
            d_cell = Paragraph(f"<b>[✓ Ate]</b> {safe_pdf_text(d_choice or 'Standard')}", badge_ate)
        elif d_stat == "CANCELLED":
            d_cell = Paragraph("<b>[✕ Skipped/Off]</b>", badge_cancelled)
        elif d_stat == "LEAVE":
            d_cell = Paragraph("<b>[🏖️ On Leave]</b>", badge_leave)
        elif d_stat == "SCHEDULED":
            d_cell = Paragraph(f"<b>[⏳ Scheduled]</b> {safe_pdf_text(d_choice or 'Standard')}", badge_scheduled)
        elif d_stat == "BEFORE_JOIN":
            d_cell = Paragraph("[Pre-Start]", cell_muted)
        else:
            d_cell = Paragraph("—", cell_muted)

        # Delivery Mode
        deliv = d.get("lunch_delivery") or d.get("dinner_delivery") or delivery_pref
        deliv_label = "Room" if deliv == "DELIVERY" else "Dine-In"

        table_rows.append([
            Paragraph(f"<b>{display_date}</b>", cell_normal),
            Paragraph(day_name, cell_normal),
            l_cell,
            d_cell,
            Paragraph(deliv_label, cell_normal),
        ])

    log_table = Table(table_rows, colWidths=[55, 45, 195, 195, 41])
    log_style = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
        ("BOX", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ("TOPPADDING", (0, 0), (-1, -1), 2.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]

    # Alternating row highlights
    for r_idx in range(1, len(table_rows)):
        if r_idx % 2 == 0:
            log_style.append(("BACKGROUND", (0, r_idx), (-1, r_idx), colors.HexColor("#fafafa")))

    log_table.setStyle(TableStyle(log_style))
    story.append(log_table)
    story.append(Spacer(1, 8))

    # 5. Recent Fee / Payment Log (if available)
    if payments and len(payments) > 0:
        pay_rows = [
            [
                Paragraph("<b>Date</b>", cell_bold),
                Paragraph("<b>Description / Period</b>", cell_bold),
                Paragraph("<b>Payment Mode</b>", cell_bold),
                Paragraph("<b>Amount Paid</b>", cell_right_bold),
            ]
        ]
        for p in payments[:5]:
            pay_rows.append([
                Paragraph(safe_pdf_text(p.get("date")), cell_normal),
                Paragraph(safe_pdf_text(p.get("note") or p.get("description") or "Monthly Mess Subscription"), cell_normal),
                Paragraph(safe_pdf_text(p.get("payment_method") or "UPI / Cash"), cell_normal),
                Paragraph(f"<b>{format_currency(p.get('amount', 0))}</b>", cell_right_bold),
            ])

        story.append(Paragraph("<b>Recent Subscription & Fee Payments</b>", section_heading))
        pay_table = Table(pay_rows, colWidths=[80, 240, 110, 101])
        pay_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
            ("BOX", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ]))
        story.append(pay_table)
        story.append(Spacer(1, 8))

    # 6. Authorization & Footer
    current_time_str = now_tz().strftime("%d %B %Y, %I:%M %p")
    footer_block = KeepTogether([
        HRFlowable(width="100%", thickness=0.5, color=BORDER_COLOR, spaceBefore=6, spaceAfter=6),
        Table([
            [
                Paragraph(f"<b>Generated On:</b> {current_time_str} (Asia/Kolkata IST)", cell_normal),
                Paragraph("<b>Mess Administration / Seal:</b> ____________________", cell_right),
            ]
        ], colWidths=[280, 251]),
        Spacer(1, 6),
        Paragraph("This is an official computer-generated student meal consumption statement from Ayushman Kitchen Management System.", footer_text),
    ])
    story.append(footer_block)

    # Build PDF
    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()
