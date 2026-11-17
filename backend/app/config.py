from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", extra="ignore")

    mongo_url: str = "mongodb://localhost:27017"
    mongo_db: str = "ufaa_db"
    cors_origins: str = "http://localhost:5173"
    storage_dir: str = "storage"
    timezone: str = "Africa/Nairobi"
    default_admin_password: str = "Admin@1234"

    @property
    def storage_path(self) -> Path:
        path = Path(self.storage_dir)
        return path if path.is_absolute() else BASE_DIR / path

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
