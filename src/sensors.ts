import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import type { SensorsData, SensorReading } from "./types.js";

function findFile(dir: string, suffix: string): string | null {
  const sensorsDir = path.join(dir, ".sensors");
  if (!fs.existsSync(sensorsDir)) return null;
  const match = fs.readdirSync(sensorsDir).find((f) => f.endsWith(suffix));
  return match ? path.join(sensorsDir, match) : null;
}

function run(cmd: string, args: string[], cwd: string, ignoreStderr?: RegExp): boolean {
  const result = spawnSync(cmd, args, { cwd, encoding: "utf-8", timeout: 30_000 });
  if (result.status !== 0) {
    const stderr = result.stderr?.trim() ?? "";
    if (ignoreStderr && ignoreStderr.test(stderr)) {
      return true;
    }
    console.warn(`[sensors] ${cmd} ${args.join(" ")} failed (exit ${result.status}): ${stderr}`);
    return false;
  }
  return true;
}

function readState(codebasePath: string): Record<string, SensorReading> | null {
  const stateFile = findFile(codebasePath, ".state.json");
  if (!stateFile) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(stateFile, "utf-8")) as {
      runners: Record<string, { status: string; reading: SensorReading & { formatted?: unknown; guidance?: unknown; extra?: unknown } }>;
    };
    return Object.fromEntries(
      Object.entries(raw.runners).map(([name, runner]) => [
        name,
        {
          status: runner.status,
          summary: runner.reading.summary,
          score: runner.reading.score,
          metrics: runner.reading.metrics,
          findings: runner.reading.findings ?? [],
        } satisfies SensorReading,
      ])
    );
  } catch (e) {
    console.warn(`[sensors] Failed to read state file: ${e}`);
    return null;
  }
}

export function detectAndStart(codebasePath: string): SensorsData {
  const configFile = findFile(codebasePath, ".sensors.yaml");

  if (!configFile) {
    return { available: false, started: false, snapshotted: false, stateBefore: null, stateAfter: null };
  }

  console.log(`[sensors] Config found: ${path.basename(configFile)}`);

  const stateBefore = readState(codebasePath);

  console.log("[sensors] Starting...");
  const started = run("sensors", ["start", "."], codebasePath, /already running/i);
  if (!started) {
    return { available: true, started: false, snapshotted: false, stateBefore, stateAfter: null };
  }

  console.log("[sensors] Taking before snapshot...");
  const snapshotted = run("sensors", ["snapshot", "."], codebasePath);

  return { available: true, started, snapshotted, stateBefore, stateAfter: null };
}

export function captureAfterState(codebasePath: string, sensors: SensorsData): SensorsData {
  if (!sensors.started) return sensors;
  return { ...sensors, stateAfter: readState(codebasePath) };
}

export function stop(codebasePath: string): void {
  run("sensors", ["stop", "."], codebasePath);
}
