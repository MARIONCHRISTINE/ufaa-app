.venv/Scripts/python.exe -c "from app.config import settings as s; u=s.mongo_url; print(repr(u[:16]), len(u))"
