import {
  loadState,
  saveState,
  getStockState,
  updateStockStage,
  markStockEntry,
  markStockFailed,
  cleanExpiredStocks,
  PIPELINE_STAGES,
  PIPELINE_TYPES,
} from './state.js';

import { extractScreenerName } from './chartink.js';

import {
  loadProbabilityTable,
  saveProbabilityTable,
  shouldEnter,
  updateTableWithResult,
} from './probability.js';

const DEFAULT_PIPELINE_CONFIG = {
  day_trading: {
    name: 'Day Trading Pipeline',
    stages: {
      stage_0: { timeframe: '5m', name: 'Stage 0 - Accumulation Detection' },
      stage_1: { timeframe: '5m', name: 'Stage 1 - Breakout Confirmation' },
      stage_2: { timeframe: '15m', name: 'Stage 2 - Momentum Validation' },
      stage_3: { timeframe: '30m', name: 'Stage 3 - Entry Trigger' },
    },
    windows: {
      stage_0_to_1: 30,
      stage_1_to_2: 30,
      stage_2_to_3: 60,
    },
  },
  weekly_swing: {
    name: 'Weekly Swing Pipeline',
    stages: {
      stage_0: { timeframe: 'daily', name: 'Stage 0 - Accumulation Base' },
      stage_1: { timeframe: 'daily', name: 'Stage 1 - Impulse Candle' },
      stage_2: { timeframe: 'weekly', name: 'Stage 2 - Weekly Breakout' },
    },
    windows: {
      stage_0_to_1: 1440,
      stage_1_to_2: 1440,
    },
  },
};

export class PipelineProcessor {
  constructor(config = DEFAULT_PIPELINE_CONFIG) {
    this.config = config;
    this.state = loadState();
    this.probabilityTable = loadProbabilityTable();
    this.gateStats = { passed: 0, blocked: 0, skipped: 0 };
  }

  _resetGateStats() {
    this.gateStats = { passed: 0, blocked: 0, skipped: 0 };
  }

  _checkBayesianGate(features) {
    const result = shouldEnter(features, this.probabilityTable);
    if (result.probability === null) return { passed: true, reason: 'no data → pass' };
    return { passed: result.shouldEnter, probability: result.probability, threshold: result.threshold, reason: result.reason };
  }

  processStage0(stocks, screenerName, pipelineType = PIPELINE_TYPES.DAY_TRADING) {
    const results = [];

    for (const stock of stocks) {
      const symbol = stock.nsecode || stock.symbol;
      updateStockStage(this.state, symbol, pipelineType, PIPELINE_STAGES.STAGE_0, {
        stage0_screener: extractScreenerName(screenerName),
        scanTime: new Date().toISOString(),
      });
      results.push({ symbol, action: 'stage_0_triggered' });
    }

    return results;
  }

  processStage1(stockSymbols, screenerName, pipelineType = PIPELINE_TYPES.DAY_TRADING) {
    const results = [];

    for (const symbol of stockSymbols) {
      const stockState = getStockState(this.state, symbol);
      const pipeline = stockState?.pipelines?.[pipelineType];

      if (!pipeline || pipeline.stage !== PIPELINE_STAGES.STAGE_0) continue;

      const stage0Time = new Date(pipeline.stageEnteredAt);
      const now = new Date();
      const minutesElapsed = (now - stage0Time) / 60000;

      const windowMinutes = this.config[pipelineType].windows.stage_0_to_1;
      if (minutesElapsed > windowMinutes) {
        markStockFailed(this.state, symbol, pipelineType, 'Stage 0 timeout');
        continue;
      }

      const features = {
        stage0_screener: pipeline.metadata?.stage0_screener ? `https://chartink.com/screener/${pipeline.metadata?.stage0_screener}` : null,
        stage1_screener: extractScreenerName(screenerName) ? `https://chartink.com/screener/${extractScreenerName(screenerName)}` : null,
        stage2_screener: null,
        stage3_screener: null,
        pipeline_type: pipelineType,
      };

      const gate = this._checkBayesianGate(features);
      if (!gate.passed) {
        this.gateStats.blocked++;
        continue;
      }
      this.gateStats.passed++;

      updateStockStage(this.state, symbol, pipelineType, PIPELINE_STAGES.STAGE_1, {
        stage0_screener: pipeline.metadata?.stage0_screener,
        stage1_screener: extractScreenerName(screenerName),
        scanTime: new Date().toISOString(),
      });
      results.push({ symbol, action: 'stage_1_confirmed' });
    }

    return results;
  }

