"""Admin Data Management: data-quality checks, duplicate-claim audit, quality CSV exports and the
submission password vault."""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..db import get_db, next_id
from ..security import log_activity, require_admin
from ..services.assets import CSV_HEADER, stream_csv
from ..utils import contains, now, page_meta, text, to_jsonable

router = APIRouter(prefix="/api/admin", tags=["admin-data"])

MISSING_FIELDS = ("owner_name", "id_passport_no", "date_of_birth", "account_number")
# The audit has two outcomes. "Not a duplicate" closes the group here (/duplicates/review).
# "Confirmed duplicate" always goes back to the uploader to clean up (/duplicates/flag), so a group
# can never be confirmed without someone being asked to fix it.
CLEARED = "False Duplicate / Cleared"
CONFIRMED_SENT = "Confirmed True Duplicate — Sent to Uploader"
RESOLUTIONS = (CLEARED,)
EMPTY = [None, ""]


def _trim(field: str) -> dict:
    return {"$trim": {"input": {"$ifNull": [f"${field}", ""]}}}


def _first10(field: str) -> dict:
    return {"$substrCP": [_trim(field), 0, 10]}


# account___id___lastTx(10 chars)___compilationDate(10 chars) — same key the PHP portal stored.
GROUP_KEY = {"$concat": [
    _trim("account_number"), "___", _trim("id_passport_no"), "___",
    _first10("last_transaction"), "___", _first10("compilation_date"),
]}

TRUE_DUP_BASE = [
    {"$match": {"account_number": {"$nin": EMPTY}, "id_passport_no": {"$nin": EMPTY}}},
    {"$group": {"_id": GROUP_KEY, "count": {"$sum": 1}, "ids": {"$push": "$_id"}}},
    {"$match": {"count": {"$gt": 1}}},
]

_ID_OR_OWNER = {"$cond": [{"$gt": [{"$strLenCP": _trim("id_passport_no")}, 0]}, _trim("id_passport_no"), "$owner_name"]}

RECYCLED_BASE = [
    {"$match": {"account_number": {"$nin": EMPTY}}},
    {"$group": {"_id": "$account_number", "owners": {"$addToSet": _ID_OR_OWNER}, "ids": {"$push": "$_id"}}},
    {"$match": {"owners.1": {"$exists": True}}},
]

NOTE_LOOKUP = [
    {"$lookup": {"from": "duplicate_notes", "localField": "_id", "foreignField": "group_key", "as": "n"}},
    {"$addFields": {"note": {"$arrayElemAt": ["$n", 0]}}},
    # A review only covers the records that existed when it was made. If more copies are uploaded
    # later, the group counts as unreviewed again so the new duplicates are not hidden.
    {"$addFields": {"covered": {"$and": [
        {"$eq": ["$note.reviewed", True]},
        {"$lte": ["$count", {"$ifNull": ["$note.record_count", 0]}]},
    ]}}},
    # A group sent back to an officer stays "awaiting" (not resolved) while its review file is open.
    {"$lookup": {
        "from": "drafts",
        "let": {"k": "$_id"},
        "pipeline": [
            {"$match": {"$expr": {"$and": [
                {"$eq": ["$group_key", "$$k"]},
                {"$in": ["$status", ["flagged", "active"]]},
            ]}}},
            {"$project": {"created_by": 1}},
        ],
        "as": "open_review",
    }},
    {"$addFields": {
        "awaiting": {"$gt": [{"$size": "$open_review"}, 0]},
        "assigned_to": {"$arrayElemAt": ["$open_review.created_by", 0]},
    }},
]

RECORD_FIELDS = ["owner_name", "id_passport_no", "account_number", "date_of_birth", "last_transaction",
                 "due_amount", "compilation_date", "status"]


def _missing_filter(field: str) -> dict:
    return {field: {"$in": EMPTY}}


async def _count(pipeline: list[dict]) -> int:
    rows = [r async for r in get_db().assets.aggregate(pipeline + [{"$count": "n"}], allowDiskUse=True)]
    return rows[0]["n"] if rows else 0


async def _active_usernames(names) -> set[str]:
    """Which of these usernames still belong to an active account."""
    names = [n for n in set(names) if n]
    if not names:
        return set()
    cursor = get_db().users.find({"username": {"$in": names}, "is_active": True}, {"username": 1})
    return {u["username"] async for u in cursor}


