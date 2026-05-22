import fs from 'fs';
import path from 'path';

const DIR = 'state/formatted-backtests';
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.json'));

const backtests = new Map();
for (const file of files) {
  const data = JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8'));
  backtests.set(data.screener, data);
}

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
    accumulation_stocks: 'stage_0',
    breakout_after_accumulation_like_tata_power: 'stage_0',
    zero_to_multibagger_rsi_above_50_on_weekly_chart: 'stage_0',
    potential_breakout_152: 'stage_1',
    bullish_stocks_screener_1: 'stage_1',
    rising_price_and_volume_within_bollinger_band_and_rsi_70: 'stage_2',
    weekly_buy_find_trading_zones: 'stage_2',
  },
};

for (const [pipelineType, screenerMap] of Object.entries(PIPELINE_STAGE_MAP)) {
  console.log(`\n${pipelineType}:`);
  for (const [key, stage] of Object.entries(screenerMap)) {
    const name = key.replace(/_/g, '-');
    const bt = backtests.get(name);
    if (bt) {
      const count = (bt.sequences?.[0]?.stocks || []).length;
      const pipeline_bt = bt.pipeline_type || 'none';
      console.log(`  ✓ [${stage}] ${name}: ${count} stocks  (file pipeline=${pipeline_bt})`);
    } else {
      console.log(`  ✗ [${stage}] ${name} → NOT FOUND`);
    }
  }
}