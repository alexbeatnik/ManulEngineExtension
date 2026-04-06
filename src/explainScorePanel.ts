/**
 * explainScorePanel.ts — Explain-next result display helpers.
 *
 * Results are now shown inline in the DebugControlPanel QuickPick via
 * `panel.updateExplainResult()`.  This module retains backward-compatible
 * exports so existing callers don't break.
 */

import type { ExplainNextResult } from "./shared";

/** @deprecated — results are now shown inline in the QuickPick. No-op. */
export async function showExplainScorePanel(
  _result: ExplainNextResult,
): Promise<void> {
  // No-op — results are rendered inline by DebugControlPanel.updateExplainResult().
}

/** No-op for API compatibility. */
export function disposeExplainScorePanel(): void {
  // nothing to dispose
}
