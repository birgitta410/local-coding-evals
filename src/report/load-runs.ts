import * as fs from "fs";
import * as path from "path";
import type { RunResult } from "../types.js";
import { extractScreenshotsFromFullOutput, mdToHtml } from "./html-utils.js";

export interface RunEntry {
  file: string;
  data: RunResult & { _reasoningHtml?: string };
}

export function loadRuns(resultsDir: string): RunEntry[] {
  return fs
    .readdirSync(resultsDir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse()
    .map((f) => {
      const data = JSON.parse(
        fs.readFileSync(path.join(resultsDir, f), "utf-8"),
      ) as RunResult;
      const eval_ = data.evaluation;
      const screenshots =
        eval_?.screenshots && eval_.screenshots.length > 0
          ? eval_.screenshots
          : extractScreenshotsFromFullOutput(eval_?.fullOutput);
      return {
        file: f,
        data: {
          ...data,
          evaluation: eval_ ? { ...eval_, screenshots } : eval_,
          _reasoningHtml: mdToHtml(
            eval_?.fullOutput ?? eval_?.reasoning ?? "No reasoning provided.",
          ),
        },
      };
    });
}
