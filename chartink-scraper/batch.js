import fs from "fs";
import path from "path";
import { runScreener } from "./src/chartink.js";
import { runBacktest } from "./src/backtest.js";
import { saveResponse, saveBacktestResponse, ensureResponsesDir } from "./src/storage.js";
import {
  processScreener,
  processBacktest,
  writeScreenerOutput,
  writeBacktestOutput,
  ensureProcessedDirs,
} from "./src/processor.js";

// ─── Config ───────────────────────────────────────────────────────────────────

const DELAY_BETWEEN_CALLS_MS = 2000;
const DELAY_BETWEEN_URLS_MS = 3000;
const DEFAULT_MAX_ROWS = 160;

// ─── Links loader ─────────────────────────────────────────────────────────────

function loadLinks() {
  const candidates = [
    path.join(process.cwd(), "links.txt"),
    path.join(process.cwd(), "..", "links.txt"),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const lines = fs
        .readFileSync(p, "utf8")
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.startsWith("http"));
      if (lines.length > 0) {
        console.log(`  Links file    : ${p}`);
        return lines;
      }
    }
  }

  const args = process.argv.slice(2).filter((a) => a.startsWith("http"));
  if (args.length > 0) return args;

  console.error("No links found. Create links.txt with one Chartink URL per line.");
  process.exit(1);
}

function loadCookies() {
  const p = path.join(process.cwd(), "cookies.txt");
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8").trim() : "";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function slugFromUrl(url) {
  return url.replace(/\/$/, "").split("/").pop();
}

function bar(pct, width = 30) {
  const filled = Math.round((pct / 100) * width);
  return "[" + "█".repeat(filled) + "░".repeat(width - filled) + "]";
}

function printHeader(title) {
  const line = "─".repeat(62);
  console.log(`\n┌${line}┐`);
  console.log(`│  ${title.padEnd(60)}│`);
  console.log(`└${line}┘`);
}

function printStep(icon, label, value = "") {
  const v = value ? `  →  ${value}` : "";
  console.log(`  ${icon}  ${label}${v}`);
}

// ─── Single URL pipeline ──────────────────────────────────────────────────────

async function processUrl(url, index, total, cookies) {
  const slug = slugFromUrl(url);
  const pct = Math.round((index / total) * 100);

  printHeader(`[${index}/${total}] ${bar(pct)} ${pct}%  ${slug}`);

  const result = { url, slug, screener: null, backtest: null, errors: [] };

  // ── Screener ───────────────────────────────────────────────────────────────
  printStep("📥", "Screener fetch ...");
  try {
    const raw = await runScreener(url, cookies);
    const savedPath = saveResponse(raw);
    printStep("✔", "Raw saved", path.relative(process.cwd(), savedPath));

    const processed = processScreener(raw);
    if (processed.rows > 0) {
      const { csvPath, summaryPath } = writeScreenerOutput(processed, slug);
      printStep("✔", `Stocks found: ${processed.rows}`);
      printStep("✔", "CSV", path.relative(process.cwd(), csvPath));
      printStep("✔", "Summary", path.relative(process.cwd(), summaryPath));
      result.screener = { rows: processed.rows, csvPath, summaryPath };
    } else {
      printStep("⚠", "Screener returned 0 stocks (screener may be empty today)");
      result.screener = { rows: 0 };
    }
  } catch (err) {
    const msg = err.response
      ? `HTTP ${err.response.status}: ${err.message}`
      : err.message;
    printStep("✖", `Screener error: ${msg}`);
    result.errors.push({ step: "screener", error: msg });
  }

  await sleep(DELAY_BETWEEN_CALLS_MS);

  // ── Backtest ───────────────────────────────────────────────────────────────
  printStep("📊", `Backtest fetch (max_rows=${DEFAULT_MAX_ROWS}) ...`);
  try {
    const raw = await runBacktest(url, DEFAULT_MAX_ROWS, cookies);
    const savedPath = saveBacktestResponse(raw);
    printStep("✔", "Raw saved", path.relative(process.cwd(), savedPath));

    const processed = processBacktest(raw);
    if (!processed.error) {
      const { dailyCsvPath, sectorCsvPath, summaryPath } =
        writeBacktestOutput(processed, slug);
      const s = processed.summary;
      printStep("✔", `Date range: ${s.dateRange.from} → ${s.dateRange.to}`);
      printStep("✔", `Signals: ${processed.totalSignals}  |  Active days: ${s.activeDays}/${s.totalDays}`);
      printStep("✔", `Peak: ${s.peakDate} (${s.peakDaySignalCount} signals)`);
      printStep("✔", "Daily CSV", path.relative(process.cwd(), dailyCsvPath));
      printStep("✔", "Sector CSV", path.relative(process.cwd(), sectorCsvPath));
      result.backtest = {
        totalSignals: processed.totalSignals,
        activeDays: s.activeDays,
        dateFrom: s.dateRange.from,
        dateTo: s.dateRange.to,
        dailyCsvPath,
        sectorCsvPath,
        summaryPath,
      };
    } else {
      printStep("⚠", `Backtest: ${processed.error}`);
      result.errors.push({ step: "backtest", error: processed.error });
    }
  } catch (err) {
    const msg = err.response
      ? `HTTP ${err.response.status}: ${err.message}`
      : err.message;
    printStep("✖", `Backtest error: ${msg}`);
    result.errors.push({ step: "backtest", error: msg });
  }

  return result;
}

