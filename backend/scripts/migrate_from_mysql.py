"""One-time import of the old PHP/MySQL UFAA data into MongoDB.

Usage (from the backend folder, with MySQL/XAMPP and MongoDB both running):

    python -m scripts.migrate_from_mysql --php-root ..\\.. --mysql-password ""

Options:
    --mysql-host / --mysql-port / --mysql-user / --mysql-password / --mysql-db   (defaults: XAMPP's root@127.0.0.1/ufaa_db)
    --php-root   folder of the old PHP app, used to copy uploads/stamped, uploads/drafts and
                 uploads/generated_submissions (default: two levels up, i.e. the UFAA folder)
    --drop       empty the MongoDB collections first (otherwise existing ids are overwritten)
"""

import argparse
import json
import shutil
import sys
from datetime import date, datetime
from pathlib import Path

import pymysql
import pymysql.cursors
from pymongo import MongoClient, ReplaceOne

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings  # noqa: E402
from app.utils import ROW_FIELDS, TZ, amount_value, text  # noqa: E402

COLLECTIONS = ["users", "assets", "activity_logs", "settings", "duplicate_notes", "upload_sessions",
               "uploaded_files", "drafts", "draft_rows", "counters"]


def local(value):
    if isinstance(value, datetime):
        return value.replace(tzinfo=TZ) if value.tzinfo is None else value
    if isinstance(value, date):
        return datetime(value.year, value.month, value.day, tzinfo=TZ)
    return value


