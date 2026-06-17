import { AuthStorage, createAgentSession, SessionManager } from "@earendil-works/pi-coding-agent";
import * as path from "path";
import { resolveModel } from "./model-resolver.js";
import type { Scenario, EvalResult, ToolCall } from "./types.js";

function buildEvalPrompt(codebasePath: string, expectation: string): string {
  return `You are evaluating whether a coding task was completed successfully.

Working directory: ${codebasePath}

Expected outcome:
${expectation}

Use whatever tools are available to verify whether the expected outcome has been met. \
Be thorough.

If the expectation requires checking a running app in a browser, use the playwright \
tools directly (e.g. playwright_navigate, playwright_screenshot, playwright_click). \
These are available as direct tools. When you take screenshots, write them to the results directory \
where we're also putting our reports. Add time stamps to the screenshot file names, and reference \
the screenshot path in your evaluation summary if relevant.

After your investigation, output a single line of JSON in exactly this format \
(nothing else on that line):
{"passed": true, "score": 1.0, "reasoning": "..."}

score must be a float between 0.0 and 1.0.`;
}

export async function evaluate(scenario: Scenario): Promise<EvalResult> {
  const codebasePath = path.resolve(scenario.codebasePath);
  const authStorage = AuthStorage.create();
  const { model, modelRegistry } = resolveModel(scenario.evaluatorModel, authStorage);

  const { session, extensionsResult } = await createAgentSession({
    cwd: codebasePath,
    model,
    modelRegistry,
    authStorage,
    sessionManager: SessionManager.inMemory(),
  });
  // bindExtensions fires the session_start event that MCP adapter (and other extensions)
  // need to initialize. createAgentSession alone does not fire it — only the interactive
  // and print modes do. Without this call all MCP tools return "MCP not initialized".
  await session.bindExtensions({});
  const extNames = extensionsResult.extensions.map((e) => e.name ?? "(unnamed)");
  console.log(`[evaluator] extensions loaded: ${extNames.length ? extNames.join(", ") : "none"}`);

  let output = "";
  const toolCalls: ToolCall[] = [];
  const pendingCalls = new Map<string, ToolCall>();

  session.subscribe((event) => {
    if (event.type === "message_update" && event.assistantMessageEvent?.type === "text_delta") {
      output += event.assistantMessageEvent.delta;
      process.stdout.write(event.assistantMessageEvent.delta);
    } else if (event.type === "tool_execution_start") {
      const args = JSON.stringify(event.args ?? {});
      process.stdout.write(`\n[tool: ${event.toolName}] ${args}\n`);
      pendingCalls.set(event.toolCallId, {
        toolName: event.toolName,
        args: event.args,
        result: undefined,
        isError: false,
      });
    } else if (event.type === "tool_execution_end") {
      const result = typeof event.result === "string"
        ? event.result.slice(0, 300)
        : JSON.stringify(event.result ?? "").slice(0, 300);
      const suffix = result.length === 300 ? "..." : "";
      const label = event.isError ? "error" : "ok";
      process.stdout.write(`[${label}] ${result}${suffix}\n`);
      const call = pendingCalls.get(event.toolCallId);
      if (call) {
        call.result = event.result;
        call.isError = event.isError;
        toolCalls.push(call);
        pendingCalls.delete(event.toolCallId);
      }
    }
  });

  await session.prompt(buildEvalPrompt(codebasePath, scenario.expectation));

  const jsonLine = output
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.startsWith('{"passed"'));

  if (jsonLine) {
    const parsed = JSON.parse(jsonLine) as { passed: boolean; score: number; reasoning: string };
    return {
      passed: parsed.passed,
      score: parsed.score,
      reasoning: parsed.reasoning,
      evaluatorModel: scenario.evaluatorModel,
      toolCalls,
    };
  }

  return {
    passed: false,
    score: 0,
    reasoning: `Evaluator did not produce parseable JSON. Raw output:\n${output.slice(0, 1000)}`,
    evaluatorModel: scenario.evaluatorModel,
    toolCalls,
  };
}
