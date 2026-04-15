import * as vscode from "vscode";
import { RE_STEP, RE_DONE, RE_HOOK_OPEN, RE_HOOK_CLOSE, RE_IF, RE_ELIF, RE_ELSE, RE_REPEAT, RE_FOR_EACH, RE_WHILE } from "./constants";

/**
 * Document formatter for .hunt DSL files.
 *
 * Applies YAML/Python-like visual hierarchy:
 *   0 spaces — @headers, STEP markers, DONE., [SETUP]/[TEARDOWN] block markers, top-level comments
 *   4 spaces — action commands, IF/ELIF/ELSE headers, loop headers (REPEAT/FOR EACH/WHILE), comments inside STEP or hook blocks
 *   8 spaces — body lines inside IF/ELIF/ELSE conditional blocks and loop blocks
 *   +4 per nesting level for nested IF/ELIF/ELSE/loop blocks
 */

const INDENT = "    "; // 4 spaces

/** Lines that are always flush-left (0 indent). */
const RE_HEADER = /^\s*@/;

export class HuntDocumentFormatter implements vscode.DocumentFormattingEditProvider {
  provideDocumentFormattingEdits(
    document: vscode.TextDocument,
    _options: vscode.FormattingOptions,
    _token: vscode.CancellationToken
  ): vscode.TextEdit[] {
    const edits: vscode.TextEdit[] = [];
    let insideBlock = false; // true when inside a STEP group or hook block
    const conditionalStack: number[] = []; // stack of IF/ELIF/ELSE header indent widths

    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      const raw = line.text;
      const trimmed = raw.trimEnd();    // strip trailing whitespace always
      const stripped = trimmed.trimStart();

      // ── Empty / blank lines — preserve as empty ──────────────────────
      if (stripped.length === 0) {
        if (raw !== "") {
          edits.push(vscode.TextEdit.replace(line.range, ""));
        }
        continue;
      }

      const origIndent = raw.length - raw.trimStart().length;
      let desired: string;

      // ── Zero-indent tokens ───────────────────────────────────────────
      if (RE_HEADER.test(stripped)) {
        // @context:, @title:, @tags:, @var:, @data:
        desired = stripped;
      } else if (RE_STEP.test(stripped)) {
        // STEP 1: Label  or  STEP: Label
        insideBlock = true;
        conditionalStack.length = 0;
        desired = stripped;
      } else if (RE_DONE.test(stripped)) {
        insideBlock = false;
        conditionalStack.length = 0;
        desired = stripped;
      } else if (RE_HOOK_OPEN.test(stripped)) {
        // [SETUP] / [TEARDOWN]
        insideBlock = true;
        conditionalStack.length = 0;
        desired = stripped;
      } else if (RE_HOOK_CLOSE.test(stripped)) {
        // [END SETUP] / [END TEARDOWN]
        insideBlock = false;
        conditionalStack.length = 0;
        desired = stripped;
      } else if (RE_IF.test(stripped)) {
        // New IF block — pop stale nesting entries using origIndent hint
        if (origIndent > 0) {
          while (conditionalStack.length > 0 &&
                 conditionalStack[conditionalStack.length - 1] >= origIndent) {
            conditionalStack.pop();
          }
        }
        const headerIndent = conditionalStack.length > 0
          ? conditionalStack[conditionalStack.length - 1] + INDENT.length
          : insideBlock ? INDENT.length : 0;
        conditionalStack.push(headerIndent);
        desired = headerIndent > 0 ? " ".repeat(headerIndent) + stripped : stripped;
      } else if (RE_REPEAT.test(stripped) || RE_FOR_EACH.test(stripped) || RE_WHILE.test(stripped)) {
        // Loop headers — same nesting logic as IF
        if (origIndent > 0) {
          while (conditionalStack.length > 0 &&
                 conditionalStack[conditionalStack.length - 1] >= origIndent) {
            conditionalStack.pop();
          }
        }
        const headerIndent = conditionalStack.length > 0
          ? conditionalStack[conditionalStack.length - 1] + INDENT.length
          : insideBlock ? INDENT.length : 0;
        conditionalStack.push(headerIndent);
        desired = headerIndent > 0 ? " ".repeat(headerIndent) + stripped : stripped;
      } else if (RE_ELIF.test(stripped) || RE_ELSE.test(stripped)) {
        // ELIF/ELSE — same indent as the matching IF (top of stack)
        // Pop nested entries that sit deeper than the origIndent hint
        if (origIndent > 0) {
          while (conditionalStack.length > 1 &&
                 conditionalStack[conditionalStack.length - 1] > origIndent) {
            conditionalStack.pop();
          }
        }
        if (conditionalStack.length > 0) {
          const headerIndent = conditionalStack[conditionalStack.length - 1];
          desired = headerIndent > 0 ? " ".repeat(headerIndent) + stripped : stripped;
        } else {
          desired = insideBlock ? INDENT + stripped : stripped;
        }
      } else {
        // ── Action / comment lines ───────────────────────────────────
        // Pop stale conditional entries when the original indent shows
        // the line is at or above the header level (i.e. exited the body).
        // Skip when origIndent is 0 — the file may be fully unformatted.
        if (origIndent > 0) {
          while (conditionalStack.length > 0 &&
                 origIndent <= conditionalStack[conditionalStack.length - 1]) {
            conditionalStack.pop();
          }
        }
        if (conditionalStack.length > 0) {
          const bodyIndent = conditionalStack[conditionalStack.length - 1] + INDENT.length;
          desired = " ".repeat(bodyIndent) + stripped;
        } else {
          desired = insideBlock ? INDENT + stripped : stripped;
        }
      }

      if (raw !== desired) {
        edits.push(vscode.TextEdit.replace(line.range, desired));
      }
    }

    return edits;
  }
}
