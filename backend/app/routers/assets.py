"""Officer portal: asset records, dashboard stats, status updates, CSV export and stamped copies."""

from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from ..config import settings
from ..db import get_db
from ..security import get_current_user, log_activity
from ..services.assets import (
    CSV_HEADER,
    OWNER_SORT,
    asset_out,
    build_asset_filter,
    stream_csv,
)
from ..utils import ASSET_STATUSES, now, page_meta

router = APIRouter(prefix="/api/assets", tags=["assets"])

PER_PAGE = 100
STAMPED_EXTS = {"pdf", "jpg", "jpeg", "png", "doc", "docx"}


def asset_filters(
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
    if scope not in ("all", "claimed", "unclaimed", "letters"):
        raise HTTPException(400, "Invalid scope.")
    return build_asset_filter(scope, owner_name, id_no, account_no, amount, status, letter,
                              compilation_start, compilation_end)


@router.get("/stats")
async def stats(user: dict = Depends(get_current_user)):
    db = get_db()
    totals = {"Unclaimed": 0.0, "Claimed": 0.0}
    async for row in db.assets.aggregate([
        {"$match": {"status": {"$in": ["Unclaimed", "Claimed"]}}},
        {"$group": {"_id": "$status", "sum": {"$sum": {"$ifNull": ["$amount", 0]}}}},
    ]):
        totals[row["_id"]] = row["sum"]
    return {
        "total": await db.assets.estimated_document_count(),
        "unclaimed_amount": totals["Unclaimed"],
        "claimed_amount": totals["Claimed"],
        "letters": await db.assets.count_documents({"$or": [{"letter_generated": "Yes"}, {"letter_received": "Yes"}]}),
    }


@router.get("")
async def list_assets(
    page: int = Query(1, ge=1),
    flt: dict = Depends(asset_filters),
    user: dict = Depends(get_current_user),
):
    db = get_db()
    total = await db.assets.count_documents(flt)
    cursor = (
        db.assets.find(flt)
        .sort(OWNER_SORT)
        .skip((page - 1) * PER_PAGE)
        .limit(PER_PAGE)
    )
    records = [asset_out(d) async for d in cursor]
    return {"records": records, **page_meta(total, page, PER_PAGE)}


class UpdateIn(BaseModel):
    field: str
    value: str | None = None


FRIENDLY = {
    "status": "Claiming status",
    "letter_generated": "Letter Generated status",
    "letter_received": "Letter Received status",
    "letter_date": "Letter date detail",
}


@router.patch("/{record_id}")
async def update_record(record_id: int, body: UpdateIn, request: Request, user: dict = Depends(get_current_user)):
    db = get_db()
    field, value = body.field, body.value
    if field not in FRIENDLY:
        raise HTTPException(400, "Unauthorized field modification request.")

    if field == "status":
        if value not in ASSET_STATUSES:
            raise HTTPException(400, "Invalid claim status value.")
    elif field in ("letter_generated", "letter_received"):
        if value not in ("Yes", "No"):
            raise HTTPException(400, "Invalid status value.")
    else:
        value = (value or "").strip() or None

    existing = await db.assets.find_one({"_id": record_id}, {"owner_name": 1, "status": 1})
    if not existing:
        raise HTTPException(404, "Asset record not found.")
    old_status = existing.get("status", "")
    owner = existing.get("owner_name") or ""

    if field == "status" and old_status == "Claimed":
        raise HTTPException(403, "This record has been marked as Claimed and is permanently locked. Status cannot be changed.")
    if field == "status" and value == "Claimed" and old_status == "Unclaimed":
        raise HTTPException(403, "Please issue holder letter first to mark claimed.")

    update = {field: value}
    await db.assets.update_one({"_id": record_id}, {"$set": update})
    if field == "letter_generated" and value == "Yes":
        await db.assets.update_one({"_id": record_id, "letter_generated_date": None}, {"$set": {"letter_generated_date": now()}})

    display = "Cleared" if value is None else value
    desc = f"Changed {FRIENDLY[field]} to '{display}'"
    if field == "status" and old_status:
        desc += f" (was '{old_status}')"
    desc += f" for Record #{record_id}" + (f" ({owner})" if owner else "")
    await log_activity("status_change" if field == "status" else "record_edit", desc,
                       record_id=record_id, user=user, request=request)

    return {"message": f"{FRIENDLY[field]} updated successfully to: {display}", "value": value}


@router.get("/export")
async def export_assets(
    request: Request,
    count_only: bool = False,
    offset: int = Query(0, ge=0),
    limit: int = Query(0, ge=0),
    chunk_num: int = 0,
    total_chunks: int = 0,
    flt: dict = Depends(asset_filters),
    status: str = "",
    user: dict = Depends(get_current_user),
):
    db = get_db()
    if count_only:
        return {"count": await db.assets.count_documents(flt)}

    count_kwargs = {"skip": offset}
    if limit:
        count_kwargs["limit"] = limit
    rows = await db.assets.count_documents(flt, **count_kwargs)
    status_desc = f" [Status: {status}]" if status else ""
    await log_activity("export", f"Exported {rows} asset records to CSV/Excel report{status_desc}", user=user, request=request)

    cursor = db.assets.find(flt).sort(OWNER_SORT).skip(offset)
    if limit:
        cursor = cursor.limit(limit)
    suffix = f"_Part{chunk_num}_of_{total_chunks}" if chunk_num > 0 and total_chunks > 0 else ""
    filename = f"UFAA_Compliance_Export_{now():%Y%m%d_%H%M%S}{suffix}.csv"
    return StreamingResponse(
        stream_csv(cursor, CSV_HEADER),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/{record_id}/stamped")
async def upload_stamped(
    record_id: int,
    request: Request,
    letter_file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    db = get_db()
    if not await db.assets.find_one({"_id": record_id}, {"_id": 1}):
        raise HTTPException(404, "Asset record not found.")

    original = letter_file.filename or "file"
    ext = Path(original).suffix.lower().lstrip(".")
    if ext not in STAMPED_EXTS:
        raise HTTPException(400, "Invalid file type. Only PDF, Images, and Word docs allowed.")

    stamp = now()
    rel_dir = Path("stamped") / f"{stamp:%Y}" / f"{stamp:%m}"
    abs_dir = settings.storage_path / rel_dir
    abs_dir.mkdir(parents=True, exist_ok=True)
    new_name = f"stamped_{record_id}_{int(stamp.timestamp())}.{ext}"
    dest = abs_dir / new_name

    with dest.open("wb") as out:
        while chunk := await letter_file.read(1024 * 1024):
            out.write(chunk)

    rel_path = (rel_dir / new_name).as_posix()
    try:
        await db.assets.update_one({"_id": record_id}, {"$set": {"stamped_file_path": rel_path}})
    except Exception as exc:
        dest.unlink(missing_ok=True)
        raise HTTPException(500, f"Database error: {exc}")

    await log_activity("patch_upload", f"Uploaded stamped letter file '{original}' for Record #{record_id}",
                       record_id=record_id, user=user, request=request)
    return {"message": "Letter uploaded successfully!", "stamped_file_path": rel_path}


def resolve_storage_file(rel_path: str) -> Path:
    base = settings.storage_path.resolve()
    target = (base / rel_path).resolve()
    if base not in target.parents or not target.is_file():
        raise HTTPException(404, "The attached file could not be found on the server.")
    return target


@router.get("/{record_id}/stamped")
async def get_stamped(record_id: int, user: dict = Depends(get_current_user)):
    doc = await get_db().assets.find_one({"_id": record_id}, {"stamped_file_path": 1})
    if not doc or not doc.get("stamped_file_path"):
        raise HTTPException(404, "No stamped copy has been attached to this record.")
    path = resolve_storage_file(doc["stamped_file_path"])
    return FileResponse(path, filename=path.name, content_disposition_type="inline")
