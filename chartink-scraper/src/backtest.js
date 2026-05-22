import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import * as cheerio from 'cheerio';
import { extractScanClause, extractScreenerName } from './chartink.js';

const BASE_URL = 'https://chartink.com';
const BACKTEST_PROCESS_URL = `${BASE_URL}/backtest/process`;
const SCREENER_URL_BASE = `${BASE_URL}/screener/`;
const SCREENER_URL = `${BASE_URL}/screener`;

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function createClient(extraCookies = '') {
  const jar = new CookieJar();

  if (extraCookies) {
    for (const pair of extraCookies.split(';')) {
      const [name, ...rest] = pair.trim().split('=');
      if (name && rest.length) {
        jar.setCookieSync(`${name.trim()}=${rest.join('=').trim()}`, BASE_URL);
      }
    }
  }

  return wrapper(
    axios.create({
      jar,
      withCredentials: true,
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })
  );
}

function extractCsrfToken(html) {
  const $ = cheerio.load(html);
  const metaToken = $('meta[name="csrf-token"]').attr('content');
  if (metaToken) return metaToken;
  const inputToken = $('input[name="_token"]').first().attr('value');
  if (inputToken) return inputToken;
  return null;
}

function screenerUrlFromBacktestUrl(url) {
  if (url.includes('/screener/')) return url;
  const slug = url.replace(/\/$/, '').split('/').pop();
  return `${SCREENER_URL_BASE}${slug}`;
}

export async function runBacktest(inputUrl, maxRows = 160, cookies = '') {
  const screenerUrl = screenerUrlFromBacktestUrl(inputUrl);
  const screenerName = extractScreenerName(screenerUrl);

  console.log(`\n  Fetching screener page for CSRF + scan clause: ${screenerUrl}`);

  const client = createClient(cookies);

  const pageResponse = await client.get(screenerUrl, {
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    timeout: 20000,
  });

  const html = pageResponse.data;

  const csrfToken = extractCsrfToken(html);
  if (!csrfToken) {
    throw new Error(
      'Could not extract CSRF token. Page structure may have changed or login is required.'
    );
  }
  console.log(`  CSRF token found: ${csrfToken.slice(0, 12)}...`);

  const scanClause = extractScanClause(html);
  if (!scanClause) {
    throw new Error('Could not extract scan clause. The screener may be private or deleted.');
  }
  console.log(`  Scan clause found: ${scanClause.slice(0, 60)}...`);
  console.log(`  Running backtest (max_rows=${maxRows})...`);

  const body = new URLSearchParams({
    max_rows: String(maxRows),
    scan_clause: scanClause,
  }).toString();

  const backtestResponse = await client.post(BACKTEST_PROCESS_URL, body, {
    headers: {
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-CSRF-TOKEN': csrfToken,
      'X-Requested-With': 'XMLHttpRequest',
      Referer: `${BASE_URL}/backtest/${screenerName}`,
      Origin: BASE_URL,
    },
    timeout: 60000,
  });

  const data = backtestResponse.data;
  const sectorCount = Array.isArray(data?.groups) ? data.groups.length : 0;

  return {
    sourceUrl: inputUrl,
    screenerUrl,
    screenerName,
    scanClause,
    maxRows,
    fetchedAt: new Date().toISOString(),
    sectorGroups: sectorCount,
    data,
  };
}

export async function runCustomBacktest(
  scanClause,
  maxRows = 160,
  cookies = '',
  queryName = 'custom-query'
) {
  console.log(`\n  Running custom backtest:`);
  console.log(`  ${scanClause.slice(0, 80)}${scanClause.length > 80 ? '...' : ''}`);

  const client = createClient(cookies);

  console.log(`  Fetching CSRF token from ${SCREENER_URL}`);
  const pageResponse = await client.get(SCREENER_URL, {
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    timeout: 15000,
  });

  const html = pageResponse.data;
  const csrfToken = extractCsrfToken(html);

  if (!csrfToken) {
    throw new Error(
      'Could not extract CSRF token. Page structure may have changed or login is required.'
    );
  }
  console.log(`  CSRF token found: ${csrfToken.slice(0, 12)}...`);
  console.log(`  Running backtest (max_rows=${maxRows})...`);

  const body = new URLSearchParams({
    max_rows: String(maxRows),
    scan_clause: scanClause,
  }).toString();

  const backtestResponse = await client.post(BACKTEST_PROCESS_URL, body, {
    headers: {
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-CSRF-TOKEN': csrfToken,
      'X-Requested-With': 'XMLHttpRequest',
      Referer: SCREENER_URL,
      Origin: BASE_URL,
    },
    timeout: 60000,
  });

  const data = backtestResponse.data;
  const sectorCount = Array.isArray(data?.groups) ? data.groups.length : 0;

  return {
    sourceUrl: 'custom-query',
    screenerUrl: SCREENER_URL,
    screenerName: queryName,
    scanClause,
    maxRows,
    fetchedAt: new Date().toISOString(),
    sectorGroups: sectorCount,
    data,
  };
}
