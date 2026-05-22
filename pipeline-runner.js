import { PipelineProcessor, PIPELINE_TYPES } from './src/pipeline.js';
import { runScreener } from './src/chartink.js';
import { runBacktest } from './src/backtest.js';
import {
  loadProbabilityTable,
  saveProbabilityTable,
  updateTableWithResult,
} from './src/probability.js';
import fs from 'fs';
import path from 'path';

const SCRAPER_URLS = {
  day_trading: {
    stage_0: [
      'https://chartink.com/screener/rsi-between-30-to-70-vol-5lcs-sma-gt-20-gt-50-gt-200',
      'https://chartink.com/screener/ichimoku-swing-trading-5',
    ],
    stage_1: [
      'https://chartink.com/screener/accumulation-distribution',
      'https://chartink.com/screener/stocks-coming-out-of-base',
    ],
    stage_2: [
      'https://chartink.com/screener/potential-breakout-152',
      'https://chartink.com/screener/breakout-after-accumulation-like-tata-power',
    ],
    stage_3: [
      'https://chartink.com/screener/accumulation-stocks',
      'https://chartink.com/screener/stock-before-break-out',
      'https://chartink.com/screener/base-pattern',
      'https://chartink.com/screener/ready-to-breakout-shares',
    ],
  },
  weekly_swing: {
    stage_0: [
      'https://chartink.com/screener/rising-price-and-volume-within-bollinger-band-and-rsi-70',
      'https://chartink.com/screener/weekly-buy-find-trading-zones',
    ],
    stage_1: [
      'https://chartink.com/screener/accumulation-stocks',
      'https://chartink.com/screener/breakout-after-accumulation-like-tata-power',
      'https://chartink.com/screener/zero-to-multibagger-rsi-above-50-on-weekly-chart',
    ],
    stage_2: [
      'https://chartink.com/screener/potential-breakout-152',
      'https://chartink.com/screener/bullish-stocks-screener-1',
    ],
  },
  multi_timeframe: {
    weekly: {
      stage_0: [
        'https://chartink.com/screener/breakout-after-accumulation-like-tata-power',
        'https://chartink.com/screener/zero-to-multibagger-rsi-above-50-on-weekly-chart',
      ],
      stage_1: [
        'https://chartink.com/screener/eod-intra-day-long-list-weekly-impulse-daily-corrective',
      ],
    },
    daily: {
      stage_0: [
        'https://chartink.com/screener/accumulation-stocks',
        'https://chartink.com/screener/stock-before-break-out',
      ],
      stage_1: [
        'https://chartink.com/screener/potential-breakout-152',
      ],
    },
    hourly: {
      stage_0: [
        'https://chartink.com/screener/strong-bullish-swing-ver-2-with-volume',
        'https://chartink.com/screener/adx-rsi-and-macd-breakout-stocks',
      ],
    },
    minute_15: {
      stage_0: [
        'https://chartink.com/screener/15-min-breakout-with-high-volume',
      ],
      stage_1: [
        'https://chartink.com/screener/intraday-stocks-rising-with-increase-in-volume-on-15-minute-candles',
      ],
    },
    minute_5: {
      stage_0: [
        'https://chartink.com/screener/intraday-trending-stocks-20',
      ],
    },
  },
};

const FORMATTED_DIR = path.join(process.cwd(), 'state', 'formatted-backtests');

function loadCookies() {
  const cookieFile = path.join(process.cwd(), 'cookies.txt');
  if (fs.existsSync(cookieFile)) {
    return fs.readFileSync(cookieFile, 'utf8').trim();
  }
  return '';
}

function ensureFormattedDir() {
  if (!fs.existsSync(FORMATTED_DIR)) {
    fs.mkdirSync(FORMATTED_DIR, { recursive: true });
  }
}

