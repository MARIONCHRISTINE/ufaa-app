"""Holder confirmation letters: printable view data, PDF download and the stamped-copies ZIP."""

import os
import tempfile
import zipfile
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, Response
from starlette.background import BackgroundTask

from ..config import settings
from ..db import get_db
from ..security import get_current_user, log_activity
from ..services.assets import build_asset_filter, consolidated_records
from ..services.pdf import build_letter_pdf
from ..utils import now, safe_filename_part, text, to_jsonable

router = APIRouter(prefix="/api/letters", tags=["letters"])


def _letter_meta(asset: dict) -> dict:
    stamp = now()
    return {
        "ref_no": f"UFAA/HL/{stamp:%Y}/{asset['_id']:05d}",
        "date_str": stamp.strftime("%d %B %Y"),
        "owner_name": (text(asset.get("owner_name")) or "NOT PROVIDED").upper(),
        "id_no": text(asset.get("id_passport_no")) or "NOT PROVIDED",
    }


def _record_rows(records: list[dict]) -> list[dict]:
    return [
        {
            "record_id": r["_id"],
            "account_number": r.get("account_number"),
            "last_transaction": r.get("last_transaction"),
            "due_amount": r.get("due_amount"),
            "compilation_date": r.get("compilation_date"),
        }
        for r in records
    ]


async def _load(record_id: int) -> tuple[dict, list[dict]]:
    db = get_db()
    asset = await db.assets.find_one({"_id": record_id})
    if not asset:
        raise HTTPException(404, f"Asset record not found for ID: {record_id}")
    return asset, await consolidated_records(db, asset)


@router.get("/zip")
async def download_letters_zip(
    request: Request,
    owner_name: str = "",
    id_no: str = "",
    account_no: str = "",
    status: str = "",
    compilation_start: str = "",
    compilation_end: str = "",
    user: dict = Depends(get_current_user),
):
    """ZIP of every stamped copy attached to records matching the filters."""
    db = get_db()
    flt = build_asset_filter("all", owner_name, id_no, account_no, "", status, "", compilation_start, compilation_end)
    flt = {"$and": [flt, {"stamped_file_path": {"$nin": [None, ""]}}]} if flt else {"stamped_file_path": {"$nin": [None, ""]}}
    records = [d async for d in db.assets.find(flt, {"owner_name": 1, "stamped_file_path": 1}).sort("_id", -1)]
    if not records:
        raise HTTPException(404, "No letter files found matching the search/filter parameters.")

    await log_activity("export", f"Downloaded batch Holder Letters ZIP archive ({len(records)} records)",
                       user=user, request=request)

    tmp_dir = settings.storage_path / "tmp"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    fd, zip_path = tempfile.mkstemp(suffix=".zip", dir=tmp_dir)
    os.close(fd)

    def build() -> int:
        added = 0
        base = settings.storage_path.resolve()
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for row in records:
                path = (base / row["stamped_file_path"]).resolve()
                if base in path.parents and path.is_file():
                    zf.write(path, f"{safe_filename_part(text(row.get('owner_name')))}_{path.name}")
                    added += 1
        return added

    added = await run_in_threadpool(build)
    if added == 0:
        Path(zip_path).unlink(missing_ok=True)
        raise HTTPException(404, "None of the matching files exist on the server filesystem.")

    return FileResponse(
        zip_path,
        media_type="application/zip",
        filename=f"UFAA_Letters_Export_{now():%Y%m%d_%H%M%S}.zip",
        background=BackgroundTask(lambda: Path(zip_path).unlink(missing_ok=True)),
    )


@router.get("/{record_id}")
async def view_letter(record_id: int, user: dict = Depends(get_current_user)):
    """Data for the printable letter. Opening it marks the letter as generated."""
    db = get_db()
    asset, records = await _load(record_id)
    ids = [r["_id"] for r in records]
    await db.assets.update_many({"_id": {"$in": ids}}, {"$set": {"letter_generated": "Yes"}})
    await db.assets.update_many({"_id": {"$in": ids}, "letter_generated_date": None},
                                {"$set": {"letter_generated_date": now()}})
    await db.assets.update_many({"_id": {"$in": ids}, "status": "Unclaimed"},
                                {"$set": {"status": "Letter Generated"}})
    return to_jsonable({"record_id": record_id, **_letter_meta(asset), "records": _record_rows(records)})


@router.get("/{record_id}/pdf")
async def letter_pdf(record_id: int, request: Request, user: dict = Depends(get_current_user)):
    db = get_db()
    asset, records = await _load(record_id)
    meta = _letter_meta(asset)
    pdf = await run_in_threadpool(build_letter_pdf, meta["ref_no"], meta["date_str"], meta["owner_name"],
                                  meta["id_no"], _record_rows(records))

    ids = [r["_id"] for r in records]
    await db.assets.update_many({"_id": {"$in": ids}}, {"$set": {"letter_generated": "Yes", "status": "Claimed"}})
    await db.assets.update_many({"_id": {"$in": ids}, "letter_generated_date": None},
                                {"$set": {"letter_generated_date": now()}})

    owner = text(asset.get("owner_name"))
    await log_activity("letter_generated",
                       f"Downloaded Holder Letter PDF for Record #{record_id}" + (f" ({owner})" if owner else ""),
                       record_id=record_id, user=user, request=request)

    name = f"Holder_Letter_{record_id}_{safe_filename_part(owner or 'Asset')}.pdf"
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})
