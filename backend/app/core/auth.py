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
    Validate JWT token by calling Supabase's auth endpoint.
    If no token provided or validation fails in dev mode, return a default user.
    """
    if not credentials:
        # No token - allow in dev mode
        if settings.app_env == "development":
            return {"user_id": "dev-user", "email": "dev@local"}
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    token = credentials.credentials

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
