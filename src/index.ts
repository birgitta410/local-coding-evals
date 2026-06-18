import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import * as readline from "readline";
import { spawnSync } from "child_process";
import { runScenario } from "./runner.js";
import { evaluate } from "./evaluator.js";
import { detectAndStart, captureAfterState, stop as stopSensors } from "./sensors.js";
import type { Scenario, RunResult, LmStudioModelConfig } from "./types.js";

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = ((ms % 60_000) / 1000).toFixed(0);
  return `${m}m ${s}s`;
}

function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase().startsWith("y"));
    });
  });
}

function checkGitState(codebasePath: string): { clean: boolean; summary: string } {
  const result = spawnSync("git", ["status", "--porcelain"], {
    cwd: codebasePath,
    encoding: "utf-8",
  });

  if (result.status === 128 || result.error) {
    return { clean: true, summary: "" };
  }

  const lines = (result.stdout ?? "").trim();
  if (!lines) return { clean: true, summary: "" };

  return { clean: false, summary: lines };
}

function gitCurrentBranch(codebasePath: string): string | null {
  const r = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: codebasePath, encoding: "utf-8" });
  if (r.status !== 0) return null;
  return r.stdout.trim();
}

function gitRun(codebasePath: string, args: string[]): boolean {
  const r = spawnSync("git", args, { cwd: codebasePath, encoding: "utf-8" });
  return r.status === 0;
}

function gitStash(codebasePath: string): boolean {
  const r = spawnSync("git", ["stash"], { cwd: codebasePath, encoding: "utf-8" });
  return r.status === 0 && (r.stdout ?? "").includes("Saved");
}

function readPiProviderBaseUrl(providerName: string): string | null {
  const modelsJsonPath = path.join(os.homedir(), ".pi", "agent", "models.json");
  try {
    const raw = fs.readFileSync(modelsJsonPath, "utf-8");
    const data = JSON.parse(raw) as { providers?: Record<string, { baseUrl?: string }> };
    const providerConfig = data.providers?.[providerName];
    if (!providerConfig?.baseUrl) return null;
    // Strip trailing /v1 -- Pi appends it for OpenAI-compat, but LM Studio's management API lives at /api/v1/models
    return providerConfig.baseUrl.replace(/\/v1\/?$/, "");
  } catch {
    return null;
  }
}

