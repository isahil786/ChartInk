import fs from 'fs';
import path from 'path';

const PROBABILITY_DIR = path.join(process.cwd(), 'state', 'probability');
const PROBABILITY_TABLE_FILE = path.join(PROBABILITY_DIR, 'lookup-table.json');

const DEFAULT_THRESHOLD = 0.6;

const FEATURE_KEYS = [
  'stage0_screener',
  'stage1_screener',
  'stage2_screener',
  'stage3_screener',
  'time_bucket',
  'compression_quality',
  'market_regime',
  'sector_strength',
];

function ensureProbabilityDir() {
  if (!fs.existsSync(PROBABILITY_DIR)) {
    fs.mkdirSync(PROBABILITY_DIR, { recursive: true });
  }
}

function createEmptyTable() {
  return {
    sequences: {},
    metadata: {
      createdAt: new Date().toISOString(),
      totalSequences: 0,
      lastUpdated: new Date().toISOString(),
    },
  };
}

export function loadProbabilityTable() {
  ensureProbabilityDir();
  if (fs.existsSync(PROBABILITY_TABLE_FILE)) {
    try {
      const content = fs.readFileSync(PROBABILITY_TABLE_FILE, 'utf8');
      const table = JSON.parse(content);
      table.metadata ||= {
        createdAt: new Date().toISOString(),
        totalSequences: 0,
        lastUpdated: new Date().toISOString(),
      };
      return table;
    } catch {
      return createEmptyTable();
    }
  }
  return createEmptyTable();
}

export function saveProbabilityTable(table) {
  ensureProbabilityDir();
  table.metadata.lastUpdated = new Date().toISOString();
  fs.writeFileSync(PROBABILITY_TABLE_FILE, JSON.stringify(table, null, 2), 'utf8');
}

export function buildSequenceKey(features) {
  const parts = [
    features.stage0_screener || 'none',
    features.stage1_screener || 'none',
    features.stage2_screener || 'none',
    features.stage3_screener ? `s3_${features.stage3_screener}` : 'no_s3',
    features.time_bucket || 'any',
    features.compression_quality || 'medium',
    features.market_regime || 'normal',
  ];
  return parts.join('|');
}

export function updateTableWithResult(table, features, success) {
  const key = buildSequenceKey(features);

  if (!table.sequences[key]) {
    table.sequences[key] = {
      features,
      successCount: 0,
      totalCount: 0,
      probabilities: {
        day_trading: { success: 0, total: 0 },
        weekly_swing: { success: 0, total: 0 },
      },
    };
  }

  const seq = table.sequences[key];
  seq.totalCount++;
  if (success) seq.successCount++;

  const pipelineType = features.pipeline_type || 'day_trading';
  if (seq.probabilities[pipelineType]) {
    seq.probabilities[pipelineType].total++;
    if (success) seq.probabilities[pipelineType].success++;
  }

  table.metadata.totalSequences = Object.keys(table.sequences).length;
  table.metadata.lastUpdated = new Date().toISOString();
}

export function calculateProbability(table, features) {
  const key = buildSequenceKey(features);
  const seq = table.sequences[key];

  if (!seq) {
    return {
      probability: null,
      confidence: 'low',
      reason: 'No historical data for this sequence',
    };
  }

  const pipelineType = features.pipeline_type || 'day_trading';
  const pipelineData = seq.probabilities[pipelineType];

  if (pipelineData.total === 0) {
    return {
      probability: null,
      confidence: 'low',
      reason: 'No data for this pipeline type',
    };
  }

  const probability = (pipelineData.success + 1) / (pipelineData.total + 2);
  const confidence = pipelineData.total < 10 ? 'low' : pipelineData.total < 30 ? 'medium' : 'high';

  return {
    probability,
    confidence,
    successCount: pipelineData.success,
    totalCount: pipelineData.total,
    reason: 'Historical probability',
  };
}

