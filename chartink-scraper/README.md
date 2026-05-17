# Chartink Screener Fetcher

A Node.js script that fetches data from Chartink screener URLs and saves the responses as JSON files.

## Setup

```bash
cd chartink-scraper
npm install
```

## Usage

### Option 1 — Edit `screeners.json`

Add your screener URLs to `screeners.json`:

```json
[
  "https://chartink.com/screener/copy-fibonacci-61-8-buy-daily-55",
  "https://chartink.com/screener/another-screener"
]
```

Then run:

```bash
node index.js
```

### Option 2 — Pass URLs as arguments

```bash
node index.js https://chartink.com/screener/copy-fibonacci-61-8-buy-daily-55
```

## Output

Responses are saved in the `responses/` folder as JSON files:

```
responses/
  copy-fibonacci-61-8-buy-daily-55_2024-05-17_10-30-00.json
```

Each file contains:
- `screenerUrl` — the original URL
- `screenerName` — slug extracted from the URL
- `scanClause` — the formula used by the screener
- `fetchedAt` — ISO timestamp
- `totalResults` — number of stocks returned
- `data` — full API response from Chartink

## Private Screeners / Login Required

If you get an error about missing scan clauses or authentication, you need to provide session cookies:

1. Open Chrome and log in to [chartink.com](https://chartink.com)
2. Open DevTools → Application → Cookies → `https://chartink.com`
3. Copy the value of the `chartink_session` cookie
4. Create a file called `cookies.txt` in this folder:

```
chartink_session=<your-cookie-value>
```

The script will automatically load cookies from `cookies.txt` if it exists.

## Notes

- The script waits 1.5 seconds between requests to avoid rate limiting
- Chartink does not provide an official public API; this tool uses the same endpoint the website uses internally
- Public screeners work without login; private or saved screeners may require cookies
