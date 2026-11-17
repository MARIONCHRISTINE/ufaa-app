"""Admin portal: dashboard stats, user management, activity logs and system settings."""

import platform
import re
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from pymongo.errors import DuplicateKeyError

from ..db import DEFAULT_SETTINGS, get_db, next_id
from ..security import ROLES, get_settings_map, hash_password, log_activity, require_admin
from ..utils import TZ, contains, now, page_meta, to_jsonable

router = APIRouter(prefix="/api/admin", tags=["admin"])

ROLE_LABELS = {
    "compliance_admin": "Compliance Admin",
    "compliance_officer": "Compliance Officer",
    "both": "Both (Admin & Officer)",
}


def _name_label(u: dict) -> str:
    return f"{u['username']} ({u['fullname']})" if u.get("fullname") else u["username"]


# ── Dashboard ───────────────────────────────────────────────────────────────────

@router.get("/stats")
async def dashboard_stats(user: dict = Depends(require_admin)):
    db = get_db()
    by_status: dict[str, dict] = {}
    async for row in db.assets.aggregate([
        {"$group": {"_id": "$status", "count": {"$sum": 1}, "amount": {"$sum": {"$ifNull": ["$amount", 0]}}}},
    ]):
        by_status[row["_id"] or ""] = row

    today = now().replace(hour=0, minute=0, second=0, microsecond=0)
    six_months = today - timedelta(days=183)
    uploads = [r async for r in db.upload_sessions.aggregate([
        {"$match": {"uploaded_at": {"$gte": six_months}}},
        {"$group": {"_id": {"$dateToString": {"format": "%Y-%m", "date": "$uploaded_at", "timezone": str(TZ)}},
                    "total": {"$sum": "$record_count"}}},
        {"$sort": {"_id": 1}},
    ])]
    trend = [r async for r in db.activity_logs.aggregate([
        {"$match": {"created_at": {"$gte": today - timedelta(days=13)}}},
        {"$group": {"_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at", "timezone": str(TZ)}},
                    "count": {"$sum": 1}}},
        {"$sort": {"_id": 1}},
    ])]

    return {
        "total": await db.assets.estimated_document_count(),
        "claimed": by_status.get("Claimed", {}).get("amount", 0),
        "unclaimed": by_status.get("Unclaimed", {}).get("amount", 0),
        "claimed_count": by_status.get("Claimed", {}).get("count", 0),
        "unclaimed_count": by_status.get("Unclaimed", {}).get("count", 0),
        "letters": await db.assets.count_documents({"letter_generated": "Yes"}),
        "users": await db.users.count_documents({"is_active": True}),
        "log_count": await db.activity_logs.estimated_document_count(),
        "today_activity": await db.activity_logs.count_documents({"created_at": {"$gte": today}}),
        "uploads": await db.upload_sessions.estimated_document_count(),
        "chart_uploads": {
            "labels": [datetime.strptime(r["_id"], "%Y-%m").strftime("%b %Y") for r in uploads],
            "data": [r["total"] for r in uploads],
        },
        "chart_trend": {
            "labels": [datetime.strptime(r["_id"], "%Y-%m-%d").strftime("%d %b") for r in trend],
            "data": [r["count"] for r in trend],
        },
    }


# ── Users ───────────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    username: str
    fullname: str = ""
    email: str = ""
    password: str
    role: str = "compliance_officer"


class RoleIn(BaseModel):
    role: str


def _user_out(u: dict) -> dict:
    return to_jsonable({
        "id": u["_id"], "username": u["username"], "fullname": u.get("fullname", ""),
        "email": u.get("email", ""), "role": u.get("role"), "is_active": bool(u.get("is_active", True)),
        "created_at": u.get("created_at"), "last_login": u.get("last_login"),
    })


@router.get("/users")
async def list_users(search: str = "", user: dict = Depends(require_admin)):
    flt = {}
    if search.strip():
        rx = contains(search.strip())
        flt = {"$or": [{"username": rx}, {"fullname": rx}, {"email": rx}]}
    cursor = get_db().users.find(flt).sort("created_at", -1)
    return {"users": [_user_out(u) async for u in cursor]}


@router.post("/users")
async def create_user(body: UserCreate, request: Request, user: dict = Depends(require_admin)):
    db = get_db()
    username = body.username.strip()
    if not username or not body.password.strip():
        raise HTTPException(400, "Username and password required")
    role = body.role if body.role in ROLES else "compliance_officer"
    if await db.users.find_one({"username": username}, {"_id": 1}):
        raise HTTPException(400, f"Username '{username}' is already taken. Please choose a unique username.")

    new_id = await next_id("users")
    try:
        await db.users.insert_one({
            "_id": new_id, "username": username, "fullname": body.fullname.strip(), "email": body.email.strip(),
            "password_hash": hash_password(body.password.strip()), "role": role, "is_active": True,
            "failed_login_attempts": 0, "created_at": now(), "last_login": None,
        })
    except DuplicateKeyError:
        raise HTTPException(400, f"Username '{username}' is already taken. Please choose a unique username.")
    label = f"{username} ({body.fullname.strip()})" if body.fullname.strip() else username
    await log_activity("user_created", f"Created new user '{label}' with role '{ROLE_LABELS[role]}'", user=user, request=request)
    return {"id": new_id}


async def _target(user_id: int) -> dict:
    target = await get_db().users.find_one({"_id": user_id})
    if not target:
        raise HTTPException(404, "User not found")
    return target


