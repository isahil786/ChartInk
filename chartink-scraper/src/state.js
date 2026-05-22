import fs from 'fs';
import path from 'path';

const STATE_DIR = path.join(process.cwd(), 'state');
const PIPELINE_STATE_FILE = path.join(STATE_DIR, 'pipeline-state.json');

const PIPELINE_STAGES = {
  STAGE_0: 'stage_0',
  STAGE_1: 'stage_1',
  STAGE_2: 'stage_2',
  STAGE_3: 'stage_3',
  ENTRY: 'entry',
  FAILED: 'failed',
};

const PIPELINE_TYPES = {
  DAY_TRADING: 'day_trading',
  WEEKLY_SWING: 'weekly_swing',
};

function ensureStateDir() {
  if (!fs.existsSync(STATE_DIR)) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
  }
}

function toIST(date) {
  const d = new Date(date);
  const utc = d.getTime();
  const ist = new Date(utc + 5.5 * 60 * 60 * 1000);
  const y = ist.getFullYear();
  const m = String(ist.getMonth() + 1).padStart(2, '0');
  const day = String(ist.getDate()).padStart(2, '0');
  const h = String(ist.getHours()).padStart(2, '0');
  const min = String(ist.getMinutes()).padStart(2, '0');
  const s = String(ist.getSeconds()).padStart(2, '0');
  const ms = String(ist.getMilliseconds()).padStart(3, '0');
  return `${y}-${m}-${day} ${h}:${min}:${s}.${ms} IST`;
}

function createInitialState() {
  return {
    stocks: {},
    pipelines: {},
    lastUpdated: new Date().toISOString(),
  };
}

export function loadState() {
  ensureStateDir();
  if (fs.existsSync(PIPELINE_STATE_FILE)) {
    try {
      const content = fs.readFileSync(PIPELINE_STATE_FILE, 'utf8');
      const loaded = JSON.parse(content);
      if (loaded.stocks) return loaded;
      if (loaded.byStage) {
        const migrated = { stocks: {}, pipelines: {}, lastUpdated: loaded.lastUpdated };
        for (const [stage, stageData] of Object.entries(loaded.byStage)) {
          for (const [pipelineType, stocks] of Object.entries(stageData)) {
            for (const stock of stocks) {
              if (!migrated.stocks[stock.symbol]) {
                migrated.stocks[stock.symbol] = { symbol: stock.symbol, pipelines: {}, createdAt: stock.enteredAt };
              }
              migrated.stocks[stock.symbol].pipelines[pipelineType] = { stage, stageEnteredAt: stock.enteredAt, metadata: { ...stock } };
            }
          }
        }
        return migrated;
      }
      return createInitialState();
    } catch {
      return createInitialState();
    }
  }
  return createInitialState();
}

export function saveState(state) {
  ensureStateDir();
  state.lastUpdated = new Date().toISOString();
  
  const byStage = {};
  for (const [symbol, stock] of Object.entries(state.stocks)) {
    for (const [pipelineType, pipeline] of Object.entries(stock.pipelines)) {
      if (!byStage[pipeline.stage]) byStage[pipeline.stage] = {};
      if (!byStage[pipeline.stage][pipelineType]) byStage[pipeline.stage][pipelineType] = [];
      byStage[pipeline.stage][pipelineType].push({
        symbol,
        enteredAt: toIST(pipeline.stageEnteredAt),
        ...(pipeline.metadata || {})
      });
    }
  }
  
  const saveData = { byStage, lastUpdated: state.lastUpdated };
  fs.writeFileSync(PIPELINE_STATE_FILE, JSON.stringify(saveData, null, 2));
}

export function getStockState(state, symbol) {
  return state.stocks[symbol] || null;
}

export function updateStockStage(state, symbol, pipelineType, stage, metadata = {}) {
  const now = new Date().toISOString();

  if (!state.stocks[symbol]) {
    state.stocks[symbol] = {
      symbol,
      pipelines: {},
      createdAt: now,
    };
  }

  state.stocks[symbol].pipelines[pipelineType] = {
    stage,
    stageEnteredAt: now,
    metadata,
  };

  state.stocks[symbol].lastUpdated = now;
}

export function markStockEntry(state, symbol, pipelineType, entryPrice, stopLoss) {
  if (state.stocks[symbol] && state.stocks[symbol].pipelines[pipelineType]) {
    state.stocks[symbol].pipelines[pipelineType].stage = PIPELINE_STAGES.ENTRY;
    state.stocks[symbol].pipelines[pipelineType].entryPrice = entryPrice;
    state.stocks[symbol].pipelines[pipelineType].stopLoss = stopLoss;
    state.stocks[symbol].pipelines[pipelineType].enteredAt = toIST(new Date());
  }
}

export function markStockFailed(state, symbol, pipelineType, reason = '') {
  if (state.stocks[symbol] && state.stocks[symbol].pipelines[pipelineType]) {
    state.stocks[symbol].pipelines[pipelineType].stage = PIPELINE_STAGES.FAILED;
    state.stocks[symbol].pipelines[pipelineType].failureReason = reason;
  }
}

export function cleanExpiredStocks(state, maxStage0AgeMinutes = 60, maxStage1AgeMinutes = 30) {
  const now = new Date();
  const expired = [];

  for (const [symbol, stock] of Object.entries(state.stocks)) {
    for (const [pipelineType, pipeline] of Object.entries(stock.pipelines)) {
      const stageEntered = new Date(pipeline.stageEnteredAt);
      const ageMinutes = (now - stageEntered) / 60000;

      if (pipeline.stage === PIPELINE_STAGES.STAGE_0 && ageMinutes > maxStage0AgeMinutes) {
        markStockFailed(state, symbol, pipelineType, 'Stage 0 expired');
        expired.push({ symbol, pipelineType, reason: 'Stage 0 expired' });
      } else if (pipeline.stage === PIPELINE_STAGES.STAGE_1 && ageMinutes > maxStage1AgeMinutes) {
        markStockFailed(state, symbol, pipelineType, 'Stage 1 expired');
        expired.push({ symbol, pipelineType, reason: 'Stage 1 expired' });
      }
    }
  }

  return expired;
}

export { PIPELINE_STAGES, PIPELINE_TYPES };
