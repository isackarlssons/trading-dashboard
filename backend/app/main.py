from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.routes import signals, positions, trades, strategies, position_actions, market_snapshots, risk

app = FastAPI(
    title="Trading Dashboard API",
    description="Personal trading dashboard - signals, positions, trades & stats",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS – hardcoded origins so it works regardless of env-var config
_cors_origins = [
    "https://trading-dashboard-leexeygz0-isackarlsson1997-gmailcoms-projects.vercel.app",
    "https://trading-dashboard-git-main-isackarlsson1997-gmailcoms-projects.vercel.app",
    "http://localhost:3000",
]
# Merge any extra origins coming from CORS_ORIGINS env var
for _o in settings.cors_origins_list:
    if _o and _o not in _cors_origins:
        _cors_origins.append(_o)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(strategies.router, prefix="/api/v1")
app.include_router(signals.router, prefix="/api/v1")
app.include_router(positions.router, prefix="/api/v1")
app.include_router(trades.router, prefix="/api/v1")
app.include_router(position_actions.router, prefix="/api/v1")
app.include_router(market_snapshots.router, prefix="/api/v1")
app.include_router(risk.router, prefix="/api/v1")


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
