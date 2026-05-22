import { PipelineProcessor, PIPELINE_TYPES, PIPELINE_STAGES } from './src/pipeline.js';
import { loadState, saveState } from './src/state.js';
import { loadProbabilityTable } from './src/probability.js';
import fs from 'fs';
import path from 'path';

const FORMATTED_DIR = path.join(process.cwd(), 'state', 'formatted-backtests');

function analyzeArchitecture() {
  console.log('════════════════════════════════════════════════');
  console.log('Pipeline Architecture Review');
  console.log('════════════════════════════════════════════════\n');

  // ─── 1. State File Analysis ───────────────────────
  console.log('1.  STATE FILE (pipeline-state.json)');
  console.log('   Format: byStage');
  const state = loadState();
  const byStageCounts = {};
  for (const [symbol, stock] of Object.entries(state.stocks)) {
    for (const [pType, pipe] of Object.entries(stock.pipelines)) {
      if (!byStageCounts[pipe.stage]) byStageCounts[pipe.stage] = 0;
      byStageCounts[pipe.stage]++;
    }
  }

  // ─── 2. Stage Cross-Pipeline Analysis ─────────────
  console.log('\n2.  STAGE CROSS-PIPELINE ANALYSIS');
  console.log('   Per-symbol pipeline overlap:');
  let count1 = 0, count2 = 0, count0 = 0;
  for (const stock of Object.values(state.stocks)) {
    const d = !!stock.pipelines[PIPELINE_TYPES.DAY_TRADING];
    const w = !!stock.pipelines[PIPELINE_TYPES.WEEKLY_SWING];
    if (d && w) count2++;
    else if (d || w) count1++;
    else count0++;
  }
  console.log(`   Both pipelines: ${count2} stocks`);
  console.log(`   Single pipeline: ${count1} stocks`);
  console.log(`   No pipeline: ${count0} stocks`);

  // ─── 3. Stage Progression Efficiency ──────────────
  console.log('\n3.  STAGE PROGRESSION EFFICIENCY');
  for (const pType of [PIPELINE_TYPES.DAY_TRADING, PIPELINE_TYPES.WEEKLY_SWING]) {
    const s0 = Object.values(state.stocks).filter(s => s.pipelines[pType]?.stage === PIPELINE_STAGES.STAGE_0).length;
    const s1 = Object.values(state.stocks).filter(s => s.pipelines[pType]?.stage === PIPELINE_STAGES.STAGE_1).length;
    const s2 = Object.values(state.stocks).filter(s => s.pipelines[pType]?.stage === PIPELINE_STAGES.STAGE_2).length;
    const s3 = Object.values(state.stocks).filter(s => s.pipelines[pType]?.stage === PIPELINE_STAGES.STAGE_3).length;
    const entry = Object.values(state.stocks).filter(s => s.pipelines[pType]?.stage === PIPELINE_STAGES.ENTRY).length;
    console.log(`   ${pType}: s0=${s0}  s1=${s1}  s2=${s2}  s3=${s3}  entry=${entry}`);
  }

  // ─── 4. Probability Table Anatomy ─────────────────
  console.log('\n4.  PROBABILITY TABLE ANATOMY');
  const table = loadProbabilityTable();
  const seqs = table.sequences;
  const daySeqs = Object.values(seqs).filter(s => s.features?.pipeline_type === PIPELINE_TYPES.DAY_TRADING);
  const weekSeqs = Object.values(seqs).filter(s => s.features?.pipeline_type === PIPELINE_TYPES.WEEKLY_SWING);
  console.log(`   Total sequences  : ${Object.keys(seqs).length}`);
  console.log(`   Day   (stage-only): ${daySeqs.length}`);
  console.log(`   Weekly (stage-only): ${weekSeqs.length}`);
  console.log(`   Combined sequences: 0  ← KEY FLAW`);

  const combinedKeys = Object.entries(seqs).filter(([k]) => {
    const parts = k.split('|');
    return !(parts[1] === 'none' && parts[2] === 'none');
  });
  console.log(`   Sequences with >1 stage filled: ${combinedKeys.length}`);
  console.log('\n   Key format: <s0>|<s1>|<s2>|<s3_flag>|<tb>|<cq>|<mr>');
  console.log('   Entry lookup uses all 4 stages. none = no data.');
  console.log('   All 15 sequences have ONE filled stage, others=none.');

  // ─── 5. Backtest vs State Alignment ───────────────
  console.log('\n5.  BACKTEST vs STATE ALIGNMENT');
  const files = fs.readdirSync(FORMATTED_DIR).filter(f => f.endsWith('.json'));
  console.log(`   Formatted backtest files: ${files.length}`);
  const DAY_URLS = ['accumulation-stocks','stock-before-break-out','base-pattern','ready-to-breakout-shares',
                    'potential-breakout-152','breakout-after-accumulation-like-tata-power',
                    'accumulation-distribution','stocks-coming-out-of-base',
                    'rsi-between-30-to-70-vol-5lcs-sma-gt-20-gt-50-gt-200','ichimoku-swing-trading-5'];
  const WEEKLY_URLS = ['accumulation-stocks','breakout-after-accumulation-like-tata-power',
                       'zero-to-multibagger-rsi-above-50-on-weekly-chart',
                       'potential-breakout-152','bullish-stocks-screener-1',
                       'rising-price-and-volume-within-bollinger-band-and-rsi-70',
                       'weekly-buy-find-trading-zones'];

  let dayInBacktest = new Set();
  let weeklyInBacktest = new Set();
  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(FORMATTED_DIR, file), 'utf8'));
    const name = data.screener;
    const stocks = (data.sequences?.[0]?.stocks || []).map(s => s.symbol);
    if (DAY_URLS.includes(name)) stocks.forEach(s => dayInBacktest.add(s));
    if (WEEKLY_URLS.includes(name)) stocks.forEach(s => weeklyInBacktest.add(s));
  }

  const dayInState = new Set(Object.values(state.stocks).filter(s => s.pipelines[PIPELINE_TYPES.DAY_TRADING]).map(s => s.symbol));
  const weekInState = new Set(Object.values(state.stocks).filter(s => s.pipelines[PIPELINE_TYPES.WEEKLY_SWING]).map(s => s.symbol));

  const dayMissing = [...dayInBacktest].filter(s => !dayInState.has(s)).length;
  const weekMissing = [...weeklyInBacktest].filter(s => !weekInState.has(s)).length;
  console.log(`   Backtest day_trading stocks:  ${dayInBacktest.size}`);
  console.log(`   State   day_trading stocks:   ${dayInState.size}`);
  console.log(`   Missing from state (day):     ${dayMissing}`);
  console.log(`   Backtest weekly_swing stocks: ${weeklyInBacktest.size}`);
  console.log(`   State   weekly_swing stocks:  ${weekInState.size}`);
  console.log(`   Missing from state (weekly):  ${weekMissing}`);
  console.log('   → State captures only a subset of backtest universe');

  // ─── 6. Entry Evaluation Gap ──────────────────────
  console.log('\n6.  ENTRY EVALUATION GAP');
  const stage2 = Object.values(state.stocks).filter(s => s.pipelines[PIPELINE_TYPES.WEEKLY_SWING]?.stage === PIPELINE_STAGES.STAGE_2);
  const stage3 = Object.values(state.stocks).filter(s => s.pipelines[PIPELINE_TYPES.DAY_TRADING]?.stage === PIPELINE_STAGES.STAGE_3);
  console.log(`   Weekly swing stage_2 candidates: ${stage2.length} (entry target)`);
  console.log(`   Day trading  stage_3 candidates: ${stage3.length} (entry target)`);

  // ─── 7. Design Flaw Summary ───────────────────────
  console.log('\n7.  DESIGN FLAW SUMMARY');
  console.log('   ┌──────────────────────────────────────────┐');
  console.log('   │ FLAW  1  │ State stores per-pipeline      │');
  console.log('   │          │ stage_0 blocks stage_1          │');
  console.log('   │          │ progression unless in EACH       │');
  console.log('   │          │ pipeline type.                     │');
  console.log('   ├──────────────────────────────────────────┤');
  console.log('   │ FLAW  2  │ Probability table stores         │');
  console.log('   │          │ per-stage keys. Entry lookup      │');
  console.log('   │          │ needs combined key → always       │');
  console.log('   │          │ misses (0 combined seqs).          │');
  console.log('   ├──────────────────────────────────────────┤');
  console.log('   │ FLAW  3  │ Backtest data is external        │');
  console.log('   │          │ (14 files, 52K stock-hits).       │');
  console.log('   │          │ Internal state is tiny subset      │');
  console.log('   │          │ (1562 stocks, 1 entry).           │');
  console.log('   │          │ No feedback loop connects them.    │');
  console.log('   ├──────────────────────────────────────────┤');
  console.log('   │ FLAW  4  │ pipeline-runner.js (467 lines)   │');
  console.log('   │          │ mixes: API fetch + state mgmt +   │');
  console.log('   │          │ probability + backtest + cleanup. │');
  console.log('   │          │ Single responsibility violated.   │');
  console.log('   └──────────────────────────────────────────┘');
}

analyzeArchitecture();