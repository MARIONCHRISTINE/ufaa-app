23203159@KE-23203159-WL1 MINGW64 ~/OneDrive - Airtel Africa/Compliance/GRC/ufaa-app/backend (main)
$ .venv/Scripts/python.exe -m uvicorn app.main:app --port 8000
INFO:     Started server process [50112]
INFO:     Waiting for application startup.
ERROR:    Traceback (most recent call last):
  File "C:\Users\23203159\OneDrive - Airtel Africa\Compliance\GRC\ufaa-app\backend\.venv\lib\site-packages\starlette\routing.py", line 693, in lifespan
    async with self.lifespan_context(app) as maybe_state:
  File "C:\Users\23203159\AppData\Local\Programs\Python\Python310\lib\contextlib.py", line 199, in __aenter__
    return await anext(self.gen)
  File "C:\Users\23203159\OneDrive - Airtel Africa\Compliance\GRC\ufaa-app\backend\.venv\lib\site-packages\fastapi\routing.py", line 133, in merged_lifespan
    async with original_context(app) as maybe_original_state:
  File "C:\Users\23203159\AppData\Local\Programs\Python\Python310\lib\contextlib.py", line 199, in __aenter__
    return await anext(self.gen)
  File "C:\Users\23203159\OneDrive - Airtel Africa\Compliance\GRC\ufaa-app\backend\.venv\lib\site-packages\fastapi\routing.py", line 133, in merged_lifespan
    async with original_context(app) as maybe_original_state:
  File "C:\Users\23203159\AppData\Local\Programs\Python\Python310\lib\contextlib.py", line 199, in __aenter__
    return await anext(self.gen)
  File "C:\Users\23203159\OneDrive - Airtel Africa\Compliance\GRC\ufaa-app\backend\.venv\lib\site-packages\fastapi\routing.py", line 133, in merged_lifespan
    async with original_context(app) as maybe_original_state:
  File "C:\Users\23203159\AppData\Local\Programs\Python\Python310\lib\contextlib.py", line 199, in __aenter__
    return await anext(self.gen)
  File "C:\Users\23203159\OneDrive - Airtel Africa\Compliance\GRC\ufaa-app\backend\.venv\lib\site-packages\fastapi\routing.py", line 133, in merged_lifespan
    async with original_context(app) as maybe_original_state:
  File "C:\Users\23203159\AppData\Local\Programs\Python\Python310\lib\contextlib.py", line 199, in __aenter__
    return await anext(self.gen)
  File "C:\Users\23203159\OneDrive - Airtel Africa\Compliance\GRC\ufaa-app\backend\.venv\lib\site-packages\fastapi\routing.py", line 133, in merged_lifespan
    async with original_context(app) as maybe_original_state:
  File "C:\Users\23203159\AppData\Local\Programs\Python\Python310\lib\contextlib.py", line 199, in __aenter__
    return await anext(self.gen)
  File "C:\Users\23203159\OneDrive - Airtel Africa\Compliance\GRC\ufaa-app\backend\.venv\lib\site-packages\fastapi\routing.py", line 133, in merged_lifespan
    async with original_context(app) as maybe_original_state:
  File "C:\Users\23203159\AppData\Local\Programs\Python\Python310\lib\contextlib.py", line 199, in __aenter__
    return await anext(self.gen)
  File "C:\Users\23203159\OneDrive - Airtel Africa\Compliance\GRC\ufaa-app\backend\.venv\lib\site-packages\fastapi\routing.py", line 133, in merged_lifespan
    async with original_context(app) as maybe_original_state:
  File "C:\Users\23203159\AppData\Local\Programs\Python\Python310\lib\contextlib.py", line 199, in __aenter__
    return await anext(self.gen)
  File "C:\Users\23203159\OneDrive - Airtel Africa\Compliance\GRC\ufaa-app\backend\app\main.py", line 21, in lifespan
    await db.connect()
  File "C:\Users\23203159\OneDrive - Airtel Africa\Compliance\GRC\ufaa-app\backend\app\db.py", line 40, in connect
    _client = AsyncIOMotorClient(settings.mongo_url, tz_aware=True, tzinfo=TZ)
  File "C:\Users\23203159\OneDrive - Airtel Africa\Compliance\GRC\ufaa-app\backend\.venv\lib\site-packages\motor\core.py", line 171, in __init__
    delegate = self.__delegate_class__(*args, **kwargs)
  File "C:\Users\23203159\OneDrive - Airtel Africa\Compliance\GRC\ufaa-app\backend\.venv\lib\site-packages\pymongo\synchronous\mongo_client.py", line 780, in __init__
    res = uri_parser.parse_uri(
  File "C:\Users\23203159\OneDrive - Airtel Africa\Compliance\GRC\ufaa-app\backend\.venv\lib\site-packages\pymongo\uri_parser.py", line 502, in parse_uri
    raise InvalidURI(f"Invalid URI scheme: URI must begin with '{SCHEME}' or '{SRV_SCHEME}'")
pymongo.errors.InvalidURI: Invalid URI scheme: URI must begin with 'mongodb://' or 'mongodb+srv://'

ERROR:    Application startup failed. Exiting.

23203159@KE-23203159-WL1 MINGW64 ~/OneDrive - Airtel Africa/Compliance/GRC/ufaa-app/backend (main)
$