function formatBacktestForIntegration(backtestResult, screenerName, pipelineType = 'day_trading') {
  const tradeTimes = backtestResult.data?.metaData?.[0]?.tradeTimes || [];
  const formatIST = (ts) => new Date(ts).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const formatted = {
    screener: screenerName,
    scanClause: backtestResult.scanClause,
    fetchedAt: backtestResult.fetchedAt,
    sequences: [],
    tradeDates: tradeTimes,
    tradeDatesFormatted: tradeTimes.map(formatIST),
    sectorGroups: backtestResult.sectorGroups,
    pipeline_type: pipelineType,
  };

  if (backtestResult.data?.aggregatedStockList && backtestResult.data?.metaData?.[0]?.tradeTimes) {
    const tradeTimes = backtestResult.data.metaData[0].tradeTimes;
    const aggregatedList = backtestResult.data.aggregatedStockList;

    for (let idx = 0; idx < tradeTimes.length; idx++) {
      const tradeTime = tradeTimes[idx];
      const seenSymbols = new Set();
      const stocks = [];

      for (let i = 0; i < aggregatedList.length; i++) {
        const group = aggregatedList[i];
        if (idx < group.length) {
          const symbol = group[idx * 3];
          const marketCap = group[idx * 3 + 1];
          const sector = group[idx * 3 + 2];
          if (typeof symbol === 'string' && symbol.length <= 10 && /^[A-Z]+$/.test(symbol) && !seenSymbols.has(symbol)) {
            seenSymbols.add(symbol);
            stocks.push({
              symbol: symbol,
              marketCap: marketCap,
              sector: sector,
            });
          }
        }
      }

      formatted.sequences.push({
        groupName: 'aggregated',
        tradeTime: tradeTime,
        tradeTimeFormatted: new Date(tradeTime).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
        count: stocks.length,
        stocks: stocks,
      });
    }
  } else if (backtestResult.data?.aggregatedStockList) {
    for (const group of backtestResult.data.aggregatedStockList) {
      const seenSymbols = new Set();
      const stocks = [];
      for (let i = 0; i < group.length; i += 3) {
        const symbol = group[i];
        const marketCap = group[i + 1];
        const sector = group[i + 2];
        if (typeof symbol === 'string' && symbol.length <= 10 && /^[A-Z]+$/.test(symbol) && !seenSymbols.has(symbol)) {
          seenSymbols.add(symbol);
          stocks.push({
            symbol: symbol,
            marketCap: marketCap,
            sector: sector,
          });
        }
      }
      formatted.sequences.push({
        groupName: 'aggregated',
        tradeTimes: formatted.tradeDates,
        count: stocks.length,
        stocks: stocks,
      });
    }
  }

  return formatted;
}

async function runBacktestAndFormat(screenerUrl, cookies, pipelineType = 'day_trading') {
  console.log(`  Running backtest: ${screenerUrl}`);
  const backtestResult = await runBacktest(screenerUrl, 160, cookies);
  const screenerName = backtestResult.screenerName;

  ensureFormattedDir();
  const formatted = formatBacktestForIntegration(backtestResult, screenerName, pipelineType);
  const filename = `${screenerName}_${backtestResult.fetchedAt.slice(0, 10)}.json`;
  const filepath = path.join(FORMATTED_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(formatted, null, 2), 'utf8');

  console.log(`  Saved formatted backtest to: ${filepath}`);
  return formatted;
}

async function updateProbabilityWithBacktest(screenerName, stageKey, formattedBacktest, table, pipelineType) {
  const success = formattedBacktest.sequences.length > 0;
  const features = {
    stage0_screener: stageKey === 'stage_0' ? screenerName : null,
    stage1_screener: stageKey === 'stage_1' ? screenerName : null,
    stage2_screener: stageKey === 'stage_2' ? screenerName : null,
    stage3_screener: stageKey === 'stage_3' ? screenerName : null,
    time_bucket: 'any',
    compression_quality: 'medium',
    market_regime: 'normal',
    pipeline_type: pipelineType,
  };

  updateTableWithResult(table, features, success);
}

