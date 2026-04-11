import * as vscode from "vscode";
import { RE_STEP, RE_DONE, RE_HOOK_OPEN, RE_HOOK_CLOSE, RE_IF, RE_ELIF, RE_ELSE } from "./constants";

/**
 * Document formatter for .hunt DSL files.
 *
 * Applies YAML/Python-like visual hierarchy:
 *   0 spaces — @headers, STEP markers, DONE., [SETUP]/[TEARDOWN] block markers, top-level comments
 *   4 spaces — action commands, IF/ELIF/ELSE headers, comments inside STEP or hook blocks
 *   8 spaces — body lines inside IF/ELIF/ELSE conditional blocks
 */

const INDENT = "    "; // 4 spaces
const DOUBLE_INDENT = "        "; // 8 spaces

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
    let conditionalHeaderIndent = -1; // indent column of the active IF/ELIF/ELSE header, -1 = none

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

      let desired: string;

      // ── Zero-indent tokens ───────────────────────────────────────────
      if (RE_HEADER.test(stripped)) {
        // @context:, @title:, @tags:, @var:, @data:
        desired = stripped;
      } else if (RE_STEP.test(stripped)) {
        // STEP 1: Label  or  STEP: Label
        insideBlock = true;
        conditionalHeaderIndent = -1;
        desired = stripped;
      } else if (RE_DONE.test(stripped)) {
        insideBlock = false;
        conditionalHeaderIndent = -1;
        desired = stripped;
      } else if (RE_HOOK_OPEN.test(stripped)) {
        // [SETUP] / [TEARDOWN]
        insideBlock = true;
        conditionalHeaderIndent = -1;
        desired = stripped;
      } else if (RE_HOOK_CLOSE.test(stripped)) {
        // [END SETUP] / [END TEARDOWN]
        insideBlock = false;
        conditionalHeaderIndent = -1;
        desired = stripped;
      } else if (RE_IF.test(stripped) || RE_ELIF.test(stripped) || RE_ELSE.test(stripped)) {
        // IF/ELIF/ELSE headers — same indent level as action lines (4 spaces inside a block)
        const headerIndent = insideBlock ? INDENT.length : 0;
        conditionalHeaderIndent = headerIndent;
        desired = insideBlock ? INDENT + stripped : stripped;
      } else {
        // ── Action / comment lines ───────────────────────────────────
        // Detect whether we've left the conditional body: a line whose
        // *original* indent is at or below the header indent is a sibling,
        // not a body child.  Skip the check when origIndent is 0 because
        // that often means the file is completely unformatted.
        if (conditionalHeaderIndent >= 0) {
          const origIndent = raw.length - raw.trimStart().length;
          if (origIndent > 0 && origIndent <= conditionalHeaderIndent) {
            conditionalHeaderIndent = -1;
          }
        }
        desired = conditionalHeaderIndent >= 0
          ? DOUBLE_INDENT + stripped
          : insideBlock ? INDENT + stripped
          : stripped;
      }

      if (raw !== desired) {
        edits.push(vscode.TextEdit.replace(line.range, desired));
      }
    }

    return edits;
  }
}