  processStage2(stockSymbols, screenerName, pipelineType = PIPELINE_TYPES.DAY_TRADING) {
    const results = [];

    for (const symbol of stockSymbols) {
      const stockState = getStockState(this.state, symbol);
      const pipeline = stockState?.pipelines?.[pipelineType];

      if (!pipeline || pipeline.stage !== PIPELINE_STAGES.STAGE_1) continue;

      const stage1Time = new Date(pipeline.stageEnteredAt);
      const now = new Date();
      const minutesElapsed = (now - stage1Time) / 60000;

      const windowMinutes = this.config[pipelineType].windows.stage_1_to_2;
      if (minutesElapsed > windowMinutes) {
        markStockFailed(this.state, symbol, pipelineType, 'Stage 1 timeout');
        continue;
      }

      const features = {
        stage0_screener: pipeline.metadata?.stage0_screener ? `https://chartink.com/screener/${pipeline.metadata?.stage0_screener}` : null,
        stage1_screener: pipeline.metadata?.stage1_screener ? `https://chartink.com/screener/${pipeline.metadata?.stage1_screener}` : null,
        stage2_screener: extractScreenerName(screenerName) ? `https://chartink.com/screener/${extractScreenerName(screenerName)}` : null,
        stage3_screener: null,
        pipeline_type: pipelineType,
      };

      const gate = this._checkBayesianGate(features);
      if (!gate.passed) {
        this.gateStats.blocked++;
        continue;
      }
      this.gateStats.passed++;

      updateStockStage(this.state, symbol, pipelineType, PIPELINE_STAGES.STAGE_2, {
        stage0_screener: pipeline.metadata?.stage0_screener,
        stage1_screener: pipeline.metadata?.stage1_screener,
        stage2_screener: extractScreenerName(screenerName),
        scanTime: new Date().toISOString(),
      });
      results.push({ symbol, action: 'stage_2_confirmed' });
    }

    return results;
  }

  processStage3(stockSymbols, screenerName, pipelineType = PIPELINE_TYPES.DAY_TRADING) {
    const results = [];
    const windowMinutes = this.config[pipelineType]?.windows?.stage_2_to_3;
    if (windowMinutes === undefined) return results;

    for (const symbol of stockSymbols) {
      const stockState = getStockState(this.state, symbol);
      const pipeline = stockState?.pipelines?.[pipelineType];

      if (!pipeline || pipeline.stage !== PIPELINE_STAGES.STAGE_2) continue;

      const stage2Time = new Date(pipeline.stageEnteredAt);
      const now = new Date();
      const minutesElapsed = (now - stage2Time) / 60000;

      if (minutesElapsed > windowMinutes) {
        markStockFailed(this.state, symbol, pipelineType, 'Stage 2 timeout');
        continue;
      }

      const features = {
        stage0_screener: pipeline.metadata?.stage0_screener ? `https://chartink.com/screener/${pipeline.metadata?.stage0_screener}` : null,
        stage1_screener: pipeline.metadata?.stage1_screener ? `https://chartink.com/screener/${pipeline.metadata?.stage1_screener}` : null,
        stage2_screener: pipeline.metadata?.stage2_screener ? `https://chartink.com/screener/${pipeline.metadata?.stage2_screener}` : null,
        stage3_screener: extractScreenerName(screenerName) ? `https://chartink.com/screener/${extractScreenerName(screenerName)}` : null,
        pipeline_type: pipelineType,
      };

      const gate = this._checkBayesianGate(features);
      if (!gate.passed) {
        this.gateStats.blocked++;
        continue;
      }
      this.gateStats.passed++;

      updateStockStage(this.state, symbol, pipelineType, PIPELINE_STAGES.STAGE_3, {
        stage0_screener: pipeline.metadata?.stage0_screener,
        stage1_screener: pipeline.metadata?.stage1_screener,
        stage2_screener: pipeline.metadata?.stage2_screener,
        stage3_screener: extractScreenerName(screenerName),
        scanTime: new Date().toISOString(),
      });
      results.push({ symbol, action: 'stage_3_confirmed' });
    }

    return results;
  }

