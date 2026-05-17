import { runBacktest } from "./src/backtest.js";
import { saveBacktestResponse, ensureResponsesDir } from "./src/storage.js";
import fs from "fs";
import path from "path";

const BACKTESTS_FILE = path.join(process.cwd(), "backtests.json");

function loadBacktests() {
  const args = process.argv.slice(2).filter((a) => a.startsWith("http"));
  if (args.length > 0) {
    return args.map((url) => ({ url, max_rows: 160 }));
  }

  if (fs.existsSync(BACKTESTS_FILE)) {
    const content = JSON.parse(fs.readFileSync(BACKTESTS_FILE, "utf8"));
    if (Array.isArray(content) && content.length > 0) return content;
  }

  console.error("No backtest entries found.");
  console.error(
    "  Option 1: Add entries to backtests.json (array of { url, max_rows })"
  );
  console.error(
    "  Option 2: Pass screener URLs as arguments — node backtest.js <url1> <url2>"
  );
  process.exit(1);
}

function loadCookies() {
  const cookieFile = path.join(process.cwd(), "cookies.txt");
  if (fs.existsSync(cookieFile)) {
    return fs.readFileSync(cookieFile, "utf8").trim();
  }
  return "";
}

async function main() {
  const entries = loadBacktests();
  const cookies = loadCookies();

  ensureResponsesDir();

  console.log(`\nChartink Backtest Fetcher`);
  console.log(`${"=".repeat(40)}`);
  console.log(`Backtests to run: ${entries.length}`);
  if (cookies) console.log(`Session cookies: loaded from cookies.txt`);
  console.log(`${"=".repeat(40)}`);

  const results = [];
  const errors = [];

  for (let i = 0; i < entries.length; i++) {
    const { url, max_rows = 160 } = entries[i];
    console.log(`\n[${i + 1}/${entries.length}] ${url}  (max_rows=${max_rows})`);

    try {
      const result = await runBacktest(url, max_rows, cookies);
      const savedPath = saveBacktestResponse(result);

      console.log(`  Sector groups : ${result.sectorGroups}`);
      console.log(`  Saved to      : ${savedPath}`);

      results.push({ url, savedPath, sectorGroups: result.sectorGroups });
    } catch (err) {
      const message = err.response
        ? `HTTP ${err.response.status}: ${JSON.stringify(err.response.data).slice(0, 120)}`
        : err.message;

      console.error(`  ERROR: ${message}`);
      errors.push({ url, error: message });
    }

    if (i < entries.length - 1) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  console.log(`\n${"=".repeat(40)}`);
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
    console.log(
      `\nTip: Backtests may require login. Add your session cookies to cookies.txt`
    );
    console.log(
      `  Open Chrome DevTools -> Application -> Cookies -> copy the value of "chartink_session"`
    );
    console.log(`  Then paste it into cookies.txt as: chartink_session=<value>`);
  }

  console.log("");
}

main();
