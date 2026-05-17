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
