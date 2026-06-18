import type { Scenario } from "../src/types.js";

const scenario: Scenario = {
  // Unique name used as the result filename prefix
  name: "country-bar-chart",

  // Absolute path to the codebase the agent will work in
  codebasePath: "/Users/Shared/projects/websites/birgitta_info_gen",

  // What you want Pi to build -- be specific
  prompt: `
We have now new data in our access log data, a new field "country"

I want to add a horizontal bar chart to our visualisation that shows which countries the requests have come from.

As a reminder, the entries now look like this:

{"ts": "2026-05-24T01:10:41+02:00", "ip": "x.x.x.x", "status": 200, "ref": "https://the-referer.com", "country": "Malta"}

We will only have to read and change this one file, don't worry about the rest of the application. We are reading a bunch of *.ndjson files with access log entries such as the one given as an example above, and visualising them

@scripts/extract-timeline.mjs"`,

  // What the evaluator checks after the agent finishes.
  // The evaluator has full read/grep/bash access to the codebase.
  expectation: `
- extract-timeline.mjs has code to implement a horizontal bar chart showing the number of requests per country
- Running "./access show" generates an HTML file that contains this bar chart
- Open that HTML file and take a screenshot of the chart. You might have to scroll first to have the full chart visible in the viewport. Reference that screenshot path in your evaluation summary.
- If you can, look at the visual and see that it is displayed well, that the bars are contained in their visual area and not overlapping other elements, that the countries are sorted by number of requests, and that the chart is horizontal, not vertical.
`.trim(),

  // Model used by Pi to perform the coding task
  // provider: "anthropic" | "openai" | "ollama" | ...  (whatever Pi supports)
  taskModel: {
    provider: "lmstudio-tw",
    model: "qwen/qwen3.6-35b-a3b",
  },

  // Model used to evaluate whether the task succeeded
  evaluatorModel: {
    provider: "anthropic",
    model: "claude-sonnet-4-6",
  },
};

export default scenario;
