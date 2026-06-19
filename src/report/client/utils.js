// Browser-side utility functions injected into every report page.

function fmt(ms) {
  if (ms < 60000) return (ms / 1000).toFixed(1) + "s";
  return Math.floor(ms / 60000) + "m " + ((ms % 60000) / 1000).toFixed(0) + "s";
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function prettyJson(v) {
  try { return JSON.stringify(typeof v === "string" ? JSON.parse(v) : v, null, 2); }
  catch { return String(v ?? ""); }
}
