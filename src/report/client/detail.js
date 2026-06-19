// Run detail rendering: section helpers, conversation/tool/sensor renderers, and selectRun.
// Depends on: RUNS (data), fmt/esc/prettyJson (utils.js), selectedOverviewScenario (sidebar.js)

function section(title, bodyHtml, openByDefault = true) {
  const id = "s" + Math.random().toString(36).slice(2);
  return `<div class="section">
    <div class="section-header ${openByDefault ? "open" : ""}" onclick="toggleSection(this, '${id}')">
      ${esc(title)}
      <span class="chevron">&#9656;</span>
    </div>
    <div class="section-body ${openByDefault ? "" : "hidden"}" id="${id}">${bodyHtml}</div>
  </div>`;
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
      bubbleHtml = `<div class="msg-bubble ${role}-bubble">${esc(content)}</div>`;
    } else if (Array.isArray(content)) {
      bubbleHtml = content.map(block => {
        if (block.type === "thinking") {
          return `<div class="thinking-block">
            <div class="thinking-label">&#129300; Thinking</div>${esc(block.thinking ?? "")}</div>`;
        } else if (block.type === "text") {
          return `<div class="msg-bubble ${role}-bubble">${esc(block.text ?? "")}</div>`;
        } else if (block.type === "tool_use") {
          return `<div class="tool-block">
            <div class="tool-header">&#128295; ${esc(block.name)}</div>${esc(prettyJson(block.input))}</div>`;
        } else if (block.type === "toolCall") {
          return `<div class="tool-block">
            <div class="tool-header">&#128295; ${esc(block.name)}</div>${esc(prettyJson(block.arguments))}</div>`;
        } else if (block.type === "tool_result") {
          const inner = Array.isArray(block.content)
            ? block.content.map(c => c.text ?? "").join("\n")
            : String(block.content ?? "");
          return `<div class="tool-block" style="background:#1a2e1a; border-left: 3px solid #22c55e;">
            <div class="tool-header" style="color:#86efac; cursor:pointer; user-select:none" onclick="const b=this.nextElementSibling; const open=b.style.display!=='none'; b.style.display=open?'none':'block'; this.querySelector('.tr-chevron').style.transform=open?'':'rotate(90deg)'">&#10003; tool result <span class="tr-chevron" style="float:right; display:inline-block; transition:transform 0.2s">&#9656;</span></div>
            <div style="display:none">${esc(inner)}</div></div>`;
        } else if (block.type === "toolResult") {
          const inner = Array.isArray(block.content)
            ? block.content.map(c => c.text ?? "").join("\n")
            : String(block.result ?? block.content ?? "");
          return `<div class="tool-block" style="background:#1a2e1a; border-left: 3px solid #22c55e;">
            <div class="tool-header" style="color:#86efac; cursor:pointer; user-select:none" onclick="const b=this.nextElementSibling; const open=b.style.display!=='none'; b.style.display=open?'none':'block'; this.querySelector('.tr-chevron').style.transform=open?'':'rotate(90deg)'">&#10003; tool result <span class="tr-chevron" style="float:right; display:inline-block; transition:transform 0.2s">&#9656;</span></div>
            <div style="display:none">${esc(inner)}</div></div>`;
        } else {
          return `<div class="msg-bubble">${esc(JSON.stringify(block))}</div>`;
        }
      }).join("\n");
    } else {
      bubbleHtml = `<div class="msg-bubble">${esc(JSON.stringify(content))}</div>`;
    }

    return `<div class="message">
      <div class="msg-role ${role}">${esc(role)}</div>
      <div style="flex:1">${bubbleHtml}</div>
    </div>`;
  }).join("");
}

