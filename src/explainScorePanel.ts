/**
 * explainScorePanel.ts — Modal dialog that displays the heuristic score
 * breakdown for the current debug step.
 *
 * Opened from the "🔮 Explain Next Step" button in the DebugControlPanel
 * QuickPick.  Uses a native VS Code modal dialog so it floats above
 * everything.  The QuickPick stays open behind it — once the modal is
 * dismissed the user is back at the pause controls.
 */

import * as vscode from "vscode";
import type { ExplainNextResult } from "./shared";

/**
 * Show a modal dialog with the WhatIfResult from the engine's
 * explain-next evaluation.  Can be called repeatedly.
 */
export async function showExplainScorePanel(
  result: ExplainNextResult,
): Promise<void> {
  const shortStep = result.step.length > 80 ? result.step.slice(0, 80) + "…" : result.step;

  const lines: string[] = [];
  lines.push(`Confidence: ${result.score}/10 (${result.confidence_label})`);
  lines.push(`Target found: ${result.target_found ? "Yes" : "No"}`);
  if (result.target_element) {
    lines.push(`Target element: ${result.target_element}`);
  }
  if (result.heuristic_score !== null) {
    lines.push(`Heuristic score: ${result.heuristic_score}`);
  }
  if (result.heuristic_match) {
    lines.push(`Best heuristic match: ${result.heuristic_match}`);
  }
  lines.push("");
  lines.push(`Explanation: ${result.explanation}`);
  if (result.risk) {
    lines.push(`Risk: ${result.risk}`);
  }
  if (result.suggestion) {
    lines.push(`Suggestion: ${result.suggestion}`);
  }

  const detail = lines.join("\n");

  await vscode.window.showInformationMessage(
    `🔮 Explain Next Step: ${shortStep}`,
    { modal: true, detail },
    "OK"
  );
}

/** No-op for API compatibility — modal dialogs don't need disposal. */
export function disposeExplainScorePanel(): void {
  // nothing to dispose — modal is ephemeral
}
