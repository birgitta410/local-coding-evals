import type { Scenario } from "../src/types.js";

const scenario: Scenario = {
  // Unique name used as the result filename prefix
  name: "country-bar-chart",

  // What you want Pi to build -- be specific
  prompt: `
We have now new data in our access log data, a new field "country"

I want to add a horizontal bar chart to our visualisation that shows which countries the requests have come from. The title of the chart should be "Countries". It should show the top 10 countries, sorted by number of requests, with the country with the most requests at the top. All other countries should be grouped into an "Other" category at the bottom of the chart. 
For access entries without a country value, they should not show up as their own category, but be lumped into "Other" as well.

As a reminder, the entries now look like this:

{"ts": "2026-05-24T01:10:41+02:00", "ip": "x.x.x.x", "status": 200, "ref": "https://the-referer.com", "country": "Malta"}

We will only have to read and change this one file, don't worry about the rest of the application. We are reading a bunch of *.ndjson files with access log entries such as the one given as an example above, and visualising them

@scripts/extract-timeline.mjs"`,

  // What the evaluator checks after the agent finishes.
  // The evaluator has full read/grep/bash access to the codebase.
  expectation: `
- extract-timeline.mjs has code to implement a horizontal bar chart showing the number of requests per country
- in WORKING_DIR: Run "node scripts/extract-timeline.mjs server/weblogs/extracts" to generate the timeline.html file
- Then use playwright in EVAL_DIR to create a screenshot of the bottom of that page: "npx tsx scenarios/country-bar-chart/screenshot-country-chart.ts -- WORKING_DIR/server/weblogs/extracts/timeline.html" It will exit with a message like this: 
  Screenshot saved: /path/to/screenshot/country-chart-2026-06-18T15-05-04-993Z.png 
- Read the screenshot file and look at the visual and see that it is displayed well, that the bars are contained in their visual area and not overlapping other elements, that the countries are sorted by number of requests, and that the chart is horizontal, not vertical.
- Check that we only see the top 10 countries, and that the last bar says "Other". "Other" is expected to be quite long, if it is very small, that would be a smell that the implementation didn't properly work for that bar.
`.trim(),

};

export default scenario;
