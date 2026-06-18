export interface ModelSpec {
  provider: string;
  model: string;
  // Required when provider is not a built-in Pi provider (e.g. ollama)
  baseUrl?: string;
  // Defaults used when registering a custom provider's model
  contextWindow?: number;
  maxTokens?: number;
}

export interface Scenario {
  name: string;
  codebasePath: string;
  // Optional git SHA to checkout before running the task. After the task, the
  // result is committed on a new eval branch, then the original branch is restored.
  gitSha?: string;
  prompt: string;
  expectation: string;
  taskModel: ModelSpec;
  evaluatorModel: ModelSpec;
}

export interface ToolCall {
  toolName: string;
  args: unknown;
  result: unknown;
  isError: boolean;
}

export interface EvalResult {
  passed: boolean;
  score: number;
  reasoning: string;
  fullOutput?: string;
  screenshots?: string[];
  evaluatorModel: ModelSpec;
  toolCalls: ToolCall[];
}

export interface SensorReading {
  status: string;
  summary: string;
  score: { value: number; direction: string; description: string; threshold: number | null };
  metrics: Array<{ key: string; label: string; value: number; unit: string | null; direction: string; threshold: number | null }>;
}

export interface SensorsData {
  available: boolean;
  started: boolean;
  snapshotted: boolean;
  stateBefore: Record<string, SensorReading> | null;
  stateAfter: Record<string, SensorReading> | null;
}

export interface LmStudioModelConfig {
  max_context_length: number;
  params_string: string | null;
  quantization: { name: string | null; bits_per_weight: number | null } | null;
  loaded_instance_config: {
    context_length: number;
    eval_batch_size?: number;
    parallel?: number;
    flash_attention?: boolean;
  } | null;
}

export interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
}

export interface RunResult {
  scenarioName: string;
  codebasePath: string;
  prompt: string;
  expectation: string;
  startTime: number;
  endTime: number;
  durationMs: number;
  taskModel: ModelSpec;
  taskModelConfig?: LmStudioModelConfig;
  evaluatorModel: ModelSpec;
  conversation: unknown[];
  changedFiles?: string[];
  tokenUsage?: TokenUsage;
  evaluation?: EvalResult;
  sensors: SensorsData;
}
