import { AuthStorage, createAgentSession, SessionManager } from "@earendil-works/pi-coding-agent";
import { execSync } from "child_process";
import * as path from "path";
import { resolveModel } from "./model-resolver.js";
import type { Scenario, RunResult } from "./types.js";

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

  let failedToolCalls = 0;
  // track whether we're mid-line inside a thinking block so we can indent continuations
  let inThinking = false;

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
        process.stdout.write(e.delta);
      }
    } else if (event.type === "tool_execution_start") {
      process.stdout.write(`\n\x1b[33m[tool: ${event.toolName}]\x1b[0m ${JSON.stringify(event.args ?? {})}\n`);
    } else if (event.type === "tool_execution_end") {
      if (event.isError) failedToolCalls++;
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

  // Check if any files were modified. If not, nudge the agent to continue.
  let gitStatus = "";
  try {
    gitStatus = execSync("git status --porcelain", { cwd: codebasePath, encoding: "utf8" });
  } catch {
    // not a git repo or git unavailable -- skip the check
  }
  if (gitStatus.trim() === "") {
    process.stdout.write("\n\x1b[33m[runner] No file changes detected -- sending follow-up prompt\x1b[0m\n");
    try {
      await session.prompt("You haven't changed any files, are you sure you're done? If not, please continue.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Follow-up prompt failed (model: ${modelSpec}): ${msg}`, { cause: err });
    }
  }

  const endTime = Date.now();
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
    failedToolCalls,
  };
}
