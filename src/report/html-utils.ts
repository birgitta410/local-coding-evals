/** Server-side TypeScript helpers for HTML generation. */

export function extractScreenshotsFromFullOutput(fullOutput: string | undefined): string[] {
  if (!fullOutput) return [];
  for (const line of fullOutput.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith('{"passed"')) {
      try {
        const parsed = JSON.parse(trimmed) as { screenshots?: string[] };
        return (parsed.screenshots ?? []).filter((s) => typeof s === "string" && s.length > 0);
      } catch {
        return [];
      }
    }
  }
  return [];
}

export function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function mdToHtml(text: string): string {
  if (!text) return "";
  let s = escHtml(text);
  // Code blocks
  s = s.replace(/```[^\n]*\n([\s\S]*?)```/g, (_: string, code: string) =>
    `<pre style="background:#1e1e3f;color:#a9b1d6;padding:10px 14px;border-radius:6px;overflow-x:auto;font-size:12px;margin:8px 0">${code.trimEnd()}</pre>`);
  // Headers
  s = s.replace(/^### (.+)$/gm, '<h3 style="font-size:13px;font-weight:700;margin:14px 0 4px">$1</h3>');
  s = s.replace(/^## (.+)$/gm,  '<h2 style="font-size:14px;font-weight:700;margin:16px 0 6px">$1</h2>');
  s = s.replace(/^# (.+)$/gm,   '<h1 style="font-size:16px;font-weight:700;margin:18px 0 8px">$1</h1>');
  // Bold / italic
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Inline code
  s = s.replace(/`([^`]+)`/g, '<code style="background:#f1f5f9;padding:1px 5px;border-radius:4px;font-size:12px">$1</code>');
  // Horizontal rule
  s = s.replace(/^---+$/gm, '<hr style="border:none;border-top:1px solid #e2e8f0;margin:12px 0">');
  // Bullet lists
  s = s.replace(/((?:^[ \t]*[-*] .+\n?)+)/gm, (block: string) => {
    const items = block.trim().split(/\n/).map((l: string) => `<li style="margin:3px 0">${l.replace(/^[ \t]*[-*] /, "")}</li>`).join("");
    return `<ul style="padding-left:20px;margin:6px 0">${items}</ul>`;
  });
  // Numbered lists
  s = s.replace(/((?:^[ \t]*\d+\. .+\n?)+)/gm, (block: string) => {
    const items = block.trim().split(/\n/).map((l: string) => `<li style="margin:3px 0">${l.replace(/^[ \t]*\d+\. /, "")}</li>`).join("");
    return `<ol style="padding-left:20px;margin:6px 0">${items}</ol>`;
  });
  // Paragraphs and line breaks
  s = s.replace(/\n\n+/g, '</p><p style="margin:8px 0">');
  s = s.replace(/\n/g, "<br>");
  return `<p style="margin:8px 0">${s}</p>`;
}

export function formatDuration(ms: number): string {
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = ((ms % 60_000) / 1000).toFixed(0);
  return `${m}m ${s}s`;
}
