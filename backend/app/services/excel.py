"""Excel output: the password-protected submission workbook."""

from pathlib import Path

from openpyxl import Workbook

from ..utils import ROW_FIELDS

SUBMISSION_HEADER = [
    "Owner Name",
    "ID/Passport No",
    "Date of Birth",
    "Account Number",
    "Last Transaction Date/Time",
    "Due Amount",
    "Compilation Date",
]


def write_submission_xlsx(rows: list[dict], password: str, path: Path) -> None:
    """Write a single-sheet workbook whose sheet is locked with `password`."""
    wb = Workbook(write_only=True)
    ws = wb.create_sheet("UFAA Submission")
    ws.protection.sheet = True
    ws.protection.password = password
    ws.append(SUBMISSION_HEADER)
    for row in rows:
        ws.append([row.get(f) or "" for f in ROW_FIELDS])
    path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(path)
