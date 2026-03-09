from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.routes import signals, positions, trades, strategies

app = FastAPI(
    title="Trading Dashboard API",
    description="Personal trading dashboard - signals, positions, trades & stats",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS (temporary: allow all origins for debugging)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(strategies.router, prefix="/api/v1")
app.include_router(signals.router, prefix="/api/v1")
app.include_router(positions.router, prefix="/api/v1")
app.include_router(trades.router, prefix="/api/v1")


@app.get("/")
async def root():
    return {"message": "Trading Dashboard API", "version": "1.0.0"}


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/pending")
async def get_pending():
    return []


@app.get("/open")
async def get_open():
    return []


@app.get("/stats")
async def get_stats():
    return {
        "totalTrades": 0,
        "winRate": 0,
        "pnl": 0
    }
