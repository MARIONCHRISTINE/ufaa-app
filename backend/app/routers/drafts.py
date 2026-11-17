"""Working drafts (the "Web-Excel" data sanitizer): chunked upload, live collaborative editing,
presence, validation and the final submit-and-lock into the assets collection.

Each draft row is its own document in `draft_rows`, identified by a stable `seq` number that the
browser receives as `_rid`. Edits and deletes target `_rid`, so indexes never shift under other users.
"""

import re
import secrets
import time

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel
from pymongo import ReturnDocument, UpdateOne
from pymongo.errors import BulkWriteError, DuplicateKeyError

from ..config import settings
from ..db import get_db, next_id
from ..security import get_current_user, log_activity
from ..services.assets import new_asset_doc
from .admin_data import group_record_ids
from ..services.excel import write_submission_xlsx
from ..services.validator import validate_rows
from ..utils import ROW_FIELDS, initials, now, text, to_jsonable, user_color

router = APIRouter(prefix="/api", tags=["drafts"])

OPEN_STATUSES = ("active", "flagged")
MAX_ROWS = 500_000
VIEWER_TTL = 15
EDITOR_TTL = 10
SUBMISSION_RE = re.compile(r"^UFAA_Submission_[a-zA-Z0-9_\-.]+\.xlsx$")


def row_out(doc: dict) -> dict:
    out = {"_rid": doc["seq"]}
    for f in ROW_FIELDS:
        out[f] = doc.get(f) or ""
    if doc.get("source_id") is not None:
        out["_src"] = doc["source_id"]  # database record this row came from (flagged review files)
    return out


def clean_row(row: dict) -> dict:
    return {f: text(row.get(f)) for f in ROW_FIELDS}


def _alive(entries: list[dict], ttl: int, me: str) -> list[dict]:
    cutoff = time.time() - ttl
    return [{**e, "is_self": e.get("user") == me} for e in entries or [] if e.get("ts", 0) >= cutoff]


def _closed(draft: dict | None) -> dict:
    return {
        "status": "closed",
        "message": "This working file has been submitted and locked by an officer.",
        "submitted_by": (draft or {}).get("last_edited_by") or "another officer",
    }


def _is_owner(draft: dict, user: dict) -> bool:
    return draft.get("created_by") == user["username"] or user.get("role") == "compliance_admin"


def _summary(draft: dict, user: dict) -> dict:
    me = user["username"]
    presence = [p for p in _alive(draft.get("presence"), EDITOR_TTL, me) if not p["is_self"]]
    return {
        "status": "success",
        "draft_id": draft["_id"],
        "draft_name": draft.get("draft_name"),
        "created_by": draft.get("created_by"),
        "is_owner": _is_owner(draft, user),
        "draft_status": draft.get("status"),
        "flagged_reason": draft.get("flagged_reason") or "",
        "is_review": bool(draft.get("group_key")),
        "last_edited_by": draft.get("last_edited_by"),
        "updated_at": to_jsonable(draft.get("updated_at")),
        "updated_ts": draft["updated_at"].timestamp() if draft.get("updated_at") else 0,
        "total_rows": draft.get("row_count", 0),
        "presence": presence,
        "viewers": _alive(draft.get("viewers"), VIEWER_TTL, me),
        "current_user": me,
    }


def _check_flagged_access(draft: dict, user: dict) -> None:
    if draft.get("status") == "flagged" and not _is_owner(draft, user):
        raise HTTPException(
            403, f"This file was flagged for duplicate review by its uploader ({draft.get('created_by')}). "
                 "Only they can open it.")


async def _open_draft(draft_id: int, user: dict) -> dict:
    draft = await get_db().drafts.find_one({"_id": draft_id})
    if not draft or draft.get("status") not in OPEN_STATUSES:
        raise HTTPException(409, "This working file has been submitted and locked, or no longer exists.")
    _check_flagged_access(draft, user)
    return draft


