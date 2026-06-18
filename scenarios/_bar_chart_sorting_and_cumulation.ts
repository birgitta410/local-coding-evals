import type { Scenario } from "../src/types.js";

const scenario: Scenario = {
  // Unique name used as the result filename prefix
  name: "chativity-bar-chart",

  // What you want Pi to build -- be specific
  prompt: `I want to change the diagram in the frontend titled, "Messages per anonymous poster" 
- It should be "per poster", not "anonymous" 
- I want the bars in the bar chart to be sorted by number of messages, with highest bar first on the left 
- I want the x-axis to not show numbers ("#75"), instead I want it to show what percentage of the overall messages a certain bar is at. E.g., if the first 10 bars add up to 240 messages, and the overall messages in that time period are 1000, then I want to see 24% at the x-axis at the 10th bar. I want this percentage to be shown every 10th bar.
`,

  // What the evaluator checks after the agent finishes.
  // The evaluator has full read/grep/bash access to the codebase.
  expectation: `
- Run the application with npm run dev
- Run this playwright script from the EVAL_DIR I told you about earlier: npx tsx scenarios/chativity-bar-chart/screenshot-bar-chart.ts It will exit with a message like this: 
  Screenshot saved: /path/to/screenshot/bar-chart-2026-06-18T15-05-04-993Z.png
- Read the screenshot file from that absolute path and do some verification - don't look at the SVG, it will be too messy. Be sure to mention the full path to the screenshot file in your evaluation reasoning summary.
-> Verify that the bar chart "Messages per poster" is sorted by number of messages, with highest bar first on the left
-> Verify that the x-axis shows percentages of overall messages every 10th bar, instead of numbers
-> Most importantly: Verify that the percentages on the x-axis are not only in the code, but also visible. And they should be coherent and make sense - usually, it should get to 50% quite early on, after just a few bars
`.trim(),

};

export default scenario;
