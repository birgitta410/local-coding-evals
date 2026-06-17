import * as path from "path";
import * as fs from "fs";
import * as readline from "readline";
import { spawnSync } from "child_process";
import { runScenario } from "./runner.js";
import { evaluate } from "./evaluator.js";
import { detectAndStart, captureAfterState, stop as stopSensors } from "./sensors.js";
import type { Scenario, RunResult } from "./types.js";

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
    }

    console.log("\n--- agent ---\n");

    partial = await runScenario(scenario);

    console.log(`\n\n--- done in ${formatDuration(partial.durationMs)} ---`);

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

    if (scenario.gitSha && originalBranch) {
      console.log(`\n[git] Restoring ${originalBranch}...`);
      gitRun(codebasePath, ["checkout", originalBranch]);
      if (stashed) {
        console.log("[git] Popping stash...");
        gitRun(codebasePath, ["stash", "pop"]);
      }
    }

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

    const result: RunResult = { ...partial, evaluation, sensors: sensorsWithAfter };

    const resultsDir = path.resolve("results");
    fs.mkdirSync(resultsDir, { recursive: true });

    const ts = new Date(partial.startTime)
      .toISOString()
      .replace(/[:.]/g, "-")
      .replace("T", "_")
      .slice(0, 19);
    const outFile = path.join(resultsDir, `${scenario.name.replace(/\s+/g, "-")}_${ts}.json`);
    fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
    console.log(`\nSaved: ${outFile}`);
    return;
  }

  // eval-only path: no sensors, no git ops, no saved result file
  console.log("\n--- evaluating ---\n");

  const evaluation = await evaluate(scenario);

  const verdict = evaluation.passed ? "PASS" : "FAIL";
  console.log(`\n${verdict}  score=${evaluation.score.toFixed(2)}`);
  console.log(`Reasoning: ${evaluation.reasoning}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
