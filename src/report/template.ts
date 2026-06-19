import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import type { RunEntry } from "./load-runs.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readAsset(relPath: string): string {
  return fs.readFileSync(path.join(__dirname, relPath), "utf-8");
}

/** Serialise run data for the browser, escaping </script> closing tags. */
function runsJson(runs: RunEntry[]): string {
  return JSON.stringify(runs.map((r) => ({ file: r.file, data: r.data }))).replace(
    /<\//g,
    "<\\/",
  );
}

/** Assemble the full report HTML from CSS, HTML shell, and client JS assets. */
export function buildHtml(runs: RunEntry[]): string {
  const css = readAsset("styles.css");

  const clientScript = [
    `const RUNS = ${runsJson(runs)};`,
    readAsset("client/utils.js"),
    readAsset("client/sidebar.js"),
    readAsset("client/overview.js"),
    readAsset("client/detail.js"),
    readAsset("client/init.js"),
  ].join("\n\n");

  const count = runs.length;

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Local Coding Evals</title>
<style>
${css}
</style>
</head>
<body>

<header>
  <h1>Local Coding Evals</h1>
  <span class="count">${count} run${count !== 1 ? "s" : ""}</span>
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
${clientScript}
</script>
</body>
</html>`;
}
