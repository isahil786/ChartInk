import fs from 'fs';
import path from 'path';

const DIR = 'state/formatted-backtests';
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.json'));

const PIPELINE_STAGE_MAP = {
  day_trading: {
    accumulation_stocks: 'stage_0',
    stock_before_break_out: 'stage_0',
    base_pattern: 'stage_0',
    ready_to_breakout_shares: 'stage_0',
    potential_breakout_152: 'stage_1',
    breakout_after_accumulation_like_tata_power: 'stage_1',
    accumulation_distribution: 'stage_2',
    stocks_coming_out_of_base: 'stage_2',
    rsi_between_30_to_70_vol_5lcs_sma_gt_20_gt_50_gt_200: 'stage_3',
    ichimoku_swing_trading_5: 'stage_3',
  },
  weekly_swing: {
    accumulation_stocks_ws: 'stage_0',
    breakout_after_accumulation_ws: 'stage_0',
    zero_to_multibagger_rsi_above_50_weekly: 'stage_0',
    potential_breakout_152_ws: 'stage_1',
    bullish_stocks_screener_1: 'stage_1',
    rising_price_and_volume_bollinger_rsi70: 'stage_2',
    weekly_buy_find_trading_zones: 'stage_2',
  },
};

const backtests = new Map();
for (const file of files) {
  const data = JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8'));
  backtests.set(data.screener, data);
}

const stageMap = PIPELINE_STAGE_MAP;
const stageKeys = ['stage_0', 'stage_1', 'stage_2', 'stage_3'];

for (const [pipelineType, screenerMap] of Object.entries(stageMap)) {
  const screenerByKey = {};
  for (const [key, stage] of Object.entries(screenerMap)) {
    const url = `https://chartink.com/screener/${key.replace(/_/g, '-')}`;
    screenerByKey[url] = { url, stage };
  }

  console.log(`\n${pipelineType} — matches: ` + Object.keys(screenerByKey).length);
  console.log('Matched:');
  let matched = 0;
  for (const [url, { stage }] of Object.entries(screenerByKey)) {
    const inBT = backtests.has(url);
    const bt = backtests.get(url);
    const count = bt?.sequences?.[0]?.stocks?.length || 0;
    const pipeline_bt = bt?.pipeline_type || 'none';
    if (inBT) {
      console.log(`  ✓ [${stage}] ${url} => ${count} stocks  (file pipeline=${pipeline_bt})`);
      matched++;
    }
  }
  console.log(`\nUnmatched:`);
  for (const [url, { stage }] of Object.entries(screenerByKey)) {
    if (!backtests.has(url)) console.log(`  ✗ [${stage}] ${url} → no backtest file`);
  }
}

// Demonstrate path-building for one stock
console.log('\n── ABB combined path (day_trading) ──');
const testScreener = 'https://chartink.com/screener/accumulation-distribution';
const bt = backtests.get('accumulation-distribution');
if (bt) {
  const seq0Stocks = (bt.sequences[0]?.stocks || []).map(s => s.symbol);
  console.log('Sequence[0] ABB in distribution:', seq0Stocks.includes('ABB'));
}