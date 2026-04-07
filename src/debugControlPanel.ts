/**
 * debugControlPanel.ts — Floating QuickPick overlay for ManulEngine debug control.
 *
 * Uses vscode.window.createQuickPick() (low-level API) so the picker can be
 * dismissed programmatically via abort() when the user clicks Stop in Test Explorer.
 *
 * Buttons:  ⏭ Next Step  |  ▶ Continue All  |  👁 Highlight Element
 * ESC / Stop → abort() hides the picker → treated as "next" so Python unblocks.
 *
 * Window raising (Linux): spawns xdotool / wmctrl + notify-send (both silent-fail).
 */
import * as vscode from "vscode";
import { exec, execFile } from "child_process";
import type { ExplainNextResult } from "./shared";

export type PauseChoice = "next" | "continue" | "debug-stop" | "stop-test";

const NEXT_LABEL    = "⏭  Next Step";
const CONT_LABEL    = "▶  Continue All";
const EXPLAIN_LABEL = "🔮  Explain Next Step";
const DSTOP_LABEL   = "⏹  Debug Stop";
const SSTOP_LABEL   = "🛑  Stop Test";

/**
 * Find the 0-based line number of a step in the open editor document.
 * Matches the trimmed step text against each line.  Returns -1 if not found.
 */
function findStepLine(huntFile: string, stepText: string): number {
  const uri = vscode.Uri.file(huntFile);
  const doc = vscode.workspace.textDocuments.find(
    (d) => d.uri.fsPath === uri.fsPath
  );
  if (!doc) { return -1; }

  const trimmed = stepText.trim();
  for (let i = 0; i < doc.lineCount; i++) {
    if (doc.lineAt(i).text.trim() === trimmed) {
      return i;
    }
  }
  return -1;
}

/**
 * Read the current text of the step line from the VS Code editor.
 * Uses a pre-computed 0-based line number so it works even after the user
 * edits the line content between clicks.
 */
function readStepAtLine(huntFile: string, lineNumber: number): string | undefined {
  if (lineNumber < 0) { return undefined; }
  const uri = vscode.Uri.file(huntFile);
  const doc = vscode.workspace.textDocuments.find(
    (d) => d.uri.fsPath === uri.fsPath
  );
  if (!doc || lineNumber >= doc.lineCount) { return undefined; }
  return doc.lineAt(lineNumber).text.trim() || undefined;
}

/** Best-effort: raise the editor window above other apps on Linux. */
function tryRaiseWindow(stepIdx: number, stepText: string): void {
  if (process.platform !== "linux") { return; }
  // X11: xdotool activates by WM_CLASS, fallback wmctrl by title.
  exec(
    'xdotool search --onlyvisible --class "Code" windowactivate 2>/dev/null || wmctrl -a "Code" 2>/dev/null || true',
    () => { /* ignore errors */ }
  );
  // OS notification flashes taskbar on both X11 and Wayland.
  // Use execFile (argv array) instead of exec() to avoid shell-injection from
  // crafted .hunt step text that could break out of the notify-send quotes.
  const safeText = stepText.slice(0, 80);
  execFile(
    "notify-send",
    ["-u", "normal", "-t", "5000", `🐛 ManulEngine Debug — Step ${stepIdx}`, safeText],
    () => { /* ignore errors — notify-send may not be installed */ }
  );
}

export class DebugControlPanel {
  private static _instance: DebugControlPanel | undefined;
  private _activeQp: vscode.QuickPick<vscode.QuickPickItem> | undefined;

  private constructor(_ctx: vscode.ExtensionContext) {}

