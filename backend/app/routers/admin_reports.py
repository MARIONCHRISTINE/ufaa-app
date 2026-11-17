"""Admin Reports: multi-year summaries, raw CSV export, executive CSV and executive PDF."""

import csv
import io
import secrets
from datetime import datetime

from fastapi import APIRouter, Depends, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response, StreamingResponse

from ..db import get_db
from ..security import log_activity, require_admin
from ..services.assets import stream_csv
from ..services.pdf import build_report_pdf
from ..utils import fmt_dt, now

router = APIRouter(prefix="/api/admin/reports", tags=["admin-reports"])

DATE_RX = {"$regex": r"^\d{4}-\d{2}-\d{2}"}
EMPTY = [None, ""]


async def _bounds() -> tuple[str, list[str]]:
    db = get_db()
    first = await db.assets.find_one({"compilation_date": DATE_RX}, {"compilation_date": 1},
                                     sort=[("compilation_date", 1)])
    min_date = (first or {}).get("compilation_date", "2015-01-01")[:10]
    years = [r["_id"] async for r in db.assets.aggregate([
        {"$match": {"compilation_date": DATE_RX}},
        {"$group": {"_id": {"$substrCP": ["$compilation_date", 0, 4]}}},
        {"$sort": {"_id": -1}},
    ])]
    return min_date, years


async def _params(year: str, date_from: str, date_to: str) -> tuple[str, str, str, list[str]]:
    min_date, years = await _bounds()
    if year and not date_from:
        date_from = f"{year}-01-01"
    if year and not date_to:
        date_to = f"{year}-12-31"
    return date_from or min_date, date_to or now().strftime("%Y-%m-%d"), min_date, years


def _filter(date_from: str, date_to: str, status: str, letter: str) -> dict:
    # Compare on the first 10 characters so values with a time part still match the range.
    flt: dict = {"compilation_date": {"$gte": date_from, "$lte": date_to + "￿"}}
    if status:
        flt["status"] = status
    if letter:
        flt["letter_generated"] = letter
    return flt


async def _aggregates(flt: dict) -> tuple[list[dict], list[dict]]:
    db = get_db()
    status_totals = [
        {"status": r["_id"] or "Unknown", "cnt": r["cnt"], "sum_amount": r["sum"]}
        async for r in db.assets.aggregate([
            {"$match": flt},
            {"$group": {"_id": "$status", "cnt": {"$sum": 1}, "sum": {"$sum": {"$ifNull": ["$amount", 0]}}}},
            {"$sort": {"_id": 1}},
        ], allowDiskUse=True)
    ]
    monthly = []
    async for r in db.assets.aggregate([
        {"$match": flt},
        {"$group": {"_id": {"month": {"$substrCP": ["$compilation_date", 0, 7]}, "status": "$status"},
                    "count": {"$sum": 1}, "total": {"$sum": {"$ifNull": ["$amount", 0]}}}},
        {"$sort": {"_id.month": 1, "_id.status": 1}},
    ], allowDiskUse=True):
        key = r["_id"]["month"]
        try:
            label = datetime.strptime(key, "%Y-%m").strftime("%b %Y")
        except ValueError:
            label = key
        monthly.append({"month_key": key, "month_label": label, "status": r["_id"]["status"] or "Unknown",
                        "record_count": r["count"], "total_amount": r["total"]})
    return status_totals, monthly


async def _quality() -> dict:
    db = get_db()
    dup = [r async for r in db.assets.aggregate([
        {"$match": {"account_number": {"$nin": EMPTY}}},
        {"$group": {"_id": "$account_number", "c": {"$sum": 1}}},
        {"$match": {"c": {"$gt": 1}}},
        {"$count": "n"},
    ], allowDiskUse=True)]
    return {
        "missing_owner": await db.assets.count_documents({"owner_name": {"$in": EMPTY}}),
        "missing_id": await db.assets.count_documents({"id_passport_no": {"$in": EMPTY}}),
        "missing_account": await db.assets.count_documents({"account_number": {"$in": EMPTY}}),
        "dup_accounts": dup[0]["n"] if dup else 0,
    }


@router.get("")
async def report_data(year: str = "", date_from: str = "", date_to: str = "", status: str = "", letter: str = "",
                      user: dict = Depends(require_admin)):
    date_from, date_to, min_date, years = await _params(year, date_from, date_to)
    status_totals, monthly = await _aggregates(_filter(date_from, date_to, status, letter))
    return {
        "date_from": date_from, "date_to": date_to, "min_date": min_date, "available_years": years,
        "status_totals": status_totals, "monthly": monthly,
        "total_records": sum(s["cnt"] for s in status_totals),
        "total_value": sum(s["sum_amount"] for s in status_totals),
    }


