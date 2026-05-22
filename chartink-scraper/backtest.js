import { runBacktest, runCustomBacktest } from './src/backtest.js';
import { saveBacktestResponse, ensureResponsesDir } from './src/storage.js';
import fs from 'fs';
import path from 'path';

const BACKTESTS_FILE = path.join(process.cwd(), 'backtests.json');
const CUSTOM_QUERIES_FILE = path.join(process.cwd(), 'custom-queries.json');

function loadCustomQueries() {
  if (fs.existsSync(CUSTOM_QUERIES_FILE)) {
    const content = JSON.parse(fs.readFileSync(CUSTOM_QUERIES_FILE, 'utf8'));
    if (Array.isArray(content) && content.length > 0) return content;
  }
  return [];
}

function findQuery(queryName, queries) {
  const lowerName = queryName.toLowerCase();
  return queries.find((q) => q.name.toLowerCase() === lowerName || q.id === lowerName);
}

function loadBacktests() {
  const httpArgs = process.argv.slice(2).filter((a) => a.startsWith('http'));
  if (httpArgs.length > 0) {
    return httpArgs.map((url) => ({ type: 'screener', url, max_rows: 160 }));
  }

  const customArgs = process.argv.slice(2).filter((a) => !a.startsWith('http'));
  if (customArgs.length > 0) {
    const queries = loadCustomQueries();
    return customArgs.map((name) => {
      const query = findQuery(name, queries);
      return {
        type: 'custom',
        scan: query ? query.scan : name,
        queryName: query ? query.name : name,
        max_rows: 160,
      };
    });
  }

  if (fs.existsSync(BACKTESTS_FILE)) {
    const content = JSON.parse(fs.readFileSync(BACKTESTS_FILE, 'utf8'));
    if (Array.isArray(content) && content.length > 0) {
      return content.map((e) => ({ ...e, type: 'screener' }));
    }
  }

  console.error('No backtest entries found.');
  console.error('  Option 1: Add entries to backtests.json (array of { url, max_rows })');
  console.error('  Option 2: Pass screener URLs as arguments — node backtest.js <url1> <url2>');
  console.error(
    '  Option 3: Pass custom query names — node backtest.js ma-alignment rsi-divergence'
  );
  console.error(
    "  Option 4: Pass scan clause directly — node backtest.js '(close > ema(close, 20))'"
  );
  process.exit(1);
}

function loadCookies() {
  const cookieFile = path.join(process.cwd(), 'cookies.txt');
  if (fs.existsSync(cookieFile)) {
    return fs.readFileSync(cookieFile, 'utf8').trim();
  }
  return '';
}

async function main() {
  const entries = loadBacktests();
  const cookies = loadCookies();

  ensureResponsesDir();

  console.log(`\nChartink Backtest Fetcher`);
  console.log(`${'='.repeat(40)}`);
  console.log(`Backtests to run: ${entries.length}`);
  if (cookies) console.log(`Session cookies: loaded from cookies.txt`);
  console.log(`${'='.repeat(40)}`);

  const results = [];
  const errors = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    if (entry.type === 'custom') {
      console.log(`\n[${i + 1}/${entries.length}] Custom: ${entry.queryName}`);

      try {
        const result = await runCustomBacktest(
          entry.scan,
          entry.max_rows,
          cookies,
          entry.queryName
        );
        const savedPath = saveBacktestResponse(result);

        console.log(`  Sector groups : ${result.sectorGroups}`);
        console.log(`  Saved to      : ${savedPath}`);

        results.push({ url: entry.queryName, savedPath, sectorGroups: result.sectorGroups });
      } catch (err) {
        const message = err.response
          ? `HTTP ${err.response.status}: ${JSON.stringify(err.response.data).slice(0, 120)}`
          : err.message;

        console.error(`  ERROR: ${message}`);
        errors.push({ url: entry.queryName, error: message });
      }
    } else {
      console.log(`\n[${i + 1}/${entries.length}] ${entry.url}  (max_rows=${entry.max_rows})`);

      try {
        const result = await runBacktest(entry.url, entry.max_rows, cookies);
        const savedPath = saveBacktestResponse(result);

        console.log(`  Sector groups : ${result.sectorGroups}`);
        console.log(`  Saved to      : ${savedPath}`);

        results.push({ url: entry.url, savedPath, sectorGroups: result.sectorGroups });
      } catch (err) {
        const message = err.response
          ? `HTTP ${err.response.status}: ${JSON.stringify(err.response.data).slice(0, 120)}`
          : err.message;

        console.error(`  ERROR: ${message}`);
        errors.push({ url: entry.url, error: message });
      }
    }

    if (i < entries.length - 1) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  console.log(`\n${'='.repeat(40)}`);
  console.log(`Done`);
  console.log(`  Succeeded : ${results.length}`);
  console.log(`  Failed    : ${errors.length}`);

  if (results.length > 0) {
    console.log(`\nSaved files:`);
    results.forEach(({ savedPath, sectorGroups }) => {
      console.log(`  ${savedPath}  (${sectorGroups} sector groups)`);
    });
  }

  if (errors.length > 0) {
    console.log(`\nFailed backtests:`);
    errors.forEach(({ url, error }) => {
      console.log(`  ${url}`);
      console.log(`    Reason: ${error}`);
    });
    console.log(`\nTip: Backtests may require login. Add your session cookies to cookies.txt`);
    console.log(
      `  Open Chrome DevTools -> Application -> Cookies -> copy the value of "chartink_session"`
    );
    console.log(`  Then paste it into cookies.txt as: chartink_session=<value>`);
  }

  console.log('');
}

main();
