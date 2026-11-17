"""Shared helpers: time zone, JSON conversion, text cleaning and search helpers."""

import re
import zlib
from datetime import date, datetime
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import Request

from .config import settings

TZ = ZoneInfo(settings.timezone)
UTC = ZoneInfo("UTC")

# The seven data columns of an unclaimed-asset row, in spreadsheet order.
ROW_FIELDS = [
    "owner_name",
    "id_passport_no",
    "date_of_birth",
    "account_number",
    "last_transaction",
    "due_amount",
    "compilation_date",
]

FIELD_LABELS = {
    "owner_name": "Owner Name",
    "id_passport_no": "ID / Passport No",
    "date_of_birth": "Date of Birth",
    "account_number": "Account Number",
    "last_transaction": "Last Transaction",
    "due_amount": "Due Amount",
    "compilation_date": "Compilation Date",
}

INVALID_ID_PLACEHOLDERS = {
    "N/A", "NA", "NONE", "NIL", "UNKNOWN", "NOT PROVIDED", "NO ID", "NOT AVAILABLE",
    "0", "-", "--", "000000", "123456", "NULL", "INVALID",
}

USER_COLORS = ["#1d4ed8", "#0369a1", "#0f766e", "#4338ca", "#6d28d9", "#9333ea", "#c2410c", "#b45309"]

ASSET_STATUSES = ["Unclaimed", "Letter Generated", "Submitted", "Claimed"]


def now() -> datetime:
    return datetime.now(TZ)


def to_local(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(TZ)


def fmt_dt(value: datetime | None, pattern: str = "%Y-%m-%d %H:%M:%S") -> str:
    local = to_local(value)
    return local.strftime(pattern) if local else ""


def to_jsonable(value: Any) -> Any:
    """Recursively convert datetimes to ISO strings so documents can be returned as JSON."""
    if isinstance(value, datetime):
        return to_local(value).isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: to_jsonable(v) for k, v in value.items()}
    if isinstance(value, list):
        return [to_jsonable(v) for v in value]
    return value


def text(value: Any) -> str:
    return "" if value is None else str(value).strip()


def none_if_blank(value: Any) -> str | None:
    s = text(value)
    return s or None


def split_terms(value: str | None) -> list[str]:
    """Split a search box value on commas, semicolons or newlines."""
    return [t.strip() for t in re.split(r"[\n\r,;]+", value or "") if t.strip()]


def contains(term: str) -> dict:
    """Case-insensitive 'LIKE %term%' match."""
    return {"$regex": re.escape(term), "$options": "i"}


def clean_amount_str(value: Any) -> str:
    return re.sub(r"[^\d.\-]", "", text(value))


def amount_value(value: Any) -> float:
    try:
        return float(clean_amount_str(value))
    except ValueError:
        return 0.0


def is_number(value: str) -> bool:
    try:
        float(value)
        return True
    except ValueError:
        return False


_DATE_FORMATS = [
    "%Y-%m-%d %H:%M:%S", "%Y-%m-%d",
    "%d/%m/%Y %H:%M:%S", "%d/%m/%Y",
    "%d-%m-%Y %H:%M:%S", "%d-%m-%Y",
    "%d-%b-%Y", "%d-%B-%Y",
    "%d/%b/%Y", "%d/%B/%Y",
]


def normalize_date(value: Any) -> str | None:
    """Return YYYY-MM-DD when the value is a recognisable date, otherwise the trimmed original."""
    s = text(value)
    if not s:
        return None
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$", s)
    if m:
        return f"{m[1]}-{m[2]}-{m[3]}"
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return s


def initials(name: str) -> str:
    parts = (name or "").strip().split()
    if len(parts) >= 2:
        return (parts[0][0] + parts[1][0]).upper()
    return (name or "??")[:2].upper()


def user_color(name: str) -> str:
    return USER_COLORS[zlib.crc32((name or "").encode()) % len(USER_COLORS)]


def client_ip(request: Request) -> str:
    return request.client.host if request.client else ""


def page_meta(total: int, page: int, per_page: int) -> dict:
    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": max(1, -(-total // per_page)),
    }


def safe_filename_part(value: str, fallback: str = "Record") -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_\-]", "_", value or "")
    cleaned = re.sub(r"_+", "_", cleaned).strip("_")
    return cleaned or fallback