async def quality_counts() -> dict:
    db = get_db()
    counts = {f: await db.assets.count_documents(_missing_filter(f)) for f in MISSING_FIELDS}
    counts["true_duplicates"] = await _count(TRUE_DUP_BASE + NOTE_LOOKUP + [{"$match": {"covered": False}}])
    counts["awaiting_uploader"] = await _count(TRUE_DUP_BASE + NOTE_LOOKUP + [{"$match": {"covered": True, "awaiting": True}}])
    # Review files waiting on an officer who has since been suspended or removed need reassigning.
    assignees = [d["created_by"] async for d in db.drafts.find(
        {"group_key": {"$exists": True}, "status": {"$in": ["flagged", "active"]}}, {"created_by": 1})]
    active = await _active_usernames(assignees)
    counts["awaiting_inactive"] = sum(1 for name in assignees if name not in active)
    counts["recycled_accounts"] = await _count(RECYCLED_BASE)
    counts["total"] = await db.assets.estimated_document_count()
    # Groups still waiting on an officer are not resolved yet, so they count as open issues.
    counts["total_issues"] = sum(counts[f] for f in MISSING_FIELDS) + counts["true_duplicates"] + counts["awaiting_uploader"]
    counts["all_good"] = counts["total_issues"] == 0
    return counts


@router.get("/quality-counts")
async def get_quality_counts(user: dict = Depends(require_admin)):
    return await quality_counts()


@router.get("/missing")
async def missing_records(
    field: str,
    page: int = Query(1, ge=1),
    per_page: int = Query(100, ge=25, le=500),
    user: dict = Depends(require_admin),
):
    if field not in MISSING_FIELDS:
        raise HTTPException(400, "Invalid field")
    db = get_db()
    flt = _missing_filter(field)
    total = await db.assets.count_documents(flt)
    cursor = db.assets.find(flt).sort("_id", 1).skip((page - 1) * per_page).limit(per_page)
    records = [to_jsonable({"record_id": d["_id"], **{f: d.get(f) for f in RECORD_FIELDS},
                            "letter_generated": d.get("letter_generated"), "uploaded_at": d.get("uploaded_at")})
               async for d in cursor]
    return {"records": records, **page_meta(total, page, per_page)}


def _review_filter(flt: str) -> list[dict]:
    if flt == "unreviewed":
        return [{"$match": {"covered": False}}]
    if flt == "awaiting":
        return [{"$match": {"covered": True, "awaiting": True}}]
    if flt == "confirmed":
        return [{"$match": {"covered": True, "awaiting": False, "note.note": "Resolved by uploader"}}]
    if flt == "cleared":
        return [{"$match": {"covered": True, "note.note": {"$regex": "false|cleared", "$options": "i"}}}]
    return []


def _records_stages(search: str) -> list[dict]:
    stages: list[dict] = [
        {"$unwind": "$ids"},
        {"$lookup": {"from": "assets", "localField": "ids", "foreignField": "_id", "as": "r"}},
        {"$unwind": "$r"},
        {"$replaceRoot": {"newRoot": {"$mergeObjects": [
            "$r", {"group_key": "$_id", "group_count": "$count", "covered": "$covered",
                   "awaiting": "$awaiting", "assigned_to": "$assigned_to"}]}}},
    ]
    if search.strip():
        rx = contains(search.strip())
        ors: list[dict] = [{"account_number": rx}, {"id_passport_no": rx}, {"owner_name": rx}]
        if search.strip().isdigit():
            ors.append({"_id": int(search.strip())})
        stages.append({"$match": {"$or": ors}})
    return stages


