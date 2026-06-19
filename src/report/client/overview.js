// Scenario overview: sortable cross-run comparison table.
// Depends on: RUNS (data), fmt/esc (utils.js), selectedOverviewScenario/scenarioGroupKeys (sidebar.js)

let ovSortKey = "date";
let ovSortDir = -1;

// Soft palette: background + matching text, one entry per distinct model.
const MODEL_COLORS = [
  { bg: "#dbeafe", text: "#1e40af" }, // blue
  { bg: "#ede9fe", text: "#5b21b6" }, // violet
  { bg: "#dcfce7", text: "#166534" }, // green
  { bg: "#fed7aa", text: "#c2410c" }, // orange
  { bg: "#fce7f3", text: "#9d174d" }, // pink
  { bg: "#ccfbf1", text: "#0f766e" }, // teal
  { bg: "#fef9c3", text: "#854d0e" }, // yellow
  { bg: "#e0e7ff", text: "#3730a3" }, // indigo
];

function countToolCalls(conversation) {
  return (conversation ?? []).reduce((n, msg) => {
    if (!Array.isArray(msg.content)) return n;
    return n + msg.content.filter(b => b.type === "tool_use" || b.type === "toolCall").length;
  }, 0);
}

function miniBar(value, max, color) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100).toFixed(1) : 0;
  return `<span class="mini-bar"><span class="mini-bar-fill" style="width:${pct}%;background:${color || "#3b82f6"}"></span></span>`;
}

function renderScenarioOverview(scenarioName) {
  const base = RUNS.map((r, i) => ({ ...r, idx: i })).filter(r => r.data.scenarioName === scenarioName);
  if (!base.length) return "<em>No runs found.</em>";

  // Assign a stable color to each unique model (order of first appearance).
  const modelColorMap = new Map();
  base.forEach(r => {
    const m = r.data.taskModel?.model ?? "";
    if (!modelColorMap.has(m))
      modelColorMap.set(m, MODEL_COLORS[modelColorMap.size % MODEL_COLORS.length]);
  });

  base.forEach(r => {
    r._dur    = r.data.durationMs;
    r._turns  = (r.data.conversation ?? []).length;
    r._tc     = countToolCalls(r.data.conversation);
    r._tok    = r.data.tokenUsage?.total    ?? 0;
    r._tokIn  = r.data.tokenUsage?.input    ?? 0;
    r._tokOut = r.data.tokenUsage?.output   ?? 0;
    r._ctx    = r.data.contextUsage?.tokens  ?? null;
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
    ...(avgCtx > 0 ? [{ v: Math.round(avgCtx).toLocaleString(), label: "Avg Ctx Tokens" }] : []),
  ];

  function th(key, label) {
    const active = ovSortKey === key;
    const arrow  = active ? (ovSortDir === -1 ? " ↓" : " ↑") : "";
    return `<th class="ov-th${active ? " active" : ""}" onclick="ovSort('${key}')" title="Sort by ${label}">${label}${arrow}</th>`;
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
    const maxCtxInSet = Math.max(...base.map(r => r._ctx ?? 0));
    const minCtxInSet = Math.min(...base.map(r => r._ctx ?? Infinity).filter(v => v !== Infinity));
    const ctxColor = ctx != null && base.length > 1
      ? (ctx === maxCtxInSet ? "#ef4444" : ctx === minCtxInSet ? "#22c55e" : "#3b82f6")
      : "#3b82f6";

    const tokCell = tok > 0
      ? miniBar(tok, maxTok) + tok.toLocaleString()
        + `<br><span style="color:#94a3b8;font-size:11px">↑ ${r._tokIn.toLocaleString()} / ↓ ${r._tokOut.toLocaleString()}</span>`
      : `<span style="color:#94a3b8">—</span>`;

    const ctxCell = ctx != null
      ? miniBar(ctx, maxCtx, ctxColor) + ctx.toLocaleString()
        + (ctxWin ? ` <span style="color:#94a3b8;font-size:10px">/ ${ctxWin.toLocaleString()}</span>` : "")
      : `<span style="color:#94a3b8">—</span>`;

    return `<tr class="ov-row" onclick="selectRun(${r.idx})">
      <td><div class="ov-model" style="display:inline-flex;flex-direction:column;background:${modelColorMap.get(model).bg};border-radius:6px;padding:4px 9px;">
        <span style="font-size:10px;color:${modelColorMap.get(model).text};opacity:0.75">${esc(provider)}</span>
        <strong style="color:${modelColorMap.get(model).text}">${esc(model)}</strong>
      </div></td>
      <td class="ov-date">${esc(date)}</td>
      <td style="white-space:nowrap">
        <span class="badge ${pass ? "pass" : "fail"}">${pass ? "PASS" : "FAIL"}</span>
        <span style="margin-left:6px;color:#64748b;font-size:12px">${(score * 100).toFixed(0)}%</span>
      </td>
      <td style="white-space:nowrap">${miniBar(dur, maxDur, durColor)}${fmt(dur)}</td>
      <td style="white-space:nowrap">${miniBar(t,   maxT)}${t}</td>
      <td style="white-space:nowrap">${miniBar(tc,  maxTc)}${tc}</td>
      <td>${tokCell}</td>
      <td style="white-space:nowrap">${ctxCell}</td>
    </tr>`;
  }).join("");

  return `<div class="overview-header">
    <h2 class="ov-title">${esc(scenarioName)}</h2>
    <p class="ov-subtitle">${base.length} run${base.length !== 1 ? "s" : ""} &middot; click a row to view full run details</p>
  </div>
  <div class="overview-summary">${statCards.map(c =>
    `<div class="ov-stat">
      <div class="ov-stat-val${c.cls ? " " + c.cls : ""}">${c.v}</div>
      <div class="ov-stat-label">${c.label}</div>
    </div>`
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
          ${th("model","Model")}${th("date","Date")}${th("score","Result")}
          ${th("duration","Duration")}${th("turns","Turns")}${th("toolcalls","Tool Calls")}
          ${th("tokens","Tokens")}${th("context","Context Tokens")}
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>`;
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
