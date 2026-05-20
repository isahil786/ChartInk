import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3000;
const BASE = (process.env.BASE_PATH || "/dashboard").replace(/\/$/, "");

const PROCESSED = path.join(__dirname, "processed");
const SCREENERS_DIR = path.join(PROCESSED, "screeners");
const BACKTESTS_DIR = path.join(PROCESSED, "backtests");

// ─── CSV parser ───────────────────────────────────────────────────────────────

function parseCsv(filePath) {
  if (!fs.existsSync(filePath)) return { headers: [], rows: [] };
  const lines = fs.readFileSync(filePath, "utf8").trim().split("\n");
  if (lines.length < 2) return { headers: [], rows: [] };

  function splitLine(line) {
    const result = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        result.push(cur); cur = "";
      } else {
        cur += ch;
      }
    }
    result.push(cur);
    return result;
  }

  const headers = splitLine(lines[0]);
  const rows = lines.slice(1).filter(Boolean).map((l) => {
    const vals = splitLine(l);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] ?? ""; });
    return obj;
  });
  return { headers, rows };
}

// ─── Slugs ────────────────────────────────────────────────────────────────────

function getAllSlugs() {
  if (!fs.existsSync(SCREENERS_DIR)) return [];
  return fs
    .readdirSync(SCREENERS_DIR)
    .filter((f) => f.endsWith("_summary.json"))
    .map((f) => f.replace("_summary.json", ""))
    .sort();
}

// ─── Root redirect ────────────────────────────────────────────────────────────

if (BASE) {
  app.get("/", (_req, res) => res.redirect(BASE + "/"));
}

// ─── Static files ─────────────────────────────────────────────────────────────

app.use(BASE, express.static(path.join(__dirname, "public")));

// ─── Inject BASE_PATH into index.html dynamically ────────────────────────────

app.get(`${BASE}/`, (_req, res) => {
  const html = fs.readFileSync(path.join(__dirname, "public/index.html"), "utf8")
    .replace("</head>", `  <meta name="base-path" content="${BASE}" />\n</head>`);
  res.type("html").send(html);
});

// ─── API: list screeners ──────────────────────────────────────────────────────

app.get(`${BASE}/api/screeners`, (req, res) => {
  const slugs = getAllSlugs();
  const screeners = slugs.map((slug) => {
    const summaryPath = path.join(SCREENERS_DIR, `${slug}_summary.json`);
    const summary = fs.existsSync(summaryPath)
      ? JSON.parse(fs.readFileSync(summaryPath, "utf8"))
      : {};
    return { slug, ...summary };
  });
  res.json(screeners);
});

// ─── API: screener stocks (today) ─────────────────────────────────────────────

app.get(`${BASE}/api/screeners/:slug`, (req, res) => {
  const { slug } = req.params;
  const summaryPath = path.join(SCREENERS_DIR, `${slug}_summary.json`);
  const csvPath = path.join(SCREENERS_DIR, `${slug}.csv`);

  if (!fs.existsSync(summaryPath)) {
    return res.status(404).json({ error: "Screener not found" });
  }

  const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
  const { rows: stocks } = parseCsv(csvPath);

  res.json({ slug, summary, stocks });
});

// ─── API: backtest summary ────────────────────────────────────────────────────

app.get(`${BASE}/api/backtests/:slug`, (req, res) => {
  const { slug } = req.params;
  const summaryPath = path.join(BACKTESTS_DIR, `${slug}_summary.json`);

  if (!fs.existsSync(summaryPath)) {
    return res.status(404).json({ error: "Backtest not found" });
  }

  const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
  res.json({ slug, summary });
});

// ─── API: backtest daily signal counts (for line chart) ──────────────────────

app.get(`${BASE}/api/backtests/:slug/daily`, (req, res) => {
  const { slug } = req.params;
  const csvPath = path.join(BACKTESTS_DIR, `${slug}_sector_counts.csv`);

  if (!fs.existsSync(csvPath)) {
    return res.status(404).json({ error: "Sector counts not found" });
  }

  const { rows } = parseCsv(csvPath);
  const daily = rows.map((r) => ({
    date: r["Date"],
    total: Number(r["Total Signals"]) || 0,
  }));

  res.json(daily);
});

// ─── API: backtest sector totals (for bar chart) ──────────────────────────────

app.get(`${BASE}/api/backtests/:slug/sectors`, (req, res) => {
  const { slug } = req.params;
  const summaryPath = path.join(BACKTESTS_DIR, `${slug}_summary.json`);

  if (!fs.existsSync(summaryPath)) {
    return res.status(404).json({ error: "Not found" });
  }

  const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
  const sectors = (summary.sectorTotals ?? []).filter((s) => s.total > 0);
  res.json(sectors);
});

// ─── API: backtest daily stocks list ─────────────────────────────────────────

app.get(`${BASE}/api/backtests/:slug/stocks`, (req, res) => {
  const { slug } = req.params;
  const csvPath = path.join(BACKTESTS_DIR, `${slug}_daily_stocks.csv`);

  if (!fs.existsSync(csvPath)) {
    return res.status(404).json({ error: "Daily stocks not found" });
  }

  const { rows } = parseCsv(csvPath);
  res.json(rows);
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Chartink Dashboard running at http://localhost:${PORT}${BASE}/`);
  console.log(`API ready at http://localhost:${PORT}${BASE}/api/screeners`);
});
