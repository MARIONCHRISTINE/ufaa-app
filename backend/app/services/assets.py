"""Unclaimed-asset helpers shared by the officer and admin routes."""

import csv
import io
from typing import AsyncIterator

from ..utils import (
    INVALID_ID_PLACEHOLDERS,
    amount_value,
    clean_amount_str,
    contains,
    fmt_dt,
    is_number,
    normalize_date,
    now,
    split_terms,
    text,
    to_jsonable,
)

SCOPE_FILTERS = {
    "all": {},
    "claimed": {"status": "Claimed"},
    "unclaimed": {"status": "Unclaimed"},
    "letters": {
        "$or": [
            {"letter_generated": "Yes"},
            {"letter_received": "Yes"},
            {"letter_file_path": {"$nin": [None, ""]}},
        ]
    },
}

OWNER_SORT = [("owner_missing", 1), ("owner_sort", 1), ("_id", 1)]

CSV_HEADER = [
    "Record ID", "Owner Name", "ID / Passport No", "Date of Birth", "Account Number",
    "Last Transaction", "Due Amount", "Compilation Date", "Status", "Letter Issued",
    "Issue Date", "Uploaded At",
]


def build_asset_filter(
    scope: str = "all",
    owner_name: str = "",
    id_no: str = "",
    account_no: str = "",
    amount: str = "",
    status: str = "",
    letter: str = "",
    compilation_start: str = "",
    compilation_end: str = "",
) -> dict:
    clauses: list[dict] = []
    base = SCOPE_FILTERS.get(scope, {})
    if base:
        clauses.append(base)

    for field, value in (("owner_name", owner_name), ("id_passport_no", id_no), ("account_number", account_no)):
        terms = split_terms(value)
        if terms:
            clauses.append({"$or": [{field: contains(t)} for t in terms]})

    if amount.strip():
        clauses.append({"due_amount": contains(amount.strip())})
    if status.strip() and scope not in ("claimed", "unclaimed"):
        clauses.append({"status": status.strip()})
    if letter.strip():
        clauses.append({"letter_generated": letter.strip()})

    comp: dict = {}
    if compilation_start.strip():
        comp["$gte"] = compilation_start.strip()
    if compilation_end.strip():
        comp["$lte"] = compilation_end.strip()
    if comp:
        clauses.append({"compilation_date": comp})

    if not clauses:
        return {}
    return clauses[0] if len(clauses) == 1 else {"$and": clauses}


def asset_out(doc: dict) -> dict:
    return to_jsonable({
        "record_id": doc["_id"],
        "owner_name": doc.get("owner_name"),
        "id_passport_no": doc.get("id_passport_no"),
        "date_of_birth": doc.get("date_of_birth"),
        "account_number": doc.get("account_number"),
        "last_transaction": doc.get("last_transaction"),
        "due_amount": doc.get("due_amount"),
        "compilation_date": doc.get("compilation_date"),
        "status": doc.get("status", "Unclaimed"),
        "letter_generated": doc.get("letter_generated", "No"),
        "letter_generated_date": doc.get("letter_generated_date"),
        "letter_received": doc.get("letter_received", "No"),
        "letter_date": doc.get("letter_date"),
        "stamped_file_path": doc.get("stamped_file_path"),
        "has_stamped_copy": bool(doc.get("stamped_file_path")),
        "uploaded_at": doc.get("uploaded_at"),
        "uploaded_by": doc.get("uploaded_by"),
    })


def csv_row(doc: dict) -> list:
    return [
        doc["_id"], doc.get("owner_name"), doc.get("id_passport_no"), doc.get("date_of_birth"),
        doc.get("account_number"), doc.get("last_transaction"), doc.get("due_amount"),
        doc.get("compilation_date"), doc.get("status"), doc.get("letter_generated"),
        fmt_dt(doc.get("letter_generated_date")), fmt_dt(doc.get("uploaded_at")),
    ]


async def stream_csv(cursor, header: list[str], row_fn=csv_row) -> AsyncIterator[str]:
    """Yield a UTF-8 (with BOM, for Excel) CSV in batches so millions of rows never sit in memory."""
    buf = io.StringIO()
    writer = csv.writer(buf)
    buf.write("﻿")
    writer.writerow(header)
    count = 0
    async for doc in cursor:
        writer.writerow(row_fn(doc))
        count += 1
        if count % 2000 == 0:
            yield buf.getvalue()
            buf.seek(0)
            buf.truncate(0)
    yield buf.getvalue()


def new_asset_doc(record_id: int, row: dict, uploaded_at=None, uploaded_by: str | None = None,
                  upload_session_id: int | None = None) -> dict:
    """Build a new asset document from a cleaned spreadsheet row (used when a draft is submitted)."""
    owner = text(row.get("owner_name")) or "Unknown"
    due = clean_amount_str(row.get("due_amount"))
    if not due or not is_number(due):
        due = "0.00"
    return {
        "_id": record_id,
        "owner_name": owner,
        "owner_missing": False,
        "owner_sort": owner.lower(),
        "id_passport_no": text(row.get("id_passport_no")) or None,
        "date_of_birth": text(row.get("date_of_birth")) or None,
        "account_number": text(row.get("account_number")) or "N/A",
        "last_transaction": text(row.get("last_transaction")) or None,
        "due_amount": due,
        "amount": amount_value(due),
        "compilation_date": normalize_date(row.get("compilation_date")) or now().strftime("%Y-%m-%d"),
        "status": "Unclaimed",
        "letter_generated": "No",
        "letter_generated_date": None,
        "letter_received": "No",
        "letter_date": None,
        "letter_file_path": None,
        "stamped_file_path": None,
        "uploaded_at": uploaded_at or now(),
        # Who submitted the record — used to send duplicate-review flags to the right officer.
        "uploaded_by": uploaded_by,
        "upload_session_id": upload_session_id,
    }


def is_valid_id(id_no: str) -> bool:
    return len(id_no) >= 3 and id_no.upper() not in INVALID_ID_PLACEHOLDERS


async def consolidated_records(db, asset: dict) -> list[dict]:
    """The asset plus up to 50 other records sharing the same genuine ID / passport number."""
    records = [asset]
    id_no = text(asset.get("id_passport_no"))
    if id_no and is_valid_id(id_no):
        cursor = db.assets.find({"id_passport_no": id_no, "_id": {"$ne": asset["_id"]}}).limit(50)
        records.extend([d async for d in cursor])
    return records