@router.get("/duplicates")
async def duplicate_groups(
    mode: str = "true_dup",
    page: int = Query(1, ge=1),
    per_page: int = Query(100, ge=25, le=500),
    search: str = "",
    filter: str = "all",
    user: dict = Depends(require_admin),
):
    """Records belonging to duplicate groups.
    true_dup: same account + ID + last transaction + compilation date (needs an audit decision).
    recycled: same account number used by different people (recycled SIM, informational)."""
    db = get_db()
    if mode == "recycled":
        pipeline = RECYCLED_BASE + _records_stages(search)
        sort = {"account_number": 1, "_id": 1}
        group_field = "account_number"
    else:
        mode = "true_dup"
        pipeline = TRUE_DUP_BASE + NOTE_LOOKUP + _review_filter(filter) + _records_stages(search)
        sort = {"account_number": 1, "id_passport_no": 1, "last_transaction": 1, "compilation_date": 1, "_id": 1}
        group_field = "group_key"

    pipeline.append({"$facet": {
        "meta": [{"$group": {"_id": None, "total": {"$sum": 1}, "groups": {"$addToSet": f"${group_field}"}}},
                 {"$project": {"total": 1, "distinct": {"$size": "$groups"}}}],
        "records": [{"$sort": sort}, {"$skip": (page - 1) * per_page}, {"$limit": per_page}],
    }})
    result = [r async for r in db.assets.aggregate(pipeline, allowDiskUse=True)][0]
    meta = result["meta"][0] if result["meta"] else {"total": 0, "distinct": 0}

    records = []
    for d in result["records"]:
        records.append(to_jsonable({"record_id": d["_id"], "group_key": d.get("group_key", d.get("account_number")),
                                    "group_count": d.get("group_count"), "covered": bool(d.get("covered")),
                                    "awaiting": bool(d.get("awaiting")), "assigned_to": d.get("assigned_to"),
                                    "uploaded_by": d.get("uploaded_by"), **{f: d.get(f) for f in RECORD_FIELDS}}))

    active = await _active_usernames(r["assigned_to"] for r in records if r.get("awaiting"))
    for r in records:
        r["assignee_active"] = bool(r.get("assigned_to") in active) if r.get("awaiting") else None

    notes = {}
    if mode == "true_dup":
        keys = list({r["group_key"] for r in records})
        async for n in db.duplicate_notes.find({"group_key": {"$in": keys}}):
            notes[n["group_key"]] = to_jsonable({k: v for k, v in n.items() if k != "_id"})

    return {"mode": mode, "records": records, "notes": notes, "distinct_dups": meta["distinct"],
            **page_meta(meta["total"], page, per_page)}


class GroupIn(BaseModel):
    group_key: str
    resolution: str = ""
    note: str = ""


def _reviewer(user: dict) -> str:
    return user.get("fullname") or user.get("username") or "Admin"


async def group_record_ids(group_key: str) -> list[int]:
    """Ids of every record currently in a duplicate group (same key as the audit list)."""
    parts = group_key.split("___")
    account = text(parts[0] if parts else "")
    id_no = text(parts[1] if len(parts) > 1 else "")
    if not account or not id_no:
        return []
    pipeline = [
        {"$match": {"account_number": account, "id_passport_no": id_no}},
        {"$addFields": {"gk": GROUP_KEY}},
        {"$match": {"gk": group_key}},
        {"$sort": {"_id": 1}},
        {"$project": {"_id": 1}},
    ]
    return [d["_id"] async for d in get_db().assets.aggregate(pipeline)]


async def _ensure_not_reviewed(group_key: str, ids: list[int], message: str) -> None:
    existing = await get_db().duplicate_notes.find_one({"group_key": group_key}, {"reviewed": 1, "record_count": 1})
    if existing and existing.get("reviewed") and existing.get("record_count", 0) >= len(ids):
        raise HTTPException(400, message)


@router.post("/duplicates/review")
async def mark_reviewed(body: GroupIn, request: Request, user: dict = Depends(require_admin)):
    if not body.group_key.strip():
        raise HTTPException(400, "Missing group key")
    resolution = body.resolution or body.note
    if resolution not in RESOLUTIONS:
        raise HTTPException(
            400, "Only 'Not a duplicate' is recorded here. To confirm a duplicate, use "
                 "'Confirm duplicate & send to uploader' so the extra copies get cleaned up.")
    ids = await group_record_ids(body.group_key)
    await _ensure_not_reviewed(body.group_key, ids, "This duplicate claim has already been reviewed and locked")
    by = _reviewer(user)
    await get_db().duplicate_notes.update_one({"group_key": body.group_key}, {"$set": {
        "note": resolution, "noted_by": by, "noted_at": now(),
        "reviewed": True, "reviewed_by": by, "reviewed_at": now(),
        "record_count": len(ids), "record_ids": ids,
    }}, upsert=True)
    await log_activity("duplicate_cleared", f"Group {body.group_key} marked as not a duplicate (cleared)", user=user, request=request)
    return {"resolution": resolution}


class ReassignIn(BaseModel):
    group_key: str
    username: str


