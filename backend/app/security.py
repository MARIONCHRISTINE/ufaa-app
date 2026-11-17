"""Password hashing, login sessions, the current-user dependency and activity logging."""

import secrets
from datetime import timedelta

import bcrypt
from fastapi import Depends, HTTPException, Request

from .db import get_db
from .utils import client_ip, now

ROLES = ("compliance_admin", "compliance_officer", "both")


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    if not password_hash:
        return False
    # Hashes created by PHP's password_hash() start with $2y$, which is the same algorithm as $2b$.
    if password_hash.startswith("$2y$"):
        password_hash = "$2b$" + password_hash[4:]
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:
        return False


async def get_setting(key: str, default: str = "") -> str:
    doc = await get_db().settings.find_one({"_id": key})
    return str(doc["value"]) if doc and doc.get("value") is not None else default


async def get_settings_map() -> dict[str, str]:
    return {d["_id"]: str(d.get("value", "")) async for d in get_db().settings.find({})}


async def log_activity(
    action: str,
    description: str = "",
    record_id: int | None = None,
    user: dict | None = None,
    request: Request | None = None,
    username: str | None = None,
) -> None:
    try:
        await get_db().activity_logs.insert_one({
            "user_id": user.get("id") if user else None,
            "username": username or (user.get("username") if user else "system"),
            "action": action,
            "description": description,
            "record_id": record_id,
            "ip_address": client_ip(request) if request else "",
            "created_at": now(),
        })
    except Exception:  # logging must never break the request
        pass


async def create_session(user: dict, portal_role: str) -> str:
    token = secrets.token_urlsafe(32)
    await get_db().sessions.insert_one({
        "_id": token,
        "user": {
            "id": user["_id"],
            "username": user["username"],
            "fullname": user.get("fullname") or user["username"],
            "email": user.get("email", ""),
            "role": portal_role,
            "db_role": user.get("role", ""),
        },
        "created_at": now(),
        "last_activity": now(),
    })
    return token


def _token_from(request: Request) -> str:
    header = request.headers.get("Authorization", "")
    return header[7:].strip() if header.lower().startswith("bearer ") else ""


async def get_current_user(request: Request) -> dict:
    token = _token_from(request)
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required. Please log in.")

    db = get_db()
    session = await db.sessions.find_one({"_id": token})
    if not session:
        raise HTTPException(status_code=401, detail="Please log in to access the portal.")

    timeout_min = max(1, int(await get_setting("session_timeout", "120") or 120))
    current = now()
    if current - session["last_activity"] > timedelta(minutes=timeout_min):
        await db.sessions.delete_one({"_id": token})
        user = session["user"]
        await log_activity(
            "logout",
            f"User '{user['username']}' logged out automatically due to inactivity ({timeout_min} mins)",
            user=user,
            request=request,
        )
        raise HTTPException(
            status_code=401,
            detail=f"Your session has expired due to {timeout_min} minute(s) of inactivity. Please log in again.",
        )

    # Only write the activity timestamp every 30 seconds to keep polling cheap.
    if current - session["last_activity"] > timedelta(seconds=30):
        await db.sessions.update_one({"_id": token}, {"$set": {"last_activity": current}})

    return {**session["user"], "token": token}


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "compliance_admin":
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    return user
