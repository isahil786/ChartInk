import fs from 'fs';
import path from 'path';
import { loadProbabilityTable, trainFromBacktest } from './src/probability.js';

const FORMATTED_DIR = path.join(process.cwd(), 'state', 'formatted-backtests');

function parseBacktestFile(filepath) {
  const content = fs.readFileSync(filepath, 'utf8');
  return JSON.parse(content);
}

async function main() {
  console.log('Backtest to Probability Training');
  console.log('================================\n');

  const files = fs.readdirSync(FORMATTED_DIR).filter((f) => f.endsWith('.json'));

  if (files.length === 0) {
    console.log('No formatted backtest files found. Run pipeline with --backtest first:');
    console.log('  node pipeline-runner.js --day --backtest');
    process.exit(0);
  }

  console.log(`Found ${files.length} formatted backtest files\n`);

  const table = loadProbabilityTable();

  const backtestResults = [];

  for (const file of files) {
    const filepath = path.join(FORMATTED_DIR, file);
    console.log(`Processing: ${file}`);

    const backtestData = parseBacktestFile(filepath);

    const result = {
      stage0_screener: backtestData.screener,
      stage1_screener: null,
      stage2_screener: null,
      stage3_screener: null,
      time_bucket: 'any',
      compression_quality: 'medium',
      market_regime: 'normal',
      pipeline_type: 'day_trading',
      success: backtestData.sequences.length > 0 && backtestData.sectorGroups > 0,
    };
    backtestResults.push(result);
  }

  const outcomeFunction = (r) => r.success;

  trainFromBacktest(table, backtestResults, outcomeFunction);

  console.log(`\nProbability table updated`);
  console.log(`Total sequences in table: ${table.metadata.totalSequences}`);
}

main();
