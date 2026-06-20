import { AuthStorage, createAgentSession, SessionManager } from "@earendil-works/pi-coding-agent";
import * as path from "path";
import * as fs from "fs";
import { resolveModel } from "./model-resolver.js";
import type { Scenario, EvalResult, ToolCall } from "./types.js";

interface FailedToolCall {
  toolName: string;
  errorText: string;
}

function extractFailedToolCalls(conversation: unknown[]): FailedToolCall[] {
  const results: FailedToolCall[] = [];
  for (const entry of conversation) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      (entry as Record<string, unknown>).role !== "toolResult" ||
      !(entry as Record<string, unknown>).isError
    ) continue;
    const e = entry as Record<string, unknown>;
    const toolName = typeof e.toolName === "string" ? e.toolName : "(unknown)";
    let errorText = "";
    const content = e.content;
    if (Array.isArray(content)) {
      for (const c of content) {
        if (typeof c === "object" && c !== null && (c as Record<string, unknown>).type === "text") {
          errorText += (c as Record<string, unknown>).text ?? "";
        }
      }
    }
    results.push({ toolName, errorText: errorText.trim() });
  }
  return results;
}

function buildToolCallQualitySection(failedCalls: FailedToolCall[]): string {
  if (failedCalls.length === 0) return "";
  const list = failedCalls
    .map((c, i) => `${i + 1}. Tool: ${c.toolName}\n   Error: ${c.errorText}`)
    .join("\n\n");
  return `\n\nTOOL CALL ERRORS IN TASK CONVERSATION:
The task agent produced ${failedCalls.length} failed tool call(s). Review each and decide whether the failure
was caused by the agent calling the tool incorrectly (wrong/missing arguments, schema violations, calling a
non-existent tool) versus an expected execution failure (bash command returning non-zero, file not found when
the agent was probing, network error, etc.).

${list}

In your verdict JSON, include a "toolCallQuality" field with a short summary: how many errors were agent-caused
(improper tool use) vs execution failures, and brief descriptions of the agent-caused ones.`;
}

function buildEvalPrompt(codebasePath: string, expectation: string, evalsDirPath: string, resultFilePath: string, failedToolCalls: FailedToolCall[]): string {
  return `You are evaluating whether a coding task was completed successfully.

Working directory WORKING_DIR: ${codebasePath}
Directory of the evaluation framework EVAL_DIR (for scenario specific tools and storing reports and other resources): ${evalsDirPath}

Expected outcome:
${expectation}

Use whatever tools are available to verify whether the expected outcome has been met.
Be thorough.

IMPORTANT: Assume the task FAILED until you find clear evidence it succeeded. Be skeptical.
Do not let earlier text-based investigation override what you see in screenshots -- the screenshot
is the ground truth for visual verification. If you cannot confirm something visually, mark it as failed.

If the expectation requires checking a running app in a browser, use the playwright
tools directly (e.g. playwright_navigate, playwright_screenshot, playwright_click).
These are available as direct tools. When you take screenshots, ask Playwright to save them
under ./results where we're also storing our reports. Add timestamps to screenshot file names
and reference all full screenshot file paths in your evaluation reasoning.

IMPORTANT for visual verification: You are a vision-capable model. When you read a screenshot
file back, you will receive the actual image and can see it directly. Use that visual
interpretation to evaluate chart appearance, labels, ordering, colors, etc. Do NOT attempt to
verify visual properties by inspecting DOM or SVG elements -- the chart library may render
labels into canvas or use techniques that make DOM inspection unreliable. Screenshots are the
authoritative source for visual verification. As the screenshots will go into this folder, NOT relative to the
codebase working directory where you will be working, when you want to read a screenshot,
always use an absolute path to the screenshot here under ${evalsDirPath}/results.
${buildToolCallQualitySection(failedToolCalls)}

When you have finished your investigation, write your verdict to this file using the write tool:
${resultFilePath}

The file must contain a single JSON object:
{
  "passed": true,
  "score": 1.0,
  "reasoning": "...",
  "screenshots": ["...absolute paths to any screenshot files generated during evaluation..."],
  "toolCallQuality": "..."
}

score must be a float between 0.0 and 1.0. The screenshots array may be empty if no screenshots were taken.
toolCallQuality must always be present: if there were no tool call errors, write "No tool call errors."`;
}

const MAX_EVAL_TURNS = 100;

async function runEvalSession(
  scenario: Scenario,
  codebasePath: string,
  evalsDirPath: string,
  resultFilePath: string,
  failedToolCalls: FailedToolCall[],
): Promise<{ output: string; toolCalls: ToolCall[] }> {
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
  let inThinking = false;
  const toolCalls: ToolCall[] = [];
  const pendingCalls = new Map<string, ToolCall>();

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
      } else if (e.type === "text_delta") {
        if (inThinking) { process.stdout.write("\x1b[0m\n"); inThinking = false; }
        output += e.delta;
        process.stdout.write(e.delta);
      }
    } else if (event.type === "agent_end") {
      turnCount++;
      if (turnCount >= MAX_EVAL_TURNS) {
        process.stdout.write(`\n[evaluator] turn limit (${MAX_EVAL_TURNS}) reached — forcing stop\n`);
        session.steer("You have reached the maximum number of turns. Stop immediately and output your JSON result now.");
      }
    } else if (event.type === "tool_execution_start") {
      const args = JSON.stringify(event.args ?? {});
      process.stdout.write(`\n\x1b[33m[tool: ${event.toolName}]\x1b[0m ${args}\n`);
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
      const label = event.isError ? "\x1b[31m[error]\x1b[0m" : "\x1b[32m[ok]\x1b[0m";
      process.stdout.write(`${label} ${result}${suffix}\n`);
      const call = pendingCalls.get(event.toolCallId);
      if (call) {
        call.result = event.result;
        call.isError = event.isError;
        toolCalls.push(call);
        pendingCalls.delete(event.toolCallId);
      }
    }
  });

  await session.prompt(buildEvalPrompt(codebasePath, scenario.expectation, evalsDirPath, resultFilePath, failedToolCalls));
  session.dispose();

  return { output, toolCalls };
}

export async function evaluate(scenario: Scenario, conversation: unknown[] = []): Promise<EvalResult> {
  const codebasePath = path.resolve(scenario.codebasePath);
  const evalsDirPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  const resultFilePath = path.join(evalsDirPath, "results", `eval-verdict-${Date.now()}.json`);

  const failedToolCalls = extractFailedToolCalls(conversation);
  const { output, toolCalls } = await runEvalSession(scenario, codebasePath, evalsDirPath, resultFilePath, failedToolCalls);

  if (fs.existsSync(resultFilePath)) {
    const raw = fs.readFileSync(resultFilePath, "utf-8");
    fs.unlinkSync(resultFilePath);
    const parsed = JSON.parse(raw) as {
      passed: boolean;
      score: number;
      reasoning: string;
      screenshots?: string[];
      toolCallQuality?: string;
    };
    return {
      passed: parsed.passed,
      score: parsed.score,
      reasoning: parsed.reasoning,
      fullOutput: output,
      screenshots: (parsed.screenshots ?? []).filter((s) => typeof s === "string" && s.length > 0),
      evaluatorModel: scenario.evaluatorModel,
      toolCalls,
      toolCallQuality: typeof parsed.toolCallQuality === "string" ? parsed.toolCallQuality : undefined,
    };
  }

  return {
    passed: false,
    score: 0,
    reasoning: `Evaluator did not write a result file. Raw output:\n${output.slice(0, 1000)}`,
    evaluatorModel: scenario.evaluatorModel,
    toolCalls,
  };
}
