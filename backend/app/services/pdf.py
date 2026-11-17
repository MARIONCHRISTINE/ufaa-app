"""PDF builders (ReportLab): the holder confirmation letter and the executive compliance report."""

import io

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

RED = colors.HexColor("#C80000")
NAVY = colors.HexColor("#1E3A5F")
GREY = colors.HexColor("#646464")
LIGHT = colors.HexColor("#F5F5F5")
BORDER = colors.HexColor("#DCDCDC")

_styles = getSampleStyleSheet()
BODY = ParagraphStyle("body", parent=_styles["Normal"], fontName="Helvetica", fontSize=9, leading=12)
BODY_J = ParagraphStyle("bodyj", parent=BODY, alignment=TA_JUSTIFY)
BOLD = ParagraphStyle("bold", parent=BODY, fontName="Helvetica-Bold")
TITLE = ParagraphStyle("title", parent=BODY, fontName="Helvetica-Bold", fontSize=15, leading=19,
                       textColor=RED, alignment=TA_CENTER)
SUBTITLE = ParagraphStyle("subtitle", parent=BODY, textColor=GREY, alignment=TA_CENTER)
SUBJECT = ParagraphStyle("subject", parent=BODY, fontName="Helvetica-Bold", fontSize=10.5, textColor=RED)
H2 = ParagraphStyle("h2", parent=BODY, fontName="Helvetica-Bold", fontSize=11, textColor=NAVY, spaceBefore=8, spaceAfter=4)


def _esc(value) -> str:
    s = "" if value is None else str(value)
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _footer(label: str):
    def draw(canvas, doc):
        canvas.saveState()
        canvas.setStrokeColor(RED)
        canvas.setLineWidth(1)
        canvas.line(20 * mm, A4[1] - 15 * mm, A4[0] - 20 * mm, A4[1] - 15 * mm)
        canvas.setFont("Helvetica-Oblique", 8)
        canvas.setFillColor(colors.HexColor("#787878"))
        canvas.drawCentredString(A4[0] / 2, 14 * mm, label)
        canvas.drawCentredString(A4[0] / 2, 10 * mm, f"Page {doc.page}")
        canvas.restoreState()
    return draw


