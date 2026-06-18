# Local coding evals

Vibe-coded little app that can run coding task scenarios against local models.

- Uses Pi as the coding agent
  - Pi needs to be preinstalled on the machine, not just in these dependencies
  - Global Pi configuration will be used, in particular its model configuration in `~/.pi/agent/models.json`
  - For checks in the browser, needs the `pi-mcp-adapter` package and Playwright MCP server installed
- Assumes models are run in LM Studio

## Set up prerequisites

### Download models

The setup assumes and has only been tested with [LM Studio](https://lmstudio.ai/) as the model runtime. Install it and download models there.

### Install and configure Pi

For coding, the [Pi coding agent](https://pi.dev/docs/latest/quickstart) is used, make sure it is installed.

Configure the models you downloaded in LM Studio in Pi's `~/.pi/agent/models.json`, e.g.

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

Also make sure Pi has access to other, more powerful models that can do the evaluation.

If your tasks involve building something visual in the web, make the browser available to task runner and evaluator:

- Install Pi MCP Adapter Package https://pi.dev/packages/pi-mcp-adapter
- Install Playwright MCP `npm install -g @playwright/mcp@latest`

Before you try running a task, start `pi` directly and check if all the configuration is working.

- Are the configured models available?
- Is the evaluator model available (e.g., if you want to use an Anthropic model for that, you need to make sure `pi` is authenticated to do that, with an ANTHROPIC_API_KEY or similar)
- Ask `Navigate to google.com with the playwright mcp tool` to see if the browser access is working


## Run

`npm install`

Add the model names in the (./scenario)[./scenario] file you want to run.

`npx tsx src/index.ts scenarios/_example.ts --task-model lmstudio/google/gemma-4-12b-qat --evaluator-model anthropic/claude-haiku-4-5`

(`lmstudio` is assumed here as the name of the provider in the model configuration, adjust if necessary)

[Example scenario](./scenarios/_example.ts) uses a simple application inside of this repository

## See results

Results will be written to `./results`

`npm run report` to show an HTML version of all results