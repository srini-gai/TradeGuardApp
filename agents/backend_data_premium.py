# Add this route to your backend routers/data.py
# Deploy to tradegard.tech backend — this file is NOT part of the React Native app.

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional

# Assumes router is already mounted at /api/data in main.py:
#   app.include_router(data_router, prefix="/api/data")
router = APIRouter()


class OptionsPriceResponse(BaseModel):
    symbol: str
    strike: float
    direction: str
    ltp: float
    expiry: str


@router.get("/premium/{symbol}/{strike}/{direction}", response_model=OptionsPriceResponse)
async def get_options_price(
    symbol: str,
    strike: float,
    direction: str,
    expiry: Optional[str] = Query(None),
):
    """
    Fetch live LTP for a specific options strike from Upstox options chain.
    Called by the mobile app on each foreground resume to track paper trades.
    """
    if direction.upper() not in ("CE", "PE"):
        raise HTTPException(status_code=400, detail="direction must be CE or PE")

    # --- Replace this block with your actual Upstox options chain fetch ---
    # Example using your existing upstox client:
    #
    # from services.upstox import get_option_ltp
    # ltp = await get_option_ltp(symbol=symbol, strike=strike, option_type=direction, expiry=expiry)
    #
    # If you use a synchronous client, wrap with asyncio.to_thread:
    # import asyncio
    # ltp = await asyncio.to_thread(get_option_ltp, symbol, strike, direction, expiry)
    # ----------------------------------------------------------------------

    # Placeholder — replace with real Upstox call:
    raise HTTPException(
        status_code=501,
        detail="Implement get_option_ltp() using your Upstox options chain client",
    )

    return OptionsPriceResponse(
        symbol=symbol.upper(),
        strike=strike,
        direction=direction.upper(),
        ltp=ltp,
        expiry=expiry or "",
    )
