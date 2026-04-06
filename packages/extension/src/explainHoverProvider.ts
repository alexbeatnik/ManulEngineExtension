/**
 * explainHoverProvider.ts — Stores per-line explanation data from `--explain`
 * debug runs and serves it as hover tooltips in `.hunt` files.
 *
 * Flow:
 *   1. Debug runner spawns `manul --explain …`
 *   2. Stdout is parsed line-by-line; `[🐾 STEP N @…]` markers track the
 *      current plan step; explain blocks (┌─ 🔍 EXPLAIN … └─ ✅ Decision)
 *      are captured and stored keyed by file line number.
 *   3. When the user hovers over a line in the editor, the HoverProvider
 *      checks the cache and returns the explanation as a Markdown tooltip.
 */

import * as vscode from "vscode";
import * as fs from "fs";
import { RE_DONE, RE_HOOK_CLOSE, RE_HOOK_OPEN, RE_METADATA, RE_STEP } from "./constants";

/**
 * Parse a `.hunt` file and return a map from 1-based plan step index
 * to 0-based file line number.
 *
 * This mirrors the executable mission body rather than the raw file layout:
 * skip metadata, comments, blank lines, hook blocks, logical STEP headers,
 * and DONE markers. `result.get(stepNum)` gives the 0-based editor line for
 * the Nth executable step.
 */
export function buildStepLineMap(filePath: string): Map<number, number> {
  const map = new Map<number, number>();
  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf-8");
  } catch {
    return map;
  }

  let inHook = false;
  let stepIndex = 0;

  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // Hook block boundaries
    if (RE_HOOK_OPEN.test(trimmed)) { inHook = true; continue; }
    if (RE_HOOK_CLOSE.test(trimmed)) { inHook = false; continue; }
    if (inHook) { continue; }

    // Skip blank, comment, metadata, structural STEP headers, and DONE.
    if (!trimmed || trimmed.startsWith("#") || RE_METADATA.test(trimmed) || RE_STEP.test(trimmed) || RE_DONE.test(trimmed)) {
      continue;
    }

    // This is a content line → plan step
    stepIndex++;
    map.set(stepIndex, i); // stepIndex is 1-based, i is 0-based
  }

  return map;
}

// ── Explanation cache ──────────────────────────────────────────────────────

/**
 * Global cache: file URI string → Map<0-based line number, explanation markdown>.
 * Persists across hover calls; cleared when a new debug session starts for
 * the same file.
 */
const _cache = new Map<string, Map<number, string>>();

/** Clear cached explanations for a specific file. */
export function clearExplanations(fileUri: string): void {
  _cache.delete(fileUri);
}

/** Clear all cached explanations (e.g. workspace change). */
export function clearAllExplanations(): void {
  _cache.clear();
}

/** Store an explanation for a specific file + line. */
export function setExplanation(fileUri: string, line: number, text: string): void {
  let fileMap = _cache.get(fileUri);
  if (!fileMap) {
    fileMap = new Map();
    _cache.set(fileUri, fileMap);
  }
  fileMap.set(line, text);
}

/** Retrieve cached explanation for a file + line (0-based). */
export function getExplanation(fileUri: string, line: number): string | undefined {
  return _cache.get(fileUri)?.get(line);
}

// ── Stdout explain-block parser ────────────────────────────────────────────

const BRACKETED_STEP_MARKER_RE = /\[(?:[^\]]*\s)?STEP\s+(\d+)(?:\s*[@:\]])/i;
const PLAIN_STEP_MARKER_RE = /^\s*STEP\s+(\d+)\b/i;
const ACTION_START_RE = /^\s*\[(?:[^\]]*\s)?ACTION START\]/i;
const EXPLAIN_START_RE = /^\s*┌─(?:\s*🔍)?\s*EXPLAIN:/u;
const EXPLAIN_END_RE = /^\s*└─(?:\s*✅)?\s*Decision:/iu;

