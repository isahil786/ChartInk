import fs from "fs";
import path from "path";

// ─── CSV helpers ────────────────────────────────────────────────────────────

function escapeCsv(val) {
  if (val === null || val === undefined) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function rowToCsv(row) {
  return row.map(escapeCsv).join(",");
}

function writeCsv(filePath, headers, rows) {
  const lines = [rowToCsv(headers), ...rows.map(rowToCsv)];
  fs.writeFileSync(filePath, lines.join("\n") + "\n", "utf8");
}

// ─── Screener processor ──────────────────────────────────────────────────────

export function processScreener(raw) {
  const stocks = raw.data?.data ?? [];

  if (stocks.length === 0) {
    return { type: "screener", rows: 0, csv: null, summary: null };
  }

  const headers = [
    "Sr",
    "NSE Code",
    "BSE Code",
    "Company Name",
    "Close (₹)",
    "% Change",
    "Volume",
  ];

  const rows = stocks.map((s) => [
    s.sr,
    s.nsecode,
    s.bsecode,
    s.name,
    s.close,
    s.per_chg,
    s.volume,
  ]);

  // Summary stats
  const gainers = stocks.filter((s) => s.per_chg > 0);
  const losers = stocks.filter((s) => s.per_chg < 0);
  const avgChange = (
    stocks.reduce((sum, s) => sum + s.per_chg, 0) / stocks.length
  ).toFixed(2);
  const avgVolume = Math.round(
    stocks.reduce((sum, s) => sum + s.volume, 0) / stocks.length
  );

  const summary = {
    totalStocks: stocks.length,
    gainers: gainers.length,
    losers: losers.length,
    avgPercentChange: Number(avgChange),
    avgVolume,
    topGainer: stocks.reduce(
      (best, s) => (s.per_chg > best.per_chg ? s : best),
      stocks[0]
    ),
    topLoser: stocks.reduce(
      (worst, s) => (s.per_chg < worst.per_chg ? s : worst),
      stocks[0]
    ),
  };

  return { type: "screener", rows: stocks.length, headers, csvRows: rows, summary };
}

// ─── Backtest processor ──────────────────────────────────────────────────────

export function processBacktest(raw) {
  const data = raw.data;
  if (!data) return { type: "backtest", error: "No data found" };

  const aggregatedStockList = data.aggregatedStockList ?? [];
  const groupData = data.groupData ?? {};
  const numDays = aggregatedStockList.length;

  // ── 1. Daily stocks CSV ──────────────────────────────────────────────────
  // aggregatedStockList[i] = flat array of [symbol, cap, sector, symbol, cap, sector, ...]
  const dailyHeaders = ["Day Index", "Symbol", "Cap Type", "Sector"];
  const dailyRows = [];

  for (let i = 0; i < numDays; i++) {
    const flat = aggregatedStockList[i] ?? [];
    for (let j = 0; j < flat.length; j += 3) {
      const symbol = flat[j];
      const cap = flat[j + 1];
      const sector = flat[j + 2];
      if (symbol) {
        dailyRows.push([i, symbol, cap, sector]);
      }
    }
  }

  // ── 2. Sector counts pivot CSV ───────────────────────────────────────────
  // groupData = { "0": { name, results: [{ formula: [count x numDays] }] }, ... }
  // Build: rows = day index, columns = sectors
  const sectorEntries = Object.values(groupData).map((g) => {
    const counts = g.results?.[0]
      ? Object.values(g.results[0])[0]
      : new Array(numDays).fill(0);
    return { name: g.name, counts };
  });

  const sectorNames = sectorEntries.map((e) => e.name);
  const sectorHeaders = ["Day Index", "Total Signals", ...sectorNames];
  const sectorRows = [];

  for (let i = 0; i < numDays; i++) {
    const colCounts = sectorEntries.map((e) => e.counts[i] ?? 0);
    const total = colCounts.reduce((sum, v) => sum + v, 0);
    sectorRows.push([i, total, ...colCounts]);
  }

  // ── 3. Summary stats ─────────────────────────────────────────────────────
  const totalSignals = dailyRows.length;
  const activeDays = aggregatedStockList.filter((a) => a.length > 0).length;

  // Most frequent symbols
  const symbolFreq = {};
  for (const [, symbol] of dailyRows) {
    symbolFreq[symbol] = (symbolFreq[symbol] ?? 0) + 1;
  }
  const topSymbols = Object.entries(symbolFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([sym, count]) => ({ symbol: sym, appearances: count }));

  // Peak day
  const dayCounts = aggregatedStockList.map((a) => Math.floor(a.length / 3));
  const peakCount = Math.max(...dayCounts);
  const peakDay = dayCounts.indexOf(peakCount);

  // Sector totals
  const sectorTotals = sectorEntries
    .map((e) => ({
      sector: e.name,
      total: e.counts.reduce((s, v) => s + v, 0),
    }))
    .sort((a, b) => b.total - a.total);

  const summary = {
    totalDays: numDays,
    activeDays,
    totalSignalOccurrences: totalSignals,
    avgSignalsPerActiveDay:
      activeDays > 0 ? (totalSignals / activeDays).toFixed(2) : 0,
    peakDay,
    peakDaySignalCount: peakCount,
    topSymbols,
    sectorTotals,
  };

  return {
    type: "backtest",
    totalDays: numDays,
    totalSignals,
    dailyHeaders,
    dailyRows,
    sectorHeaders,
    sectorRows,
    summary,
  };
}

// ─── Write processed outputs ─────────────────────────────────────────────────

const PROCESSED_DIR = path.join(process.cwd(), "processed");

export function ensureProcessedDirs() {
  ["", "screeners", "backtests"].forEach((sub) => {
    const dir = path.join(PROCESSED_DIR, sub);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });
}

export function writeScreenerOutput(result, screenerName) {
  ensureProcessedDirs();
  const base = path.join(PROCESSED_DIR, "screeners", screenerName);

  // CSV
  const csvPath = `${base}.csv`;
  writeCsv(csvPath, result.headers, result.csvRows);

  // Summary JSON
  const summaryPath = `${base}_summary.json`;
  fs.writeFileSync(summaryPath, JSON.stringify(result.summary, null, 2), "utf8");

  return { csvPath, summaryPath };
}

export function writeBacktestOutput(result, screenerName) {
  ensureProcessedDirs();
  const base = path.join(PROCESSED_DIR, "backtests", screenerName);

  // Daily stocks CSV
  const dailyCsvPath = `${base}_daily_stocks.csv`;
  writeCsv(dailyCsvPath, result.dailyHeaders, result.dailyRows);

  // Sector counts pivot CSV
  const sectorCsvPath = `${base}_sector_counts.csv`;
  writeCsv(sectorCsvPath, result.sectorHeaders, result.sectorRows);

  // Summary JSON
  const summaryPath = `${base}_summary.json`;
  fs.writeFileSync(summaryPath, JSON.stringify(result.summary, null, 2), "utf8");

  return { dailyCsvPath, sectorCsvPath, summaryPath };
}
