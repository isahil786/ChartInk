import { runCustomQuery } from './src/custom.js';
import { saveResponse, ensureResponsesDir } from './src/storage.js';
import fs from 'fs';
import path from 'path';

const CUSTOM_QUERIES_FILE = path.join(process.cwd(), 'custom-queries.json');

function loadCustomQueries() {
  if (fs.existsSync(CUSTOM_QUERIES_FILE)) {
    const content = JSON.parse(fs.readFileSync(CUSTOM_QUERIES_FILE, 'utf8'));
    if (Array.isArray(content) && content.length > 0) return content;
  }
  return [];
}

function loadCookies() {
  const cookieFile = path.join(process.cwd(), 'cookies.txt');
  if (fs.existsSync(cookieFile)) {
    return fs.readFileSync(cookieFile, 'utf8').trim();
  }
  return '';
}

function findQuery(queryName, queries) {
  const lowerName = queryName.toLowerCase();
  return queries.find((q) => q.name.toLowerCase() === lowerName || q.id === lowerName);
}

async function main() {
  const args = process.argv.slice(2);
  const queries = loadCustomQueries();
  const cookies = loadCookies();

  if (args.length === 0 && queries.length === 0) {
    console.error('No query specified and no custom-queries.json found.');
    console.error('  Usage: node custom-query.js <scan-clause> [--cookies file]');
    console.error('  Or:    node custom-query.js <query-name>');
    console.error(`  Available queries: ${queries.map((q) => q.name).join(', ')}`);
    process.exit(1);
  }

  ensureResponsesDir();

  console.log(`\nChartink Custom Query`);
  console.log(`${'='.repeat(40)}`);

  const scanClause = args[0];
  const query = findQuery(scanClause, queries);

  let result;
  if (query) {
    console.log(`Query name: ${query.name}`);
    result = await runCustomQuery(query.scan, cookies);
    result.queryName = query.name;
  } else {
    result = await runCustomQuery(scanClause, cookies);
  }

  const savedPath = saveResponse(result);

  console.log(`\n${'='.repeat(40)}`);
  console.log(`Done`);
  console.log(`  Stocks found: ${result.totalResults}`);
  console.log(`  Saved to    : ${savedPath}`);
  console.log('');
}

main();
