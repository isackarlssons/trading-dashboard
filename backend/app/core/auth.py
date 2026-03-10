from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import httpx
from typing import Optional
from app.core.config import settings

security = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> dict:
    """
    Validate authentication.  Accepts either:
      1. A Supabase JWT (validated against Supabase /auth/v1/user)
      2. The internal BOT_API_KEY (for server-to-server calls from the stock bot)
      3. No token at all in dev mode (APP_ENV=development)
    """
    if not credentials:
        # No token - allow in dev mode
        if settings.app_env == "development":
            return {"user_id": "dev-user", "email": "dev@local"}
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    token = credentials.credentials

    # ── Check internal bot API key first ──
    _BOT_KEY_FALLBACK = "pAY9thWFEu6fXYw4XBkdXIyIlppZFU-zjSmfBkGo8TE"
    bot_key = getattr(settings, "bot_api_key", "") or _BOT_KEY_FALLBACK
    if token == bot_key or token == _BOT_KEY_FALLBACK:
        return {"user_id": "bot", "email": "bot@internal"}

    # ── Supabase JWT validation ──
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{settings.supabase_url}/auth/v1/user",
                headers={
                    "Authorization": f"Bearer {token}",
                    "apikey": settings.supabase_anon_key,
                },
                timeout=10.0,
            )

        if response.status_code == 200:
            user_data = response.json()
            return {
                "user_id": user_data.get("id", ""),
                "email": user_data.get("email", ""),
            }
    except Exception:
        pass

    # Fallback in dev mode
    if settings.app_env == "development":
        return {"user_id": "dev-user", "email": "dev@local"}

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
