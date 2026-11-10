from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    object_storage_root: Path = Path("./storage")
    max_upload_bytes: int = 50 * 1024 * 1024


settings = Settings()

