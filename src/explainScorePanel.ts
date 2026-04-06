/**
 * explainScorePanel.ts — WebviewPanel that displays the heuristic score
 * breakdown for the current debug step.
 *
 * Opened from the "🔮 Explain Next Step" button in the DebugControlPanel
 * QuickPick.  The panel persists across step changes and can be
 * closed / reopened / updated at will.
 */

import * as vscode from "vscode";

let _panel: vscode.WebviewPanel | undefined;

/**
 * Show (or update) the explain score panel with the given data.
 * If the panel is already open it is updated in place and revealed;
 * if it was closed a new one is created.
 */
export function showExplainScorePanel(
  explainText: string | undefined,
  step: string,
  idx: number
): void {
  const title = `🔮 Explain — Step ${idx}`;
  const html = buildHtml(explainText, step, idx);

  if (_panel) {
    _panel.title = title;
    _panel.webview.html = html;
    _panel.reveal(vscode.ViewColumn.Beside, /* preserveFocus */ true);
    return;
  }

  _panel = vscode.window.createWebviewPanel(
    "manulExplainScore",
    title,
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
    { enableScripts: false, retainContextWhenHidden: true }
  );
  _panel.webview.html = html;
  _panel.onDidDispose(() => {
    _panel = undefined;
  });
}

/** Dispose the panel (called when the debug session ends). */
export function disposeExplainScorePanel(): void {
  _panel?.dispose();
  _panel = undefined;
}

// ── HTML builder ───────────────────────────────────────────────────────────

function buildHtml(
  explainText: string | undefined,
  step: string,
  idx: number
): string {
  const safeStep = escapeHtml(step);

  let bodyContent: string;
  if (!explainText) {
    bodyContent = `<p class="empty">No heuristic data available for this step yet.</p>`;
  } else {
    // Strip the markdown wrapper added by ExplainOutputParser:
    //   **🔍 Heuristic Explanation** — Step N\n\n```\n…\n```
    const raw = explainText
      .replace(/^\*\*.*?\*\*\s*—\s*Step\s+\d+\s*\n*/u, "")
      .replace(/^```\n?/, "")
      .replace(/\n?```$/, "")
      .replace(/\u200B/g, ""); // remove zero-width spaces used to neutralise fences
    bodyContent = `<pre class="explain-block">${escapeHtml(raw)}</pre>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<style>
  body {
    font-family: var(--vscode-font-family, sans-serif);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    padding: 12px 16px;
    line-height: 1.5;
  }
  h2 { margin: 0 0 4px 0; font-size: 1.1em; }
  .step-text {
    color: var(--vscode-descriptionForeground);
    font-size: 0.9em;
    margin-bottom: 12px;
  }
  .explain-block {
    background: var(--vscode-textBlockQuote-background, rgba(127,127,127,.1));
    border-left: 3px solid var(--vscode-textLink-foreground, #3794ff);
    padding: 10px 14px;
    border-radius: 4px;
    overflow-x: auto;
    font-size: 0.85em;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .empty {
    color: var(--vscode-disabledForeground);
    font-style: italic;
  }
</style>
</head>
<body>
  <h2>🔮 Explain Next Step — Step ${idx}</h2>
  <p class="step-text">${safeStep}</p>
  ${bodyContent}
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