@router.post("/duplicates/reassign")
async def reassign_review(body: ReassignIn, request: Request, user: dict = Depends(require_admin)):
    """Move an open duplicate-review file to another officer (e.g. the original uploader has left)."""
    db = get_db()
    draft = await db.drafts.find_one({"group_key": body.group_key, "status": {"$in": ["flagged", "active"]}})
    if not draft:
        raise HTTPException(404, "There is no open review file for this group.")
    target = await db.users.find_one({"username": body.username.strip()})
    if not target or not target.get("is_active", True):
        raise HTTPException(400, "Choose an active user account.")
    if target.get("role") not in ("compliance_officer", "both"):
        raise HTTPException(400, "The review must go to a Compliance Officer account.")
    previous = draft.get("created_by")
    if previous == target["username"]:
        raise HTTPException(400, f"The review is already assigned to {previous}.")

    by = _reviewer(user)
    await db.drafts.update_one({"_id": draft["_id"]}, {"$set": {
        "created_by": target["username"], "status": "flagged", "presence": [], "viewers": [],
        "reassigned_from": previous, "reassigned_by": by, "flagged_at": now(), "updated_at": now(),
    }})
    await log_activity("duplicate_reassigned",
                       f"Duplicate review for group {body.group_key} reassigned from {previous} to {target['username']} by {by}",
                       user=user, request=request)
    return {"assigned_to": target["username"], "previous": previous}


@router.post("/duplicates/note")
async def save_note(body: GroupIn, request: Request, user: dict = Depends(require_admin)):
    if not body.group_key.strip():
        raise HTTPException(400, "Missing group key")
    if not body.note.strip():
        raise HTTPException(400, "Note cannot be empty")
    await get_db().duplicate_notes.update_one({"group_key": body.group_key}, {
        "$set": {"note": body.note.strip(), "noted_by": _reviewer(user), "noted_at": now()},
        "$setOnInsert": {"reviewed": False},
    }, upsert=True)
    await log_activity("Duplicate Note Saved", f"Noted duplicate group: {body.group_key}", user=user, request=request)
    return {"ok": True}


@router.post("/duplicates/flag")
async def flag_for_review(body: GroupIn, request: Request, user: dict = Depends(require_admin)):
    """Send a duplicate group back to the uploading officer as a 'flagged' working draft."""
    db = get_db()
    key = body.group_key.strip()
    if not key:
        raise HTTPException(400, "Missing group key")
    ids = await group_record_ids(key)
    if len(ids) < 2:
        raise HTTPException(400, "This group no longer has duplicate records.")
    await _ensure_not_reviewed(key, ids, "This group has already been flagged for uploader review.")

    parts = key.split("___")
    account = text(parts[0])
    id_no = text(parts[1] if len(parts) > 1 else "")
    fields = ["owner_name", "id_passport_no", "date_of_birth", "account_number", "last_transaction",
              "due_amount", "compilation_date"]
    docs = [d async for d in db.assets.find({"_id": {"$in": ids}}).sort("_id", 1)]

    # Send the review to the officer who uploaded these records (the most recent upload in the group).
    by_recency = sorted(docs, key=lambda d: d.get("uploaded_at") or now(), reverse=True)
    uploader = next((d["uploaded_by"] for d in by_recency if d.get("uploaded_by")), None)
    if not uploader:
        latest = await db.upload_sessions.find_one({}, sort=[("uploaded_at", -1)])
        uploader = (latest or {}).get("uploaded_by") or "Officer"
    by = _reviewer(user)
    reason = (f"Admin flagged {len(ids)} copies of the same claim (Account: {account}, ID: {id_no}). "
              "Keep the correct record and remove the extra copies, then submit to update the database.")

    # Each row remembers the database record it came from (source_id). Submitting the review file
    # then updates or removes those records instead of adding them again.
    rows = [{**{f: text(d.get(f)) for f in fields}, "source_id": d["_id"]} for d in docs]

    # One flagged working file per duplicate group; refresh its rows if the group has grown.
    existing = await db.drafts.find_one({"group_key": key, "status": {"$in": ["active", "flagged"]}})
    draft_fields = {"status": "flagged", "flagged_reason": reason, "flagged_by": by, "flagged_at": now(),
                    "created_by": uploader, "last_edited_by": by, "row_count": len(rows), "next_seq": len(rows),
                    "source_ids": ids, "updated_at": now()}
    if existing:
        draft_id = existing["_id"]
        await db.draft_rows.delete_many({"draft_id": draft_id})
        await db.drafts.update_one({"_id": draft_id}, {"$set": draft_fields})
    else:
        draft_id = await next_id("drafts")
        await db.drafts.insert_one({
            "_id": draft_id, "draft_name": f"Flagged Duplicate Review — Account {account}",
            "group_key": key, "presence": [], "viewers": [], "created_at": now(), **draft_fields,
        })
    await db.draft_rows.insert_many([{"draft_id": draft_id, "seq": i, **r} for i, r in enumerate(rows)])

    await db.duplicate_notes.update_one({"group_key": key}, {"$set": {
        "note": CONFIRMED_SENT, "noted_by": by, "noted_at": now(),
        "reviewed": True, "reviewed_by": by, "reviewed_at": now(),
        "record_count": len(ids), "record_ids": ids,
    }}, upsert=True)
    await log_activity("duplicate_confirmed",
                       f"Group {key} confirmed as a duplicate ({len(ids)} copies) and sent to {uploader} to clean up",
                       user=user, request=request)
    return {"uploader": uploader, "flagged_by": by, "group_key": key, "draft_id": draft_id}


