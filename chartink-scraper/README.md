# Chartink Fetcher

A Node.js tool that fetches data from Chartink screener and backtest APIs, saving all responses as JSON files.

## Setup

```bash
cd chartink-scraper
npm install
```

---

## Screener — `node index.js`

Fetches the current stock list from a screener.

### Configure `screeners.json`

```json
[
  "https://chartink.com/screener/copy-fibonacci-61-8-buy-daily-55",
  "https://chartink.com/screener/another-screener"
]
```

### Run

```bash
node index.js

# Or pass URLs directly as arguments:
node index.js https://chartink.com/screener/copy-fibonacci-61-8-buy-daily-55
```

### Output

Saved in `responses/` as timestamped JSON files:

```
responses/
  copy-fibonacci-61-8-buy-daily-55_2024-05-17_10-30-00.json
```

Each file contains:
- `screenerUrl` — original URL
- `screenerName` — slug from the URL
- `scanClause` — scan formula extracted from the page
- `fetchedAt` — ISO timestamp
- `totalResults` — number of stocks returned
- `data` — full Chartink response (stock symbols, prices, % change, volume)

---

## Backtest — `node backtest.js`

Runs the screener formula against historical data via Chartink's backtest API.

### Configure `backtests.json`

```json
[
  {
    "url": "https://chartink.com/screener/copy-fibonacci-61-8-buy-daily-55",
    "max_rows": 160
  }
]
```

- `url` — screener URL (screener or backtest URL, both work)
- `max_rows` — number of historical rows to return (default: 160)

### Run

```bash
node backtest.js

# Or pass screener URLs directly:
node backtest.js https://chartink.com/screener/copy-fibonacci-61-8-buy-daily-55
```

### Output

Saved in `responses/backtests/` as timestamped JSON files:

```
responses/
  backtests/
    copy-fibonacci-61-8-buy-daily-55_2024-05-17_10-31-00.json
```

Each file contains:
- `sourceUrl` — input URL
- `screenerUrl` — screener page used for CSRF + scan clause
- `screenerName` — slug
- `scanClause` — scan formula
- `maxRows` — rows requested
- `fetchedAt` — ISO timestamp
- `sectorGroups` — number of sectors in the response
- `data` — full backtest response (sector-grouped time-series: how many stocks per sector triggered the condition on each historical day)

---

## Private Screeners / Login Required

If you see errors about CSRF or missing scan clauses, you need to provide session cookies:

1. Open Chrome and log in to [chartink.com](https://chartink.com)
2. Open DevTools → Application → Cookies → `https://chartink.com`
3. Copy the value of the `chartink_session` cookie
4. Create a file called `cookies.txt` in this folder:

```
chartink_session=<your-cookie-value>
```

Both scripts automatically load `cookies.txt` if it exists.

---

## Notes

- The screener script waits 1.5 seconds between requests; backtest waits 2 seconds — to avoid rate limiting
- Chartink does not provide an official public API; this tool uses the same endpoints the website uses internally
- Public screeners work without login; private or deleted screeners may require cookies

## Tool Verification

| Tool | Command | Status |
|------|---------|--------|
| Screener | `node index.js <url>` | ✓ Public screeners fetch successfully |
| Backtest | `node backtest.js <url>` | ✓ Backtests run with 26 sector groups |
| Backtest | `node backtest.js -q <name>` | ✓ Custom queries work |
| Custom Query | `node custom-query.js -q <name>` | ✓ On-demand scans work |
| Processing | `node backtest.js --process` | ✓ Generates CSV + summary JSON |

## API Server — `node server.js`

Runs an Express server with endpoints for fetching and serving screener data.

### CORS

The API supports cross-origin requests. All endpoints include `Access-Control-Allow-Origin: *` header.

### API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/fetch?screener=<url>` | Fetch screener(s) by URL (no save) |
| `GET /api/fetch?screener=<url1>&screener=<url2>` | Multiple URLs supported |
| `GET /api/screeners` | List available processed screeners |
| `GET /api/screeners/:slug` | Get stocks for a screener |
| `GET /api/backtests/:slug` | Get backtest summary |
| `GET /api/backtests/:slug/daily` | Get daily signal counts |
| `GET /api/backtests/:slug/sectors` | Get sector totals |
| `GET /api/backtests/:slug/stocks` | Get daily stocks list |

### API: Fetch Screener by URL

```bash
# Single URL
curl "http://localhost:3000/dashboard/api/fetch?screener=https://chartink.com/screener/ma-alignment"

# Multiple URLs
curl "http://localhost:3000/dashboard/api/fetch?screener=URL1&screener=URL2&screener=URL3"

# With session cookies (for private screeners)
curl "http://localhost:3000/dashboard/api/fetch?screener=URL&cookies=chartink_session=VALUE"
```

Note: CSRF token is extracted automatically from the page. Only use `cookies` parameter for private screeners requiring login.

Returns:
```json
{
  "success": true,
  "data": [
    {
      "url": "https://chartink.com/screener/...",
      "result": { "screenerName": "...", "totalResults": N, "data": [...] }
    }
  ]
}
```
