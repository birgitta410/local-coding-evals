// Sidebar state and rendering.
// Note: selectedOverviewScenario and scenarioGroupKeys are also used by overview.js,
// which is concatenated after this file.

let currentGroupBy = "model";
let selectedRunIndex = -1;
let selectedOverviewScenario = null;
let scenarioGroupKeys = [];

function renderRunItem(d, i) {
  const pass = d.evaluation?.passed;
  const score = d.evaluation?.score ?? 0;
  const date = new Date(d.startTime).toLocaleString();
  const turns = (d.conversation ?? []).length;
  const model = d.taskModel?.model ?? "";
  const active = i === selectedRunIndex;
  return `<div class="run-item${active ? " active" : ""}" data-index="${i}" onclick="selectRun(${i})">
    <div class="name">${esc(d.scenarioName)}</div>
    <div class="meta">
      <span class="badge ${pass ? "pass" : "fail"}">${pass ? "PASS" : "FAIL"}</span>
      <span>${(score * 100).toFixed(0)}%</span>
      <span>${fmt(d.durationMs)}</span>
      <span>${turns} turns</span>
    </div>
    <div class="score-bar-wrap">
      <div class="score-bar ${pass ? "pass" : "fail"}" style="width:${(score * 100).toFixed(1)}%"></div>
    </div>
    <div class="meta" style="margin-top:5px; font-size:10px;">${esc(model)} &middot; ${esc(date)}</div>
  </div>`;
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
      ? `<div class="run-item overview-item${selectedOverviewScenario === key ? " active" : ""}" data-gi="${gi}" onclick="selectOverview(${gi})">
          <div class="name">&#8862; Overview &amp; Compare</div>
          <div class="meta">${items.length} run${items.length !== 1 ? "s" : ""} &middot; all models</div>
        </div>`
      : "";
    return `<div class="group-label">${esc(key)}</div>` + ovItem +
      items.map(({ d, i }) => renderRunItem(d, i)).join("");
  }).join("");
}

function setSidebarGroup(groupBy) {
  currentGroupBy = groupBy;
  document.getElementById("btn-model").classList.toggle("active", groupBy === "model");
  document.getElementById("btn-scenario").classList.toggle("active", groupBy === "scenario");
  buildSidebar();
}