async def _touch(draft_id: int, user: dict, inc_rows: int = 0) -> float:
    update: dict = {"$set": {"last_edited_by": user["username"], "updated_at": now()}}
    if inc_rows:
        update["$inc"] = {"row_count": inc_rows}
    draft = await get_db().drafts.find_one_and_update(
        {"_id": draft_id}, update, return_document=ReturnDocument.AFTER, projection={"updated_at": 1})
    return draft["updated_at"].timestamp() if draft else 0


async def _load_rows(draft_id: int) -> list[dict]:
    cursor = get_db().draft_rows.find({"draft_id": draft_id}, {"_id": 0, "draft_id": 0}).sort("seq", 1)
    return [row_out(d) async for d in cursor.batch_size(5000)]


# ── List / read ─────────────────────────────────────────────────────────────────

def _draft_card(d: dict) -> dict:
    return {
        "id": d["_id"],
        "draft_name": d.get("draft_name"),
        "created_by": d.get("created_by"),
        "last_edited_by": d.get("last_edited_by"),
        "status": d.get("status"),
        "flagged_reason": d.get("flagged_reason") or "",
        "flagged_by": d.get("flagged_by") or "",
        "flagged_at": to_jsonable(d.get("flagged_at") or d.get("updated_at")),
        "updated_at": to_jsonable(d.get("updated_at")),
        "approx_rows": d.get("row_count", 0),
        "viewer_count": len(_alive(d.get("viewers"), VIEWER_TTL, "")),
        "editor_count": len(_alive(d.get("presence"), EDITOR_TTL, "")),
    }


async def _my_flagged(user: dict) -> list[dict]:
    """Files an admin sent back for duplicate review — visible only to the officer who uploaded them."""
    cursor = get_db().drafts.find({"status": "flagged", "created_by": user["username"]}).sort("updated_at", -1)
    return [_draft_card(d) async for d in cursor]


@router.get("/drafts")
async def list_drafts(user: dict = Depends(get_current_user)):
    """Shared working files (every officer sees these) plus this user's own flagged files."""
    cursor = get_db().drafts.find({"status": "active"}).sort("updated_at", -1).limit(30)
    return {"drafts": [_draft_card(d) async for d in cursor], "flagged": await _my_flagged(user)}


@router.get("/drafts/flagged")
async def my_flagged_drafts(user: dict = Depends(get_current_user)):
    return {"flagged": await _my_flagged(user)}


@router.get("/drafts/{draft_id}")
async def get_draft(draft_id: int, summary_only: bool = False, user: dict = Depends(get_current_user)):
    draft = await get_db().drafts.find_one({"_id": draft_id})
    if not draft or draft.get("status") not in OPEN_STATUSES:
        return _closed(draft)
    _check_flagged_access(draft, user)
    data = _summary(draft, user)
    if not summary_only:
        data["rows"] = await _load_rows(draft_id)
        data["total_rows"] = len(data["rows"])
    return data


@router.get("/drafts/{draft_id}/sync")
async def poll_sync(draft_id: int, user: dict = Depends(get_current_user)):
    draft = await get_db().drafts.find_one({"_id": draft_id}, {"rows": 0})
    if not draft or draft.get("status") not in OPEN_STATUSES:
        return _closed(draft)
    _check_flagged_access(draft, user)
    return _summary(draft, user)


# ── Upload ──────────────────────────────────────────────────────────────────────

class ChunkIn(BaseModel):
    draft_id: int = 0
    draft_name: str = "Working Draft"
    chunk_index: int = 0
    total_chunks: int = 1
    rows: list[dict] = []