async function fetchLmStudioModelConfig(
  baseUrl: string,
  modelId: string
): Promise<LmStudioModelConfig | null> {
  const url = `${baseUrl}/api/v1/models`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.log(`[lmstudio] HTTP ${res.status} ${res.statusText} from ${url}`);
      return null;
    }
    const data = (await res.json()) as { models: any[] };
    const models: any[] = data.models ?? [];
    const model = models.find((m) => m.key === modelId);
    if (!model) {
      const keys = models.map((m) => m.key).join(", ") || "(none)";
      console.log(`[lmstudio] Model key "${modelId}" not found. Available keys: ${keys}`);
      return null;
    }
    const instance = model.loaded_instances?.[0] ?? null;
    if (!instance) {
      console.log(`[lmstudio] Model "${modelId}" found but has no loaded instances — context_length will be unavailable`);
    }
    return {
      max_context_length: model.max_context_length,
      params_string: model.params_string ?? null,
      quantization: model.quantization ?? null,
      loaded_instance_config: instance?.config ?? null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[lmstudio] Failed to fetch model config from ${url}: ${msg}`);
    return null;
  }
}

async function main() {
  const scenarioPath = process.argv[2];
  const evalOnly = process.argv.includes("--eval-only");

  if (!scenarioPath) {
    console.error("Usage: tsx src/index.ts <path-to-scenario.ts> [--eval-only]");
    process.exit(1);
  }

  const scenario: Scenario = (await import(path.resolve(scenarioPath))).default;

  console.log(`\n=== ${scenario.name} ===`);
  console.log(`Codebase : ${scenario.codebasePath}`);
  console.log(`Task     : ${scenario.taskModel.provider}/${scenario.taskModel.model}`);
  console.log(`Evaluator: ${scenario.evaluatorModel.provider}/${scenario.evaluatorModel.model}`);
  if (evalOnly) console.log(`Mode     : eval-only (skipping task execution)`);

  const codebasePath = path.resolve(scenario.codebasePath);

  const lmStudioBaseUrl = scenario.taskModel.baseUrl
    ?? readPiProviderBaseUrl(scenario.taskModel.provider);
  if (!lmStudioBaseUrl) {
    console.log("[lmstudio] Warning: baseUrl not set in scenario and provider not found in ~/.pi/agent/models.json, cannot request model config");
  } else if (!scenario.taskModel.baseUrl) {
    console.log(`[lmstudio] baseUrl resolved from Pi config for provider "${scenario.taskModel.provider}": ${lmStudioBaseUrl}`);
  }

  let partial: Omit<RunResult, "evaluation" | "sensors">;

  if (evalOnly) {
    const now = Date.now();
    partial = {
      scenarioName: scenario.name,
      codebasePath,
      prompt: scenario.prompt,
      expectation: scenario.expectation,
      startTime: now,
      endTime: now,
      durationMs: 0,
      taskModel: scenario.taskModel,
      evaluatorModel: scenario.evaluatorModel,
      conversation: [],
    };
  } else {
    const git = checkGitState(codebasePath);

    let originalBranch: string | null = null;
    let stashed = false;

    if (scenario.gitSha) {
      originalBranch = gitCurrentBranch(codebasePath);
      if (!git.clean) {
        console.log("[git] Stashing local changes...");
        stashed = gitStash(codebasePath);
        if (!stashed) {
          console.error("[git] Failed to stash changes. Aborting.");
          process.exit(1);
        }
      }
      console.log(`[git] Checking out ${scenario.gitSha}...`);
      if (!gitRun(codebasePath, ["checkout", scenario.gitSha])) {
        console.error(`[git] Failed to checkout ${scenario.gitSha}.`);
        if (stashed) gitRun(codebasePath, ["stash", "pop"]);
        process.exit(1);
      }
    } else if (!git.clean) {
      console.log("\n\x1b[33mWarning: codebase has uncommitted changes:\x1b[0m");
      console.log(git.summary.split("\n").map((l) => `  ${l}`).join("\n"));
      const proceed = await confirm("\nContinue anyway? [y/N] ");
      if (!proceed) {
        console.log("Aborted.");
        process.exit(0);
      }
    }

    const sensors = detectAndStart(codebasePath);
    if (sensors.available) {
      console.log(`[sensors] available=${sensors.available} started=${sensors.started} snapshotted=${sensors.snapshotted}`);
      if (sensors.started) {
        console.log("[sensors] Waiting 5s before snapshot...");
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }

    const restoreGit = () => {
      if (scenario.gitSha && originalBranch) {
        console.log(`\n[git] Restoring ${originalBranch}...`);
        gitRun(codebasePath, ["checkout", originalBranch]);
        if (stashed) {
          console.log("[git] Popping stash...");
          gitRun(codebasePath, ["stash", "pop"]);
        }
      }
    };

    console.log("\n--- agent ---\n");

    try {
      partial = { ...await runScenario(scenario) };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error && err.stack ? `\n${err.stack}` : "";
      console.error(`\n[error] Task run failed: ${msg}${stack}`);
      restoreGit();
      process.exit(1);
    }

    console.log(`\n\n--- done in ${formatDuration(partial.durationMs)} ---`);

    let taskModelConfig: LmStudioModelConfig | undefined;
    if (lmStudioBaseUrl) {
      const config = await fetchLmStudioModelConfig(lmStudioBaseUrl, scenario.taskModel.model);
      if (config) {
        taskModelConfig = config;
        const ctxLen = config.loaded_instance_config?.context_length ?? "not loaded";
        console.log(`[lmstudio] context_length=${ctxLen} max_context_length=${config.max_context_length} params=${config.params_string ?? "?"}`);
      } else {
        console.log("[lmstudio] Could not fetch model config (non-LM Studio runtime or API unavailable)");
      }
    }
    partial = { ...partial, taskModelConfig };

    const postTaskGit = checkGitState(codebasePath);
    if (postTaskGit.clean) {
      console.error("\n[error] Task run produced no file changes. Skipping evaluation.");
      restoreGit();
      process.exit(1);
    }

    if (scenario.gitSha) {
      const ts = new Date(partial.startTime)
        .toISOString()
        .replace(/[:.]/g, "-")
        .replace("T", "_")
        .slice(0, 19);
      const evalBranch = `eval-${scenario.name.replace(/\s+/g, "-")}_${ts}`;
      console.log(`\n[git] Creating branch ${evalBranch}...`);
      if (!gitRun(codebasePath, ["checkout", "-b", evalBranch])) {
        console.error(`[git] Failed to create branch ${evalBranch}.`);
      } else {
        gitRun(codebasePath, ["add", "-A"]);
        const commitBody = `Model: ${scenario.taskModel.provider}/${scenario.taskModel.model}\n\nPrompt:\n${scenario.prompt}`;
        gitRun(codebasePath, ["commit", "-m", `eval: ${scenario.name}`, "-m", commitBody]);
      }
    }

    const sensorsWithAfter = captureAfterState(codebasePath, sensors);
    if (sensors.started) {
      stopSensors(codebasePath);
    }

    restoreGit();

    // Compute output path now so we can write preliminary and final to the same file.
    const resultsDir = path.resolve("results");
    fs.mkdirSync(resultsDir, { recursive: true });

    const ts = new Date(partial.startTime)
      .toISOString()
      .replace(/[:.]/g, "-")
      .replace("T", "_")
      .slice(0, 19);
    const outFile = path.join(resultsDir, `${scenario.name.replace(/\s+/g, "-")}_${ts}.json`);

    // Collect changed files from the final git status (after all git ops).
    const changedFiles = postTaskGit.summary
      ? postTaskGit.summary.split("\n").map((l) => l.trim()).filter(Boolean)
      : [];

    const preliminary: RunResult = { ...partial, changedFiles, sensors: sensorsWithAfter };
    fs.writeFileSync(outFile, JSON.stringify(preliminary, null, 2));
    console.log(`\nPreliminary result saved: ${outFile}`);

    console.log("\n--- evaluating ---\n");

    const evaluation = await evaluate(scenario);

    if (sensorsWithAfter.available && sensorsWithAfter.stateAfter) {
      console.log("\n--- sensors ---");
      for (const [name, runner] of Object.entries(sensorsWithAfter.stateAfter)) {
        const before = sensorsWithAfter.stateBefore?.[name];
        const delta = before ? ` (was: ${before.summary})` : "";
        console.log(`  ${name}: ${runner.summary}${delta}`);
      }
    }

    const verdict = evaluation.passed ? "PASS" : "FAIL";
    console.log(`\n${verdict}  score=${evaluation.score.toFixed(2)}`);
    console.log(`Reasoning: ${evaluation.reasoning}`);

    const result: RunResult = { ...preliminary, evaluation };
    fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
    console.log(`\nSaved: ${outFile}`);
    return;
  }

  // eval-only path: find an existing result file to update
  const evalResultsDir = path.resolve("results");
  let evalTargetFile: string | null = null;

  if (fs.existsSync(evalResultsDir)) {
    const candidates = fs
      .readdirSync(evalResultsDir)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .reverse();

    for (const f of candidates) {
      try {
        const data = JSON.parse(
          fs.readFileSync(path.join(evalResultsDir, f), "utf-8")
        ) as RunResult;
        if (
          data.scenarioName === scenario.name &&
          data.taskModel.model === scenario.taskModel.model
        ) {
          evalTargetFile = path.join(evalResultsDir, f);
          break;
        }
      } catch {
        // skip malformed files
      }
    }
  }

  if (!evalTargetFile) {
    console.log("\n[eval-only] No existing result file found for this scenario + model. Results will not be saved.");
  } else {
    console.log(`\n[eval-only] Found result file: ${evalTargetFile}`);
    const proceed = await confirm("Add evaluation results to this file? [y/N] ");
    if (!proceed) {
      console.log("Aborted.");
      process.exit(0);
    }
  }

  console.log("\n--- evaluating ---\n");

  const evaluation = await evaluate(scenario);

  const verdict = evaluation.passed ? "PASS" : "FAIL";
  console.log(`\n${verdict}  score=${evaluation.score.toFixed(2)}`);
  console.log(`Reasoning: ${evaluation.reasoning}`);

  if (evalTargetFile) {
    const existing = JSON.parse(fs.readFileSync(evalTargetFile, "utf-8")) as RunResult;
    const updated: RunResult = { ...existing, evaluation };
    fs.writeFileSync(evalTargetFile, JSON.stringify(updated, null, 2));
    console.log(`\nUpdated: ${evalTargetFile}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
