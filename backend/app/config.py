from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Base path for local storage. Resolves relative to workspace root
    data_root: Path = Path(__file__).resolve().parent.parent.parent / "local_data"
    max_upload_bytes: int = 100 * 1024 * 1024  # 100 MB default upload limit

    # Phase 14 AI Assistant defaults (BYOK Euri API + Optional Local Ollama)
    euri_api_key: str | None = None
    euri_base_url: str = "https://api.euron.one/api/v1/euri/chat/completions"
    euri_model: str = "gpt-5.3-instant"
    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "llama3.2"

    @property
    def database_path(self) -> Path:
        return self.data_root / "app.db"

    @property
    def originals_path(self) -> Path:
        return self.data_root / "originals"

    @property
    def working_path(self) -> Path:
        return self.data_root / "working"

    @property
    def exports_path(self) -> Path:
        return self.data_root / "exports"

    @property
    def thumbnails_path(self) -> Path:
        return self.data_root / "thumbnails"

    @property
    def history_path(self) -> Path:
        return self.data_root / "history"

    @property
    def temp_path(self) -> Path:
        return self.data_root / "temp"

    @property
    def tessdata_path(self) -> Path:
        return self.data_root / "tessdata"

    @property
    def templates_path(self) -> Path:
        return self.data_root / "templates"

    @property
    def signatures_path(self) -> Path:
        return self.data_root / "signatures"

    @property
    def certs_path(self) -> Path:
        return self.data_root / "certs"

    @property
    def ai_config_path(self) -> Path:
        return self.data_root / "ai_config.json"

    def ensure_directories(self) -> None:
        """Creates the local storage directory hierarchy if missing."""
        for path in [
            self.data_root,
            self.originals_path,
            self.working_path,
            self.exports_path,
            self.thumbnails_path,
            self.history_path,
            self.temp_path,
            self.tessdata_path,
            self.templates_path,
            self.signatures_path,
            self.certs_path,
        ]:
            path.mkdir(parents=True, exist_ok=True)


settings = Settings()
