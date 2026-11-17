# UFAA Compliance Portal — v3 (React + FastAPI + MongoDB)

This is a full rewrite of the PHP/MySQL portal in the parent folder. The old PHP files are untouched
and can stay as a reference until you are happy with the new version.

| Layer    | Old                         | New                                                  |
|----------|-----------------------------|------------------------------------------------------|
| Database | MySQL / MariaDB (XAMPP)     | MongoDB, accessed with **Motor** (async driver)      |
| Backend  | PHP pages + `ajax/*.php`    | **FastAPI** (Python) — `backend/`                    |
| Frontend | PHP-rendered HTML + JS      | **React + Tailwind CSS** (Vite) — `frontend/`        |

## 1. Install the tools (one time)

Run these in PowerShell. Close and reopen the terminal afterwards so the new commands are on the PATH.

```bash
winget install -e --id Python.Python.3.12
```

```bash
winget install -e --id OpenJS.NodeJS.LTS
```

```bash
winget install -e --id MongoDB.Server
```

MongoDB Server installs as a Windows service and starts automatically on `mongodb://localhost:27017`.
Optionally also install the MongoDB Compass GUI (`winget install -e --id MongoDB.Compass.Full`) to browse the data.

## 2. Start the backend (FastAPI)

```bash
cd ufaa-app\backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8000
```

On first start the API creates the indexes, the default settings and an `admin` account
(password `Admin@1234`, from `DEFAULT_ADMIN_PASSWORD` in `.env`) if there are no users yet.
Change that password after you sign in. API docs: http://localhost:8000/docs

## 3. Start the frontend (React)

In a second terminal:

```bash
cd ufaa-app\frontend
npm install
npm run dev
```

Open http://localhost:5173. Vite forwards every `/api` call to the backend on port 8000.

## 4. (Optional) Copy the existing MySQL data into MongoDB

With XAMPP's MySQL **and** MongoDB both running, from `ufaa-app\backend` (venv active):

```bash
python -m scripts.migrate_from_mysql --mysql-password ""
```

This imports users (their existing passwords keep working), all asset records, activity logs,
settings, duplicate notes, upload sessions / vault passwords and open working drafts. It also copies
the stamped letter files and generated submission files from `..\uploads` into `backend\storage`.
Add `--drop` to empty the MongoDB collections first. It is safe to run more than once.

## Production build

```bash
cd ufaa-app\frontend
npm run build
```

Serve `frontend/dist` with any static web server and route `/api` to the FastAPI app
(`uvicorn app.main:app --host 0.0.0.0 --port 8000`), and set `CORS_ORIGINS` in `backend/.env`
if the frontend is served from a different origin.

## How the pieces map to the old PHP files

| Old PHP                                                     | New                                                         |
|-------------------------------------------------------------|-------------------------------------------------------------|
| `login.php`, `register.php`, `logout.php`, `admin_auth.php` | `routers/auth.py`, `security.py` · `pages/Login.jsx`, `Register.jsx` |
| `index.php`, `claimed.php`, `unclaimed.php`, `letters.php`  | `routers/assets.py` · `pages/Home.jsx`, `RecordsPage.jsx`   |
| `ajax/update_record.php`, `upload_letter.php`, `export.php` | `routers/assets.py`                                         |
| `view_letter.php`, `generate_letter.php`, `download_letters_zip.php` | `routers/letters.py`, `services/pdf.py` · `pages/LetterView.jsx` |
| `data_preparation.php`, `data_sanitizer_editor.php`, `ajax/sandbox_draft_api.php` | `routers/drafts.py` · `pages/DataUpload.jsx`, `DraftEditor.jsx` |
| `ajax/pre_submission_validator.php`                         | `services/validator.py`                                     |
| `ajax/commit_pre_submission.php`, `download_submission.php` | `routers/drafts.py`, `services/excel.py`                    |
| `admin/index.php`, `users.php`, `logs.php`, `settings.php`  | `routers/admin_core.py` · `pages/admin/*`                   |
| `admin/data_management.php` + its `ajax/*`                  | `routers/admin_data.py` · `pages/admin/DataManagement.jsx`  |
| `admin/reports.php`, `report_pdf.php`                       | `routers/admin_reports.py` · `pages/admin/Reports.jsx`      |

## MongoDB collections

`users`, `sessions`, `assets` (was `unclaimed_assets`, `_id` = record id), `activity_logs`, `settings`,
`duplicate_notes`, `drafts` + `draft_rows` (one document per spreadsheet row), `upload_sessions`,
`uploaded_files`, `counters` (auto-increment ids, so record and user numbers stay numeric).

## Behaviour changes worth knowing

- **Login sessions** are server-side tokens (not PHP sessions). The inactivity timeout from Settings still applies.
- **Files** (stamped copies, submission workbooks) are only served to signed-in users, through the API.
- **Draft editing** targets each row by a stable id instead of its position, so two officers deleting
  rows at the same time can no longer edit the wrong row. Undo/Redo now also saves to the server.
- **"Letter Issued" filter** on the record pages now filters on whether a letter was generated
  (it previously checked a "letter received" flag that the portal never set).
- **Compliance admins** may submit any draft (the old check compared against a role name that never existed, so only the owner could).
- The direct "upload Excel straight into the database" endpoint (`ajax/upload.php`) was already unused
  by the pages and was not carried over; all uploads go through the Data Upload editor.
- The PDF letter and executive report are built with ReportLab; layout matches the old FPDF/HTML versions closely but not pixel-for-pixel.