  getEntryStage(pipelineType = PIPELINE_TYPES.DAY_TRADING) {
    if (pipelineType === PIPELINE_TYPES.WEEKLY_SWING) {
      return PIPELINE_STAGES.STAGE_2;
    }
    return PIPELINE_STAGES.STAGE_3;
  }

  evaluateEntry(symbol, pipelineType = PIPELINE_TYPES.DAY_TRADING, entryPrice = null) {
    const stockState = getStockState(this.state, symbol);
    const pipeline = stockState?.pipelines?.[pipelineType];
    const entryStage = this.getEntryStage(pipelineType);

    if (!pipeline || pipeline.stage !== entryStage) {
      return { entry: false, reason: 'Not in entry stage' };
    }

    const baseUrl = 'https://chartink.com/screener/';
    const features = {
      stage0_screener: pipeline.metadata?.stage0_screener ? baseUrl + pipeline.metadata?.stage0_screener : null,
      stage1_screener: pipeline.metadata?.stage1_screener ? baseUrl + pipeline.metadata?.stage1_screener : null,
      stage2_screener: pipeline.metadata?.stage2_screener ? baseUrl + pipeline.metadata?.stage2_screener : null,
      stage3_screener: pipeline.metadata?.stage3_screener ? baseUrl + pipeline.metadata?.stage3_screener : null,
      pipeline_type: pipelineType,
    };

    const evaluation = shouldEnter(features, this.probabilityTable);

    if (evaluation.shouldEnter) {
      const stopLoss = entryPrice * 0.95;
      markStockEntry(this.state, symbol, pipelineType, entryPrice, stopLoss);
      return {
        entry: true,
        probability: evaluation.probability,
        threshold: evaluation.threshold,
        stopLoss,
      };
    }

    return {
      entry: false,
      probability: evaluation.probability,
      threshold: evaluation.threshold,
      reason: evaluation.reason || `Probability below threshold: ${evaluation.probability?.toFixed(2)}`,
    };
  }

  recordOutcome(symbol, pipelineType, success, _entryPrice = null, _exitPrice = null) {
    const stockState = getStockState(this.state, symbol);
    const pipeline = stockState?.pipelines?.[pipelineType];

    if (!pipeline) return;

    const features = {
      stage0_screener: pipeline.metadata?.stage0_screener,
      stage1_screener: pipeline.metadata?.stage1_screener,
      stage2_screener: pipeline.metadata?.stage2_screener,
      stage3_screener: pipeline.metadata?.stage3_screener,
      pipeline_type: pipelineType,
    };

    updateTableWithResult(this.probabilityTable, features, success);
    saveProbabilityTable(this.probabilityTable);
  }

  cleanup(saveProbTable = true) {
    const expired = cleanExpiredStocks(this.state);
    saveState(this.state);
    if (saveProbTable) {
      saveProbabilityTable(this.probabilityTable);
    }
    return { expired, stateSaved: true, probTableSaved: saveProbTable };
  }

  getState() {
    return { state: this.state, probabilityTable: this.probabilityTable };
  }

  setProbabilityTable(table) {
    this.probabilityTable = table;
  }
}

export { PIPELINE_STAGES, PIPELINE_TYPES, DEFAULT_PIPELINE_CONFIG };
