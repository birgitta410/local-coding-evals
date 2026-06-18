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
- Use the Playwright MCP server tool to navigate to localhost:3000 (not in headless mode, but I want a browser to pop up)
- It might need a login, in which case wait for 1 minute for the user to log you in, and then check again
- Select the space "AI-assisted Software Delivery [AIFSD]" and click on "Activity" for it, then "Analyze" on the following page
- Take a screenshot of the chart, make sure the full chart is visible, you might have to scroll down. Store the screenshot file and reference it in your evaluation summary so that the user can look at it
- Based on the visual screenshot, do some verification - don't look at the SVG, it will be too messy
-> Verify that the bar chart "Messages per poster" is sorted by number of messages, with highest bar first on the left
-> Verify that the x-axis shows percentages of overall messages every 10th bar, instead of numbers
-> Most importantly: Verify that the percentages on the x-axis are not only in the code, but also visible. And they should be coherent and make sense - usually, it should get to 50% quite early on, after just a few bars
`.trim(),

};

export default scenario;
