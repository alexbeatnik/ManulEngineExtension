import * as vscode from "vscode";
import { RE_STEP, RE_DONE, RE_HOOK_OPEN, RE_HOOK_CLOSE, RE_COMMENT, RE_IF, RE_ELIF, RE_ELSE } from "./constants";

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
    let insideConditional = false; // true when inside an IF/ELIF/ELSE body

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
        insideConditional = false;
        desired = stripped;
      } else if (RE_DONE.test(stripped)) {
        insideBlock = false;
        insideConditional = false;
        desired = stripped;
      } else if (RE_HOOK_OPEN.test(stripped)) {
        // [SETUP] / [TEARDOWN]
        insideBlock = true;
        insideConditional = false;
        desired = stripped;
      } else if (RE_HOOK_CLOSE.test(stripped)) {
        // [END SETUP] / [END TEARDOWN]
        insideBlock = false;
        insideConditional = false;
        desired = stripped;
      } else if (RE_IF.test(stripped) || RE_ELIF.test(stripped) || RE_ELSE.test(stripped)) {
        // IF/ELIF/ELSE headers — same indent level as action lines
        insideConditional = true;
        desired = insideBlock ? INDENT + stripped : stripped;
      } else if (RE_COMMENT.test(stripped)) {
        // Comments: double-indent inside conditionals, single inside blocks
        desired = insideConditional ? DOUBLE_INDENT + stripped
          : insideBlock ? INDENT + stripped
          : stripped;
      } else {
        // ── Action lines — double-indent inside conditionals ─────────
        desired = insideConditional ? DOUBLE_INDENT + stripped
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
