import fs from "fs";
import path from "path";

const RESPONSES_DIR = path.join(process.cwd(), "responses");
const BACKTESTS_DIR = path.join(RESPONSES_DIR, "backtests");

export function ensureResponsesDir() {
  if (!fs.existsSync(RESPONSES_DIR)) {
    fs.mkdirSync(RESPONSES_DIR, { recursive: true });
  }
  if (!fs.existsSync(BACKTESTS_DIR)) {
    fs.mkdirSync(BACKTESTS_DIR, { recursive: true });
  }
}

function sanitizeName(name) {
  return name.replace(/[^a-z0-9-_]/gi, "-").replace(/-+/g, "-").toLowerCase();
}

function buildFileName(screenerName) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
  return `${sanitizeName(screenerName)}_${ts}.json`;
}

export function saveResponse(result) {
  ensureResponsesDir();
  const fileName = buildFileName(result.screenerName);
  const filePath = path.join(RESPONSES_DIR, fileName);
  fs.writeFileSync(filePath, JSON.stringify(result, null, 2), "utf8");
  return filePath;
}

export function saveBacktestResponse(result) {
  ensureResponsesDir();
  const fileName = buildFileName(result.screenerName);
  const filePath = path.join(BACKTESTS_DIR, fileName);
  fs.writeFileSync(filePath, JSON.stringify(result, null, 2), "utf8");
  return filePath;
}

export function listSavedFiles() {
  ensureResponsesDir();
  return fs
    .readdirSync(RESPONSES_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => path.join(RESPONSES_DIR, f));
}