export function calculateFallbackProbability(table, features) {
  const pipelineType = features.pipeline_type || 'day_trading';
  const stageScreeners = [
    features.stage0_screener,
    features.stage1_screener,
    features.stage2_screener,
    features.stage3_screener,
  ].filter(Boolean);

  let totalProb = 0;
  let count = 0;

  for (const screener of stageScreeners) {
    const stageFeatures = {
      stage0_screener: features.stage0_screener === screener ? screener : null,
      stage1_screener: features.stage1_screener === screener ? screener : null,
      stage2_screener: features.stage2_screener === screener ? screener : null,
      stage3_screener: features.stage3_screener === screener ? screener : null,
      pipeline_type: pipelineType,
    };
    const result = calculateProbability(table, stageFeatures);
    if (result.probability !== null) {
      totalProb += result.probability;
      count++;
    }
  }

  if (count === 0) {
    return {
      probability: DEFAULT_THRESHOLD,
      threshold: DEFAULT_THRESHOLD,
      confidence: 'low',
      successCount: 0,
      totalCount: stageScreeners.length,
      reason: 'Using default threshold - no individual stage data',
    };
  }

  return {
    probability: totalProb / count,
    confidence: 'low',
    successCount: count,
    totalCount: stageScreeners.length,
    reason: 'Fallback probability from individual stages',
  };
}

export function getProbabilityThreshold(features, table) {
  const result = calculateProbability(table, features);
  if (result.probability === null) return DEFAULT_THRESHOLD;

  const baseThreshold = DEFAULT_THRESHOLD;
  const multiplier =
    result.confidence === 'high' ? 0.9 : result.confidence === 'medium' ? 1.0 : 1.2;
  return baseThreshold * multiplier;
}

export function shouldEnter(features, table, customThreshold = null) {
  let result = calculateProbability(table, features);

  if (result.probability === null) {
    result = calculateFallbackProbability(table, features);
  }

  if (result.probability === null) {
    return {
      shouldEnter: false,
      reason: 'No historical data - cannot determine probability',
    };
  }

  const threshold = customThreshold ?? result.threshold ?? getProbabilityThreshold(features, table);

  return {
    shouldEnter: result.probability >= threshold,
    probability: result.probability,
    threshold,
    confidence: result.confidence,
    reason: result.reason,
  };
}

export function trainFromBacktest(table, backtestResults, outcomeFunction) {
  for (const result of backtestResults) {
    const features = {
      stage0_screener: result.stage0_screener,
      stage1_screener: result.stage1_screener,
      stage2_screener: result.stage2_screener,
      stage3_screener: result.stage3_screener,
      time_bucket: result.time_bucket,
      compression_quality: result.compression_quality,
      market_regime: result.market_regime,
      pipeline_type: result.pipeline_type,
    };

    const success = outcomeFunction(result);
    updateTableWithResult(table, features, success);
  }

  saveProbabilityTable(table);
  return table;
}

const FORMATTED_DIR = path.join(process.cwd(), 'state', 'formatted-backtests');

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

function loadFormattedBacktests() {
  const files = fs.readdirSync(FORMATTED_DIR).filter(f => f.endsWith('.json'));
  const results = new Map();
  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(FORMATTED_DIR, file), 'utf8'));
    results.set(data.screener, data);
  }
  return results;
}

function getPipelineStageMap() {
  return PIPELINE_STAGE_MAP;
}

