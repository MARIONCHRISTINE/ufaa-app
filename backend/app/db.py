"""MongoDB connection (Motor), numeric id counters, indexes and first-run seeding."""

import logging

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymongo import ASCENDING, DESCENDING, ReturnDocument

from .config import settings
from .utils import TZ, now

log = logging.getLogger("ufaa.db")

_client: AsyncIOMotorClient | None = None
_db: AsyncIOMotorDatabase | None = None

DEFAULT_SETTINGS = {
    "portal_label": "UFAA Compliance Portal",
    "session_timeout": "120",
    "max_login_attempts": "5",
    "max_upload_mb": "50",
    "records_per_page": "50",
    "maintenance_mode": "0",
    "maintenance_scheduled_at": "",
    "maintenance_banner_msg": (
        "Notice: The system is undergoing scheduled maintenance to improve services. "
        "Some functions may be temporarily limited."
    ),
    "maintenance_show_banner": "1",
}


def get_db() -> AsyncIOMotorDatabase:
    if _db is None:
        raise RuntimeError("Database is not connected yet.")
    return _db


async def connect() -> None:
    global _client, _db
    _client = AsyncIOMotorClient(settings.mongo_url, tz_aware=True, tzinfo=TZ)
    _db = _client[settings.mongo_db]
    await _db.command("ping")
    await init_db(_db)
    log.info("Connected to MongoDB database '%s'", settings.mongo_db)


async def disconnect() -> None:
    if _client is not None:
        _client.close()


async def next_id(name: str, count: int = 1) -> int:
    """Reserve `count` sequential integer ids and return the first one (auto-increment)."""
    doc = await get_db().counters.find_one_and_update(
        {"_id": name},
        {"$inc": {"seq": count}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return doc["seq"] - count + 1


async def init_db(db: AsyncIOMotorDatabase) -> None:
    await db.users.create_index("username", unique=True)
    await db.users.create_index("email")

    # Alphabetical (case-insensitive) owner order uses a stored lowercase copy of the name. A collated
    # index is avoided on purpose: MongoDB returns no rows when a regex filter meets a collated sort.
    if "owner_sort_ci" in await db.assets.index_information():
        await db.assets.drop_index("owner_sort_ci")
    await db.assets.update_many(
        {"owner_sort": {"$exists": False}},
        [{"$set": {"owner_sort": {"$toLower": {"$ifNull": ["$owner_name", ""]}}}}],
    )
    await db.assets.create_index([("owner_missing", ASCENDING), ("owner_sort", ASCENDING)], name="owner_sort")
    await db.assets.create_index("uploaded_by")

    # Records submitted before uploaders were tracked: a submission's records share its exact timestamp.
    async for s in db.upload_sessions.find({"uploaded_at": {"$ne": None}}, {"uploaded_by": 1, "uploaded_at": 1}):
        await db.assets.update_many(
            {"uploaded_by": {"$exists": False}, "uploaded_at": s["uploaded_at"]},
            {"$set": {"uploaded_by": s.get("uploaded_by"), "upload_session_id": s["_id"]}},
        )
    await db.assets.create_index("id_passport_no")
    await db.assets.create_index("account_number")
    await db.assets.create_index("status")
    await db.assets.create_index("compilation_date")
    await db.assets.create_index("letter_generated")
    await db.assets.create_index([("status", ASCENDING), ("letter_generated", ASCENDING)])

    await db.activity_logs.create_index([("created_at", DESCENDING)])
    await db.activity_logs.create_index("action")
    await db.activity_logs.create_index("username")

    # Sessions are removed automatically a week after their last activity.
    await db.sessions.create_index("last_activity", expireAfterSeconds=7 * 24 * 3600)

    await db.duplicate_notes.create_index("group_key", unique=True)
    await db.drafts.create_index([("status", ASCENDING), ("updated_at", DESCENDING)])
    await db.draft_rows.create_index([("draft_id", ASCENDING), ("seq", ASCENDING)], unique=True)
    await db.uploaded_files.create_index("file_name", unique=True)
    await db.upload_sessions.create_index([("uploaded_at", DESCENDING)])

    await _seed(db)

    for sub in ("stamped", "submissions", "tmp"):
        (settings.storage_path / sub).mkdir(parents=True, exist_ok=True)


async def _seed(db: AsyncIOMotorDatabase) -> None:
    from .security import hash_password  # local import avoids a circular import

    if await db.users.count_documents({}) == 0:
        user_id = await next_id("users")
        await db.users.insert_one({
            "_id": user_id,
            "username": "admin",
            "fullname": "",
            "email": "admin@ufaa.go.ke",
            "password_hash": hash_password(settings.default_admin_password),
            "role": "compliance_admin",
            "is_active": True,
            "failed_login_attempts": 0,
            "created_at": now(),
            "last_login": None,
        })
        log.warning("Seeded default 'admin' account. Change its password after first login.")

    for key, value in DEFAULT_SETTINGS.items():
        await db.settings.update_one(
            {"_id": key},
            {"$setOnInsert": {"value": value, "updated_at": now()}},
            upsert=True,
        )
