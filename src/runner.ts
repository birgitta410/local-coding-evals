import { AuthStorage, createAgentSession, SessionManager } from "@earendil-works/pi-coding-agent";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { resolveModel } from "./model-resolver.js";
import type { Scenario, RunResult, GitChangeSummary, GitFileChange } from "./types.js";

function collectGitChanges(codebasePath: string): GitChangeSummary {
  const statusResult = spawnSync("git", ["status", "--porcelain"], {
    cwd: codebasePath, encoding: "utf-8",
  });
  const statusLines = (statusResult.stdout ?? "").trim().split("\n").filter(Boolean);

  // numstat gives "<additions>\t<deletions>\t<path>" for tracked changes (- for binary)
  const numstatResult = spawnSync("git", ["diff", "--numstat"], {
    cwd: codebasePath, encoding: "utf-8",
  });
  const numstatMap = new Map<string, { additions: number | null; deletions: number | null }>();
  for (const line of (numstatResult.stdout ?? "").trim().split("\n").filter(Boolean)) {
    const [add, del, ...pathParts] = line.split("\t");
    const filePath = pathParts.join("\t");
    numstatMap.set(filePath, {
      additions: add === "-" ? null : parseInt(add, 10),
      deletions: del === "-" ? null : parseInt(del, 10),
    });
  }

  const IGNORED = new Set([".mcp.json"]);

  const files: GitFileChange[] = [];
  for (const line of statusLines) {
    const xy = line.slice(0, 2);
    const filePath = line.slice(3);
    if (IGNORED.has(path.basename(filePath))) continue;
    let status: GitFileChange["status"];
    if (xy === "??") {
      status = "untracked";
    } else if (xy[0] === "R" || xy[1] === "R") {
      status = "renamed";
    } else if (xy[0] === "D" || xy[1] === "D") {
      status = "deleted";
    } else if (xy[0] === "A" || xy[1] === "A") {
      status = "added";
    } else {
      status = "modified";
    }

    let additions: number | null = numstatMap.get(filePath)?.additions ?? null;
    let deletions: number | null = numstatMap.get(filePath)?.deletions ?? null;

    // For untracked files, count their lines as additions
    if (status === "untracked" && additions === null) {
      try {
        const fullPath = path.join(codebasePath, filePath);
        const content = fs.readFileSync(fullPath, "utf-8");
        additions = content.split("\n").length;
        deletions = 0;
      } catch {
        // binary or unreadable
      }
    }

    files.push({ path: filePath, status, additions, deletions });
  }

  const totalAdditions = files.reduce((s, f) => s + (f.additions ?? 0), 0);
  const totalDeletions = files.reduce((s, f) => s + (f.deletions ?? 0), 0);
  return {
    files,
    totalAdditions,
    totalDeletions,
    modifiedCount: files.filter((f) => f.status === "modified").length,
    addedCount: files.filter((f) => f.status === "added" || f.status === "untracked").length,
    deletedCount: files.filter((f) => f.status === "deleted").length,
  };
}