export function trainFromFormattedBacktests(table, options = {}) {
  const backtests = loadFormattedBacktests();
  const stageMap = getPipelineStageMap();
  const useSimple = options.simple !== false;
  const progressEvery = options.progressEvery || 3;

  for (const [pipelineType, screenerMap] of Object.entries(stageMap)) {
    const screenerByKey = {};
    for (const [key, stage] of Object.entries(screenerMap)) {
      const url = `https://chartink.com/screener/${key.replace(/_/g, '-')}`;
      screenerByKey[url] = { url, stage };
    }

    const stageToScreenerUrls = {};
    for (const { url, stage } of Object.values(screenerByKey)) {
      if (!stageToScreenerUrls[stage]) stageToScreenerUrls[stage] = [];
      stageToScreenerUrls[stage].push(url);
    }

    let totalStockAppearances = 0;
    for (const bt of backtests.values()) {
      for (const seq of bt.sequences || []) {
        totalStockAppearances += (seq.stocks || []).length;
      }
    }

    let processed = 0;
    let reportedPct = 0;

    const stockPaths = {};
    for (const [screenerName, bt] of backtests) {
      const pipelineTypeOfBt = bt.pipeline_type || 'day_trading';
      if (pipelineTypeOfBt !== pipelineType) continue;

      const screenerUrl = `https://chartink.com/screener/${screenerName}`;

      for (const seq of bt.sequences || []) {
        for (const stock of seq.stocks || []) {
          const symbol = stock.symbol;
          if (!stockPaths[symbol]) stockPaths[symbol] = { stage_0: [], stage_1: [], stage_2: [], stage_3: [] };
          const stage = screenerByKey[screenerUrl]?.stage;
          if (stage && stageToScreenerUrls[stage]?.length > 0) {
            stockPaths[symbol][stage].push(screenerName);
          }
          processed++;
          if (options.onProgress) {
            const pct = Math.floor((processed / totalStockAppearances) * 100);
            if (pct >= reportedPct + progressEvery) {
              reportedPct = pct - (pct % progressEvery);
              options.onProgress(pipelineType, reportedPct);
            }
          }
        }
      }
    }

    const stageKeys = ['stage_0', 'stage_1', 'stage_2', 'stage_3'];
    for (const [, stages] of Object.entries(stockPaths)) {
      const maxIdx = Math.max(
        stages.stage_3.length > 0 ? 3 : -1,
        stages.stage_2.length > 0 ? 2 : -1,
        stages.stage_1.length > 0 ? 1 : -1,
        stages.stage_0.length > 0 ? 0 : -1,
      );
      if (maxIdx < 0) continue;

      const features = {
        stage0_screener: stages.stage_0[0] ? `https://chartink.com/screener/${stages.stage_0[0]}` : null,
        stage1_screener: stages.stage_1[0] ? `https://chartink.com/screener/${stages.stage_1[0]}` : null,
        stage2_screener: stages.stage_2[0] ? `https://chartink.com/screener/${stages.stage_2[0]}` : null,
        stage3_screener: stages.stage_3[0] ? `https://chartink.com/screener/${stages.stage_3[0]}` : null,
        time_bucket: 'any',
        compression_quality: 'medium',
        market_regime: 'normal',
        pipeline_type: pipelineType,
      };

      if (useSimple) {
        updateTableWithResult(table, features, true);
        continue;
      }

      const outcome = maxIdx >= stageKeys.length - 1 ? 1 : 0;
      updateTableWithResult(table, features, Boolean(outcome));

      for (let i = 0; i < maxIdx; i++) {
        const partialFeatures = {
          stage0_screener: i >= 0 && stages.stage_0[0] ? `https://chartink.com/screener/${stages.stage_0[0]}` : null,
          stage1_screener: i >= 1 && stages.stage_1[0] ? `https://chartink.com/screener/${stages.stage_1[0]}` : null,
          stage2_screener: i >= 2 && stages.stage_2[0] ? `https://chartink.com/screener/${stages.stage_2[0]}` : null,
          stage3_screener: i >= 3 && stages.stage_3[0] ? `https://chartink.com/screener/${stages.stage_3[0]}` : null,
          time_bucket: 'any',
          compression_quality: 'medium',
          market_regime: 'normal',
          pipeline_type: pipelineType,
        };
        const transSuccess = i < maxIdx - 1 || maxIdx >= stageKeys.length - 1;
        updateTableWithResult(table, partialFeatures, Boolean(transSuccess));
      }
    }

    if (options.onProgress) options.onProgress(pipelineType, 100);
  }

  table.metadata.formattedBacktestsTrainedAt = new Date().toISOString();
  table.metadata.trainingSequenceCount = table.metadata.totalSequences;
  saveProbabilityTable(table);
  return table;
}

export function exportTable(table, filepath = null) {
  ensureProbabilityDir();
  const targetPath = filepath || PROBABILITY_TABLE_FILE;
  fs.writeFileSync(targetPath, JSON.stringify(table, null, 2), 'utf8');
  return targetPath;
}

export { DEFAULT_THRESHOLD, FEATURE_KEYS };
