from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # Supabase
    supabase_url: str = "http://localhost:54321"
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""
    supabase_jwt_secret: str = ""

    # Database
    database_url: str = "postgresql://postgres:postgres@localhost:54322/postgres"

    # App
    app_env: str = "development"
    cors_origins: str = "http://localhost:3000"
    bot_api_key: str = "pAY9thWFEu6fXYw4XBkdXIyIlppZFU-zjSmfBkGo8TE"  # Internal API key for bot-to-backend auth

    @property
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.cors_origins.split(",")]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
