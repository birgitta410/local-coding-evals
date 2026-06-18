import type { Scenario } from "../src/types.js";

const scenario: Scenario = {
  // Unique name used as the result filename prefix
  name: "example",

  // Absolute path to the codebase the agent will work in
  codebasePath: "./test-app",

  // Optional: checkout this git SHA before running the task.
  // After the task, changes are committed on a new eval branch, then the original branch is restored.
  // gitSha: "abc1234",

  // What you want Pi to build -- be specific
  prompt: `Add a GET /hello endpoint to the Express app in app.js.
It should return JSON: { "message": "Hello, world!" } Then serve a simple HTML page from / that says "Welcome!" and then shows the message coming from the /hello endpoint by fetching it with JavaScript and displaying the message on the page.`,

  // What the evaluator checks after the agent finishes.
  // The evaluator has full read/grep/bash access to the codebase.
  expectation: `
- app.js defines a GET /hello route that returns { message: "Hello, world!" }
- The server can be started without errors, and the endpoint can be curled
- Use the mcp tool and playwright to take a screenshot of the page at / and store the image, reference the image in your evaluation summary so that the user can look at it
`.trim(),

  // Model used by Pi to perform the coding task
  // provider: "anthropic" | "openai" | "ollama" | ...  (whatever Pi supports)
  taskModel: {
    provider: "lmstudio-tw",
    // model: "qwen/qwen3.6-35b-a3b",
    model: "google/gemma-4-12b-qat",
    // model: "google/gemma-4-31b"
  },

  // Model used to evaluate whether the task succeeded
  evaluatorModel: {
    provider: "anthropic",
    model: "claude-sonnet-4-6",
  },
};

export default scenario;
