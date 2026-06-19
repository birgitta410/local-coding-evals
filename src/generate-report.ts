import * as fs from "fs";
import * as path from "path";
import type { RunResult } from "./types.js";

const resultsDir = path.resolve("results");

if (!fs.existsSync(resultsDir)) {
  console.error("No results/ directory found. Run a scenario first.");
  process.exit(1);
}

const runs: Array<{ file: string; data: RunResult }> = fs
  .readdirSync(resultsDir)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .reverse()
  .map((f) => ({
    file: f,
    data: JSON.parse(fs.readFileSync(path.join(resultsDir, f), "utf-8")) as RunResult,
  }));

if (runs.length === 0) {
  console.error("No JSON result files found in results/.");
  process.exit(1);
}

function extractScreenshotsFromFullOutput(fullOutput: string | undefined): string[] {
  if (!fullOutput) return [];
  for (const line of fullOutput.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith('{"passed"')) {
      try {
        const parsed = JSON.parse(trimmed) as { screenshots?: string[] };
        return (parsed.screenshots ?? []).filter((s) => typeof s === "string" && s.length > 0);
      } catch {
        return [];
      }
    }
  }
  return [];
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function mdToHtml(text: string): string {
  if (!text) return "";
  let s = escHtml(text);
  // Code blocks — use a placeholder to avoid backtick collisions
  s = s.replace(/```[^\n]*\n([\s\S]*?)```/g, (_: string, code: string) =>
    `<pre style="background:#1e1e3f;color:#a9b1d6;padding:10px 14px;border-radius:6px;overflow-x:auto;font-size:12px;margin:8px 0">${code.trimEnd()}</pre>`);
  // Headers
  s = s.replace(/^### (.+)$/gm, '<h3 style="font-size:13px;font-weight:700;margin:14px 0 4px">$1</h3>');
  s = s.replace(/^## (.+)$/gm,  '<h2 style="font-size:14px;font-weight:700;margin:16px 0 6px">$1</h2>');
  s = s.replace(/^# (.+)$/gm,   '<h1 style="font-size:16px;font-weight:700;margin:18px 0 8px">$1</h1>');
  // Bold / italic
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Inline code
  s = s.replace(/`([^`]+)`/g, '<code style="background:#f1f5f9;padding:1px 5px;border-radius:4px;font-size:12px">$1</code>');
  // Horizontal rule
  s = s.replace(/^---+$/gm, '<hr style="border:none;border-top:1px solid #e2e8f0;margin:12px 0">');
  // Bullet lists
  s = s.replace(/((?:^[ \t]*[-*] .+\n?)+)/gm, (block: string) => {
    const items = block.trim().split(/\n/).map((l: string) => `<li style="margin:3px 0">${l.replace(/^[ \t]*[-*] /, "")}</li>`).join("");
    return `<ul style="padding-left:20px;margin:6px 0">${items}</ul>`;
  });
  // Numbered lists
  s = s.replace(/((?:^[ \t]*\d+\. .+\n?)+)/gm, (block: string) => {
    const items = block.trim().split(/\n/).map((l: string) => `<li style="margin:3px 0">${l.replace(/^[ \t]*\d+\. /, "")}</li>`).join("");
    return `<ol style="padding-left:20px;margin:6px 0">${items}</ol>`;
  });
  // Paragraphs and line breaks
  s = s.replace(/\n\n+/g, '</p><p style="margin:8px 0">');
  s = s.replace(/\n/g, "<br>");
  return `<p style="margin:8px 0">${s}</p>`;
}

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = ((ms % 60_000) / 1000).toFixed(0);
  return `${m}m ${s}s`;
}

const html = /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Local Coding Evals</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 14px;
    color: #1a1a2e;
    background: #f0f2f5;
    height: 100vh;
    display: flex;
    flex-direction: column;
  }

  header {
    background: #1a1a2e;
    color: #fff;
    padding: 14px 24px;
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
  }
  header h1 { font-size: 16px; font-weight: 600; letter-spacing: 0.02em; }
  header .count {
    margin-left: auto;
    font-size: 12px;
    color: #8892b0;
  }

  .layout {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  /* ── Sidebar ── */
  aside {
    width: 280px;
    flex-shrink: 0;
    background: #fff;
    border-right: 1px solid #e2e8f0;
    overflow-y: auto;
  }

  .run-item {
    padding: 14px 16px;
    border-bottom: 1px solid #f0f2f5;
    cursor: pointer;
    transition: background 0.1s;
  }
  .run-item:hover { background: #f8fafc; }
  .run-item.active { background: #eff6ff; border-left: 3px solid #3b82f6; }

  .run-item .name {
    font-weight: 600;
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 5px;
  }

  .run-item .meta {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: #64748b;
  }

  .badge {
    display: inline-flex;
    align-items: center;
    padding: 1px 7px;
    border-radius: 9999px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
  }
  .badge.pass { background: #dcfce7; color: #166534; }
  .badge.fail { background: #fee2e2; color: #991b1b; }

  .score-bar-wrap {
    height: 3px;
    background: #e2e8f0;
    border-radius: 2px;
    margin-top: 7px;
    overflow: hidden;
  }
  .score-bar { height: 100%; border-radius: 2px; transition: width 0.3s; }
  .score-bar.pass { background: #22c55e; }
  .score-bar.fail { background: #ef4444; }

  .sidebar-top {
    padding: 10px 12px;
    border-bottom: 1px solid #e2e8f0;
    display: flex;
    gap: 6px;
    background: #f8fafc;
    position: sticky;
    top: 0;
    z-index: 1;
    flex-shrink: 0;
  }
  .group-btn {
    flex: 1;
    padding: 5px 0;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    background: #fff;
    font-size: 11px;
    font-weight: 600;
    color: #64748b;
    cursor: pointer;
  }
  .group-btn:hover { background: #f1f5f9; }
  .group-btn.active { background: #3b82f6; color: #fff; border-color: #2563eb; }
  .group-label {
    padding: 7px 16px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: #e2e8f0;
    background: #1a1a2e;
    border-bottom: none;
    position: sticky;
    top: 45px;
    z-index: 1;
  }

  /* ── Detail panel ── */
  main {
    flex: 1;
    overflow-y: auto;
    padding: 28px 32px;
  }

  .placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #94a3b8;
    font-size: 15px;
  }

  .detail { display: none; max-width: 860px; }
  .detail.visible { display: block; }

  .summary-card {
    background: #fff;
    border-radius: 10px;
    padding: 20px 24px;
    margin-bottom: 20px;
    border: 1px solid #e2e8f0;
    display: flex;
    align-items: flex-start;
    gap: 16px;
  }
  .summary-card .verdict {
    font-size: 32px;
    font-weight: 800;
    letter-spacing: -0.02em;
    line-height: 1;
  }
  .summary-card .verdict.pass { color: #16a34a; }
  .summary-card .verdict.fail { color: #dc2626; }
  .summary-card .info { flex: 1; }
  .summary-card .scenario-name {
    font-size: 18px;
    font-weight: 700;
    margin-bottom: 6px;
  }
  .summary-card .stats {
    display: flex;
    gap: 20px;
    font-size: 13px;
    color: #475569;
    flex-wrap: wrap;
  }
  .summary-card .stats span strong { color: #1a1a2e; }

  /* Sections */
  .section {
    background: #fff;
    border-radius: 10px;
    border: 1px solid #e2e8f0;
    margin-bottom: 14px;
    overflow: hidden;
  }

  .section-header {
    padding: 12px 18px;
    font-weight: 600;
    font-size: 13px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    user-select: none;
    background: #f8fafc;
    border-bottom: 1px solid #e2e8f0;
  }
  .section-header:hover { background: #f1f5f9; }
  .section-header .chevron { margin-left: auto; transition: transform 0.2s; color: #94a3b8; }
  .section-header.open .chevron { transform: rotate(90deg); }

  .section-body { padding: 16px 18px; }
  .section-body.hidden { display: none; }

  pre, code {
    font-family: "SF Mono", "Fira Code", "Fira Mono", monospace;
    font-size: 12px;
  }

  .prose {
    line-height: 1.65;
    color: #334155;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .models-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .model-card {
    background: #f8fafc;
    border-radius: 8px;
    padding: 12px 14px;
    border: 1px solid #e2e8f0;
  }
  .model-card .label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #94a3b8;
    margin-bottom: 4px;
  }
  .model-card .value {
    font-weight: 600;
    font-size: 13px;
    color: #1e40af;
    font-family: "SF Mono", monospace;
  }

  /* Tool calls table */
  .tool-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  .tool-table th {
    text-align: left;
    padding: 7px 10px;
    background: #f1f5f9;
    font-weight: 600;
    color: #475569;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-bottom: 1px solid #e2e8f0;
  }
  .tool-table td {
    padding: 7px 10px;
    border-bottom: 1px solid #f0f2f5;
    vertical-align: top;
  }
  .tool-table tr:last-child td { border-bottom: none; }
  .tool-table tr:hover td { background: #f8fafc; }
  .tool-table .tool-name {
    font-family: "SF Mono", monospace;
    color: #7c3aed;
    white-space: nowrap;
    font-weight: 600;
  }
  .tool-table .tool-error { color: #dc2626; }
  .tool-table .expandable {
    max-height: 60px;
    overflow: hidden;
    cursor: pointer;
    position: relative;
  }
  .tool-table .expandable.expanded { max-height: none; }
  .tool-table .expandable pre {
    white-space: pre-wrap;
    word-break: break-all;
    color: #334155;
  }

  /* Conversation */
  .message {
    display: flex;
    gap: 10px;
    margin-bottom: 14px;
  }
  .message:last-child { margin-bottom: 0; }
  .msg-role {
    width: 64px;
    flex-shrink: 0;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    padding-top: 3px;
    color: #94a3b8;
    text-align: right;
  }
  .msg-role.user { color: #3b82f6; }
  .msg-role.assistant { color: #8b5cf6; }
  .msg-role.tool { color: #f59e0b; }
  .msg-bubble {
    flex: 1;
    background: #f8fafc;
    border-radius: 8px;
    padding: 10px 14px;
    border: 1px solid #e2e8f0;
    font-size: 13px;
    line-height: 1.6;
    color: #334155;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .msg-bubble.user-bubble { background: #eff6ff; border-color: #bfdbfe; }
  .msg-bubble.assistant-bubble { background: #faf5ff; border-color: #e9d5ff; }
  .msg-bubble.tool-bubble {
    background: #fffbeb;
    border-color: #fde68a;
    font-family: "SF Mono", monospace;
    font-size: 12px;
  }
  .thinking-block {
    background: #fefce8;
    border: 1px solid #fde68a;
    border-left: 3px solid #f59e0b;
    border-radius: 6px;
    padding: 8px 14px;
    margin-top: 6px;
    font-size: 13px;
    color: #78350f;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .thinking-block .thinking-label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: #b45309;
    margin-bottom: 4px;
  }

  /* Sensors */
  .sensors-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .sensors-table th {
    text-align: left; padding: 7px 12px;
    background: #f1f5f9; font-size: 11px; font-weight: 600;
    text-transform: uppercase; letter-spacing: .05em; color: #475569;
    border-bottom: 1px solid #e2e8f0;
  }
  .sensors-table td { padding: 8px 12px; border-bottom: 1px solid #f0f2f5; vertical-align: middle; }
  .sensors-table tr:last-child td { border-bottom: none; }
  .sensors-table .runner-name { font-weight: 600; font-family: "SF Mono", monospace; font-size: 12px; }
  .sensor-status { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600; }
  .sensor-status.success { background: #dcfce7; color: #166534; }
  .sensor-status.failure { background: #fee2e2; color: #991b1b; }
  .sensor-status.below_threshold { background: #fef9c3; color: #713f12; }
  .sensor-status.unknown { background: #f1f5f9; color: #475569; }
  .sensor-delta { font-size: 12px; font-weight: 600; }
  .sensor-delta.improved { color: #16a34a; }
  .sensor-delta.regressed { color: #dc2626; }
  .sensor-delta.unchanged { color: #94a3b8; }
  .sensors-unavailable { color: #94a3b8; font-style: italic; font-size: 13px; }

  /* ── Scenario Overview ── */
  .overview-item { border-left: 3px solid transparent; }
  .overview-item:hover { background: #faf5ff; border-left-color: #8b5cf6; }
  .overview-item.active { background: #f5f3ff; border-left: 3px solid #8b5cf6; }

  .overview-header { margin-bottom: 20px; }
  .ov-title { font-size: 20px; font-weight: 800; color: #1a1a2e; margin-bottom: 4px; }
  .ov-subtitle { color: #64748b; font-size: 13px; }

  .overview-summary {
    display: flex; gap: 0; flex-wrap: wrap; margin-bottom: 20px;
    background: #fff; border-radius: 10px;
    border: 1px solid #e2e8f0; overflow: hidden;
  }
  .ov-stat {
    text-align: center; padding: 14px 18px; flex: 1; min-width: 80px;
    border-right: 1px solid #e2e8f0;
  }
  .ov-stat:last-child { border-right: none; }
  .ov-stat-val { font-size: 20px; font-weight: 700; color: #1a1a2e; line-height: 1.2; }
  .ov-stat-val.pass { color: #16a34a; }
  .ov-stat-val.fail { color: #dc2626; }
  .ov-stat-val.partial { color: #d97706; }
  .ov-stat-label { font-size: 10px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 3px; }

  .ov-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .ov-th {
    text-align: left; padding: 9px 14px; background: #f1f5f9;
    font-size: 11px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.05em; color: #475569; border-bottom: 2px solid #e2e8f0;
    cursor: pointer; user-select: none; white-space: nowrap;
  }
  .ov-th:hover { background: #e2e8f0; color: #1a1a2e; }
  .ov-th.active { color: #3b82f6; background: #eff6ff; border-bottom-color: #3b82f6; }
  .ov-row { cursor: pointer; }
  .ov-row td { padding: 10px 14px; border-bottom: 1px solid #f0f2f5; vertical-align: middle; }
  .ov-row:hover td { background: #f8fafc; }
  .ov-row:last-child td { border-bottom: none; }
  .ov-model { font-size: 12px; line-height: 1.5; }
  .ov-model strong { color: #1e40af; font-family: "SF Mono", monospace; font-size: 12px; }
  .ov-date { font-size: 12px; color: #64748b; white-space: nowrap; }

  .mini-bar {
    display: inline-block; width: 52px; height: 6px;
    background: #e2e8f0; border-radius: 3px; vertical-align: middle;
    overflow: hidden; margin-right: 5px; flex-shrink: 0;
  }
  .mini-bar-fill { display: block; height: 100%; border-radius: 3px; }

  .tool-block {
    background: #1e1e3f;
    color: #a9b1d6;
    border-radius: 6px;
    padding: 10px 14px;
    font-family: "SF Mono", monospace;
    font-size: 12px;
    white-space: pre-wrap;
    word-break: break-all;
    margin-top: 6px;
  }
  .tool-block .tool-header {
    color: #7aa2f7;
    font-weight: 700;
    margin-bottom: 6px;
  }
</style>
</head>
<body>

<header>
  <h1>Local Coding Evals</h1>
  <span class="count">${runs.length} run${runs.length !== 1 ? "s" : ""}</span>
</header>

<div class="layout">
  <aside>
    <div class="sidebar-top">
      <button class="group-btn active" id="btn-model" onclick="setSidebarGroup('model')">By Model</button>
      <button class="group-btn" id="btn-scenario" onclick="setSidebarGroup('scenario')">By Scenario</button>
    </div>
    <div id="sidebar-list"></div>
  </aside>

  <main id="main">
    <div class="placeholder" id="placeholder">Select a run to view details</div>
    <div id="details"></div>
  </main>
</div>

<script>
const RUNS = ${JSON.stringify(runs.map((r) => {
  const eval_ = r.data.evaluation;
  const screenshots = (eval_?.screenshots && eval_.screenshots.length > 0)
    ? eval_.screenshots
    : extractScreenshotsFromFullOutput(eval_?.fullOutput);
  return {
    file: r.file,
    data: {
      ...r.data,
      evaluation: eval_ ? { ...eval_, screenshots } : eval_,
      _reasoningHtml: mdToHtml(eval_?.fullOutput ?? eval_?.reasoning ?? "No reasoning provided."),
    },
  };
})).replace(/<\//g, "<\\/")};


function fmt(ms) {
  if (ms < 60000) return (ms / 1000).toFixed(1) + "s";
  return Math.floor(ms / 60000) + "m " + ((ms % 60000) / 1000).toFixed(0) + "s";
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function prettyJson(v) {
  try { return JSON.stringify(typeof v === "string" ? JSON.parse(v) : v, null, 2); }
  catch { return String(v ?? ""); }
}

// ── Sidebar ──────────────────────────────────────────────
let currentGroupBy = "model";
let selectedRunIndex = -1;

// ── Scenario Overview ─────────────────────────────────────
let selectedOverviewScenario = null;
let scenarioGroupKeys = [];
let ovSortKey = "date";
let ovSortDir = -1;

function countToolCalls(conversation) {
  return (conversation ?? []).reduce((n, msg) => {
    if (!Array.isArray(msg.content)) return n;
    return n + msg.content.filter(b => b.type === "tool_use" || b.type === "toolCall").length;
  }, 0);
}

function miniBar(value, max, color) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100).toFixed(1) : 0;
  return \`<span class="mini-bar"><span class="mini-bar-fill" style="width:\${pct}%;background:\${color || "#3b82f6"}"></span></span>\`;
}

function renderScenarioOverview(scenarioName) {
  const base = RUNS.map((r, i) => ({ ...r, idx: i })).filter(r => r.data.scenarioName === scenarioName);
  if (!base.length) return "<em>No runs found.</em>";

  base.forEach(r => {
    r._dur    = r.data.durationMs;
    r._turns  = (r.data.conversation ?? []).length;
    r._tc     = countToolCalls(r.data.conversation);
    r._tok    = r.data.tokenUsage?.total    ?? 0;
    r._tokIn  = r.data.tokenUsage?.input    ?? 0;
    r._tokOut = r.data.tokenUsage?.output   ?? 0;
    r._ctx    = r.data.contextUsage?.percent ?? null;
    r._score  = r.data.evaluation?.score    ?? 0;
    r._pass   = r.data.evaluation?.passed   ?? false;
  });

  const getVal = {
    date:      r => r.data.startTime,
    duration:  r => r._dur,
    turns:     r => r._turns,
    toolcalls: r => r._tc,
    tokens:    r => r._tok,
    context:   r => r._ctx ?? -1,
    score:     r => r._score,
    model:     r => r.data.taskModel?.model ?? "",
  };
  const cmpFn = getVal[ovSortKey] ?? getVal.date;
  const sorted = [...base].sort((a, b) => {
    const av = cmpFn(a), bv = cmpFn(b);
    return (typeof av === "string" ? av.localeCompare(bv) : av - bv) * ovSortDir;
  });

  const maxDur = Math.max(...base.map(r => r._dur));
  const minDur = Math.min(...base.map(r => r._dur));
  const maxT   = Math.max(...base.map(r => r._turns), 1);
  const maxTc  = Math.max(...base.map(r => r._tc),    1);
  const maxTok = Math.max(...base.map(r => r._tok),   1);
  const maxCtx = Math.max(...base.map(r => r._ctx ?? 0), 1);

  const passCount = base.filter(r => r._pass).length;
  const avgDur    = base.reduce((s, r) => s + r._dur,   0) / base.length;
  const avgT      = base.reduce((s, r) => s + r._turns, 0) / base.length;
  const tokArr    = base.filter(r => r._tok > 0);
  const avgTok    = tokArr.length ? tokArr.reduce((s, r) => s + r._tok, 0) / tokArr.length : 0;
  const ctxArr    = base.filter(r => r._ctx != null);
  const avgCtx    = ctxArr.length ? ctxArr.reduce((s, r) => s + r._ctx, 0) / ctxArr.length : 0;
  const bestScore = Math.max(...base.map(r => r._score));
  const passRateCls = passCount === base.length ? "pass" : passCount === 0 ? "fail" : "partial";

  const statCards = [
    { v: base.length,                          label: "Runs" },
    { v: passCount + "/" + base.length,        label: "Passed",       cls: passRateCls },
    { v: (bestScore * 100).toFixed(0) + "%",   label: "Best Score" },
    { v: fmt(avgDur),                          label: "Avg Duration" },
    { v: fmt(minDur),                          label: "Fastest" },
    { v: fmt(maxDur),                          label: "Slowest" },
    { v: avgT.toFixed(1),                      label: "Avg Turns" },
    ...(avgTok > 0 ? [{ v: Math.round(avgTok).toLocaleString(), label: "Avg Tokens" }]  : []),
    ...(avgCtx > 0 ? [{ v: avgCtx.toFixed(1) + "%",            label: "Avg Ctx Fill" }] : []),
  ];

  function th(key, label) {
    const active = ovSortKey === key;
    const arrow  = active ? (ovSortDir === -1 ? " ↓" : " ↑") : "";
    return \`<th class="ov-th\${active ? " active" : ""}" onclick="ovSort('\${key}')" title="Sort by \${label}">\${label}\${arrow}</th>\`;
  }

  const rows = sorted.map(r => {
    const pass = r._pass, score = r._score, dur = r._dur;
    const t    = r._turns, tc   = r._tc;
    const tok  = r._tok,   ctx  = r._ctx;
    const model    = r.data.taskModel?.model    ?? "";
    const provider = r.data.taskModel?.provider ?? "";
    const date     = new Date(r.data.startTime).toLocaleString();
    const ctxWin   = r.data.contextUsage?.contextWindow;

    const durColor = base.length > 1
      ? (dur === minDur ? "#22c55e" : dur === maxDur ? "#ef4444" : "#3b82f6")
      : "#3b82f6";
    const ctxColor = ctx != null
      ? (ctx > 80 ? "#ef4444" : ctx > 60 ? "#f59e0b" : "#22c55e")
      : "#3b82f6";

    const tokCell = tok > 0
      ? miniBar(tok, maxTok) + tok.toLocaleString()
        + \`<br><span style="color:#94a3b8;font-size:11px">↑ \${r._tokIn.toLocaleString()} / ↓ \${r._tokOut.toLocaleString()}</span>\`
      : \`<span style="color:#94a3b8">—</span>\`;

    const ctxCell = ctx != null
      ? miniBar(ctx, maxCtx, ctxColor) + ctx.toFixed(1) + "%"
        + (ctxWin ? \` <span style="color:#94a3b8;font-size:10px">/ \${ctxWin.toLocaleString()}</span>\` : "")
      : \`<span style="color:#94a3b8">—</span>\`;

    return \`<tr class="ov-row" onclick="selectRun(\${r.idx})">
      <td><div class="ov-model">
        <span style="font-size:10px;color:#94a3b8">\${esc(provider)}</span><br>
        <strong>\${esc(model)}</strong>
      </div></td>
      <td class="ov-date">\${esc(date)}</td>
      <td style="white-space:nowrap">
        <span class="badge \${pass ? "pass" : "fail"}">\${pass ? "PASS" : "FAIL"}</span>
        <span style="margin-left:6px;color:#64748b;font-size:12px">\${(score * 100).toFixed(0)}%</span>
      </td>
      <td style="white-space:nowrap">\${miniBar(dur, maxDur, durColor)}\${fmt(dur)}</td>
      <td style="white-space:nowrap">\${miniBar(t,   maxT)}\${t}</td>
      <td style="white-space:nowrap">\${miniBar(tc,  maxTc)}\${tc}</td>
      <td>\${tokCell}</td>
      <td style="white-space:nowrap">\${ctxCell}</td>
    </tr>\`;
  }).join("");

  return \`<div class="overview-header">
    <h2 class="ov-title">\${esc(scenarioName)}</h2>
    <p class="ov-subtitle">\${base.length} run\${base.length !== 1 ? "s" : ""} &middot; click a row to view full run details</p>
  </div>
  <div class="overview-summary">\${statCards.map(c =>
    \`<div class="ov-stat">
      <div class="ov-stat-val\${c.cls ? " " + c.cls : ""}">\${c.v}</div>
      <div class="ov-stat-label">\${c.label}</div>
    </div>\`
  ).join("")}</div>
  <div class="section" style="margin-bottom:0">
    <div class="section-header open" onclick="toggleSection(this,'ov-tbl')">
      Runs Comparison
      <span style="font-size:11px;color:#94a3b8;font-weight:400;margin-left:6px">&#8597; click headers to sort</span>
      <span class="chevron">&#9656;</span>
    </div>
    <div class="section-body" id="ov-tbl" style="padding:0;overflow-x:auto">
      <table class="ov-table">
        <thead><tr>
          \${th("model","Model")}\${th("date","Date")}\${th("score","Result")}
          \${th("duration","Duration")}\${th("turns","Turns")}\${th("toolcalls","Tool Calls")}
          \${th("tokens","Tokens")}\${th("context","Context Fill")}
        </tr></thead>
        <tbody>\${rows}</tbody>
      </table>
    </div>
  </div>\`;
}

function selectOverview(groupIndex) {
  const scenarioName = scenarioGroupKeys[groupIndex];
  if (scenarioName == null) return;
  selectedOverviewScenario = scenarioName;
  selectedRunIndex = -1;
  document.querySelectorAll(".run-item").forEach(el => el.classList.remove("active"));
  document.querySelectorAll(".overview-item[data-gi]").forEach(el => {
    el.classList.toggle("active", +el.dataset.gi === groupIndex);
  });
  document.getElementById("placeholder").style.display = "none";
  document.getElementById("details").innerHTML = renderScenarioOverview(scenarioName);
}

function ovSort(key) {
  if (ovSortKey === key) ovSortDir *= -1;
  else { ovSortKey = key; ovSortDir = -1; }
  if (selectedOverviewScenario != null) {
    document.getElementById("details").innerHTML = renderScenarioOverview(selectedOverviewScenario);
  }
}

function renderRunItem(d, i) {
  const pass = d.evaluation?.passed;
  const score = d.evaluation?.score ?? 0;
  const date = new Date(d.startTime).toLocaleString();
  const turns = (d.conversation ?? []).length;
  const model = d.taskModel?.model ?? "";
  const active = i === selectedRunIndex;
  return \`<div class="run-item\${active ? " active" : ""}" data-index="\${i}" onclick="selectRun(\${i})">
    <div class="name">\${esc(d.scenarioName)}</div>
    <div class="meta">
      <span class="badge \${pass ? "pass" : "fail"}">\${pass ? "PASS" : "FAIL"}</span>
      <span>\${(score * 100).toFixed(0)}%</span>
      <span>\${fmt(d.durationMs)}</span>
      <span>\${turns} turns</span>
    </div>
    <div class="score-bar-wrap">
      <div class="score-bar \${pass ? "pass" : "fail"}" style="width:\${(score * 100).toFixed(1)}%"></div>
    </div>
    <div class="meta" style="margin-top:5px; font-size:10px;">\${esc(model)} &middot; \${esc(date)}</div>
  </div>\`;
}

function buildSidebar() {
  const groupKey = (d) => currentGroupBy === "model"
    ? (d.taskModel?.model ?? "unknown")
    : d.scenarioName;

  const groups = new Map();
  RUNS.forEach((r, i) => {
    const key = groupKey(r.data);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ d: r.data, i });
  });

  const groupsArr = Array.from(groups.entries());
  if (currentGroupBy === "scenario") {
    scenarioGroupKeys = groupsArr.map(([key]) => key);
  }

  document.getElementById("sidebar-list").innerHTML = groupsArr.map(([key, items], gi) => {
    const ovItem = currentGroupBy === "scenario"
      ? \`<div class="run-item overview-item\${selectedOverviewScenario === key ? " active" : ""}" data-gi="\${gi}" onclick="selectOverview(\${gi})">
          <div class="name">&#8862; Overview &amp; Compare</div>
          <div class="meta">\${items.length} run\${items.length !== 1 ? "s" : ""} &middot; all models</div>
        </div>\`
      : "";
    return \`<div class="group-label">\${esc(key)}</div>\` + ovItem +
      items.map(({ d, i }) => renderRunItem(d, i)).join("");
  }).join("");
}

function setSidebarGroup(groupBy) {
  currentGroupBy = groupBy;
  document.getElementById("btn-model").classList.toggle("active", groupBy === "model");
  document.getElementById("btn-scenario").classList.toggle("active", groupBy === "scenario");
  buildSidebar();
}

// ── Detail ───────────────────────────────────────────────
function section(title, bodyHtml, openByDefault = true) {
  const id = "s" + Math.random().toString(36).slice(2);
  return \`<div class="section">
    <div class="section-header \${openByDefault ? "open" : ""}" onclick="toggleSection(this, '\${id}')">
      \${esc(title)}
      <span class="chevron">&#9656;</span>
    </div>
    <div class="section-body \${openByDefault ? "" : "hidden"}" id="\${id}">\${bodyHtml}</div>
  </div>\`;
}

function toggleSection(header, id) {
  header.classList.toggle("open");
  document.getElementById(id).classList.toggle("hidden");
}

function renderConversation(messages) {
  if (!messages?.length) return "<em style='color:#94a3b8'>No conversation recorded.</em>";
  return messages.map(msg => {
    const role = (msg.role || "unknown").toLowerCase();
    const content = msg.content;
    let bubbleHtml = "";

    if (typeof content === "string") {
      bubbleHtml = \`<div class="msg-bubble \${role}-bubble">\${esc(content)}</div>\`;
    } else if (Array.isArray(content)) {
      bubbleHtml = content.map(block => {
        if (block.type === "thinking") {
          return \`<div class="thinking-block">
            <div class="thinking-label">&#129300; Thinking</div>\${esc(block.thinking ?? "")}</div>\`;
        } else if (block.type === "text") {
          return \`<div class="msg-bubble \${role}-bubble">\${esc(block.text ?? "")}</div>\`;
        } else if (block.type === "tool_use") {
          return \`<div class="tool-block">
            <div class="tool-header">&#128295; \${esc(block.name)}</div>\${esc(prettyJson(block.input))}</div>\`;
        } else if (block.type === "toolCall") {
          return \`<div class="tool-block">
            <div class="tool-header">&#128295; \${esc(block.name)}</div>\${esc(prettyJson(block.arguments))}</div>\`;
        } else if (block.type === "tool_result") {
          const inner = Array.isArray(block.content)
            ? block.content.map(c => c.text ?? "").join("\\n")
            : String(block.content ?? "");
          return \`<div class="tool-block" style="background:#1a2e1a; border-left: 3px solid #22c55e;">
            <div class="tool-header" style="color:#86efac; cursor:pointer; user-select:none" onclick="const b=this.nextElementSibling; const open=b.style.display!=='none'; b.style.display=open?'none':'block'; this.querySelector('.tr-chevron').style.transform=open?'':'rotate(90deg)'">&#10003; tool result <span class="tr-chevron" style="float:right; display:inline-block; transition:transform 0.2s">&#9656;</span></div>
            <div style="display:none">\${esc(inner)}</div></div>\`;
        } else if (block.type === "toolResult") {
          const inner = Array.isArray(block.content)
            ? block.content.map(c => c.text ?? "").join("\\n")
            : String(block.result ?? block.content ?? "");
          return \`<div class="tool-block" style="background:#1a2e1a; border-left: 3px solid #22c55e;">
            <div class="tool-header" style="color:#86efac; cursor:pointer; user-select:none" onclick="const b=this.nextElementSibling; const open=b.style.display!=='none'; b.style.display=open?'none':'block'; this.querySelector('.tr-chevron').style.transform=open?'':'rotate(90deg)'">&#10003; tool result <span class="tr-chevron" style="float:right; display:inline-block; transition:transform 0.2s">&#9656;</span></div>
            <div style="display:none">\${esc(inner)}</div></div>\`;
        } else {
          return \`<div class="msg-bubble">\${esc(JSON.stringify(block))}</div>\`;
        }
      }).join("\\n");
    } else {
      bubbleHtml = \`<div class="msg-bubble">\${esc(JSON.stringify(content))}</div>\`;
    }

    return \`<div class="message">
      <div class="msg-role \${role}">\${esc(role)}</div>
      <div style="flex:1">\${bubbleHtml}</div>
    </div>\`;
  }).join("");
}

function renderToolCalls(toolCalls) {
  if (!toolCalls?.length) return "<em style='color:#94a3b8'>No tool calls recorded.</em>";
  const rows = toolCalls.map((tc, i) => {
    const argsStr = prettyJson(tc.args);
    const resultStr = prettyJson(tc.result);
    return \`<tr>
      <td><span class="tool-name">\${esc(tc.toolName)}</span></td>
      <td><div class="expandable" id="args\${i}" onclick="expand(this)"><pre>\${esc(argsStr)}</pre></div></td>
      <td class="\${tc.isError ? "tool-error" : ""}">
        <div class="expandable" id="res\${i}" onclick="expand(this)"><pre>\${esc(resultStr)}</pre></div>
      </td>
    </tr>\`;
  }).join("");
  return \`<table class="tool-table">
    <thead><tr><th>Tool</th><th>Args</th><th>Result</th></tr></thead>
    <tbody>\${rows}</tbody>
  </table>\`;
}

function expand(el) { el.classList.toggle("expanded"); }
function imgError(img) {
  img.style.display = "none";
  const msg = document.createElement("span");
  msg.style.cssText = "font-size:12px; color:#dc2626";
  msg.textContent = "Could not load: " + img.src;
  img.parentElement.appendChild(msg);
}

function renderScreenshots(paths) {
  if (!paths.length) return "";
  const imgs = paths.map(p => {
    const src = p.startsWith("/") ? \`file://\${p}\` : p;
    return \`<div style="margin-bottom:10px">
      <div style="font-size:11px; color:#94a3b8; margin-bottom:4px; font-family:'SF Mono',monospace">\${esc(p)}</div>
      <img src="\${esc(src)}" alt="\${esc(p)}" style="max-width:100%; border-radius:6px; border:1px solid #e2e8f0; display:block" onerror="imgError(this)">
    </div>\`;
  }).join("");
  return \`<div style="margin-bottom:20px">\${imgs}</div>\`;
}

function renderToolSummary(messages) {
  const allBlocks = (messages ?? []).flatMap(msg =>
    Array.isArray(msg.content) ? msg.content : []
  );
  const toolBlocks = allBlocks.filter(b => b.type === "tool_use" || b.type === "toolCall");
  if (!toolBlocks.length) return "<em style='color:#94a3b8'>No tool calls recorded.</em>";
  const counts = {};
  toolBlocks.forEach(b => {
    const name = b.name ?? "unknown";
    counts[name] = (counts[name] ?? 0) + 1;
  });
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name, count]) =>
    \`<tr><td><span class="tool-name">\${esc(name)}</span></td><td style="text-align:right; font-weight:600; padding-right:14px">\${count}</td></tr>\`
  ).join("");
  return \`<div style="margin-bottom:12px; font-size:13px; color:#475569"><strong>\${toolBlocks.length}</strong> total call\${toolBlocks.length !== 1 ? "s" : ""}</div>
    <table class="tool-table">
      <thead><tr><th>Tool</th><th style="text-align:right">Calls</th></tr></thead>
      <tbody>\${rows}</tbody>
    </table>\`;
}

function renderSensors(sensors) {
  if (!sensors?.available) return \`<div class="sensors-unavailable">Sensors not configured for this codebase.</div>\`;
  if (!sensors.started) return \`<div class="sensors-unavailable">Sensors detected but failed to start.</div>\`;
  if (!sensors.stateAfter) return \`<div class="sensors-unavailable">Sensors started but no after-state captured.</div>\`;

  const runners = Object.keys(sensors.stateAfter);
  const rows = runners.map(name => {
    const after = sensors.stateAfter[name];
    const before = sensors.stateBefore?.[name];

    const statusClass = after.status.replace(/_/g, "-").toLowerCase();
    const statusEl = \`<span class="sensor-status \${esc(after.status)}">\${esc(after.status.replace(/_/g, " "))}</span>\`;

    let deltaEl = "";
    if (before) {
      const bv = before.score?.value ?? null;
      const av = after.score?.value ?? null;
      const dir = after.score?.direction ?? "less";
      if (bv !== null && av !== null && bv !== av) {
        const diff = av - bv;
        const improved = dir === "less" ? diff < 0 : diff > 0;
        const sign = diff > 0 ? "+" : "";
        deltaEl = \`<span class="sensor-delta \${improved ? "improved" : "regressed"}">\${sign}\${diff.toFixed(diff % 1 === 0 ? 0 : 2)} \${improved ? "&#9650;" : "&#9660;"}</span>\`;
      } else if (bv !== null && av !== null) {
        deltaEl = \`<span class="sensor-delta unchanged">= unchanged</span>\`;
      }
    }

    const beforeSummary = before ? esc(before.summary) : \`<span style="color:#94a3b8">no baseline</span>\`;

    return \`<tr>
      <td><span class="runner-name">\${esc(name)}</span></td>
      <td>\${statusEl}</td>
      <td>\${esc(after.summary)}</td>
      <td>\${beforeSummary}</td>
      <td>\${deltaEl}</td>
    </tr>\`;
  }).join("");

  return \`<table class="sensors-table">
    <thead><tr><th>Sensor</th><th>Status</th><th>After</th><th>Before</th><th>Delta</th></tr></thead>
    <tbody>\${rows}</tbody>
  </table>\`;
}

function selectRun(index) {
  selectedOverviewScenario = null;
  selectedRunIndex = index;
  document.querySelectorAll(".run-item").forEach(el => {
    el.classList.toggle("active", parseInt(el.dataset.index) === index);
  });

  const r = RUNS[index].data;
  const pass = r.evaluation?.passed;
  const score = r.evaluation?.score ?? 0;
  const date = new Date(r.startTime).toLocaleString();
  const turns = (r.conversation ?? []).length;
  const toolCallCount = (r.conversation ?? []).reduce((n, msg) => {
    if (!Array.isArray(msg.content)) return n;
    return n + msg.content.filter(b => b.type === "tool_use" || b.type === "toolCall").length;
  }, 0);

  document.getElementById("placeholder").style.display = "none";

  document.getElementById("details").innerHTML = \`
    <div class="summary-card">
      <div class="verdict \${pass ? "pass" : "fail"}">\${pass ? "PASS" : "FAIL"}</div>
      <div class="info">
        <div class="scenario-name">\${esc(r.scenarioName)}</div>
        <div class="stats">
          <span><strong>Score</strong> \${(score * 100).toFixed(0)}%</span>
          <span><strong>Duration</strong> \${fmt(r.durationMs)}</span>
          <span><strong>Turns</strong> \${turns}</span>
          <span><strong>Tool calls</strong> \${toolCallCount}</span>
        </div>
        <div class="stats" style="margin-top:6px">
          \${r.tokenUsage ? \`<span title="Sum of all tokens sent and received across every API call in the session"><strong>Tokens used over all turns</strong> \${r.tokenUsage.total.toLocaleString()} (in: \${r.tokenUsage.input.toLocaleString()}, out: \${r.tokenUsage.output.toLocaleString()})</span>\` : ""}
          \${r.contextUsage?.tokens != null ? \`<span title="How full the context window was at the end of the session — the model's peak memory footprint"><strong>Final context size</strong> \${r.contextUsage.tokens.toLocaleString()} / \${r.contextUsage.contextWindow.toLocaleString()}\${r.contextUsage.percent != null ? \` (\${r.contextUsage.percent.toFixed(1)}%)\` : ""}</span>\` : ""}
        </div>
        <div class="stats" style="margin-top:6px">
          <span><strong>Run at</strong> \${esc(date)}</span>
          <span><strong>Codebase</strong> \${esc(r.codebasePath)}</span>
        </div>
      </div>
    </div>

    \${section("Models", \`<div class="models-grid">
      <div class="model-card">
        <div class="label">Task model</div>
        <div class="value">\${esc(r.taskModel.provider + "/" + r.taskModel.model)}</div>
        \${r.taskModelConfig ? \`<div style="margin-top:8px; font-size:11px; color:#475569; line-height:1.7">
          \${r.taskModelConfig.loaded_instance_config ? \`<div><strong>Context (loaded):</strong> \${r.taskModelConfig.loaded_instance_config.context_length.toLocaleString()} tokens</div>\` : ""}
          <div><strong>Context (max):</strong> \${r.taskModelConfig.max_context_length.toLocaleString()} tokens</div>
          \${r.taskModelConfig.params_string ? \`<div><strong>Params:</strong> \${esc(r.taskModelConfig.params_string)}</div>\` : ""}
          \${r.taskModelConfig.quantization?.name ? \`<div><strong>Quant:</strong> \${esc(r.taskModelConfig.quantization.name)}</div>\` : ""}
        </div>\` : ""}
      </div>
      <div class="model-card">
        <div class="label">Evaluator model</div>
        <div class="value">\${esc(r.evaluatorModel.provider + "/" + r.evaluatorModel.model)}</div>
      </div>
    </div>\`)}

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:14px; align-items:start">
      <div style="margin-bottom:0">\${section("Prompt", \`<div class="prose">\${esc(r.prompt)}</div>\`, false)}</div>
      <div style="margin-bottom:0">\${section("Expectation", \`<div class="prose">\${esc(r.expectation)}</div>\`, false)}</div>
    </div>

    \${renderScreenshots(r.evaluation?.screenshots ?? [])}

    \${section("Evaluation", \`
      <div style="margin-bottom:16px; padding:12px 16px; background:\${pass ? "#f0fdf4" : "#fef2f2"}; border-radius:8px; border:1px solid \${pass ? "#bbf7d0" : "#fecaca"}; line-height:1.65; color:#334155">
        \${r._reasoningHtml ?? "No reasoning provided."}
      </div>
      \${section("Evaluator Tool Calls", renderToolCalls(r.evaluation?.toolCalls), false)}
    \`)}

    \${section("Sensors", renderSensors(r.sensors))}

    \${section("Task run",
      section("Tool Calls", renderToolSummary(r.conversation), true) +
      section("Conversation", renderConversation(r.conversation), false),
    false)}
  \`;
}

buildSidebar();
if (RUNS.length > 0) selectRun(0);
</script>
</body>
</html>`;

const outFile = path.join(resultsDir, "index.html");
fs.writeFileSync(outFile, html);
console.log(`Report written to: ${outFile}`);
console.log(`Open with: open ${outFile}`);