export async function runScenario(scenario: Scenario): Promise<Omit<RunResult, "evaluation" | "sensors">> {
  const codebasePath = path.resolve(scenario.codebasePath);
  const authStorage = AuthStorage.create();
  const modelSpec = `${scenario.taskModel.provider}/${scenario.taskModel.model}`;

  let model: ReturnType<typeof resolveModel>["model"];
  let modelRegistry: ReturnType<typeof resolveModel>["modelRegistry"];
  try {
    ({ model, modelRegistry } = resolveModel(scenario.taskModel, authStorage));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to resolve model "${modelSpec}": ${msg}`, { cause: err });
  }

  let session: Awaited<ReturnType<typeof createAgentSession>>["session"];
  try {
    ({ session } = await createAgentSession({
      cwd: codebasePath,
      model,
      modelRegistry,
      authStorage,
      sessionManager: SessionManager.inMemory(),
    }));
    await session.bindExtensions({});
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to create agent session (model: ${modelSpec}): ${msg}`, { cause: err });
  }

  // track whether we're mid-line inside a thinking block so we can indent continuations
  let inThinking = false;
  const toolCallsMade: Array<{ toolName: string; args: unknown }> = [];
  let lastResponseText = "";

  session.subscribe((event) => {
    if (event.type === "message_update") {
      const e = event.assistantMessageEvent;
      if (e.type === "thinking_start") {
        inThinking = true;
        process.stdout.write("\n\x1b[2m[thinking]\x1b[0m\n\x1b[2m");
      } else if (e.type === "thinking_delta") {
        process.stdout.write(e.delta);
      } else if (e.type === "thinking_end") {
        process.stdout.write("\x1b[0m\n");
        inThinking = false;
      } else if (e.type === "text_start") {
        if (inThinking) { process.stdout.write("\x1b[0m\n"); inThinking = false; }
        process.stdout.write("\n");
      } else if (e.type === "text_delta") {
        lastResponseText += e.delta;
        process.stdout.write(e.delta);
      }
    } else if (event.type === "tool_execution_start") {
      toolCallsMade.push({ toolName: event.toolName, args: event.args });
      process.stdout.write(`\n\x1b[33m[tool: ${event.toolName}]\x1b[0m ${JSON.stringify(event.args ?? {})}\n`);
    } else if (event.type === "tool_execution_end") {
      const result = typeof event.result === "string"
        ? event.result.slice(0, 300)
        : JSON.stringify(event.result ?? "").slice(0, 300);
      const suffix = result.length === 300 ? "..." : "";
      const label = event.isError ? "\x1b[31m[error]\x1b[0m" : "\x1b[32m[ok]\x1b[0m";
      process.stdout.write(`${label} ${result}${suffix}\n`);
    } else if (event.type === "agent_end") {
      const lastMsg = event.messages.at(-1);
      if (lastMsg?.role === "assistant") {
        const stopReason = (lastMsg as any).stopReason;
        const errorMessage = (lastMsg as any).errorMessage;
        if (stopReason && stopReason !== "stop" && stopReason !== "toolUse") {
          process.stdout.write(`\n\x1b[33m[agent_end] stopReason=${stopReason}${errorMessage ? ` | ${errorMessage}` : ""}\x1b[0m\n`);
        }
      }
    } else if (event.type === "auto_retry_start") {
      process.stdout.write(`\n\x1b[33m[auto_retry] attempt ${event.attempt}/${event.maxAttempts}: ${event.errorMessage}\x1b[0m\n`);
    } else if (event.type === "compaction_end" && event.errorMessage) {
      process.stdout.write(`\n\x1b[31m[compaction_error] ${event.errorMessage}\x1b[0m\n`);
    }
  });

  const startTime = Date.now();
  try {
    await session.prompt(scenario.prompt);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Agent prompt failed (model: ${modelSpec}): ${msg}`, { cause: err });
  }

  // If no edit tool calls were made, nudge the agent up to 3 times.
  // The agent can opt out early by including I_AM_DONE in its response.
  const MAX_NO_EDIT_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_NO_EDIT_RETRIES; attempt++) {
    if (toolCallsMade.some((t) => t.toolName === "edit")) break;

    process.stdout.write(
      `\n\x1b[33m[runner] No edit tool calls detected (attempt ${attempt + 1}/${MAX_NO_EDIT_RETRIES}) -- sending follow-up prompt\x1b[0m\n`
    );
    lastResponseText = "";
    try {
      await session.prompt(
        "Looks like you haven't changed any files yet, please continue with the implementation. " +
        "If you're done with the task and don't want to change any files, include the text I_AM_DONE in your response."
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Follow-up prompt failed (model: ${modelSpec}): ${msg}`, { cause: err });
    }

    if (lastResponseText.includes("I_AM_DONE")) {
      process.stdout.write(`\n\x1b[33m[runner] Model indicated it is done (I_AM_DONE)\x1b[0m\n`);
      break;
    }
  }

  const endTime = Date.now();
  const stats = session.getSessionStats();
  const gitChanges = collectGitChanges(codebasePath);
  session.dispose();

  return {
    scenarioName: scenario.name,
    codebasePath,
    prompt: scenario.prompt,
    expectation: scenario.expectation,
    startTime,
    endTime,
    durationMs: endTime - startTime,
    taskModel: scenario.taskModel,
    evaluatorModel: scenario.evaluatorModel,
    conversation: session.agent.state.messages,
    tokenUsage: stats.tokens,
    contextUsage: stats.contextUsage,
    gitChanges,
  };
}
