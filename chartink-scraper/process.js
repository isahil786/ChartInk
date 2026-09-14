import fs from 'fs';
import path from 'path';
import {
  processScreener,
  processBacktest,
  writeScreenerOutput,
  writeBacktestOutput,
  ensureProcessedDirs,
} from './src/processor.js';

const RESPONSES_DIR = path.join(process.cwd(), 'responses');
const BACKTESTS_DIR = path.join(RESPONSES_DIR, 'backtests');

function loadJsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ file: f, fullPath: path.join(dir, f) }));
}

function slugFromFileName(file) {
  // e.g. "copy-fibonacci-61-8-buy-daily-55_2026-05-17_07-31-01.json"
  // → "copy-fibonacci-61-8-buy-daily-55"
  return file.replace(/_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.json$/, '').replace(/\.json$/, '');
}

function printSummaryBox(label, lines) {
  const width = 60;
  console.log(`\n  ┌${'─'.repeat(width)}┐`);
  console.log(`  │  ${label.padEnd(width - 2)}│`);
  console.log(`  ├${'─'.repeat(width)}┤`);
  lines.forEach((l) => console.log(`  │  ${l.padEnd(width - 2)}│`));
  console.log(`  └${'─'.repeat(width)}┘`);
}

async function processAllScreeners() {
  const files = loadJsonFiles(RESPONSES_DIR);
  if (files.length === 0) {
    console.log('  No screener response files found.');
    return 0;
  }

  let successCount = 0;

  for (const { file, fullPath } of files) {
    const slug = slugFromFileName(file);
    console.log(`\n  [Screener] ${file}`);

    try {
      const raw = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      const result = processScreener(raw);

      if (result.rows === 0) {
        console.log('    Skipped — no stock data in this file.');
        continue;
      }

      const { csvPath, summaryPath } = writeScreenerOutput(result, slug);
      const s = result.summary;

      printSummaryBox(`${slug}`, [
        `Total stocks   : ${s.totalStocks}`,
        `Gainers        : ${s.gainers}   Losers: ${s.losers}`,
        `Avg % Change   : ${s.avgPercentChange}%`,
        `Avg Volume     : ${s.avgVolume.toLocaleString()}`,
        `Top Gainer     : ${s.topGainer.nsecode} (${s.topGainer.per_chg}%)`,
        `Top Loser      : ${s.topLoser.nsecode} (${s.topLoser.per_chg}%)`,
        `CSV saved      : ${path.relative(process.cwd(), csvPath)}`,
        `Summary saved  : ${path.relative(process.cwd(), summaryPath)}`,
      ]);

      successCount++;
    } catch (err) {
      console.error(`    ERROR: ${err.message}`);
    }
  }

  return successCount;
}

async function processAllBacktests() {
  const files = loadJsonFiles(BACKTESTS_DIR);
  if (files.length === 0) {
    console.log('  No backtest response files found.');
    return 0;
  }

  let successCount = 0;

  for (const { file, fullPath } of files) {
    const slug = slugFromFileName(file);
    console.log(`\n  [Backtest] ${file}`);

    try {
      const raw = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      const result = processBacktest(raw);

      if (result.error) {
        console.log(`    Skipped — ${result.error}`);
        continue;
      }

      const { dailyCsvPath, sectorCsvPath, summaryPath } = writeBacktestOutput(result, slug);
      const s = result.summary;

      const topSymbolsLine = s.topSymbols
        .slice(0, 3)
        .map((t) => `${t.symbol}(${t.appearances})`)
        .join(', ');

      const topSectorLine = s.sectorTotals
        .slice(0, 3)
        .map((t) => `${t.sector}(${t.total})`)
        .join(', ');

      printSummaryBox(`${slug} — Backtest`, [
        `Date range     : ${s.dateRange.from}  →  ${s.dateRange.to}`,
        `Total days     : ${s.totalDays}  (active: ${s.activeDays})`,
        `Total signals  : ${s.totalSignalOccurrences}`,
        `Avg/active day : ${s.avgSignalsPerActiveDay}`,
        `Peak date      : ${s.peakDate} (${s.peakDaySignalCount} signals)`,
        `Top symbols    : ${topSymbolsLine}`,
        `Top sectors    : ${topSectorLine}`,
        `Daily CSV      : ${path.relative(process.cwd(), dailyCsvPath)}`,
        `Sector CSV     : ${path.relative(process.cwd(), sectorCsvPath)}`,
        `Summary JSON   : ${path.relative(process.cwd(), summaryPath)}`,
      ]);

      successCount++;
    } catch (err) {
      console.error(`    ERROR: ${err.message}`);
    }
  }

  return successCount;
}

async function main() {
  ensureProcessedDirs();

  console.log(`\nChartink Data Processor`);
  console.log(`${'='.repeat(40)}`);

  console.log(`\nProcessing screeners...`);
  const screenerCount = await processAllScreeners();

  console.log(`\nProcessing backtests...`);
  const backtestCount = await processAllBacktests();

  console.log(`\n${'='.repeat(40)}`);
  console.log(`Done`);
  console.log(`  Screeners processed : ${screenerCount}`);
  console.log(`  Backtests processed : ${backtestCount}`);
  console.log(`\n  Output written to   : processed/screeners/  and  processed/backtests/`);
  console.log(`\nOutput files per screener:`);
  console.log(`  processed/screeners/<name>.csv               — stocks list (CSV)`);
  console.log(`  processed/screeners/<name>_summary.json      — stats summary`);
  console.log(`\nOutput files per backtest:`);
  console.log(`  processed/backtests/<name>_daily_stocks.csv  — per-day triggered stocks`);
  console.log(`  processed/backtests/<name>_sector_counts.csv — sector × day pivot table`);
  console.log(`  processed/backtests/<name>_summary.json      — stats summary`);
  console.log('');
}

main();
