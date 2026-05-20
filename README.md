# Chartink Scraper Project

A Node.js tool for fetching data from Chartink screener and backtest APIs.

## Quick Start

```bash
# Fetch screener data
npm start
# or
node chartink-scraper/index.js

# Run backtest analysis
node chartink-scraper/backtest.js

# Process and generate CSV summaries
node chartink-scraper/process.js

# Start dashboard server
node chartink-scraper/server.js
```

## Project Structure

```
├── chartink-scraper/          # Main scraper application
│   ├── index.js              # Screener fetcher
│   ├── backtest.js           # Backtest runner
│   ├── process.js            # Data processor
│   ├── server.js             # Express dashboard
│   ├── screeners.json        # Screener URLs to fetch
│   ├── backtests.json        # Backtest configurations
│   ├── responses/            # Raw API responses
│   ├── processed/            # Processed CSV/JSON output
│   └── public/               # Dashboard frontend
├── artifacts/                # Build artifacts
│   └── api-server/           # API server (port 5000)
├── lib/                      # Shared libraries
└── scripts/                  # Utility scripts
```

## Available Commands

| Command | Description |
|---------|-------------|
| `npm start` | Fetch screener data |
| `node chartink-scraper/backtest.js` | Run backtest analysis |
| `node chartink-scraper/process.js` | Process data to CSV/JSON |
| `node chartink-scraper/server.js` | Start dashboard (port 3000) |

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `/dashboard/api/screeners` | List all screeners |
| `/dashboard/api/screeners/:slug` | Stocks for a screener |
| `/dashboard/api/backtests/:slug` | Backtest summary |
| `/dashboard/api/backtests/:slug/daily` | Daily signal counts |
| `/dashboard/api/backtests/:slug/sectors` | Sector breakdown |

## Authentication

For private screeners, create `chartink-scraper/cookies.txt`:
```
chartink_session=<your-cookie-value>
```

## Live URLs

**Dashboard:**
`https://cd37cc09-7d30-410e-9d7f-fc2dcf774a48-00-300bz7ov8de31.sisko.replit.dev:3000/dashboard/`

**API:**
`https://cd37cc09-7d30-410e-9d7f-fc2dcf774a48-00-300bz7ov8de31.sisko.replit.dev:3000/dashboard/api/screeners`

## Current Status

- **7 screeners** processed with CSV summaries
- **7 backtests** processed with daily/sector CSV files
- **Server running** on port 3000

## Ports

- **3000** - Dashboard server
- **5000** - API server