@router.get("/raw-csv")
async def raw_csv(request: Request, year: str = "", date_from: str = "", date_to: str = "", status: str = "",
                  letter: str = "", user: dict = Depends(require_admin)):
    date_from, date_to, _, _ = await _params(year, date_from, date_to)
    cursor = get_db().assets.find(_filter(date_from, date_to, status, letter)).sort("compilation_date", -1)
    header = ["Record ID", "Owner Name", "ID / Passport No", "Date of Birth", "Account Number",
              "Last Transaction Date", "Due Amount (KSh)", "Compilation Date", "Claim Status",
              "Letter Issued", "Issue Date", "Uploaded At"]

    def row(d):
        return [d["_id"], d.get("owner_name"), d.get("id_passport_no"), d.get("date_of_birth"),
                d.get("account_number"), d.get("last_transaction"), d.get("due_amount"), d.get("compilation_date"),
                d.get("status"), d.get("letter_generated"), fmt_dt(d.get("letter_generated_date")),
                fmt_dt(d.get("uploaded_at"))]

    await log_activity("report_export", f"Exported Raw CSV Data ({date_from} to {date_to})", user=user, request=request)
    return StreamingResponse(stream_csv(cursor, header, row), media_type="text/csv; charset=utf-8",
                             headers={"Content-Disposition": f'attachment; filename="UFAA_Raw_Data_Export_{now():%Y%m%d_%H%M%S}.csv"'})


@router.get("/summary-csv")
async def summary_csv(request: Request, year: str = "", date_from: str = "", date_to: str = "", status: str = "",
                      letter: str = "", user: dict = Depends(require_admin)):
    date_from, date_to, _, _ = await _params(year, date_from, date_to)
    status_totals, monthly = await _aggregates(_filter(date_from, date_to, status, letter))
    q = await _quality()

    buf = io.StringIO()
    buf.write("﻿")
    w = csv.writer(buf)
    w.writerow(["UNCLAIMED FINANCIAL ASSETS AUTHORITY (UFAA) — AIRTEL COMPLIANCE REPORT"])
    w.writerow(["Report Date", now().strftime("%d %b %Y, %H:%M") + " EAT"])
    w.writerow(["Date Period", f"{date_from} to {date_to}"])
    w.writerow(["Generated By", user["username"]])
    w.writerow([])
    w.writerow(["1. FINANCIAL ASSET SUMMARY BY CLAIM STATUS"])
    w.writerow(["Claim Status", "Total Accounts", "Total Money (KSh)"])
    for s in status_totals:
        w.writerow([s["status"], s["cnt"], f"{s['sum_amount']:,.2f}"])
    w.writerow(["TOTAL PORTFOLIO", sum(s["cnt"] for s in status_totals),
                f"{sum(s['sum_amount'] for s in status_totals):,.2f}"])
    w.writerow([])
    w.writerow(["2. MONTHLY ASSET COMPILATION BREAKDOWN"])
    w.writerow(["Month & Year", "Claim Status", "Account Count", "Total Money (KSh)", "Avg Account Value (KSh)"])
    for m in monthly:
        avg = m["total_amount"] / m["record_count"] if m["record_count"] else 0
        w.writerow([m["month_label"], m["status"], m["record_count"], f"{m['total_amount']:,.2f}", f"{avg:,.2f}"])
    w.writerow([])
    w.writerow(["3. DATA COMPLETENESS & QUALITY AUDIT"])
    w.writerow(["Parameter", "Affected Records", "Compliance Status"])
    for label, key in (("Missing Owner Names", "missing_owner"), ("Missing ID / Passport Numbers", "missing_id"),
                       ("Missing Account Numbers", "missing_account"), ("Duplicate Account Numbers", "dup_accounts")):
        w.writerow([label, q[key], "Action Required" if q[key] else "Complete"])
    w.writerow([])
    w.writerow(["4. OFFICIAL SIGN-OFF"])
    w.writerow(["Prepared By:", "Compliance Officer"])
    w.writerow(["Reviewed By:", "Head of Compliance"])
    w.writerow(["Approval:", "UFAA Official Seal"])

    await log_activity("report_export", f"Exported Executive Excel Summary Report ({date_from} to {date_to})",
                       user=user, request=request)
    return Response(buf.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="UFAA_Executive_Compliance_Report_{now():%Y%m%d_%H%M%S}.csv"'})


@router.get("/pdf")
async def report_pdf(request: Request, year: str = "", date_from: str = "", date_to: str = "", status: str = "",
                     letter: str = "", user: dict = Depends(require_admin)):
    date_from, date_to, _, _ = await _params(year, date_from, date_to)
    status_totals, monthly = await _aggregates(_filter(date_from, date_to, status, letter))
    report = {
        "report_id": f"RPT-{now():%Y%m%d-%H%M%S}-U{user['id']:02d}{secrets.token_hex(2).upper()}",
        "generated_by": user.get("fullname") or user["username"],
        "generated_at": now().strftime("%d %b %Y, %H:%M") + " EAT",
        "date_from": date_from, "date_to": date_to,
        "status_totals": status_totals, "monthly": monthly,
        "total_records": sum(s["cnt"] for s in status_totals),
        "total_value": sum(s["sum_amount"] for s in status_totals),
        "quality": await _quality(),
    }
    pdf = await run_in_threadpool(build_report_pdf, report)
    await log_activity("report_export", f"Downloaded Executive PDF Report ({date_from} to {date_to})", user=user, request=request)
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="UFAA_Executive_Report_{now():%Y%m%d_%H%M%S}.pdf"'})
