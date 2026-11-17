"""Login, registration, logout and the public portal settings."""

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from pymongo.errors import DuplicateKeyError

from ..db import get_db, next_id
from ..security import (
    create_session,
    get_current_user,
    get_setting,
    get_settings_map,
    hash_password,
    log_activity,
    verify_password,
)
from ..utils import now

router = APIRouter(prefix="/api", tags=["auth"])


class LoginIn(BaseModel):
    username: str
    password: str
    role: str = "compliance_officer"


class RegisterIn(BaseModel):
    fullname: str
    username: str
    email: str
    password: str
    confirm_password: str
    role: str = "compliance_officer"
    terms: bool = False


@router.post("/auth/login")
async def login(body: LoginIn, request: Request):
    db = get_db()
    username = body.username.strip()
    if not username or not body.password:
        raise HTTPException(400, "Please enter your username/email and password.")

    user = await db.users.find_one({"$or": [{"username": username}, {"email": username}]})
    max_attempts = max(1, int(await get_setting("max_login_attempts", "5") or 5))

    if not user:
        await log_activity("login_failed", f"Failed login attempt for '{username}': User not found", request=request)
        raise HTTPException(400, "Invalid credentials. User not found.")

    uname = user["username"]
    if not user.get("is_active", True):
        await log_activity(
            "login_failed", f"Failed login attempt for '{uname}': Account is locked/deactivated",
            record_id=user["_id"], request=request,
        )
        raise HTTPException(403, "Your account has been locked or deactivated. Please contact an Administrator to reactivate.")

    if not verify_password(body.password, user.get("password_hash", "")):
        failed = int(user.get("failed_login_attempts", 0)) + 1
        if failed >= max_attempts:
            await db.users.update_one({"_id": user["_id"]}, {"$set": {"is_active": False, "failed_login_attempts": failed}})
            await log_activity(
                "user_status_change",
                f"Account for '{uname}' auto-locked after {max_attempts} failed login attempts",
                record_id=user["_id"], request=request,
            )
            raise HTTPException(
                403,
                f"Your account has been locked after {max_attempts} consecutive failed login attempts. "
                "Please contact an Administrator to reactivate.",
            )
        await db.users.update_one({"_id": user["_id"]}, {"$set": {"failed_login_attempts": failed}})
        await log_activity(
            "login_failed",
            f"Failed login attempt for '{uname}': Incorrect password (Attempt {failed}/{max_attempts})",
            record_id=user["_id"], request=request,
        )
        remaining = max_attempts - failed
        raise HTTPException(400, f"Incorrect password. Warning: {remaining} attempt(s) remaining before your account is locked.")

    db_role = (user.get("role") or "").lower()
    selected = body.role if body.role in ("compliance_admin", "compliance_officer") else "compliance_officer"
    has_admin = "admin" in db_role or db_role == "both"
    has_officer = "officer" in db_role or db_role == "both"

    if selected == "compliance_admin" and not has_admin:
        await log_activity("login_failed", f"Failed login attempt for '{uname}': Access denied for Admin portal",
                           record_id=user["_id"], request=request)
        raise HTTPException(
            403,
            "Access denied. You do not have Compliance Administrator privileges. "
            "Please select the Compliance Officer tab to sign in.",
        )
    if selected == "compliance_officer" and not has_officer:
        await log_activity("login_failed", f"Failed login attempt for '{uname}': Access denied for Officer portal",
                           record_id=user["_id"], request=request)
        raise HTTPException(
            403,
            "Access denied. Your account is registered as a Compliance Administrator. "
            "Please select the Compliance Admin tab to sign in.",
        )

    await db.users.update_one({"_id": user["_id"]}, {"$set": {"failed_login_attempts": 0, "last_login": now()}})
    token = await create_session(user, selected)
    session_user = {
        "id": user["_id"],
        "username": uname,
        "fullname": user.get("fullname") or uname,
        "email": user.get("email", ""),
        "role": selected,
    }
    await log_activity("login", f"User signed in: {uname} as {selected}", record_id=user["_id"],
                       user=session_user, request=request)
    return {"token": token, "user": session_user}


@router.post("/auth/register")
async def register(body: RegisterIn, request: Request):
    db = get_db()
    fullname, username, email = body.fullname.strip(), body.username.strip(), body.email.strip()
    role = body.role if body.role in ("compliance_officer", "compliance_admin") else "compliance_officer"

    if not fullname or not username or not email or not body.password:
        raise HTTPException(400, "Please fill in all required fields.")
    if body.password != body.confirm_password:
        raise HTTPException(400, "Passwords do not match. Please re-enter your password.")
    if len(body.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters long.")
    if not body.terms:
        raise HTTPException(400, "You must agree to the UFAA & Airtel Security Policies.")

    if await db.users.find_one({"$or": [{"username": username}, {"email": email}]}):
        raise HTTPException(400, "Username or Work Email is already registered. Please sign in or use a different email.")

    user_id = await next_id("users")
    try:
        await db.users.insert_one({
            "_id": user_id,
            "username": username,
            "fullname": fullname,
            "email": email,
            "password_hash": hash_password(body.password),
            "role": role,
            "is_active": True,
            "failed_login_attempts": 0,
            "created_at": now(),
            "last_login": None,
        })
    except DuplicateKeyError:
        raise HTTPException(400, "Username or Work Email is already registered. Please sign in or use a different email.")

    await log_activity("user_created", f"User registered: {username} ({fullname}) as {role}",
                       record_id=user_id, request=request, username=username)
    return {"message": "Registration successful! Your account is active. You can now sign in."}


@router.post("/auth/logout")
async def logout(request: Request, user: dict = Depends(get_current_user)):
    await get_db().sessions.delete_one({"_id": user["token"]})
    await log_activity("logout", f"User logged out: {user['username']}", record_id=user["id"], user=user, request=request)
    return {"ok": True}


@router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return {k: v for k, v in user.items() if k != "token"}


@router.get("/settings/public")
async def public_settings():
    s = await get_settings_map()
    return {
        "portal_label": s.get("portal_label", "UFAA Compliance Portal"),
        "maintenance_mode": s.get("maintenance_mode", "0"),
        "maintenance_show_banner": s.get("maintenance_show_banner", "1"),
        "maintenance_banner_msg": s.get("maintenance_banner_msg", ""),
        "maintenance_scheduled_at": s.get("maintenance_scheduled_at", ""),
    }