async function runPipeline(pipelineType, processor, cookies, runBacktests = false, sharedTable = null) {
  const config = SCRAPER_URLS[pipelineType];
  if (!config) {
    console.error(`Unknown pipeline type: ${pipelineType}`);
    return;
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Running ${pipelineType} pipeline`);
  console.log(`${'='.repeat(50)}`);

  const table = sharedTable || loadProbabilityTable();

  const results = {
    stage_0: [],
    stage_1: [],
    stage_2: [],
    stage_3: [],
  };

  if (runBacktests) {
    console.log('\nRunning backtests for probability update...');
  }

  const stageUrls = (urls) => Array.isArray(urls) ? urls : [urls];

  console.log('\nStage 0 - Setup Detection');
  for (const url of stageUrls(config.stage_0)) {
    const stage0Result = await runScreener(url, cookies);
    results.stage_0 = [...results.stage_0, ...(stage0Result.data?.data || [])];
    processor.processStage0(stage0Result.data?.data || [], url, pipelineType);
    if (runBacktests) {
      const formatted = await runBacktestAndFormat(url, cookies, pipelineType);
      await updateProbabilityWithBacktest(url, 'stage_0', formatted, table, pipelineType);
    }
  }
  console.log(`  Found ${results.stage_0.length} stocks in Stage 0`);

  console.log('\nStage 1 - Early Expansion');
  let stage1PassedCount = 0;
  for (const url of stageUrls(config.stage_1)) {
    const stage1Result = await runScreener(url, cookies);
    const stage1Symbols = (stage1Result.data?.data || []).map((s) => s.nsecode || s.symbol);
    const stage1Results = processor.processStage1(stage1Symbols, url, pipelineType);
    stage1PassedCount += stage1Results.length;
    if (runBacktests) {
      const formatted = await runBacktestAndFormat(url, cookies, pipelineType);
      await updateProbabilityWithBacktest(url, 'stage_1', formatted, table, pipelineType);
    }
  }
  console.log(`  Found ${stage1PassedCount} stocks passed to Stage 1`);

  console.log('\nStage 2 - Confirmation');
  let stage2PassedCount = 0;
  const stage2Results = [];
  for (const url of stageUrls(config.stage_2)) {
    const stage2Result = await runScreener(url, cookies);
    const stage2Symbols = (stage2Result.data?.data || []).map((s) => s.nsecode || s.symbol);
    const results2 = processor.processStage2(stage2Symbols, url, pipelineType);
    stage2Results.push(...results2);
    stage2PassedCount += results2.length;
    if (runBacktests) {
      const formatted = await runBacktestAndFormat(url, cookies, pipelineType);
      await updateProbabilityWithBacktest(url, 'stage_2', formatted, table, pipelineType);
    }
  }
  console.log(`  Found ${stage2PassedCount} stocks passed to Stage 2`);

  console.log('\nStage 3 - Validation');
  let stage3PassedCount = 0;
  const stage3Results = [];
  const stage3Urls = config.stage_3 && config.stage_3.length > 0 ? stageUrls(config.stage_3) : [];
  for (const url of stage3Urls) {
    const stage3Result = await runScreener(url, cookies);
    const stage3Symbols = (stage3Result.data?.data || []).map((s) => s.nsecode || s.symbol);
    const results3 = processor.processStage3(stage3Symbols, url, pipelineType);
    stage3PassedCount += results3.length;
    stage3Results.push(...results3);
    if (runBacktests) {
      const formatted = await runBacktestAndFormat(url, cookies, pipelineType);
      await updateProbabilityWithBacktest(url, 'stage_3', formatted, table, pipelineType);
    }
  }
  console.log(`  Found ${stage3PassedCount} stocks passed to Stage 3`);

  console.log('\nEntry Evaluation');
  const entryCandidates = new Set();
  stage3Results.forEach(r => entryCandidates.add(r.symbol));
  stage2Results.forEach(r => entryCandidates.add(r.symbol));
  for (const symbol of entryCandidates) {
    const entryResult = processor.evaluateEntry(symbol, pipelineType, 100);
    if (entryResult.entry) {
      console.log(`  ENTRY: ${symbol} (prob: ${(entryResult.probability * 100).toFixed(1)}%)`);
    }
  }

  if (!config.stage_3 || config.stage_3.length === 0) {
    console.log(
      '\nNote: Weekly swing pipeline has no Stage 3 - entering after Stage 2 confirmation'
    );
  }

  if (runBacktests) {
    console.log('\nProbability table updated');
  }

  savePipelineSummary(pipelineType, config, results, processor, entryCandidates);
  return results;
}

async function runMultiTimeframePipeline(processor, cookies, _runBacktests = false, _sharedTable = null) {
  const config = SCRAPER_URLS.multi_timeframe;
  console.log(`\n${'='.repeat(50)}`);
  console.log('Running Multi-Timeframe Pipeline');
  console.log(`${'='.repeat(50)}`);

  let candidates = null;

  const timeframes = ['weekly', 'daily', 'hourly', 'minute_15', 'minute_5'];
  const stageNames = {
    weekly: 'Weekly Analysis',
    daily: 'Daily Setup',
    hourly: 'Hourly Confirmation',
    minute_15: '15-Min Breakout',
    minute_5: '5-Min Momentum',
  };

  for (const timeframe of timeframes) {
    const tfConfig = config[timeframe];
    console.log(`\n${stageNames[timeframe]}`);
    const tfResults = new Set();

    for (const url of tfConfig.stage_0) {
      const result = await runScreener(url, cookies);
      const symbols = (result.data?.data || []).map((s) => s.nsecode || s.symbol);
      
      if (!candidates) {
        symbols.forEach((s) => tfResults.add(s));
      } else {
        symbols.forEach((s) => {
          if (candidates.has(s)) tfResults.add(s);
        });
      }
    }

    if (!candidates) {
      candidates = tfResults;
      console.log(`  Found ${candidates.size} stocks from ${timeframe}`);
    } else {
      candidates = tfResults;
      console.log(`  Filtered to ${candidates.size} stocks from ${timeframe}`);
    }

    if (candidates.size === 0) {
      console.log('\nNo candidates remaining - pipeline stopped');
      return { stage_0: [], stage_1: [], stage_2: [], stage_3: [] };
    }
  }

  console.log(`\nFinal candidates: ${candidates.size} stocks`);
  console.log(`  ${[...candidates].slice(0, 10).join(', ')}${candidates.size > 10 ? '...' : ''}`);

  const finalResults = { stage_0: [...candidates], stage_1: [], stage_2: [], stage_3: [] };
  
  for (const symbol of candidates) {
    processor.processStage0([{nsecode: symbol}], 'multi-timeframe', 'day_trading');
  }
  
  return finalResults;
}

function printStatus(processor) {
  const { state } = processor.getState();
  console.log('\n' + '='.repeat(50));
  console.log('Pipeline Status');
  console.log('='.repeat(50));

  const stageCounts = { stage_0: 0, stage_1: 0, stage_2: 0, stage_3: 0, entry: 0, failed: 0 };
  Object.values(state.stocks).forEach((stock) => {
    Object.values(stock.pipelines).forEach((p) => {
      if (Object.hasOwn(stageCounts, p.stage)) {
        stageCounts[p.stage]++;
      }
    });
  });

  console.log(`Stage 0: ${stageCounts.stage_0} stocks`);
  console.log(`Stage 1: ${stageCounts.stage_1} stocks`);
  console.log(`Stage 2: ${stageCounts.stage_2} stocks`);
  console.log(`Stage 3: ${stageCounts.stage_3} stocks`);
  console.log(`Entries: ${stageCounts.entry} stocks`);
  console.log(`Failed:  ${stageCounts.failed} stocks`);
  console.log(`Total stocks tracked: ${Object.keys(state.stocks).length}`);
}

async function main() {
  const args = process.argv.slice(2);
  const cookies = loadCookies();
  const runBacktests = args.includes('--backtest');

  console.log('Chartink Pipeline Processor');
  console.log('===========================');
  if (runBacktests) {
    console.log('Mode: Backtest + Pipeline');
  }

  const processor = new PipelineProcessor();
  let sharedTable = null;
  if (runBacktests) {
    sharedTable = loadProbabilityTable();
    processor.setProbabilityTable(sharedTable);
  }

  try {
    if (args.includes('--day')) {
      await runPipeline(PIPELINE_TYPES.DAY_TRADING, processor, cookies, runBacktests, sharedTable);
    }

    if (args.includes('--weekly')) {
      await runPipeline(PIPELINE_TYPES.WEEKLY_SWING, processor, cookies, runBacktests, sharedTable);
    }

    if (args.includes('--multi')) {
      await runMultiTimeframePipeline(processor, cookies, runBacktests, sharedTable);
    }

    if (args.includes('--status')) {
      printStatus(processor);
    }

    if (!args.includes('--day') && !args.includes('--weekly') && !args.includes('--multi') && !args.includes('--status')) {
      console.log('\nUsage:');
      console.log('  node pipeline-runner.js --day         Run day trading pipeline');
      console.log('  node pipeline-runner.js --weekly    Run weekly swing pipeline');
      console.log('  node pipeline-runner.js --multi     Run multi-timeframe pipeline');
      console.log('  node pipeline-runner.js --status    Show pipeline status');
      console.log('  node pipeline-runner.js --backtest  Run with backtest + probability update');
      console.log('');
      await runPipeline(PIPELINE_TYPES.DAY_TRADING, processor, cookies, runBacktests, sharedTable);
      await runPipeline(PIPELINE_TYPES.WEEKLY_SWING, processor, cookies, runBacktests, sharedTable);
    }

    if (runBacktests && sharedTable) {
      saveProbabilityTable(sharedTable);
      console.log('\nProbability table updated');
    }

    const result = processor.cleanup(!runBacktests || !sharedTable);
    console.log(`\nCleanup complete: ${result.stateSaved ? 'state saved' : 'state not saved'}`);
  } catch (error) {
    console.error('Pipeline error:', error.message);
    process.exit(1);
  }
}

function savePipelineSummary(pipelineType, config, results, processor, entryCandidates) {
  const SUMMARY_FILE = path.join(process.cwd(), 'state', `${pipelineType}-summary.md`);
  const table = loadProbabilityTable();
  const { state } = processor.getState();
  
  const getStockDetailsByStage = (stage) => {
    const byStage = state.byStage || {};
    const stageNum = stage.replace('stage_', '');
    const stageKey = `stage${stageNum}_screener`;
    if (byStage[stage]?.[pipelineType]) {
      return byStage[stage][pipelineType].map(s => ({ symbol: s.symbol, screener: s[stageKey] || 'N/A' }));
    }
    const found = [];
    for (const [symbol, stock] of Object.entries(state.stocks || {})) {
      const p = stock.pipelines?.[pipelineType];
      if (p?.stage === stage && p.metadata) {
        const screener = p.metadata[stageKey] || 'N/A';
        found.push({ symbol, screener });
      }
    }
    return found;
  };
  
  const stage0Stocks = getStockDetailsByStage('stage_0');
  const stage1Stocks = getStockDetailsByStage('stage_1');
  const stage2Stocks = getStockDetailsByStage('stage_2');
  const entryStocks = getStockDetailsByStage('entry');
  
  const entryDetails = Array.from(entryCandidates).map(symbol => {
    const byStage = state.byStage || {};
    const entryStock = byStage.entry?.[pipelineType]?.find(s => s.symbol === symbol);
    if (entryStock) {
      const stages = [];
      if (entryStock.stage0_screener) stages.push(`Stage 0: ${entryStock.stage0_screener}`);
      if (entryStock.stage1_screener) stages.push(`Stage 1: ${entryStock.stage1_screener}`);
      if (entryStock.stage2_screener) stages.push(`Stage 2: ${entryStock.stage2_screener}`);
      if (entryStock.stage3_screener) stages.push(`Stage 3: ${entryStock.stage3_screener}`);
      return `- **${symbol}**\n  - ${stages.join('\n  - ')}`;
    }
    const stock = (state.stocks || {})[symbol];
    if (stock?.pipelines?.[pipelineType]) {
      const p = stock.pipelines[pipelineType];
      const stages = [];
      if (p.metadata?.stage0_screener) stages.push(`Stage 0: ${p.metadata.stage0_screener}`);
      if (p.metadata?.stage1_screener) stages.push(`Stage 1: ${p.metadata.stage1_screener}`);
      if (p.metadata?.stage2_screener) stages.push(`Stage 2: ${p.metadata.stage2_screener}`);
      if (p.metadata?.stage3_screener) stages.push(`Stage 3: ${p.metadata.stage3_screener}`);
      return `- **${symbol}**\n  - ${stages.join('\n  - ')}`;
    }
    return `- **${symbol}** (state not found)`;
  }).join('\n');
  
  const stageTable = (stocks, stageName) => {
    if (stocks.length === 0) return `None`;
    const header = `| Symbol | ${stageName} Screener |\n|--------|---------------|`;
    const rows = stocks.map(s => `| ${s.symbol} | ${s.screener} |`).join('\n');
    return header + '\n' + rows;
  };
  
  const summary = `# Pipeline Summary

## Configuration
- **Pipeline Type:** ${pipelineType || 'day_trading'}
- **Timeframe Order:** Higher → Lower (confirmed on higher TF, drilled down to lower TF)
- **Probability Threshold:** 0.6

## Stage Results

| Stage | Timeframe | Stocks Found | Description |
|-------|-----------|--------------|-------------|
| Stage 0 | ${config.stage_0?.[0]?.split('/').pop() || 'N/A'} | ${results.stage_0?.length || 0} | Setup Detection |
| Stage 1 | ${config.stage_1?.[0]?.split('/').pop() || 'N/A'} | ${results.stage_1?.length || 0} | Confirmation |
| Stage 2 | ${config.stage_2?.[0]?.split('/').pop() || 'N/A'} | ${results.stage_2?.length || 0} | Entry Setup |
| Stage 3 | ${config.stage_3?.[0]?.split('/').pop() || 'N/A'} | ${results.stage_3?.length || 0} | Final Trigger |

### Stage 0 Stocks (${stage0Stocks.length})
${stageTable(stage0Stocks, 'Stage 0')}

### Stage 1 Stocks (${stage1Stocks.length})
${stageTable(stage1Stocks, 'Stage 1')}

### Stage 2 Stocks (${stage2Stocks.length})
${stageTable(stage2Stocks, 'Stage 2')}

## Probability Table
- **Total Sequences:** ${table.metadata.totalSequences}
- **Trained At:** ${table.metadata.formattedBacktestsTrainedAt || 'N/A'}

## Gate Statistics
- **Passed:** ${processor.gateStats.passed}
- **Blocked:** ${processor.gateStats.blocked}
- **Skipped:** ${processor.gateStats.skipped}

## Entry Candidates
${entryDetails || 'None'}

Generated: ${new Date().toISOString()}
`;
  fs.writeFileSync(SUMMARY_FILE, summary, 'utf8');
  console.log(`\nSummary saved to ${SUMMARY_FILE}`);
}

main();