// ─── Final summary table ──────────────────────────────────────────────────────

function printFinalSummary(results) {
  console.log(`\n${"═".repeat(64)}`);
  console.log(`  BATCH COMPLETE — ${results.length} URLs processed`);
  console.log(`${"═".repeat(64)}`);

  const colW = [42, 8, 10];
  const header = [
    "Screener".padEnd(colW[0]),
    "Stocks".padEnd(colW[1]),
    "Signals".padEnd(colW[2]),
  ];
  console.log(`\n  ${header.join("  ")}`);
  console.log(`  ${"─".repeat(colW[0])}  ${"─".repeat(colW[1])}  ${"─".repeat(colW[2])}`);

  for (const r of results) {
    const hasError = r.errors.length > 0;
    const stocks = r.screener?.rows ?? "ERR";
    const signals = r.backtest?.totalSignals ?? "ERR";
    const flag = hasError ? " ⚠" : " ✔";
    console.log(
      `  ${r.slug.slice(0, colW[0]).padEnd(colW[0])}  ${String(stocks).padEnd(colW[1])}  ${String(signals).padEnd(colW[2])}${flag}`
    );
    if (hasError) {
      r.errors.forEach((e) =>
        console.log(`    ${e.step}: ${e.error.slice(0, 80)}`)
      );
    }
  }

  const totalStocks = results.reduce((s, r) => s + (r.screener?.rows ?? 0), 0);
  const totalSignals = results.reduce(
    (s, r) => s + (r.backtest?.totalSignals ?? 0),
    0
  );
  const errCount = results.filter((r) => r.errors.length > 0).length;

  console.log(`  ${"─".repeat(colW[0])}  ${"─".repeat(colW[1])}  ${"─".repeat(colW[2])}`);
  console.log(
    `  ${"TOTAL".padEnd(colW[0])}  ${String(totalStocks).padEnd(colW[1])}  ${String(totalSignals).padEnd(colW[2])}`
  );
  console.log(`\n  URLs with errors: ${errCount}`);
  console.log(
    `  Output folders  : processed/screeners/  &  processed/backtests/`
  );
  console.log("");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  ensureResponsesDir();
  ensureProcessedDirs();

  const links = loadLinks();
  const cookies = loadCookies();

  console.log(`\n${"═".repeat(64)}`);
  console.log(`  Chartink Batch Processor`);
  console.log(`${"═".repeat(64)}`);
  console.log(`  URLs to process : ${links.length}`);
  if (cookies) console.log(`  Cookies         : loaded from cookies.txt`);
  console.log(`  Steps per URL   : screener fetch → process → backtest fetch → process`);

  const results = [];

  for (let i = 0; i < links.length; i++) {
    const result = await processUrl(links[i], i + 1, links.length, cookies);
    results.push(result);

    if (i < links.length - 1) {
      console.log(`\n  Waiting ${DELAY_BETWEEN_URLS_MS / 1000}s before next URL...`);
      await sleep(DELAY_BETWEEN_URLS_MS);
    }
  }

  printFinalSummary(results);
}

main();
