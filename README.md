23203159@KE-23203159-WL1 MINGW64 ~/OneDrive - Airtel Africa/Compliance/GRC/ufaa-app/backend (main)
$ .venv/Scripts/python.exe -c "from app.config import settings as s; u=s.mongo_url; print(repr(u[:16]), len(u))"
'mongodb+srv://23' 77

23203159@KE-23203159-WL1 MINGW64 ~/OneDrive - Airtel Africa/Compliance/GRC/ufaa-app/backend (main)
$ .venv/Scripts/python.exe -m uvicorn app.main:app --port 8000
INFO:     Started server process [32772]
INFO:     Waiting for application startup.
ERROR:    Traceback (most recent call last):
  File "C:\Users\23203159\OneDrive - Airtel Africa\Compliance\GRC\ufaa-app\backend\.venv\lib\site-packages\starlette\routing.py", line 693, in lifespan
  File "C:\Users\23203159\AppData\Local\Programs\Python\Python310\lib\contextlib.py", line 199, in __aenter__
  File "C:\Users\23203159\OneDrive - Airtel Africa\Compliance\GRC\ufaa-app\backend\.venv\lib\site-packages\fastapi\routing.py", line 133, in merged_lifespan
  File "C:\Users\23203159\AppData\Local\Programs\Python\Python310\lib\contextlib.py", line 199, in __aenter__
  File "C:\Users\23203159\OneDrive - Airtel Africa\Compliance\GRC\ufaa-app\backend\.venv\lib\site-packages\fastapi\routing.py", line 133, in merged_lifespan
  File "C:\Users\23203159\AppData\Local\Programs\Python\Python310\lib\contextlib.py", line 199, in __aenter__
  File "C:\Users\23203159\OneDrive - Airtel Africa\Compliance\GRC\ufaa-app\backend\.venv\lib\site-packages\fastapi\routing.py", line 133, in merged_lifespan
  File "C:\Users\23203159\AppData\Local\Programs\Python\Python310\lib\contextlib.py", line 199, in __aenter__
  File "C:\Users\23203159\OneDrive - Airtel Africa\Compliance\GRC\ufaa-app\backend\.venv\lib\site-packages\fastapi\routing.py", line 133, in merged_lifespan
  File "C:\Users\23203159\AppData\Local\Programs\Python\Python310\lib\contextlib.py", line 199, in __aenter__
  File "C:\Users\23203159\OneDrive - Airtel Africa\Compliance\GRC\ufaa-app\backend\.venv\lib\site-packages\fastapi\routing.py", line 133, in merged_lifespan
  File "C:\Users\23203159\AppData\Local\Programs\Python\Python310\lib\contextlib.py", line 199, in __aenter__
  File "C:\Users\23203159\OneDrive - Airtel Africa\Compliance\GRC\ufaa-app\backend\.venv\lib\site-packages\fastapi\routing.py", line 133, in merged_lifespan
  File "C:\Users\23203159\AppData\Local\Programs\Python\Python310\lib\contextlib.py", line 199, in __aenter__
  File "C:\Users\23203159\OneDrive - Airtel Africa\Compliance\GRC\ufaa-app\backend\.venv\lib\site-packages\fastapi\routing.py", line 133, in merged_lifespan
  File "C:\Users\23203159\AppData\Local\Programs\Python\Python310\lib\contextlib.py", line 199, in __aenter__
  File "C:\Users\23203159\OneDrive - Airtel Africa\Compliance\GRC\ufaa-app\backend\app\main.py", line 21, in lifespan
  File "C:\Users\23203159\OneDrive - Airtel Africa\Compliance\GRC\ufaa-app\backend\app\db.py", line 40, in connect
  File "C:\Users\23203159\OneDrive - Airtel Africa\Compliance\GRC\ufaa-app\backend\.venv\lib\site-packages\motor\core.py", line 171, in __init__
  File "C:\Users\23203159\OneDrive - Airtel Africa\Compliance\GRC\ufaa-app\backend\.venv\lib\site-packages\pymongo\synchronous\mongo_client.py", line 780, in __init__
  File "C:\Users\23203159\OneDrive - Airtel Africa\Compliance\GRC\ufaa-app\backend\.venv\lib\site-packages\pymongo\uri_parser.py", line 558, in parse_uri
  File "C:\Users\23203159\OneDrive - Airtel Africa\Compliance\GRC\ufaa-app\backend\.venv\lib\site-packages\pymongo\srv_resolver.py", line 140, in get_hosts
  File "C:\Users\23203159\OneDrive - Airtel Africa\Compliance\GRC\ufaa-app\backend\.venv\lib\site-packages\pymongo\srv_resolver.py", line 120, in _get_srv_response_and_hosts
  File "C:\Users\23203159\OneDrive - Airtel Africa\Compliance\GRC\ufaa-app\backend\.venv\lib\site-packages\pymongo\srv_resolver.py", line 114, in _resolve_uri
pymongo.errors.ConfigurationError: The resolution lifetime expired after 20.213 seconds: Server Do53:172.23.31.23@53 answered The DNS operation timed out.; Server Do53:172.23.31.24@53 answered The DNS operation timed out.; Server Do53:172.23.19.151@53 answered The DNS operation timed out.; Server Do53:172.23.19.152@53 answered The DNS operation timed out.; Server Do53:172.23.96.38@53 answered The DNS operation timed out.; Server Do53:172.23.31.23@53 answered The DNS operation timed out.; Server Do53:172.23.31.24@53 answered The DNS operation timed out.; Server Do53:172.23.19.151@53 answered The DNS operation timed out.; Server Do53:172.23.19.152@53 answered The DNS operation timed out.; Server Do53:172.23.96.38@53 answered The DNS operation timed out.

ERROR:    Application startup failed. Exiting.

23203159@KE-23203159-WL1 MINGW64 ~/OneDrive - Airtel Africa/Compliance/GRC/ufaa-app/backend (main)
$

# Copy this file to .env and adjust if needed.
MONGO_URL=mongodb+srv://23203159_db_user:hidden by me, i have included my password@cluster0.bpzm0ts.mongodb.net/

# Comma-separated list of origins allowed to call the API (the React dev server).
CORS_ORIGINS=http://localhost:5173

# Where uploaded stamped letters, generated submission files and temp files are stored.
STORAGE_DIR=storage

TIMEZONE=Africa/Nairobi

# Password for the seeded "admin" account, used only when the users collection is empty.
DEFAULT_ADMIN_PASSWORD=hidden by me