@router.post("/users/{user_id}/toggle-active")
async def toggle_active(user_id: int, request: Request, user: dict = Depends(require_admin)):
    if user_id == user["id"]:
        raise HTTPException(400, "Cannot deactivate your own account")
    target = await _target(user_id)
    new_status = not bool(target.get("is_active", True))
    await get_db().users.update_one({"_id": user_id}, {"$set": {"is_active": new_status, "failed_login_attempts": 0}})
    if not new_status:
        await get_db().sessions.delete_many({"user.id": user_id})
    await log_activity("user_status_change",
                       f"User '{_name_label(target)}' was {'unsuspended' if new_status else 'suspended'}",
                       user=user, request=request)
    return {"is_active": new_status}


@router.post("/users/{user_id}/role")
async def change_role(user_id: int, body: RoleIn, request: Request, user: dict = Depends(require_admin)):
    if body.role not in ROLES:
        raise HTTPException(400, "Invalid params")
    target = await _target(user_id)
    await get_db().users.update_one({"_id": user_id}, {"$set": {"role": body.role}})
    await log_activity("user_role_change", f"Changed role of user '{_name_label(target)}' to '{ROLE_LABELS[body.role]}'",
                       user=user, request=request)
    return {"ok": True}


@router.delete("/users/{user_id}")
async def delete_user(user_id: int, request: Request, user: dict = Depends(require_admin)):
    if user_id == user["id"]:
        raise HTTPException(400, "Cannot delete this account")
    target = await get_db().users.find_one({"_id": user_id})
    label = _name_label(target) if target else f"ID #{user_id}"
    await get_db().users.delete_one({"_id": user_id})
    await get_db().sessions.delete_many({"user.id": user_id})
    await log_activity("user_deleted", f"Deleted user account '{label}'", user=user, request=request)
    return {"ok": True}


# ── Activity logs ───────────────────────────────────────────────────────────────

def _day_start(value: str) -> datetime | None:
    try:
        return datetime.strptime(value, "%Y-%m-%d").replace(tzinfo=TZ)
    except ValueError:
        return None


@router.get("/logs")
async def get_logs(
    page: int = Query(1, ge=1),
    per_page: int = Query(100, ge=1, le=500),
    search: str = "",
    action_filter: str = "",
    user_filter: str = "",
    date_from: str = "",
    date_to: str = "",
    user: dict = Depends(require_admin),
):
    db = get_db()
    clauses: list[dict] = []
    if search.strip():
        rx = contains(search.strip())
        ors: list[dict] = [{"username": rx}, {"description": rx}, {"ip_address": rx}]
        if search.strip().isdigit():
            ors.append({"record_id": int(search.strip())})
        clauses.append({"$or": ors})
    if action_filter:
        clauses.append({"action": action_filter})
    if user_filter:
        clauses.append({"username": user_filter})
    created: dict = {}
    if (start := _day_start(date_from)):
        created["$gte"] = start
    if (end := _day_start(date_to)):
        created["$lt"] = end + timedelta(days=1)
    if created:
        clauses.append({"created_at": created})
    flt = {"$and": clauses} if clauses else {}

    total = await db.activity_logs.count_documents(flt)
    cursor = db.activity_logs.find(flt).sort("created_at", -1).skip((page - 1) * per_page).limit(per_page)
    logs = [to_jsonable({**{k: v for k, v in d.items() if k != "_id"}, "id": str(d["_id"])}) async for d in cursor]
    actions = sorted(a for a in await db.activity_logs.distinct("action") if a)
    users = sorted(u for u in await db.activity_logs.distinct("username") if u)
    return {"logs": logs, **page_meta(total, page, per_page), "action_list": actions, "user_list": users}


# ── Settings ────────────────────────────────────────────────────────────────────

EDITABLE_SETTINGS = [
    "portal_label", "session_timeout", "max_login_attempts", "maintenance_mode",
    "maintenance_scheduled_at", "maintenance_banner_msg", "maintenance_show_banner",
]


@router.get("/settings")
async def get_settings(user: dict = Depends(require_admin)):
    values = {**DEFAULT_SETTINGS, **await get_settings_map()}
    try:
        mongo_version = (await get_db().command("buildInfo")).get("version", "unknown")
    except Exception:
        mongo_version = "unknown"
    return {
        "settings": values,
        "system": {
            "python_version": platform.python_version(),
            "server_time": now().strftime("%d %b %Y, %H:%M:%S") + " EAT",
            "database": f"MongoDB {mongo_version} via Motor",
        },
    }


@router.put("/settings")
async def save_settings(body: dict, request: Request, user: dict = Depends(require_admin)):
    db = get_db()
    for key in EDITABLE_SETTINGS:
        value = str(body.get(key, "") if body.get(key) is not None else "").strip()
        if key == "session_timeout":
            value = str(max(5, int(value) if re.fullmatch(r"\d+", value) else 120))
        elif key == "max_login_attempts":
            value = str(max(1, int(value) if re.fullmatch(r"\d+", value) else 5))
        elif key == "maintenance_show_banner":
            value = "1" if body.get(key) in (True, "1", 1, "true") else "0"
        elif key == "maintenance_mode" and value not in ("0", "1", "scheduled"):
            value = "0"
        await db.settings.update_one({"_id": key}, {"$set": {"value": value, "updated_at": now()}}, upsert=True)
    await log_activity("settings_saved", f"System settings & maintenance schedule updated by {user['username']}",
                       user=user, request=request)
    return {"message": "Settings saved successfully."}
