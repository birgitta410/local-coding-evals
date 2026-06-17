import { AuthStorage, createAgentSession, SessionManager } from "@earendil-works/pi-coding-agent";
import * as path from "path";
import { resolveModel } from "./model-resolver.js";
import type { Scenario, EvalResult, ToolCall } from "./types.js";

function buildEvalPrompt(codebasePath: string, expectation: string, evalsDirPath: string): string {
  return `You are evaluating whether a coding task was completed successfully.

Working directory: ${codebasePath}

Expected outcome:
${expectation}

Use whatever tools are available to verify whether the expected outcome has been met. \
Be thorough.

If the expectation requires checking a running app in a browser, use the playwright \
tools directly (e.g. playwright_navigate, playwright_screenshot, playwright_click). \
These are available as direct tools.

IMPORTANT for screenshots: Playwright saves screenshot files relative to THIS eval runner's \
working directory, which is ${evalsDirPath} -- NOT relative to the codebase working directory. \
When you take a screenshot, always use an absolute path under ${evalsDirPath} as the filename \
(e.g. "${evalsDirPath}/screenshot-<timestamp>.png"). \
When you subsequently read a screenshot file back to examine it, use that same absolute path. \
Add timestamps to screenshot file names and reference the screenshot path in your evaluation \
summary if relevant.

IMPORTANT for visual verification: You are a vision-capable model. When you read a screenshot \
file back, you will receive the actual image and can see it directly. Use that visual \
interpretation to evaluate chart appearance, labels, ordering, colors, etc. Do NOT attempt to \
verify visual properties by inspecting DOM or SVG elements -- the chart library may render \
labels into canvas or use techniques that make DOM inspection unreliable. Screenshots are the \
authoritative source for visual verification.

After your investigation, output a single line of JSON in exactly this format \
(nothing else on that line):
{"passed": true, "score": 1.0, "reasoning": "..."}

score must be a float between 0.0 and 1.0.`;
}

const MAX_EVAL_TURNS = 100;

async function runEvalSession(
  scenario: Scenario,
  codebasePath: string,
  evalsDirPath: string,
): Promise<{ jsonLine: string | undefined; output: string; toolCalls: ToolCall[] }> {
  const authStorage = AuthStorage.create();
  const { model, modelRegistry } = resolveModel(scenario.evaluatorModel, authStorage);

  const { session, extensionsResult } = await createAgentSession({
    cwd: codebasePath,
    model,
    modelRegistry,
    authStorage,
    sessionManager: SessionManager.inMemory(),
  });
  await session.bindExtensions({});
  const extNames = extensionsResult.extensions.map((e) => e.name ?? "(unnamed)");
  console.log(`[evaluator] extensions loaded: ${extNames.length ? extNames.join(", ") : "none"}`);

  let output = "";
  let turnCount = 0;
  const toolCalls: ToolCall[] = [];
  const pendingCalls = new Map<string, ToolCall>();

  session.subscribe((event) => {
    if (event.type === "message_update" && event.assistantMessageEvent?.type === "text_delta") {
      output += event.assistantMessageEvent.delta;
      process.stdout.write(event.assistantMessageEvent.delta);
    } else if (event.type === "agent_end") {
      turnCount++;
      if (turnCount >= MAX_EVAL_TURNS) {
        process.stdout.write(`\n[evaluator] turn limit (${MAX_EVAL_TURNS}) reached — forcing stop\n`);
        session.steer("You have reached the maximum number of turns. Stop immediately and output your JSON result now.");
      }
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

  await session.prompt(buildEvalPrompt(codebasePath, scenario.expectation, evalsDirPath));
  session.dispose();

  const jsonLine = output
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.startsWith('{"passed"'));

  return { jsonLine, output, toolCalls };
}

export async function evaluate(scenario: Scenario): Promise<EvalResult> {
  const codebasePath = path.resolve(scenario.codebasePath);
  const evalsDirPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

  let { jsonLine, output, toolCalls } = await runEvalSession(scenario, codebasePath, evalsDirPath);

  if (!jsonLine) {
    console.log("\n[evaluator] No JSON result found — retrying once...");
    ({ jsonLine, output, toolCalls } = await runEvalSession(scenario, codebasePath, evalsDirPath));
  }

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
    reasoning: `Evaluator did not produce parseable JSON after retry. Raw output:\n${output.slice(0, 1000)}`,
    evaluatorModel: scenario.evaluatorModel,
    toolCalls,
  };
}