# ── Quality CSV export ──────────────────────────────────────────────────────────

EXPORT_LABELS = {
    "missing_owner": "Missing_Owner_Name",
    "missing_id": "Missing_ID_Passport",
    "missing_dob": "Missing_Date_of_Birth",
    "missing_account": "Missing_Account_Number",
    "true_dup": "Duplicate_Claims",
    "dup_accounts": "Duplicate_Claims",
    "recycled": "Recycled_SIM_Accounts",
}
EXPORT_MISSING = {"missing_owner": "owner_name", "missing_id": "id_passport_no",
                  "missing_dob": "date_of_birth", "missing_account": "account_number"}


@router.get("/export-quality")
async def export_quality(
    request: Request,
    mode: str,
    count_only: bool = False,
    offset: int = Query(0, ge=0),
    limit: int = Query(0, ge=0),
    chunk_num: int = 0,
    total_chunks: int = 0,
    user: dict = Depends(require_admin),
):
    if mode not in EXPORT_LABELS:
        raise HTTPException(400, "Invalid export mode")
    db = get_db()

    if mode in EXPORT_MISSING:
        flt = _missing_filter(EXPORT_MISSING[mode])
    else:
        base = RECYCLED_BASE if mode == "recycled" else TRUE_DUP_BASE
        ids: list[int] = []
        async for g in db.assets.aggregate(base + [{"$project": {"ids": 1}}], allowDiskUse=True):
            ids.extend(g["ids"])
        flt = {"_id": {"$in": ids}}

    if count_only:
        return {"count": await db.assets.count_documents(flt)}

    cursor = db.assets.find(flt).sort([("account_number", 1), ("_id", 1)]).skip(offset)
    if limit:
        cursor = cursor.limit(limit)
    label = EXPORT_LABELS[mode]
    suffix = f"_Part{chunk_num}_of_{total_chunks}" if chunk_num > 0 and total_chunks > 0 else ""
    await log_activity("export", f"Exported '{label}' records" + (f" (chunk {chunk_num}/{total_chunks})" if chunk_num else ""),
                       user=user, request=request)
    return StreamingResponse(
        stream_csv(cursor, CSV_HEADER),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="UFAA_Admin_{label}_{now():%Y%m%d_%H%M%S}{suffix}.csv"'},
    )


# ── Password vault ──────────────────────────────────────────────────────────────

@router.get("/vault")
async def vault(user: dict = Depends(require_admin)):
    cursor = get_db().upload_sessions.find({}, {"protection_password": 0}).sort("_id", -1).limit(100)
    return {"sessions": [to_jsonable({**{k: v for k, v in s.items() if k != "_id"}, "id": s["_id"]}) async for s in cursor]}


@router.post("/vault/{session_id}/reveal")
async def reveal_password(session_id: int, request: Request, user: dict = Depends(require_admin)):
    session = await get_db().upload_sessions.find_one({"_id": session_id})
    if not session:
        raise HTTPException(404, "Upload session record not found.")
    await log_activity(
        "password_vault_view",
        f"Admin '{user['username']}' revealed Excel unprotect password for Upload Session #{session_id} "
        f"('{session.get('file_name')}').",
        user=user, request=request)
    return {"session_id": session_id, "file_name": session.get("file_name"),
            "protection_password": session.get("protection_password") or "N/A"}