function renderToolCalls(toolCalls) {
  if (!toolCalls?.length) return "<em style='color:#94a3b8'>No tool calls recorded.</em>";
  const rows = toolCalls.map((tc, i) => {
    const argsStr = prettyJson(tc.args);
    const resultStr = prettyJson(tc.result);
    return `<tr>
      <td><span class="tool-name">${esc(tc.toolName)}</span></td>
      <td><div class="expandable" id="args${i}" onclick="expand(this)"><pre>${esc(argsStr)}</pre></div></td>
      <td class="${tc.isError ? "tool-error" : ""}">
        <div class="expandable" id="res${i}" onclick="expand(this)"><pre>${esc(resultStr)}</pre></div>
      </td>
    </tr>`;
  }).join("");
  return `<table class="tool-table">
    <thead><tr><th>Tool</th><th>Args</th><th>Result</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
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
    const src = p.startsWith("/") ? `file://${p}` : p;
    return `<div style="margin-bottom:10px">
      <div style="font-size:11px; color:#94a3b8; margin-bottom:4px; font-family:'SF Mono',monospace">${esc(p)}</div>
      <img src="${esc(src)}" alt="${esc(p)}" style="max-width:100%; border-radius:6px; border:1px solid #e2e8f0; display:block" onerror="imgError(this)">
    </div>`;
  }).join("");
  return `<div style="margin-bottom:20px">${imgs}</div>`;
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
    `<tr><td><span class="tool-name">${esc(name)}</span></td><td style="text-align:right; font-weight:600; padding-right:14px">${count}</td></tr>`
  ).join("");
  return `<div style="margin-bottom:12px; font-size:13px; color:#475569"><strong>${toolBlocks.length}</strong> total call${toolBlocks.length !== 1 ? "s" : ""}</div>
    <table class="tool-table">
      <thead><tr><th>Tool</th><th style="text-align:right">Calls</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderSensors(sensors) {
  if (!sensors?.available) return `<div class="sensors-unavailable">Sensors not configured for this codebase.</div>`;
  if (!sensors.started) return `<div class="sensors-unavailable">Sensors detected but failed to start.</div>`;
  if (!sensors.stateAfter) return `<div class="sensors-unavailable">Sensors started but no after-state captured.</div>`;

  const runners = Object.keys(sensors.stateAfter);
  const rows = runners.map(name => {
    const after = sensors.stateAfter[name];
    const before = sensors.stateBefore?.[name];
    const statusEl = `<span class="sensor-status ${esc(after.status)}">${esc(after.status.replace(/_/g, " "))}</span>`;

    let deltaEl = "";
    if (before) {
      const bv = before.score?.value ?? null;
      const av = after.score?.value ?? null;
      const dir = after.score?.direction ?? "less";
      if (bv !== null && av !== null && bv !== av) {
        const diff = av - bv;
        const improved = dir === "less" ? diff < 0 : diff > 0;
        const sign = diff > 0 ? "+" : "";
        deltaEl = `<span class="sensor-delta ${improved ? "improved" : "regressed"}">${sign}${diff.toFixed(diff % 1 === 0 ? 0 : 2)} ${improved ? "&#9650;" : "&#9660;"}</span>`;
      } else if (bv !== null && av !== null) {
        deltaEl = `<span class="sensor-delta unchanged">= unchanged</span>`;
      }
    }

    const beforeSummary = before ? esc(before.summary) : `<span style="color:#94a3b8">no baseline</span>`;

    const findings = after.findings ?? [];
    const findingsEl = findings.length > 0
      ? `<ul class="sensor-findings">${findings.map(f => {
          const loc = f.file ? `${esc(f.file)}${f.line != null ? `:${f.line}` : ""}${f.column != null ? `:${f.column}` : ""}` : "";
          const rule = f.rule ? `<span class="sensor-finding-rule">${esc(f.rule)}</span> ` : "";
          return `<li class="sensor-finding ${esc(f.severity)}">${rule}${esc(f.message)}${loc ? ` <span class="sensor-finding-loc">${loc}</span>` : ""}</li>`;
        }).join("")}</ul>`
      : "";

    return `<tr>
      <td><span class="runner-name">${esc(name)}</span></td>
      <td>${statusEl}</td>
      <td>${esc(after.summary)}${findingsEl}</td>
      <td>${beforeSummary}</td>
      <td>${deltaEl}</td>
    </tr>`;
  }).join("");

  return `<table class="sensors-table">
    <thead><tr><th>Sensor</th><th>Status</th><th>After</th><th>Before</th><th>Delta</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
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

  document.getElementById("details").innerHTML = `
    <div class="summary-card">
      <div class="verdict ${pass ? "pass" : "fail"}">${pass ? "PASS" : "FAIL"}</div>
      <div class="info">
        <div class="scenario-name">${esc(r.scenarioName)}</div>
        <div class="stats">
          <span><strong>Score</strong> ${(score * 100).toFixed(0)}%</span>
          <span><strong>Duration</strong> ${fmt(r.durationMs)}</span>
          <span><strong>Turns</strong> ${turns}</span>
          <span><strong>Tool calls</strong> ${toolCallCount}</span>
        </div>
        <div class="stats" style="margin-top:6px">
          ${r.tokenUsage ? `<span title="Sum of all tokens sent and received across every API call in the session"><strong>Tokens used over all turns</strong> ${r.tokenUsage.total.toLocaleString()} (in: ${r.tokenUsage.input.toLocaleString()}, out: ${r.tokenUsage.output.toLocaleString()})</span>` : ""}
          ${r.contextUsage?.tokens != null ? `<span title="How full the context window was at the end of the session — the model's peak memory footprint"><strong>Final context size</strong> ${r.contextUsage.tokens.toLocaleString()} / ${r.contextUsage.contextWindow.toLocaleString()}${r.contextUsage.percent != null ? ` (${r.contextUsage.percent.toFixed(1)}%)` : ""}</span>` : ""}
        </div>
        <div class="stats" style="margin-top:6px">
          <span><strong>Run at</strong> ${esc(date)}</span>
          <span><strong>Codebase</strong> ${esc(r.codebasePath)}</span>
        </div>
      </div>
    </div>

    ${section("Models", `<div class="models-grid">
      <div class="model-card">
        <div class="label">Task model</div>
        <div class="value">${esc(r.taskModel.provider + "/" + r.taskModel.model)}</div>
        ${r.taskModelConfig ? `<div style="margin-top:8px; font-size:11px; color:#475569; line-height:1.7">
          ${r.taskModelConfig.loaded_instance_config ? `<div><strong>Context (loaded):</strong> ${r.taskModelConfig.loaded_instance_config.context_length.toLocaleString()} tokens</div>` : ""}
          <div><strong>Context (max):</strong> ${r.taskModelConfig.max_context_length.toLocaleString()} tokens</div>
          ${r.taskModelConfig.params_string ? `<div><strong>Params:</strong> ${esc(r.taskModelConfig.params_string)}</div>` : ""}
          ${r.taskModelConfig.quantization?.name ? `<div><strong>Quant:</strong> ${esc(r.taskModelConfig.quantization.name)}</div>` : ""}
        </div>` : ""}
      </div>
      <div class="model-card">
        <div class="label">Evaluator model</div>
        <div class="value">${esc(r.evaluatorModel.provider + "/" + r.evaluatorModel.model)}</div>
      </div>
    </div>`)}

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:14px; align-items:start">
      <div style="margin-bottom:0">${section("Prompt", `<div class="prose">${esc(r.prompt)}</div>`, false)}</div>
      <div style="margin-bottom:0">${section("Expectation", `<div class="prose">${esc(r.expectation)}</div>`, false)}</div>
    </div>

    ${renderScreenshots(r.evaluation?.screenshots ?? [])}

    ${section("Evaluation", `
      <div style="margin-bottom:16px; padding:12px 16px; background:${pass ? "#f0fdf4" : "#fef2f2"}; border-radius:8px; border:1px solid ${pass ? "#bbf7d0" : "#fecaca"}; line-height:1.65; color:#334155">
        ${r._reasoningHtml ?? "No reasoning provided."}
      </div>
      ${section("Evaluator Tool Calls", renderToolCalls(r.evaluation?.toolCalls), false)}
    `)}

    ${section("Sensors", renderSensors(r.sensors))}

    ${section("Task run",
      section("Tool Calls", renderToolSummary(r.conversation), true) +
      section("Conversation", renderConversation(r.conversation), false),
    false)}
  `;
}
