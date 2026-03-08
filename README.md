# Trading Dashboard

Personal trading dashboard for tracking signals, positions, and trades.

## Architecture

```
trading-dashboard/
├── frontend/          # Next.js + TypeScript + Tailwind
├── backend/           # FastAPI (Python)
└── supabase/          # Database schema & migrations
```

## Tech Stack

- **Frontend**: Next.js 14 + TypeScript + Tailwind CSS
- **Backend**: FastAPI + SQLAlchemy
- **Database/Auth**: Supabase (PostgreSQL)
- **Hosting**: Vercel (frontend) + Render/Railway (backend)

## Features (v1)

- ✅ View trading signals
- ✅ Mark signal as taken (creates position)
- ✅ View open positions
- ✅ Close position manually (creates trade record)
- ✅ View trade history
- ✅ Trading statistics (win rate, P&L, profit factor, etc.)

## Database Models

| Table | Description |
|-------|-------------|
| `strategies` | Trading strategies (zone_wide_us, etc.) |
| `signals` | Generated trading signals |
| `positions` | Open/closed positions |
| `trades` | Completed trades with P&L |
| `market_snapshots` | Market data snapshots |
| `bot_runs` | Bot execution logs |

## Local Setup

### 1. Supabase (Database & Auth)

```bash
# Install Supabase CLI
npm install -g supabase

# Start local Supabase
supabase init
supabase start

# Note the output URLs and keys, update .env files accordingly

# Run the schema
# Copy supabase/schema.sql content into Supabase SQL Editor
# Or use: psql -h localhost -p 54322 -U postgres -d postgres -f supabase/schema.sql
```

After starting Supabase locally, create a user:
1. Go to http://localhost:54323 (Supabase Studio)
2. Go to Authentication → Users → Add User
3. Create your user with email/password

### 2. Backend (FastAPI)

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Linux/Mac
# venv\Scripts\activate   # Windows

# Install dependencies
pip install -r requirements.txt

# Update .env with your Supabase credentials
cp .env.example .env
# Edit .env with actual values from `supabase status`

# Run database migrations
alembic revision --autogenerate -m "initial"
alembic upgrade head

# Start the server
uvicorn app.main:app --reload --port 8000
```

API docs available at: http://localhost:8000/docs

### 3. Frontend (Next.js)

```bash
cd frontend

# Install dependencies
npm install

# Update environment variables
cp .env.local.example .env.local
# Edit .env.local with actual Supabase values

# Start dev server
npm run dev
```

Frontend available at: http://localhost:3000

## API Endpoints

### Strategies
- `GET /api/v1/strategies/` - List all strategies
- `POST /api/v1/strategies/` - Create strategy

### Signals
- `GET /api/v1/signals/` - List signals (with filters)
- `GET /api/v1/signals/pending` - Get pending signals
- `POST /api/v1/signals/` - Create signal
- `PATCH /api/v1/signals/{id}` - Update signal status
- `POST /api/v1/signals/bulk` - Bulk create signals

### Positions
- `GET /api/v1/positions/` - List positions
- `GET /api/v1/positions/open` - Get open positions
- `POST /api/v1/positions/` - Create position manually
- `POST /api/v1/positions/from-signal` - Take a signal → create position
- `POST /api/v1/positions/{id}/close` - Close position → creates trade

### Trades
- `GET /api/v1/trades/` - List trades
- `GET /api/v1/trades/stats` - Get trading statistics
- `GET /api/v1/trades/{id}` - Get specific trade

## Workflow

1. **Bot generates signals** → `POST /api/v1/signals/bulk`
2. **You review signals** → Dashboard shows pending signals
3. **Take a trade** → `POST /api/v1/positions/from-signal` (marks signal as taken)
4. **Monitor positions** → Dashboard shows open positions
5. **Close position** → `POST /api/v1/positions/{id}/close` (calculates P&L)
6. **Review stats** → Dashboard shows win rate, P&L, etc.
