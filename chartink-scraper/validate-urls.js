import { runScreener } from './src/chartink.js';

const SCRAPER_URLS = {
  day_trading: {
    stage_0: [
      'https://chartink.com/screener/accumulation-stocks',
      'https://chartink.com/screener/stock-before-break-out',
      'https://chartink.com/screener/base-pattern',
      'https://chartink.com/screener/ready-to-breakout-shares',
    ],
    stage_1: [
      'https://chartink.com/screener/potential-breakout-152',
      'https://chartink.com/screener/breakout-after-accumulation-like-tata-power',
    ],
    stage_2: [
      'https://chartink.com/screener/accumulation-distribution',
      'https://chartink.com/screener/stocks-coming-out-of-base',
    ],
    stage_3: [
      'https://chartink.com/screener/rsi-between-30-to-70-vol-5lcs-sma-gt-20-gt-50-gt-200',
      'https://chartink.com/screener/ichimoku-swing-trading-5',
    ],
  },
  weekly_swing: {
    stage_0: [
      'https://chartink.com/screener/accumulation-stocks',
      'https://chartink.com/screener/breakout-after-accumulation-like-tata-power',
      'https://chartink.com/screener/zero-to-multibagger-rsi-above-50-on-weekly-chart',
    ],
    stage_1: [
      'https://chartink.com/screener/potential-breakout-152',
      'https://chartink.com/screener/bullish-stocks-screener-1',
    ],
    stage_2: [
      'https://chartink.com/screener/rising-price-and-volume-within-bollinger-band-and-rsi-70',
      'https://chartink.com/screener/weekly-buy-find-trading-zones',
    ],
  },
  multi_timeframe: {
    weekly: { stage_0: ['https://chartink.com/screener/breakout-after-accumulation-like-tata-power', 'https://chartink.com/screener/zero-to-multibagger-rsi-above-50-on-weekly-chart'] },
    daily:  { stage_0: ['https://chartink.com/screener/accumulation-stocks', 'https://chartink.com/screener/stock-before-break-out'] },
    hourly: { stage_0: ['https://chartink.com/screener/strong-bullish-swing-ver-2-with-volume', 'https://chartink.com/screener/adx-rsi-and-macd-breakout-stocks'] },
    minute_15: { stage_0: ['https://chartink.com/screener/15-min-breakout-with-high-volume'] },
    minute_5:  { stage_0: ['https://chartink.com/screener/intraday-trending-stocks-20'] },
  },
};

async function validateUrl(url, pipelineType, stage) {
  try {
    const result = await runScreener(url);
    const count = result.data?.data?.length || 0;
    return { ok: true, count, screenerName: result.screenerName };
  } catch (err) {
    return { ok: false, error: err.message, count: 0 };
  }
}

async function runValidation() {
  console.log('Pipeline URL Validation');
  console.log('======================\n');

  const cookies = '';
  const results = { ok: [], fail: [] };

  for (const [pipeline, config] of Object.entries(SCRAPER_URLS)) {
    for (const [stageName, urls] of Object.entries(config)) {
      if (!Array.isArray(urls)) {
        // Nested config like multi_timeframe.weekly, .daily, etc.
        for (const [subStage, subUrls] of Object.entries(urls)) {
          for (const url of subUrls) {
            console.log(`[${pipeline}/${stageName}/${subStage}] ${url}`);
            const r = await validateUrl(url, pipeline, stageName + '/' + subStage);
            if (r.ok) {
              console.log(`  ✓ ${r.count} stocks  (${r.screenerName})`);
              results.ok.push({ pipeline, stage: stageName + '/' + subStage, url, count: r.count, name: r.screenerName });
            } else {
              console.log(`  ✗ FAILED: ${r.error}`);
              results.fail.push({ pipeline, stage: stageName + '/' + subStage, url, error: r.error });
            }
          }
        }
        continue;
      }
      for (const url of urls) {
        console.log(`[${pipeline}/${stageName}] ${url}`);
        const r = await validateUrl(url, pipeline, stageName);
        if (r.ok) {
          console.log(`  ✓ ${r.count} stocks  (${r.screenerName})`);
          results.ok.push({ pipeline, stage: stageName, url, count: r.count, name: r.screenerName });
        } else {
          console.log(`  ✗ FAILED: ${r.error}`);
          results.fail.push({ pipeline, stage: stageName, url, error: r.error });
        }
      }
    }
  }

  console.log('\n' + '='.repeat(55));
  console.log('Summary');
  console.log('='.repeat(55));
  console.log(`Total URLs: ${results.ok.length + results.fail.length}`);
  console.log(`OK:         ${results.ok.length}`);
  console.log(`Failed:     ${results.fail.length}`);

  console.log('\nWorking URLs:');
  for (const r of results.ok) {
    console.log(`  [${r.pipeline}/${r.stage}] ${r.url} => ${r.count} stocks (${r.name})`);
  }

  if (results.fail.length > 0) {
    console.log('\nFailed URLs:');
    for (const r of results.fail) {
      console.log(`  [${r.pipeline}/${r.stage}] ${r.url} => ${r.error}`);
    }
  }

  console.log('\nSequence Execution Check:');
  for (const r of results.ok) {
    console.log(`  ${r.pipeline}/${r.stage}: ${r.count} stocks returned, ready`);
  }
}

runValidation();