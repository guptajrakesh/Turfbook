from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./turf.db"
    jwt_secret: str = "dev-only-secret-change-me-in-production-0123456789"
    access_token_minutes: int = 15
    refresh_token_days: int = 30

    # OTP: in dev mode the code is returned in the API response instead of an SMS.
    otp_dev_mode: bool = True
    otp_ttl_minutes: int = 5
    otp_max_attempts: int = 5

    # Payments: "mock" simulates the gateway locally; "razorpay" verifies real webhooks.
    payments_mode: str = "mock"
    razorpay_key_id: str = ""
    razorpay_webhook_secret: str = "dev-webhook-secret"

    hold_minutes: int = 10
    max_active_holds: int = 3
    default_timezone: str = "Asia/Kolkata"
    cors_origins: str = "http://localhost:5173"
    cookie_secure: bool = False  # true behind HTTPS in production


@lru_cache
def get_settings() -> Settings:
    return Settings()
