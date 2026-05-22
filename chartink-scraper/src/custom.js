import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import * as cheerio from 'cheerio';

const BASE_URL = 'https://chartink.com';
const PROCESS_URL = `${BASE_URL}/screener/process`;
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

export async function runCustomQuery(scanClause, cookies = '') {
  console.log(`\n  Running custom query:`);
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

  console.log(`  Calling screener process API...`);
  const processResponse = await client.post(
    PROCESS_URL,
    new URLSearchParams({ scan_clause: scanClause }).toString(),
    {
      headers: {
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-CSRF-TOKEN': csrfToken,
        'X-Requested-With': 'XMLHttpRequest',
        Referer: SCREENER_URL,
        Origin: BASE_URL,
      },
      timeout: 30000,
    }
  );

  return {
    queryName: 'custom-query',
    scanClause,
    fetchedAt: new Date().toISOString(),
    totalResults: processResponse.data?.data?.length ?? 0,
    data: processResponse.data,
  };
}