def build_letter_pdf(ref_no: str, date_str: str, owner_name: str, id_no: str, records: list[dict]) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm,
                            topMargin=20 * mm, bottomMargin=22 * mm,
                            title=f"Holder Confirmation Letter {ref_no}")
    story = [
        Paragraph("HOLDER CONFIRMATION LETTER", TITLE),
        Paragraph("Unclaimed Financial Assets Compliance", SUBTITLE),
        Spacer(1, 6 * mm),
    ]

    meta = Table([[Paragraph(f"<b>REF NO:</b> {_esc(ref_no)}", BODY),
                   Paragraph(f"<b>DATE:</b> {_esc(date_str)}", ParagraphStyle("r", parent=BODY, alignment=2))]],
                 colWidths=[85 * mm, 85 * mm])
    meta.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    story += [meta, Spacer(1, 4 * mm)]

    story += [
        Paragraph("<b>TO:</b>", BODY),
        Paragraph("The Chief Executive Officer / Managing Director", BODY),
        Paragraph("<b>Unclaimed Financial Assets Authority (UFAA)</b>", BODY),
        Paragraph("P.O. Box 28235 - 00200, Nairobi, Kenya", BODY),
        Spacer(1, 5 * mm),
        Paragraph("RE: CLAIMANT ASSET DETAILS CONFIRMATION", SUBJECT),
    ]
    rule = Table([[""]], colWidths=[170 * mm], rowHeights=[1])
    rule.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -1), 0.6, RED)]))
    story += [rule, Spacer(1, 5 * mm)]

    claimant = Table(
        [
            [Paragraph("<b>CLAIMANT INFORMATION</b>", BODY), ""],
            [Paragraph("Owner Name:", BODY), Paragraph(f"<b>{_esc(owner_name)}</b>", BODY)],
            [Paragraph("ID / Passport No:", BODY), Paragraph(f"<b>{_esc(id_no)}</b>", BODY)],
        ],
        colWidths=[45 * mm, 125 * mm],
    )
    claimant.setStyle(TableStyle([
        ("SPAN", (0, 0), (1, 0)),
        ("BACKGROUND", (0, 0), (1, 0), LIGHT),
        ("BOX", (0, 0), (-1, -1), 0.5, BORDER),
        ("LINEBELOW", (0, 0), (1, 0), 0.5, BORDER),
    ]))
    story += [claimant, Spacer(1, 5 * mm)]

    header = ["#", "Account Number", "Last Transaction", "Due Amount", "Compilation Date"]
    data = [header]
    for i, rec in enumerate(records, start=1):
        data.append([
            str(i),
            rec.get("account_number") or "-",
            (rec.get("last_transaction") or "-")[:22],
            rec.get("due_amount") or "-",
            rec.get("compilation_date") or "-",
        ])
    table = Table(data, colWidths=[10 * mm, 50 * mm, 45 * mm, 35 * mm, 30 * mm], repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), RED),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("ALIGN", (3, 0), (3, -1), "RIGHT"),
        ("ALIGN", (4, 0), (4, -1), "CENTER"),
    ]
    for row in range(2, len(data), 2):
        style.append(("BACKGROUND", (0, row), (-1, row), colors.HexColor("#F8F8F8")))
    table.setStyle(TableStyle(style))
    story += [table, Spacer(1, 5 * mm)]

    story.append(Paragraph(
        "This letter confirms that the above unclaimed financial asset(s) are recorded under our "
        "organization's submission files to the Unclaimed Financial Assets Authority.", BODY_J))
    story.append(Spacer(1, 6 * mm))

    signature = [
        Paragraph("<b>AUTHORIZED SIGNATORY:</b>", BODY),
        Spacer(1, 2 * mm),
        Paragraph("Signature: ___________________________", BODY),
        Paragraph("Name: Peter Mwangi", BODY),
        Paragraph("Title: Risk and Compliance Lead", BODY),
        Paragraph("Organization: Airtel Money Kenya Limited", BODY),
        Paragraph(f"Date: {_esc(date_str)}", BODY),
    ]
    stamp = Table([[Paragraph("[ STAMP AREA ]", ParagraphStyle("s", parent=BOLD, textColor=colors.HexColor("#969696"),
                                                             alignment=TA_CENTER))]],
                  colWidths=[80 * mm], rowHeights=[28 * mm])
    stamp.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#B4B4B4")),
                               ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FCFCFC")),
                               ("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
    sig_table = Table([[signature, stamp]], colWidths=[90 * mm, 80 * mm])
    sig_table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
    story.append(KeepTogether(sig_table))

    doc.build(story,
              onFirstPage=_footer("Unclaimed Financial Assets Authority (UFAA) - Official Holder Confirmation Letter"),
              onLaterPages=_footer("Unclaimed Financial Assets Authority (UFAA) - Official Holder Confirmation Letter"))
    return buf.getvalue()


def _money(value: float) -> str:
    return f"KSh {value:,.2f}"


def build_report_pdf(report: dict) -> bytes:
    """`report` holds: report_id, generated_by, generated_at, date_from, date_to, status_totals,
    monthly, total_records, total_value, quality (dict)."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm,
                            topMargin=22 * mm, bottomMargin=22 * mm, title="Executive Compliance Report")
    story = [
        Paragraph("UNCLAIMED FINANCIAL ASSETS AUTHORITY (UFAA)",
                  ParagraphStyle("t1", parent=TITLE, fontSize=14, alignment=0)),
        Paragraph("Airtel Money Kenya — Executive Compliance Report",
                  ParagraphStyle("t2", parent=H2, fontSize=12, spaceBefore=2)),
        Paragraph(
            f"Report ID: <b>{_esc(report['report_id'])}</b> &nbsp;|&nbsp; Generated: <b>{_esc(report['generated_at'])}</b> "
            f"&nbsp;|&nbsp; By: <b>{_esc(report['generated_by'])}</b><br/>"
            f"Period: <b>{_esc(report['date_from'])}</b> to <b>{_esc(report['date_to'])}</b>",
            ParagraphStyle("meta", parent=BODY, textColor=GREY)),
        Spacer(1, 5 * mm),
    ]

    claimed = sum(s["sum_amount"] for s in report["status_totals"] if s["status"] == "Claimed")
    unclaimed = sum(s["sum_amount"] for s in report["status_totals"] if s["status"] == "Unclaimed")
    kpis = Table([
        ["Total Accounts", f"{report['total_records']:,}", "Total Asset Value", _money(report["total_value"])],
        ["Claimed Value", _money(claimed), "Unclaimed Value", _money(unclaimed)],
    ], colWidths=[35 * mm, 50 * mm, 35 * mm, 54 * mm])
    kpis.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("FONTNAME", (1, 0), (1, -1), "Helvetica-Bold"),
        ("FONTNAME", (3, 0), (3, -1), "Helvetica-Bold"),
        ("TEXTCOLOR", (0, 0), (0, -1), GREY),
        ("TEXTCOLOR", (2, 0), (2, -1), GREY),
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F8FAFC")),
        ("BOX", (0, 0), (-1, -1), 0.5, BORDER),
        ("LINEBEFORE", (0, 0), (0, -1), 3, RED),
    ]))
    story += [kpis, Spacer(1, 4 * mm)]

    def table(header, rows, widths, right_cols=()):
        t = Table([header] + rows, colWidths=widths, repeatRows=1)
        style = [
            ("BACKGROUND", (0, 0), (-1, 0), NAVY),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8.5),
            ("GRID", (0, 0), (-1, -1), 0.4, BORDER),
        ]
        for c in right_cols:
            style.append(("ALIGN", (c, 0), (c, -1), "RIGHT"))
        t.setStyle(TableStyle(style))
        return t

    story.append(Paragraph("1. Financial Asset Summary by Claim Status", H2))
    total_value = report["total_value"] or 0
    rows = [[s["status"], f"{s['cnt']:,}", _money(s["sum_amount"]),
             f"{(s['sum_amount'] / total_value * 100) if total_value else 0:.1f}%"] for s in report["status_totals"]]
    rows.append(["TOTAL PORTFOLIO", f"{report['total_records']:,}", _money(total_value), "100%"])
    story.append(table(["Claim Status", "Total Accounts", "Total Money", "% Share"], rows,
                       [55 * mm, 35 * mm, 50 * mm, 34 * mm], right_cols=(1, 2, 3)))

    story.append(Paragraph("2. Monthly Asset Compilation Breakdown", H2))
    mrows = []
    for m in report["monthly"]:
        avg = m["total_amount"] / m["record_count"] if m["record_count"] else 0
        mrows.append([m["month_label"], m["status"], f"{m['record_count']:,}", _money(m["total_amount"]), _money(avg)])
    if not mrows:
        mrows = [["No data for the selected filters", "", "", "", ""]]
    story.append(table(["Month", "Claim Status", "Accounts", "Total Money", "Avg per Account"], mrows,
                       [30 * mm, 35 * mm, 25 * mm, 42 * mm, 42 * mm], right_cols=(2, 3, 4)))

    story.append(Paragraph("3. Data Completeness &amp; Quality Audit", H2))
    q = report["quality"]
    qrows = [
        ["Missing Owner Names", f"{q['missing_owner']:,}", "Action Required" if q["missing_owner"] else "Complete"],
        ["Missing ID / Passport Numbers", f"{q['missing_id']:,}", "Action Required" if q["missing_id"] else "Complete"],
        ["Missing Account Numbers", f"{q['missing_account']:,}", "Action Required" if q["missing_account"] else "Complete"],
        ["Duplicate Account Numbers", f"{q['dup_accounts']:,}", "Action Required" if q["dup_accounts"] else "Complete"],
    ]
    story.append(table(["Parameter", "Affected Records", "Compliance Status"], qrows,
                       [80 * mm, 40 * mm, 54 * mm], right_cols=(1,)))

    story.append(Paragraph("4. Official Sign-Off", H2))
    sign = Table([
        ["Prepared By:", "________________________", "Compliance Officer"],
        ["Reviewed By:", "________________________", "Head of Compliance"],
        ["Approval:", "________________________", "UFAA Official Seal"],
    ], colWidths=[30 * mm, 70 * mm, 74 * mm], rowHeights=[10 * mm] * 3)
    sign.setStyle(TableStyle([("FONTSIZE", (0, 0), (-1, -1), 9), ("VALIGN", (0, 0), (-1, -1), "BOTTOM")]))
    story.append(KeepTogether(sign))

    label = "UFAA & Airtel Kenya — Executive Compliance Report — Confidential"
    doc.build(story, onFirstPage=_footer(label), onLaterPages=_footer(label))
    return buf.getvalue()
