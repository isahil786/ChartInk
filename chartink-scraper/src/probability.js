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

export function getProbabilityThreshold(features, table) {
  const result = calculateProbability(table, features);
  if (result.probability === null) return DEFAULT_THRESHOLD;

  const baseThreshold = DEFAULT_THRESHOLD;
  const multiplier =
    result.confidence === 'high' ? 0.9 : result.confidence === 'medium' ? 1.0 : 1.2;
  return baseThreshold * multiplier;
}

export function shouldEnter(features, table, customThreshold = null) {
  const result = calculateProbability(table, features);

  if (result.probability === null) {
    return {
      shouldEnter: false,
      reason: 'No historical data - cannot determine probability',
    };
  }

  const threshold = customThreshold ?? getProbabilityThreshold(features, table);

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

export function exportTable(table, filepath = null) {
  ensureProbabilityDir();
  const targetPath = filepath || PROBABILITY_TABLE_FILE;
  fs.writeFileSync(targetPath, JSON.stringify(table, null, 2), 'utf8');
  return targetPath;
}

export { DEFAULT_THRESHOLD, FEATURE_KEYS };
