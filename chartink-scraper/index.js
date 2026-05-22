import { runScreener } from './src/chartink.js';
import { saveResponse, ensureResponsesDir } from './src/storage.js';
import fs from 'fs';
import path from 'path';

const SCREENERS_FILE = path.join(process.cwd(), 'screeners.json');

function loadScreeners() {
  const args = process.argv.slice(2).filter((a) => a.startsWith('http'));
  if (args.length > 0) return args;

  if (fs.existsSync(SCREENERS_FILE)) {
    const content = JSON.parse(fs.readFileSync(SCREENERS_FILE, 'utf8'));
    if (Array.isArray(content) && content.length > 0) return content;
  }

  console.error('No screener URLs found.');
  console.error('  Option 1: Add URLs to screeners.json (array of strings)');
  console.error('  Option 2: Pass URLs as arguments — node index.js <url1> <url2>');
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
  const screeners = loadScreeners();
  const cookies = loadCookies();

  ensureResponsesDir();

  console.log(`\nChartink Screener Fetcher`);
  console.log(`${'='.repeat(40)}`);
  console.log(`Screeners to fetch: ${screeners.length}`);
  if (cookies) console.log(`Session cookies: loaded from cookies.txt`);
  console.log(`${'='.repeat(40)}`);

  const results = [];
  const errors = [];

  for (let i = 0; i < screeners.length; i++) {
    const url = screeners[i].trim();
    console.log(`\n[${i + 1}/${screeners.length}] ${url}`);

    try {
      const result = await runScreener(url, cookies);
      const savedPath = saveResponse(result);

      console.log(`  Stocks found  : ${result.totalResults}`);
      console.log(`  Saved to      : ${savedPath}`);

      results.push({ url, savedPath, totalResults: result.totalResults });
    } catch (err) {
      const message = err.response
        ? `HTTP ${err.response.status}: ${err.response.statusText}`
        : err.message;

      console.error(`  ERROR: ${message}`);
      errors.push({ url, error: message });
    }

    if (i < screeners.length - 1) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  console.log(`\n${'='.repeat(40)}`);
  console.log(`Done`);
  console.log(`  Succeeded : ${results.length}`);
  console.log(`  Failed    : ${errors.length}`);

  if (results.length > 0) {
    console.log(`\nSaved files:`);
    results.forEach(({ savedPath, totalResults }) => {
      console.log(`  ${savedPath}  (${totalResults} stocks)`);
    });
  }

  if (errors.length > 0) {
    console.log(`\nFailed screeners:`);
    errors.forEach(({ url, error }) => {
      console.log(`  ${url}`);
      console.log(`    Reason: ${error}`);
    });
    console.log(
      `\nTip: If errors are about CSRF or login, add your session cookies to cookies.txt`
    );
    console.log(
      `  Open Chrome DevTools -> Application -> Cookies -> copy the value of "chartink_session"`
    );
    console.log(`  Then paste it into cookies.txt as: chartink_session=<value>`);
  }

  console.log('');
}

main();
