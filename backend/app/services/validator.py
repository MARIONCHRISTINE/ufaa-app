"""Pre-submission validator: required fields, identity anomalies and duplicate detection.

A row is a duplicate when its ID / passport number, account number and last transaction match
another row in the same file ("in-file") or a record already in the database ("database").
"""

import re

from ..utils import INVALID_ID_PLACEHOLDERS, clean_amount_str, fmt_dt, is_number, text

DB_FIELDS = {
    "owner_name": 1, "account_number": 1, "due_amount": 1, "id_passport_no": 1, "date_of_birth": 1,
    "last_transaction": 1, "compilation_date": 1, "uploaded_at": 1,
}


def make_dup_key(id_no, account, last_tx) -> str:
    norm_id = text(id_no).upper()
    norm_acct = re.sub(r"[\s\-_]", "", text(account)).upper()
    norm_tx = re.sub(r"\s+", " ", text(last_tx)).upper()
    if not norm_acct and not norm_id:
        return ""
    return f"{norm_id}|{norm_acct}|{norm_tx}"


def _chunks(items: list, size: int):
    for i in range(0, len(items), size):
        yield items[i:i + size]


async def _db_duplicate_map(db, rows: list[dict], exclude_ids: set | None = None) -> dict[str, dict]:
    exclude_ids = exclude_ids or set()
    accounts: set[str] = set()
    ids_without_account: set[str] = set()
    for r in rows:
        acct = text(r.get("account_number"))
        if acct:
            accounts.add(acct)
        else:
            id_no = text(r.get("id_passport_no"))
            if len(id_no) >= 5 and id_no.upper() not in INVALID_ID_PLACEHOLDERS:
                ids_without_account.add(id_no)

    found: dict[str, dict] = {}
    for field, values in (("account_number", accounts), ("id_passport_no", ids_without_account)):
        for chunk in _chunks(sorted(values), 1500):
            async for d in db.assets.find({field: {"$in": chunk}}, DB_FIELDS):
                if d["_id"] in exclude_ids:
                    continue
                key = make_dup_key(d.get("id_passport_no"), d.get("account_number"), d.get("last_transaction"))
                if key:
                    found[key] = d
    return found