def as_text(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d %H:%M:%S")
    if isinstance(value, date):
        return value.strftime("%Y-%m-%d")
    return str(value)


def table_exists(conn, name: str) -> bool:
    with conn.cursor() as cur:
        cur.execute("SHOW TABLES LIKE %s", (name,))
        return cur.fetchone() is not None


def rows(conn, sql: str):
    with conn.cursor(pymysql.cursors.SSDictCursor) as cur:
        cur.execute(sql)
        for row in cur:
            yield row


def bulk(coll, docs: list[dict]):
    if docs:
        coll.bulk_write([ReplaceOne({"_id": d["_id"]}, d, upsert=True) for d in docs], ordered=False)


def copy_file(src: Path, dest: Path) -> bool:
    if not src.is_file():
        return False
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dest)
    return True


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--mysql-host", default="127.0.0.1")
    ap.add_argument("--mysql-port", type=int, default=3306)
    ap.add_argument("--mysql-user", default="root")
    ap.add_argument("--mysql-password", default="")
    ap.add_argument("--mysql-db", default="ufaa_db")
    ap.add_argument("--php-root", default=str(Path(__file__).resolve().parents[3]))
    ap.add_argument("--drop", action="store_true")
    args = ap.parse_args()

    php_root = Path(args.php_root).resolve()
    storage = settings.storage_path
    conn = pymysql.connect(host=args.mysql_host, port=args.mysql_port, user=args.mysql_user,
                           password=args.mysql_password, database=args.mysql_db, charset="utf8mb4")
    mongo = MongoClient(settings.mongo_url, tz_aware=True, tzinfo=TZ)[settings.mongo_db]

    if args.drop:
        for name in COLLECTIONS:
            mongo[name].delete_many({})
        print("Emptied MongoDB collections.")

    counters: dict[str, int] = {}

    # Users
    if table_exists(conn, "admin_users"):
        docs = []
        for r in rows(conn, "SELECT * FROM admin_users"):
            role = r.get("role") or "compliance_officer"
            role = {"admin": "compliance_admin", "viewer": "compliance_officer", "uploader": "compliance_officer"}.get(role, role)
            docs.append({
                "_id": r["id"], "username": r["username"], "fullname": r.get("fullname") or "",
                "email": r.get("email") or "", "password_hash": r["password_hash"], "role": role,
                "is_active": bool(r.get("is_active", 1)), "failed_login_attempts": int(r.get("failed_login_attempts") or 0),
                "created_at": local(r.get("created_at")), "last_login": local(r.get("last_login")),
            })
        bulk(mongo.users, docs)
        counters["users"] = max([d["_id"] for d in docs], default=0)
        print(f"users: {len(docs)}")

    # Assets (streamed in batches)
    if table_exists(conn, "unclaimed_assets"):
        batch, total, copied, max_id = [], 0, 0, 0
        for r in rows(conn, "SELECT * FROM unclaimed_assets"):
            stamped = r.get("stamped_file_path")
            new_stamped = None
            if stamped:
                rel = Path(str(stamped).replace("\\", "/"))
                parts = rel.parts[1:] if rel.parts and rel.parts[0] == "uploads" else rel.parts
                new_rel = Path(*parts) if parts else rel
                if copy_file(php_root / rel, storage / new_rel):
                    copied += 1
                new_stamped = new_rel.as_posix()
            owner = text(r.get("owner_name")) or None
            batch.append({
                "_id": r["record_id"],
                "owner_name": owner,
                "owner_missing": owner is None,
                "owner_sort": (owner or "").lower(),
                "id_passport_no": text(r.get("id_passport_no")) or None,
                "date_of_birth": as_text(r.get("date_of_birth")),
                "account_number": text(r.get("account_number")) or None,
                "last_transaction": as_text(r.get("last_transaction")),
                "due_amount": as_text(r.get("due_amount")),
                "amount": amount_value(r.get("due_amount")),
                "compilation_date": as_text(r.get("compilation_date")),
                "status": r.get("status") or "Unclaimed",
                "letter_generated": r.get("letter_generated") or "No",
                "letter_generated_date": local(r.get("letter_generated_date")),
                "letter_received": r.get("letter_received") or "No",
                "letter_date": as_text(r.get("letter_date")),
                "letter_file_path": r.get("letter_file_path"),
                "stamped_file_path": new_stamped,
                "uploaded_at": local(r.get("uploaded_at")),
            })
            max_id = max(max_id, r["record_id"])
            if len(batch) >= 5000:
                bulk(mongo.assets, batch)
                total += len(batch)
                batch = []
                print(f"  assets: {total:,}…", end="\r")
        bulk(mongo.assets, batch)
        total += len(batch)
        counters["assets"] = max_id
        print(f"assets: {total:,} (stamped files copied: {copied})")

    # Activity logs
    if table_exists(conn, "activity_logs"):
        batch, total = [], 0
        for r in rows(conn, "SELECT * FROM activity_logs"):
            batch.append({"_id": f"mysql-{r['id']}", "user_id": r.get("user_id"), "username": r.get("username") or "system",
                          "action": r.get("action"), "description": r.get("description") or "",
                          "record_id": r.get("record_id"), "ip_address": r.get("ip_address") or "",
                          "created_at": local(r.get("created_at"))})
            if len(batch) >= 5000:
                bulk(mongo.activity_logs, batch)
                total += len(batch)
                batch = []
        bulk(mongo.activity_logs, batch)
        print(f"activity_logs: {total + len(batch):,}")

    # Settings
    if table_exists(conn, "admin_settings"):
        docs = [{"_id": r["setting_key"], "value": r["setting_value"], "updated_at": local(r.get("updated_at"))}
                for r in rows(conn, "SELECT * FROM admin_settings")]
        bulk(mongo.settings, docs)
        print(f"settings: {len(docs)}")

    # Duplicate notes
    if table_exists(conn, "duplicate_notes"):
        docs = [{"_id": r["id"], "group_key": r["group_key"], "note": r.get("note") or "", "noted_by": r.get("noted_by") or "",
                 "reviewed": bool(r.get("reviewed")), "reviewed_by": r.get("reviewed_by"),
                 "reviewed_at": local(r.get("reviewed_at")), "noted_at": local(r.get("noted_at"))}
                for r in rows(conn, "SELECT * FROM duplicate_notes")]
        bulk(mongo.duplicate_notes, docs)
        print(f"duplicate_notes: {len(docs)}")

    # Upload sessions + generated submission files
    if table_exists(conn, "upload_sessions"):
        docs = [{"_id": r["id"], "uploaded_by": r.get("uploaded_by"), "file_name": r.get("file_name"),
                 "record_count": int(r.get("record_count") or 0), "status": r.get("status") or "success",
                 "protection_password": r.get("protection_password"), "notes": r.get("notes"),
                 "uploaded_at": local(r.get("uploaded_at"))}
                for r in rows(conn, "SELECT * FROM upload_sessions")]
        bulk(mongo.upload_sessions, docs)
        counters["upload_sessions"] = max([d["_id"] for d in docs], default=0)
        copied = sum(copy_file(php_root / "uploads" / "generated_submissions" / str(d["file_name"]),
                               storage / "submissions" / str(d["file_name"])) for d in docs if d["file_name"])
        print(f"upload_sessions: {len(docs)} (submission files copied: {copied})")

    if table_exists(conn, "uploaded_files"):
        docs = [{"_id": r["id"], "file_name": r["file_name"], "uploaded_at": local(r.get("uploaded_at"))}
                for r in rows(conn, "SELECT * FROM uploaded_files")]
        bulk(mongo.uploaded_files, docs)
        print(f"uploaded_files: {len(docs)}")

    # Open working drafts (rows came from uploads/drafts/draft_N.json, or inline JSON in rows_data)
    if table_exists(conn, "sandbox_drafts"):
        n_drafts = 0
        max_draft = 0
        for r in rows(conn, "SELECT * FROM sandbox_drafts"):
            max_draft = max(max_draft, r["id"])
            if r.get("status") not in ("active", "flagged"):
                continue
            disk = php_root / "uploads" / "drafts" / f"draft_{r['id']}.json"
            data = []
            try:
                if disk.is_file():
                    data = json.loads(disk.read_text(encoding="utf-8") or "[]")
                elif str(r.get("rows_data") or "").startswith("["):
                    data = json.loads(r["rows_data"])
            except (ValueError, TypeError):
                data = []
            data = [d for d in data if isinstance(d, dict)]
            mongo.draft_rows.delete_many({"draft_id": r["id"]})
            if data:
                mongo.draft_rows.insert_many([{"draft_id": r["id"], "seq": i, **{f: text(d.get(f)) for f in ROW_FIELDS}}
                                              for i, d in enumerate(data)])
            mongo.drafts.replace_one({"_id": r["id"]}, {
                "_id": r["id"], "draft_name": r.get("draft_name"), "created_by": r.get("created_by"),
                "last_edited_by": r.get("last_edited_by"), "status": r.get("status"),
                "flagged_reason": r.get("flagged_reason"), "presence": [], "viewers": [],
                "row_count": len(data), "next_seq": len(data),
                "created_at": local(r.get("created_at")), "updated_at": local(r.get("updated_at")),
            }, upsert=True)
            n_drafts += 1
        counters["drafts"] = max_draft
        print(f"drafts: {n_drafts} open drafts")

    for name, value in counters.items():
        current = (mongo.counters.find_one({"_id": name}) or {}).get("seq", 0)
        mongo.counters.update_one({"_id": name}, {"$set": {"seq": max(current, value)}}, upsert=True)

    print("Migration finished.")


if __name__ == "__main__":
    main()
