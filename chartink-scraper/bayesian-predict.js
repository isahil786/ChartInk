import fs from 'fs';
import path from 'path';
import { PipelineProcessor, PIPELINE_TYPES, PIPELINE_STAGES } from './src/pipeline.js';
import { loadProbabilityTable, calculateProbability, shouldEnter } from './src/probability.js';

const FORMATTED_DIR = path.join(process.cwd(), 'state', 'formatted-backtests');

function loadFormattedBacktests() {
  const files = fs.readdirSync(FORMATTED_DIR).filter(f => f.endsWith('.json'));
  const results = [];

  for (const file of files) {
    const filepath = path.join(FORMATTED_DIR, file);
    const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
    results.push(data);
  }

  return results;
}

class BayesianPredictor {
  constructor() {
    this.screenerStocks = {};
    this.stockScreenerCount = {};
    this.totalScreeners = 0;
  }

  train(backtests) {
    for (const bt of backtests) {
      const screener = bt.screener;
      this.screenerStocks[screener] = new Set();
      this.totalScreeners++;

      const stocks = bt.sequences?.[0]?.stocks || [];
      for (const stock of stocks) {
        const symbol = stock.symbol;
        this.screenerStocks[screener].add(symbol);
        this.stockScreenerCount[symbol] = (this.stockScreenerCount[symbol] || 0) + 1;
      }
    }
  }

  predictNext() {
    const allStocks = new Set();
    for (const stocks of Object.values(this.screenerStocks)) {
      for (const stock of stocks) {
        allStocks.add(stock);
      }
    }

    const predictions = [];
    for (const stock of allStocks) {
      const screenerCount = this.stockScreenerCount[stock] || 0;
      const probability = screenerCount / this.totalScreeners;
      predictions.push({ stock, probability, screenerCount });
    }

    return predictions.sort((a, b) => b.probability - a.probability);
  }

  getBayesianScore(stock) {
    const count = this.stockScreenerCount[stock] || 0;
    const alpha = 1;
    const beta = 1;
    const successRate = count / this.totalScreeners;
    return (alpha + count) / (alpha + beta + this.totalScreeners);
  }
}

function runBayesianAnalysis() {
  console.log('Bayesian Stock Prediction');
  console.log('========================\n');

  const backtests = loadFormattedBacktests();
  console.log(`Loaded ${backtests.length} backtests\n`);

  const predictor = new BayesianPredictor();
  predictor.train(backtests);

  const predictions = predictor.predictNext();

  console.log('Top 10 Predicted Stocks:');
  for (const p of predictions.slice(0, 10)) {
    const bayesScore = predictor.getBayesianScore(p.stock);
    console.log(`  ${p.stock}: ${p.screenerCount} screeners, prob=${p.probability.toFixed(3)}, bayes=${bayesScore.toFixed(3)}`);
  }

  console.log('\n\nProbability Table Analysis:');
  const table = loadProbabilityTable();
  const processor = new PipelineProcessor();
  processor.setProbabilityTable(table);

  const state = { stocks: {}, pipelines: {}, lastUpdated: new Date().toISOString() };
  for (const p of predictions.slice(0, 10)) {
    const now = new Date().toISOString();
    state.stocks[p.stock] = {
      symbol: p.stock,
      pipelines: {
        [PIPELINE_TYPES.WEEKLY_SWING]: {
          stage: PIPELINE_STAGES.STAGE_2,
          stageEnteredAt: now,
          metadata: {
            stage0_screener: 'https://chartink.com/screener/accumulation-stocks',
            stage1_screener: 'https://chartink.com/screener/bullish-stocks-screener-1',
            stage2_screener: 'https://chartink.com/screener/weekly-buy-find-trading-zones',
          },
        },
      },
    };
  }

  console.log('\nEntry Evaluation for Top 10:');
  for (const p of predictions.slice(0, 10)) {
    const result = processor.evaluateEntry(p.stock, PIPELINE_TYPES.WEEKLY_SWING, 100);
    console.log(`  ${p.stock}: entry=${result.entry}, prob=${result.probability?.toFixed(3)}`);
  }
}

runBayesianAnalysis();