async def validate_rows(db, rows: list[dict], exclude_ids: set | None = None) -> dict:
    """`rows` are dicts with the seven row fields plus `_rid` (the row's stable id)."""
    total = len(rows)
    issues: dict[int, dict] = {}

    def issue(idx: int) -> dict:
        return issues.setdefault(idx, {"errors": {}, "warnings": {}})

    seen_keys: dict[str, int] = {}
    seen_id_dob: dict[str, dict] = {}
    seen_id_name: dict[str, dict] = {}
    duplicate_details: list[dict] = []
    in_file_dups = 0
    db_dups = 0

    db_map = await _db_duplicate_map(db, rows, exclude_ids)

    for index, row in enumerate(rows):
        row_num = index + 1
        errors: dict[str, str] = {}
        warnings: dict[str, str] = {}

        owner = text(row.get("owner_name"))
        id_no = text(row.get("id_passport_no"))
        dob = text(row.get("date_of_birth"))
        account = text(row.get("account_number"))
        last_tx = text(row.get("last_transaction"))
        due = text(row.get("due_amount"))
        compilation = text(row.get("compilation_date"))

        if not owner:
            errors["owner_name"] = "Owner Name is required"
        if not account:
            errors["account_number"] = "Account Number is required"
        if not due:
            errors["due_amount"] = "Due Amount is required"
        else:
            cleaned = clean_amount_str(due)
            if not is_number(cleaned) or float(cleaned) <= 0:
                errors["due_amount"] = "Due Amount must be a positive number"
        if not compilation:
            errors["compilation_date"] = "Compilation Date is required"

        if not id_no:
            errors["id_passport_no"] = "ID / Passport No is required"
        else:
            clean_id = id_no.upper()
            norm_name = owner.lower()
            if clean_id in INVALID_ID_PLACEHOLDERS or len(clean_id) < 5 or re.fullmatch(r"[a-z0-9]{1,4}", clean_id, re.I):
                warnings["id_passport_no"] = f"Suspicious/Invalid ID format ('{id_no}')"

            if dob:
                prev = seen_id_dob.get(clean_id)
                if prev:
                    if prev["dob"] and prev["dob"].lower() != dob.lower():
                        warnings["id_passport_no"] = f"Identity Anomaly: Same ID matches Row #{prev['row_num']} with different DOB"
                        warnings["date_of_birth"] = f"DOB Conflict: ID matches Row #{prev['row_num']} with DOB {prev['dob']}"
                        prev_issue = issue(prev["row_num"] - 1)
                        prev_issue["warnings"]["id_passport_no"] = f"Identity Anomaly: Same ID matches Row #{row_num} with different DOB"
                        prev_issue["warnings"]["date_of_birth"] = f"DOB Conflict: ID matches Row #{row_num} with DOB {dob}"
                else:
                    seen_id_dob[clean_id] = {"dob": dob, "row_num": row_num}

            if norm_name:
                prev = seen_id_name.get(clean_id)
                if prev:
                    if prev["name"] and prev["name"] != norm_name:
                        warnings["id_passport_no"] = f"Identity Anomaly: Same ID matches Row #{prev['row_num']} with different Name"
                        warnings["owner_name"] = f"Name Anomaly: Same ID matches Row #{prev['row_num']} ('{prev['raw']}')"
                        prev_issue = issue(prev["row_num"] - 1)
                        prev_issue["warnings"]["id_passport_no"] = f"Identity Anomaly: Same ID matches Row #{row_num} with different Name"
                        prev_issue["warnings"]["owner_name"] = f"Name Anomaly: Same ID matches Row #{row_num} ('{owner}')"
                else:
                    seen_id_name[clean_id] = {"name": norm_name, "raw": owner, "row_num": row_num}

        if not dob:
            errors["date_of_birth"] = "Date of Birth is required"
        if not last_tx:
            errors["last_transaction"] = "Last Transaction date is required"

        key = make_dup_key(id_no, account, last_tx)
        row_values = {
            "owner_name": owner, "id_passport_no": id_no, "date_of_birth": dob, "account_number": account,
            "last_transaction": last_tx, "due_amount": due, "compilation_date": compilation,
        }

        if key and key in seen_keys:
            dup_row = seen_keys[key]
            errors["account_number"] = f"True In-File Duplicate: ID, Account, and Last Transaction match Row #{dup_row}"
            in_file_dups += 1
            duplicate_details.append({
                "type": "in_file", "row_num": row_num, "rid": row.get("_rid"),
                "matched_with_row": dup_row, "matched_with_rid": rows[dup_row - 1].get("_rid"),
                **row_values,
            })
            issue(dup_row - 1)["errors"]["account_number"] = (
                f"True In-File Duplicate: ID, Account, and Last Transaction match Row #{row_num}")
        elif key:
            seen_keys[key] = row_num

        if key and key in db_map:
            match = db_map[key]
            errors["account_number"] = (
                f"True DB Duplicate: ID, Account, and Last Transaction match Database Record "
                f"#{match['_id']} ({match.get('owner_name') or ''})")
            db_dups += 1
            duplicate_details.append({
                "type": "database", "row_num": row_num, "rid": row.get("_rid"),
                "db_id": match["_id"],
                "db_owner_name": match.get("owner_name"),
                "db_record": {
                    "owner_name": match.get("owner_name"),
                    "id_passport_no": match.get("id_passport_no"),
                    "date_of_birth": match.get("date_of_birth"),
                    "account_number": match.get("account_number"),
                    "last_transaction": match.get("last_transaction"),
                    "due_amount": match.get("due_amount"),
                    "compilation_date": match.get("compilation_date"),
                },
                "created_at": fmt_dt(match.get("uploaded_at")) or "Previously Uploaded",
                **row_values,
            })

        if errors or warnings:
            entry = issue(index)
            entry["errors"].update(errors)
            entry["warnings"].update(warnings)

    critical = sum(1 for v in issues.values() if v["errors"])
    warning_rows = sum(1 for v in issues.values() if v["warnings"])

    return {
        "summary": {
            "total": total,
            "clean": max(0, total - critical),
            "critical": critical,
            "warnings": warning_rows,
            "in_file_duplicates": in_file_dups,
            "db_duplicates": db_dups,
        },
        "duplicate_details": duplicate_details[:1000],
        "row_issues": {str(rows[i].get("_rid")): v for i, v in issues.items()},
    }