@router.post("/drafts/upload-chunk")
async def upload_chunk(body: ChunkIn, request: Request, user: dict = Depends(get_current_user)):
    """Receive one chunk of parsed spreadsheet rows. The first call (draft_id=0) creates the draft."""
    db = get_db()
    me = user["username"]
    draft_id = body.draft_id

    if draft_id == 0:
        if body.chunk_index != 0:
            raise HTTPException(400, "Upload must start with chunk 0.")
        draft_id = await next_id("drafts")
        await db.drafts.insert_one({
            "_id": draft_id,
            "draft_name": body.draft_name.strip() or "Working Draft",
            "created_by": me,
            "last_edited_by": me,
            "status": "uploading",
            "flagged_reason": None,
            "presence": [],
            "viewers": [],
            "row_count": 0,
            "next_seq": 0,
            "created_at": now(),
            "updated_at": now(),
        })
    elif not await db.drafts.find_one({"_id": draft_id, "status": "uploading", "created_by": me}, {"_id": 1}):
        raise HTTPException(404, "Upload session not found. Please upload the file again.")

    rows = [clean_row(r) for r in body.rows]
    if rows:
        before = await db.drafts.find_one_and_update(
            {"_id": draft_id}, {"$inc": {"next_seq": len(rows), "row_count": len(rows)}},
            return_document=ReturnDocument.BEFORE)
        if before["row_count"] + len(rows) > MAX_ROWS:
            await _delete_draft(draft_id)
            raise HTTPException(400, f"The file exceeds the {MAX_ROWS:,} row maximum limit.")
        start = before["next_seq"]
        await db.draft_rows.insert_many(
            [{"draft_id": draft_id, "seq": start + i, **r} for i, r in enumerate(rows)], ordered=False)

    if body.chunk_index >= body.total_chunks - 1:
        draft = await db.drafts.find_one_and_update(
            {"_id": draft_id},
            {"$set": {"status": "active", "last_edited_by": me, "updated_at": now()}},
            return_document=ReturnDocument.AFTER)
        await log_activity("draft_upload", f"Uploaded working file '{draft['draft_name']}' "
                           f"({draft['row_count']:,} rows) to the Data Sanitizer", user=user, request=request)
        return {"status": "success", "draft_id": draft_id, "is_final": True, "total_rows": draft["row_count"]}

    return {"status": "chunk_saved", "draft_id": draft_id, "chunk_index": body.chunk_index, "is_final": False}


# ── Presence ────────────────────────────────────────────────────────────────────

class DraftRef(BaseModel):
    rid: int | None = None
    field: str = ""


@router.post("/drafts/{draft_id}/heartbeat")
async def heartbeat(draft_id: int, user: dict = Depends(get_current_user)):
    db = get_db()
    me = user["username"]
    cutoff = time.time() - VIEWER_TTL
    await db.drafts.update_one({"_id": draft_id},
                               {"$pull": {"viewers": {"$or": [{"user": me}, {"ts": {"$lt": cutoff}}]}}})
    draft = await db.drafts.find_one_and_update(
        {"_id": draft_id},
        {"$push": {"viewers": {"user": me, "initials": initials(me), "color": user_color(me), "ts": time.time()}}},
        return_document=ReturnDocument.AFTER, projection={"viewers": 1})
    if not draft:
        raise HTTPException(404, "Draft not found")
    return {"viewers": _alive(draft.get("viewers"), VIEWER_TTL, me)}


@router.post("/drafts/{draft_id}/presence")
async def update_presence(draft_id: int, body: DraftRef, user: dict = Depends(get_current_user)):
    db = get_db()
    me = user["username"]
    cutoff = time.time() - EDITOR_TTL
    await db.drafts.update_one({"_id": draft_id},
                               {"$pull": {"presence": {"$or": [{"user": me}, {"ts": {"$lt": cutoff}}]}}})
    if body.rid is not None and body.field in ROW_FIELDS:
        await db.drafts.update_one({"_id": draft_id}, {"$push": {"presence": {
            "user": me, "initials": initials(me), "color": user_color(me),
            "rid": body.rid, "field": body.field, "ts": time.time(),
        }}})
    draft = await db.drafts.find_one({"_id": draft_id}, {"presence": 1})
    if not draft:
        raise HTTPException(404, "Draft not found")
    return {"presence": [p for p in _alive(draft.get("presence"), EDITOR_TTL, me) if not p["is_self"]]}


