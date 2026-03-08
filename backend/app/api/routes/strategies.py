from fastapi import APIRouter, Depends, HTTPException

from app.core.supabase import get_supabase
from app.core.auth import get_current_user

router = APIRouter(prefix="/strategies", tags=["strategies"])


@router.get("/")
async def list_strategies(
    user: dict = Depends(get_current_user),
):
    """List all strategies."""
    sb = get_supabase()
    result = sb.table("strategies").select("*").order("name").execute()
    return result.data


@router.get("/{strategy_id}")
async def get_strategy(
    strategy_id: str,
    user: dict = Depends(get_current_user),
):
    """Get a specific strategy."""
    sb = get_supabase()
    result = (
        sb.table("strategies")
        .select("*")
        .eq("id", strategy_id)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Strategy not found")
    return result.data


@router.post("/", status_code=201)
async def create_strategy(
    data: dict,
    user: dict = Depends(get_current_user),
):
    """Create a new strategy."""
    sb = get_supabase()
    result = sb.table("strategies").insert(data).execute()
    return result.data[0] if result.data else {}