  static getInstance(ctx: vscode.ExtensionContext): DebugControlPanel {
    if (!DebugControlPanel._instance) {
      DebugControlPanel._instance = new DebugControlPanel(ctx);
    }
    return DebugControlPanel._instance;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Update the active QuickPick with explain-next results from the engine.
   * Called by the onExplainNextResult callback when the engine responds.
   * The result is shown inline — no modal, no hide/show cycle.
   */
  updateExplainResult(result: ExplainNextResult): void {
    const qp = this._activeQp;
    if (!qp) { return; }

    qp.busy = false;

    const found = result.target_found ? "✅" : "❌";
    const target = result.target_element || "(no match)";
    const summary = `Score: ${result.score}/10 (${result.confidence_label}) ${found} ${target}`;

    const parts: string[] = [];
    if (result.explanation) { parts.push(result.explanation); }
    if (result.risk) { parts.push(`Risk: ${result.risk}`); }
    if (result.suggestion) { parts.push(`Suggestion: ${result.suggestion}`); }
    if (result.heuristic_score !== null && result.heuristic_score !== undefined) {
      parts.push(`Heuristic: ${result.heuristic_score}`);
    }
    if (result.heuristic_match) { parts.push(`Match: ${result.heuristic_match}`); }
    const detail = parts.join(" · ");

    // Rebuild items to update the Explain entry's description & detail.
    qp.items = [
      { label: NEXT_LABEL },
      { label: CONT_LABEL },
      { label: EXPLAIN_LABEL, description: summary, detail },
      { label: DSTOP_LABEL, description: "Skip all remaining breakpoints and run to end" },
      { label: SSTOP_LABEL, description: "Abort the test immediately" },
    ];
  }

  /**
   * Show a floating QuickPick overlay for the current debug step.
   * ignoreFocusOut=true keeps it visible even when the browser is active.
   * Calling abort() (e.g. from Stop button) hides it immediately.
   */
  showPause(
    step: string,
    idx: number,
    huntFile?: string,
    onExplainRequest?: (stepOverride?: string) => void
  ): Promise<PauseChoice> {
    // Raise OS window and show system notification (fires async, best-effort).
    tryRaiseWindow(idx, step);

    return new Promise<PauseChoice>((resolve) => {
      const qp = vscode.window.createQuickPick<vscode.QuickPickItem>();
      this._activeQp = qp;

      qp.title = `🐛 ManulEngine Debug — Step ${idx}`;
      qp.placeholder = step.length > 120 ? step.slice(0, 120) + "…" : step;
      qp.items = [
        { label: NEXT_LABEL },
        { label: CONT_LABEL },
        { label: EXPLAIN_LABEL, description: "Show heuristic score breakdown for this step" },
        { label: DSTOP_LABEL, description: "Skip all remaining breakpoints and run to end" },
        { label: SSTOP_LABEL, description: "Abort the test immediately" },
      ];
      qp.ignoreFocusOut = true;

      // Locate the step's line number in the editor NOW (at pause time)
      // so we can read the current text later even if the user edits it.
      const stepLineNumber = huntFile ? findStepLine(huntFile, step) : -1;

      let resolved = false;
      const done = (choice: PauseChoice) => {
        if (resolved) { return; }
        resolved = true;
        this._activeQp = undefined;
        qp.dispose();
        resolve(choice);
      };

      qp.onDidAccept(() => {
        const label = qp.selectedItems[0]?.label;
        if (label === EXPLAIN_LABEL) {
          qp.busy = true;
          // Read the CURRENT text at the step's line — picks up any user
          // edits made since the engine paused.
          const currentStep = huntFile ? readStepAtLine(huntFile, stepLineNumber) : undefined;
          onExplainRequest?.(currentStep);
          // Clear selection so the same item can be clicked again.
          qp.activeItems = [];
          qp.value = "";
          return;
        } else if (label === DSTOP_LABEL) {
          done("debug-stop");
        } else if (label === SSTOP_LABEL) {
          done("stop-test");
        } else {
          done(label === CONT_LABEL ? "continue" : "next");
        }
      });

      // ESC or programmatic hide → resolve with "next" so Python readline() unblocks.
      qp.onDidHide(() => {
        done("next");
      });

      qp.show();
    });
  }

  /**
   * Programmatically close the active QuickPick (e.g. when Stop is pressed).
   * The pending showPause() promise resolves with "next" via onDidHide,
   * which unblocks Python's stdin readline and lets the process exit cleanly.
   */
  abort(): void {
    this._activeQp?.hide();
  }

  /** Reset singleton so next run gets a fresh instance. */
  dispose(): void {
    this._activeQp?.hide();
    DebugControlPanel._instance = undefined;
  }
}