# ── Editing ─────────────────────────────────────────────────────────────────────

class CellChange(BaseModel):
    rid: int
    field: str
    value: str = ""


class CellsIn(BaseModel):
    changes: list[CellChange]


class RidsIn(BaseModel):
    rids: list[int]


class RestoreIn(BaseModel):
    rows: list[dict]


@router.post("/drafts/{draft_id}/cells")
async def patch_cells(draft_id: int, body: CellsIn, user: dict = Depends(get_current_user)):
    await _open_draft(draft_id, user)
    ops = []
    for c in body.changes:
        if c.field not in ROW_FIELDS:
            raise HTTPException(400, f"Unknown field '{c.field}'.")
        ops.append(UpdateOne({"draft_id": draft_id, "seq": c.rid}, {"$set": {c.field: c.value.strip()}}))
    if ops:
        await get_db().draft_rows.bulk_write(ops, ordered=False)
    ts = await _touch(draft_id, user)
    return {"status": "success", "updated_by": user["username"], "updated_ts": ts}


@router.post("/drafts/{draft_id}/rows/delete")
async def delete_rows(draft_id: int, body: RidsIn, user: dict = Depends(get_current_user)):
    await _open_draft(draft_id, user)
    result = await get_db().draft_rows.delete_many({"draft_id": draft_id, "seq": {"$in": body.rids}})
    ts = await _touch(draft_id, user, inc_rows=-result.deleted_count)
    return {"status": "success", "deleted": result.deleted_count, "updated_ts": ts}


@router.post("/drafts/{draft_id}/rows/restore")
async def restore_rows(draft_id: int, body: RestoreIn, user: dict = Depends(get_current_user)):
    """Put previously deleted rows back with their original ids (used by Undo)."""
    await _open_draft(draft_id, user)
    docs = []
    for r in body.rows:
        if "_rid" not in r:
            continue
        doc = {"draft_id": draft_id, "seq": int(r["_rid"]), **clean_row(r)}
        if r.get("_src") is not None:
            doc["source_id"] = int(r["_src"])
        docs.append(doc)
    inserted = 0
    if docs:
        try:
            res = await get_db().draft_rows.insert_many(docs, ordered=False)
            inserted = len(res.inserted_ids)
        except BulkWriteError as exc:
            inserted = exc.details.get("nInserted", 0)
    ts = await _touch(draft_id, user, inc_rows=inserted)
    return {"status": "success", "restored": inserted, "updated_ts": ts}


@router.delete("/drafts/{draft_id}")
async def delete_draft(draft_id: int, request: Request, user: dict = Depends(get_current_user)):
    draft = await get_db().drafts.find_one({"_id": draft_id}, {"draft_name": 1, "status": 1, "created_by": 1})
    if draft:
        _check_flagged_access(draft, user)
    await _delete_draft(draft_id)
    if draft:
        await log_activity("draft_deleted", f"Deleted working file '{draft.get('draft_name')}'", user=user, request=request)
    return {"status": "success"}


async def _delete_draft(draft_id: int) -> None:
    db = get_db()
    await db.drafts.delete_one({"_id": draft_id})
    await db.draft_rows.delete_many({"draft_id": draft_id})


# ── Validation & submission ─────────────────────────────────────────────────────

@router.post("/drafts/{draft_id}/validate")
async def validate_draft(draft_id: int, user: dict = Depends(get_current_user)):
    draft = await _open_draft(draft_id, user)
    rows = await _load_rows(draft_id)
    # In a flagged review file the rows ARE the database records under review, so they must not be
    # reported as duplicates of themselves.
    exclude = set(draft.get("source_ids") or []) | {r["_src"] for r in rows if "_src" in r}
    return {"status": "success", **await validate_rows(get_db(), rows, exclude_ids=exclude)}


