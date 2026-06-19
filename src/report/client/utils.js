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

const TAG_COLORS = [
  { bg: "#1e40af", text: "#fff" }, // dark blue
  { bg: "#5b21b6", text: "#fff" }, // dark violet
  { bg: "#166534", text: "#fff" }, // dark green
  { bg: "#9f1239", text: "#fff" }, // dark rose
  { bg: "#0f766e", text: "#fff" }, // dark teal
  { bg: "#92400e", text: "#fff" }, // dark amber
  { bg: "#1e3a5f", text: "#fff" }, // dark navy
  { bg: "#6b21a8", text: "#fff" }, // dark purple
  { bg: "#065f46", text: "#fff" }, // dark emerald
  { bg: "#7f1d1d", text: "#fff" }, // dark red
];

function tagColor(tag) {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  return TAG_COLORS[h % TAG_COLORS.length];
}

function renderTags(tags) {
  if (!tags?.length) return "";
  return `<div class="tags">${tags.map(t => {
    const c = tagColor(t);
    return `<span class="tag" style="background:${c.bg};color:${c.text}">${esc(t)}</span>`;
  }).join("")}</div>`;
}
