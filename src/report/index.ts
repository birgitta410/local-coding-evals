import * as fs from "fs";
import * as path from "path";
import { loadRuns } from "./load-runs.js";
import { buildHtml } from "./template.js";

const resultsDir = path.resolve("results");

if (!fs.existsSync(resultsDir)) {
  console.error("No results/ directory found. Run a scenario first.");
  process.exit(1);
}

const runs = loadRuns(resultsDir);

if (runs.length === 0) {
  console.error("No JSON result files found in results/.");
  process.exit(1);
}

const html = buildHtml(runs);
const outFile = path.join(resultsDir, "index.html");
fs.writeFileSync(outFile, html);
console.log(`Report written to: ${outFile}`);
console.log(`Open with: open ${outFile}`);