@router.post("/drafts/{draft_id}/commit")
async def commit_draft(draft_id: int, request: Request, user: dict = Depends(get_current_user)):
    db = get_db()
    me = user["username"]
    draft = await _open_draft(draft_id, user)
    if not _is_owner(draft, user):
        raise HTTPException(403, f"Only the file owner ({draft.get('created_by')}) is authorized to submit this batch to UFAA.")

    rows = await _load_rows(draft_id)
    if draft.get("group_key"):
        return await _commit_review(draft, rows, user, request)
    if not rows:
        raise HTTPException(400, "No clean rows found for submission.")

    # Lock the draft straight away so nobody can keep editing while records are imported.
    locked = await db.drafts.find_one_and_update(
        {"_id": draft_id, "status": {"$in": list(OPEN_STATUSES)}},
        {"$set": {"status": "submitted", "last_edited_by": me, "updated_at": now()}})
    if not locked:
        raise HTTPException(409, "This working file has already been submitted.")

    code = secrets.token_hex(3).upper()
    password = f"UFAA-AIRTEL-{code}"
    stamp = now()
    file_name = f"UFAA_Submission_{stamp:%Y-%m-%d}_{code}.xlsx"
    count = len(rows)
    first_id = await next_id("assets", count)
    session_id = await next_id("upload_sessions")
    # Records belong to the officer who uploaded the file (the draft owner), even if an admin submits it.
    uploader = draft.get("created_by") or me

    try:
        batch = []
        for i, row in enumerate(rows):
            batch.append(new_asset_doc(first_id + i, row, stamp, uploader, session_id))
            if len(batch) >= 5000:
                await db.assets.insert_many(batch, ordered=False)
                batch = []
        if batch:
            await db.assets.insert_many(batch, ordered=False)

        await db.upload_sessions.insert_one({
            "_id": session_id,
            "uploaded_by": me,
            "file_name": file_name,
            "record_count": count,
            "status": "success",
            "protection_password": password,
            "notes": "Pre-submission sanitized upload via officer portal",
            "uploaded_at": stamp,
        })
        try:
            await db.uploaded_files.insert_one({"file_name": file_name, "uploaded_at": stamp})
        except DuplicateKeyError:
            pass
    except Exception as exc:
        # Roll back: MongoDB standalone servers have no multi-document transactions.
        await db.assets.delete_many({"_id": {"$gte": first_id, "$lt": first_id + count}})
        await db.drafts.update_one({"_id": draft_id}, {"$set": {"status": draft.get("status", "active")}})
        raise HTTPException(500, f"Database import failed: {exc}")

    await log_activity(
        "upload",
        f"Successfully submitted {count} sanitized compliance rows via Pre-Submission Sandbox "
        f"(file '{draft.get('draft_name')}'). Submission file: {file_name}",
        user=user, request=request)

    path = settings.storage_path / "submissions" / file_name
    try:
        await run_in_threadpool(write_submission_xlsx, rows, password, path)
        has_file = True
        message = f"Successfully imported {count} clean compliance records!"
    except Exception as exc:
        has_file = False
        message = f"Database updated with {count} records, but locked Excel generation failed: {exc}"

    return {
        "status": "success",
        "has_file": has_file,
        "message": message,
        "record_count": count,
        "file_name": file_name if has_file else None,
        "session_id": session_id,
    }


REVIEW_FIELDS = ("owner_name", "owner_missing", "owner_sort", "id_passport_no", "date_of_birth", "account_number",
                 "last_transaction", "due_amount", "amount", "compilation_date")


