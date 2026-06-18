# Local coding evals

Vibe-coded little app that can run coding task scenarios against local models.

- Uses Pi as the coding agent
  - Pi needs to be preinstalled on the machine, not just in these dependencies
  - Global Pi configuration will be used, in particular its model configuration in `~/.pi/agent/models.json`
  - For checks in the browser, needs the `pi-mcp-adapter` package and Playwright MCP server installed
- Assumes models are run in LM Studio

## Set up prerequisites

Install Pi coding agent https://pi.dev/docs/latest/quickstart

Configure your local models in Pi's `~/.pi/agent/models.json`, e.g.

```
{
  "providers": {
    "lmstudio-tw": {
      "baseUrl": "http://localhost:1234/v1",
      "api": "openai-completions",
      "apiKey": "lmstudio",
      "compat": {
        "supportsDeveloperRole": false,
        "supportsReasoningEffort": false,
        "supportsUsageInStreaming": true,
        "maxTokensField": "max_tokens"
      },
      "models": [
        {
          "id": "qwen/qwen3.6-35b-a3b",
          "name": "Qwen3.6 35B A3B (via TW guest wifi)",
          "reasoning": true,
          "compat": {
            "thinkingFormat": "qwen-chat-template"
          }
        }
      ]
    }
  }
}
```

If you want to make the browser available to task runner and/or evaluator:
- Install Pi MCP Adapter Package https://pi.dev/packages/pi-mcp-adapter
- Install Playwright MCP server https://github.com/microsoft/playwright-mcp


## Run

`npm install`

Add the model names in the (./scenario)[./scenario] file you want to run

`npx tsx src/index.ts scenarios/_example.ts --task-model lmstudio/google/gemma-4-12b-qat --evaluator-model anthropic/claude-haiku-4-5`

[Example scenario](./scenarios/_example.ts) uses a simple application inside of this repository

## See results

Results will be written to `./results`

`npm run report` to show an HTML version of all results