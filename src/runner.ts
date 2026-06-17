import { AuthStorage, createAgentSession, SessionManager } from "@earendil-works/pi-coding-agent";
import * as path from "path";
import { resolveModel } from "./model-resolver.js";
import type { Scenario, RunResult } from "./types.js";

export async function runScenario(scenario: Scenario): Promise<Omit<RunResult, "evaluation" | "sensors">> {
  const codebasePath = path.resolve(scenario.codebasePath);
  const authStorage = AuthStorage.create();
  const { model, modelRegistry } = resolveModel(scenario.taskModel, authStorage);

  const { session } = await createAgentSession({
    cwd: codebasePath,
    model,
    modelRegistry,
    authStorage,
    sessionManager: SessionManager.inMemory(),
  });
  await session.bindExtensions({});

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
      const result = typeof event.result === "string"
        ? event.result.slice(0, 300)
        : JSON.stringify(event.result ?? "").slice(0, 300);
      const suffix = result.length === 300 ? "..." : "";
      const label = event.isError ? "\x1b[31m[error]\x1b[0m" : "\x1b[32m[ok]\x1b[0m";
      process.stdout.write(`${label} ${result}${suffix}\n`);
    }
  });

  const startTime = Date.now();
  await session.prompt(scenario.prompt);
  const endTime = Date.now();

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
  };
}