async def _commit_review(draft: dict, rows: list[dict], user: dict, request: Request) -> dict:
    """Submit a flagged duplicate-review file. Rows update the records they came from, and records
    whose rows the officer removed are deleted. Nothing new is inserted, so resolving a review can
    never create more duplicates."""
    db = get_db()
    me = user["username"]
    locked = await db.drafts.find_one_and_update(
        {"_id": draft["_id"], "status": {"$in": list(OPEN_STATUSES)}},
        {"$set": {"status": "submitted", "last_edited_by": me, "updated_at": now()}})
    if not locked:
        raise HTTPException(409, "This working file has already been submitted.")

    source_ids = set(draft.get("source_ids") or []) | {r["_src"] for r in rows if "_src" in r}
    kept: set[int] = set()
    updated = 0
    for r in rows:
        src = r.get("_src")
        if src is None:
            continue
        kept.add(src)
        normalized = new_asset_doc(src, r)
        res = await db.assets.update_one({"_id": src}, {"$set": {k: normalized[k] for k in REVIEW_FIELDS}})
        updated += res.modified_count

    removed, protected = [], []
    for src in sorted(source_ids - kept):
        asset = await db.assets.find_one({"_id": src}, {"status": 1, "letter_generated": 1})
        if not asset:
            continue
        # Never silently delete a record that already has a letter or a claim against it.
        if asset.get("status") == "Unclaimed" and asset.get("letter_generated") != "Yes":
            await db.assets.delete_one({"_id": src})
            removed.append(src)
        else:
            protected.append(src)

    remaining = await group_record_ids(draft["group_key"])
    # The admin confirmed these are copies of one claim, so the uploader should keep exactly one.
    # Copies protected by a letter or claim can't be removed and don't count against that.
    unresolved = len(kept - set(protected)) > 1
    if unresolved:
        note = {"note": f"Uploader kept {len(kept)} copies — needs admin decision", "reviewed": False}
    else:
        note = {"note": "Resolved by uploader", "reviewed": True, "reviewed_by": me, "reviewed_at": now(),
                "record_count": len(remaining), "record_ids": remaining}
    await db.duplicate_notes.update_one({"group_key": draft["group_key"]},
                                        {"$set": {**note, "noted_by": me, "noted_at": now()}}, upsert=True)

    message = f"Duplicate review {'submitted' if unresolved else 'resolved'}: kept {len(kept)} record(s)"
    if updated:
        message += f", updated {updated}"
    if removed:
        message += f", removed {len(removed)} duplicate cop{'y' if len(removed) == 1 else 'ies'} (#{', #'.join(map(str, removed))})"
    if protected:
        message += (f". {len(protected)} record(s) were kept because a letter or claim already exists "
                    f"(#{', #'.join(map(str, protected))})")
    message += "."
    if unresolved:
        message += (" Because more than one copy was kept, the group has gone back to the administrator "
                    "for a decision.")
    await log_activity("duplicate_resolved", f"{draft.get('draft_name')}: {message}", user=user, request=request)
    return {"status": "success", "has_file": False, "message": message, "record_count": len(kept),
            "file_name": None, "session_id": None}


@router.get("/template")
async def download_template(user: dict = Depends(get_current_user)):
    """The standard upload template (CSV with a sample row)."""
    content = (
        "﻿Owner Name,ID/Passport No,Date of Birth,Account Number,Last Transaction Date/Time,Due Amount,Compilation Date\r\n"
        "John Doe,A1234567,15/08/1985,01102938475,23/04/2026 14:30:00,15000.00,30/05/2026\r\n"
    )
    return Response(content, media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": 'attachment; filename="ufaa_upload_template.csv"'})


@router.get("/submissions/{file_name}")
async def download_submission(file_name: str, user: dict = Depends(get_current_user)):
    if not SUBMISSION_RE.match(file_name):
        raise HTTPException(400, "Invalid or missing file name.")
    path = settings.storage_path / "submissions" / file_name
    if not path.is_file():
        raise HTTPException(404, "The requested submission file does not exist on the server.")
    return FileResponse(
        path, filename=file_name,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