function parseStepNumber(line: string): number | undefined {
  const bracketed = line.match(BRACKETED_STEP_MARKER_RE);
  if (bracketed) {
    return parseInt(bracketed[1], 10);
  }

  const plain = line.match(PLAIN_STEP_MARKER_RE);
  if (plain) {
    return parseInt(plain[1], 10);
  }

  return undefined;
}

/**
 * Stateful parser that extracts explain blocks from stdout lines and stores
 * them in the explanation cache mapped to the correct file line.
 *
 * Call `feed(line)` for each line of stdout.  The parser tracks the current
 * step from `[🐾 STEP N @…]` markers and accumulates explain blocks.
 */
export class ExplainOutputParser {
  private _currentStep = 0;
  private _actionStepCounter = 0;
  private _inExplainBlock = false;
  private _explainLines: string[] = [];
  private _awaitingExplicitActionStart = false;
  private readonly _fileUri: string;
  private readonly _stepLineMap: Map<number, number>;

  constructor(filePath: string) {
    this._fileUri = vscode.Uri.file(filePath).toString();
    this._stepLineMap = buildStepLineMap(filePath);
  }

  /** Explicitly set the currently executing step number from the debug pause payload. */
  setCurrentStep(stepNumber: number): void {
    if (stepNumber > 0) {
      this._currentStep = stepNumber;
      this._actionStepCounter = Math.max(this._actionStepCounter, stepNumber - 1);
      this._awaitingExplicitActionStart = true;
    }
  }

  /** Feed a single stdout line (without trailing newline). */
  feed(line: string): void {
    // Track current step number
    const parsedStep = parseStepNumber(line);
    if (parsedStep) {
      this._currentStep = parsedStep;
      this._actionStepCounter = Math.max(this._actionStepCounter, parsedStep - 1);
      this._awaitingExplicitActionStart = true;
    }

    // Fallback for current engine output: explain blocks are usually preceded
    // by ACTION START lines even when no explicit STEP marker is emitted.
    if (ACTION_START_RE.test(line)) {
      if (this._awaitingExplicitActionStart && this._currentStep === this._actionStepCounter + 1) {
        this._actionStepCounter = this._currentStep;
      } else {
        this._actionStepCounter += 1;
        this._currentStep = this._actionStepCounter;
      }
      this._awaitingExplicitActionStart = false;
    }

    // Detect explain block boundaries
    if (EXPLAIN_START_RE.test(line)) {
      this._inExplainBlock = true;
      this._explainLines = [line];
      return;
    }

    if (this._inExplainBlock) {
      this._explainLines.push(line);

      if (EXPLAIN_END_RE.test(line)) {
        this._inExplainBlock = false;
        this._storeBlock();
      }
    }
  }

  private _storeBlock(): void {
    if (this._currentStep <= 0 || this._explainLines.length === 0) { return; }

    const fileLine = this._stepLineMap.get(this._currentStep);
    if (fileLine === undefined) { return; }

    // Format as Markdown code block for the hover tooltip
    const raw = this._explainLines.join("\n");
    // Strip the box-drawing leading whitespace for cleaner display
    const cleaned = raw
      .split("\n")
      .map((l) => l.replace(/^\s{4}/, ""))
      .join("\n");

    // Prevent code-fence injection: neutralize any embedded ``` sequences
    const sanitized = cleaned.replace(/```/g, "\u200B```");
    const md = `**🔍 Heuristic Explanation** — Step ${this._currentStep}\n\n\`\`\`\n${sanitized}\n\`\`\``;
    setExplanation(this._fileUri, fileLine, md);
  }
}

// ── Hover Provider ─────────────────────────────────────────────────────────

export class ExplainHoverProvider implements vscode.HoverProvider {
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): vscode.Hover | undefined {
    const fileUri = document.uri.toString();
    const explanation = getExplanation(fileUri, position.line);
    if (!explanation) { return undefined; }

    const md = new vscode.MarkdownString(explanation);
    md.isTrusted = false;

    const lineRange = document.lineAt(position.line).range;
    return new vscode.Hover(md, lineRange);
  }
}
