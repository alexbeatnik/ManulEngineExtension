/**
 * stepBuilderPanel.ts
 *
 * Sidebar webview that provides:
 *  - Step-insertion buttons — append the next numbered step to the active .hunt
 *    file with a single click.
 */

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { randomBytes } from "crypto";
import { spawn } from "child_process";
import { MANUL_DSL_COMMANDS } from "./shared";
import { findManulExecutable } from "./huntRunner";
import { getConfigFileName, TERMINAL_NAME } from "./constants";
import { detectRuntimeType, ManulRuntimeType } from "./runtimeDetector";

const RECORDER_TERMINAL_NAME = `${TERMINAL_NAME} (Recorder)`;

// ── Hook scaffold helpers ──────────────────────────────────────────────────

function getSetupScaffold(runtimeType: ManulRuntimeType): string {
  const call = runtimeType === 'go' ? 'CALL GO package_name.function_name' : 'CALL PYTHON module_name.function_name';
  return `[SETUP]\n    PRINT "Preparing setup"\n    ${call}\n[END SETUP]`;
}

function getTeardownScaffold(runtimeType: ManulRuntimeType): string {
  const call = runtimeType === 'go' ? 'CALL GO package_name.function_name' : 'CALL PYTHON module_name.function_name';
  return `[TEARDOWN]\n    PRINT "Cleaning up"\n    ${call}\n[END TEARDOWN]`;
}

// STEP_TEMPLATES removed — buttons are now generated from the extension-local MANUL_DSL_COMMANDS registry.

// ── Provider ──────────────────────────────────────────────────────────────────

export class StepBuilderProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "manul.stepBuilder";

  private _view?: vscode.WebviewView;
  constructor() {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this._getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (msg: { command: string; template?: string; url?: string }) => {
      if (msg.command === "insertStep" && msg.template !== undefined) {
        await insertStep(msg.template);
      } else if (msg.command === "insertSetup") {
        await vscode.commands.executeCommand("manul.insertSetup");
      } else if (msg.command === "insertTeardown") {
        await vscode.commands.executeCommand("manul.insertTeardown");
      } else if (msg.command === "runLiveScan") {
        await runLiveScanCommand(msg.url ?? "");
      } else if (msg.command === "recordSession") {
        await runRecordSessionCommand(msg.url ?? "");
      }
    });
  }

  private _getHtml(_webview: vscode.Webview): string {
    // Generate a nonce for the CSP — required for inline scripts in VS Code webviews.
    const nonce = getNonce();
    const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';`;

    // Generate buttons from the shared DSL contract — single source of truth.
    // Markup uses icon span + label span + inline tooltip.
    // Snippets are stored in a JS map (not HTML attributes) to preserve multi-line content.
    const snippetMap: Record<string, string> = {};
    const buttons = MANUL_DSL_COMMANDS.map(
      (cmd) => {
        snippetMap[cmd.id] = cmd.snippet;
        const hintRow = cmd.hintNote
          ? `<div class="sb-step-tooltip-row sb-step-tooltip-hint">
              <span class="sb-step-tooltip-value">\ud83d\udca1 ${escapeHtml(cmd.hintNote)}</span>
            </div>`
          : '';
        return `<div class="sb-tooltip-wrap" data-cmd-id="${cmd.id}">
          <button class="sb-list-btn" data-cmd-id="${cmd.id}">
            <span class="sb-list-icon">${cmd.icon}</span>
            <span class="sb-list-label">${cmd.label}</span>
          </button>
          <div class="sb-step-tooltip">
            <div class="sb-step-tooltip-title">${escapeHtml(cmd.label)}</div>
            <div class="sb-step-tooltip-row">
              <span class="sb-step-tooltip-key">Description</span>
              <span class="sb-step-tooltip-value">${escapeHtml(cmd.description)}</span>
            </div>
            <div class="sb-step-tooltip-row">
              <span class="sb-step-tooltip-key">Example</span>
              <code class="sb-step-tooltip-code">${escapeHtml(cmd.example)}</code>
            </div>${hintRow}
          </div>
        </div>`;
      }
    ).join("\n");

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>
  * { box-sizing: border-box; }
  body {
    padding: 8px;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
  }

  /* ── Sections ───────────────────────────────────────────────── */
  .sb-section { margin-bottom: 12px; }
  .sb-section-title {
    font-size: 11px; font-weight: 600;
    color: var(--vscode-descriptionForeground);
    text-transform: uppercase; letter-spacing: 0.5px;
    margin-bottom: 6px;
  }

  /* ── Inputs ─────────────────────────────────────────────────── */
  .sb-input {
    width: 100%; padding: 6px 8px; margin-bottom: 6px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 4px; font-size: 12px; outline: none;
  }
  .sb-input:focus { border-color: var(--vscode-focusBorder); }
  .sb-input::placeholder { color: var(--vscode-input-placeholderForeground); }
  .sb-select {
    width: 100%; padding: 6px 8px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 4px; font-size: 12px; outline: none;
  }
  .sb-select:focus { border-color: var(--vscode-focusBorder); }

  /* ── Action buttons (primary) ───────────────────────────────── */
  .sb-action-btn {
    width: 100%; padding: 8px 12px; margin-bottom: 4px;
    border: none; border-radius: 4px; font-size: 12px;
    font-weight: 600; cursor: pointer; text-align: center;
    transition: background 0.15s;
  }
  .sb-action-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .sb-action-primary {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }
  .sb-action-primary:hover:not(:disabled) {
    background: var(--vscode-button-hoverBackground);
  }

  /* ── Scanner row ────────────────────────────────────────────── */
  .sb-scanner-row {
    display: flex; gap: 4px; margin-bottom: 6px;
  }
  .sb-scanner-row .sb-input-url { flex: 1; margin-bottom: 0; }
  .sb-scan-btn {
    flex-shrink: 0; padding: 6px 10px;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none; border-radius: 4px; font-size: 11px;
    font-weight: 600; white-space: nowrap; cursor: pointer;
    transition: background 0.15s;
  }
  .sb-scan-btn:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
  .sb-scan-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  /* ── Record button ──────────────────────────────────────────── */
  .sb-record-btn {
    width: 100%; padding: 8px 12px;
    background: #c0392b; color: #fff;
    border: none; border-radius: 4px; font-size: 12px;
    font-weight: 600; cursor: pointer; text-align: center;
    transition: background 0.15s;
  }
  .sb-record-btn:hover:not(:disabled) { background: #e74c3c; }
  .sb-record-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  /* ── Proximity builder ─────────────────────────────────────── */
  .sb-builder-toggle-row {
    display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px; margin-bottom: 10px;
  }
  .sb-builder-toggle {
    padding: 7px 10px; border: 1px solid var(--vscode-widget-border, transparent);
    border-radius: 6px; background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    font-size: 11px; font-weight: 700; letter-spacing: 0.04em; cursor: pointer;
  }
  .sb-builder-toggle.is-active {
    border-color: var(--vscode-focusBorder);
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }
  .sb-builder-grid {
    display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px;
  }
  .sb-builder-field {
    display: flex; flex-direction: column; gap: 4px;
  }
  .sb-builder-field-span { grid-column: 1 / -1; }
  .sb-builder-label, .sb-preview-label {
    font-size: 10px; font-weight: 700; letter-spacing: 0.06em;
    text-transform: uppercase; color: var(--vscode-descriptionForeground);
  }
  .sb-preview-card {
    margin-top: 10px; padding: 10px; border-radius: 8px;
    background: var(--vscode-editorHoverWidget-background, var(--vscode-editor-background));
    border: 1px solid var(--vscode-editorHoverWidget-border, var(--vscode-widget-border, transparent));
  }
  .sb-preview-code {
    display: block; margin: 8px 0 10px; padding: 8px 10px; border-radius: 6px;
    background: var(--vscode-textCodeBlock-background, rgba(15, 23, 42, 0.28));
    border: 1px solid var(--vscode-widget-border, rgba(148, 163, 184, 0.2));
    color: var(--vscode-foreground); white-space: pre-wrap; word-break: break-word;
    font-size: 11px; line-height: 1.45;
  }

  /* ── Step list ──────────────────────────────────────────────── */
  .sb-step-list { display: flex; flex-direction: column; gap: 1px; }
  .sb-tooltip-wrap { position: relative; }

  /* ── List buttons ───────────────────────────────────────────── */
  .sb-list-btn {
    display: flex; align-items: center; gap: 8px;
    padding: 7px 10px;
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border: none; border-radius: 4px; cursor: pointer;
    font-size: 12px; text-align: left;
    transition: background 0.15s; width: 100%; margin-bottom: 1px;
  }
  .sb-list-btn:hover:not(:disabled) {
    background: var(--vscode-button-secondaryHoverBackground);
  }
  .sb-list-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .sb-list-icon { flex-shrink: 0; font-size: 14px; width: 20px; text-align: center; }
  .sb-list-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* ── Hover tooltip ──────────────────────────────────────────── */
  .sb-step-tooltip {
    display: none;
    margin: 6px 0 8px; padding: 10px 12px; border-radius: 8px;
    background: var(--vscode-editorHoverWidget-background, var(--vscode-editor-background));
    border: 1px solid var(--vscode-editorHoverWidget-border, var(--vscode-widget-border, transparent));
    box-shadow: 0 8px 18px rgba(0, 0, 0, 0.18);
  }
  .sb-tooltip-wrap:hover .sb-step-tooltip,
  .sb-tooltip-wrap.sb-focus .sb-step-tooltip { display: block; }
  .sb-step-tooltip-title {
    font-size: 12px; font-weight: 700;
    color: var(--vscode-foreground); margin-bottom: 8px;
  }
  .sb-step-tooltip-row { display: flex; flex-direction: column; gap: 3px; }
  .sb-step-tooltip-row + .sb-step-tooltip-row { margin-top: 8px; }
  .sb-step-tooltip-key {
    font-size: 10px; font-weight: 700; letter-spacing: 0.06em;
    text-transform: uppercase; color: var(--vscode-descriptionForeground);
  }
  .sb-step-tooltip-value {
    font-size: 12px; line-height: 1.45; color: var(--vscode-foreground);
  }
  .sb-step-tooltip-code {
    display: block; padding: 8px 10px; border-radius: 6px;
    background: var(--vscode-textCodeBlock-background, rgba(15, 23, 42, 0.28));
    border: 1px solid var(--vscode-widget-border, rgba(148, 163, 184, 0.2));
    color: var(--vscode-foreground);
    white-space: pre-wrap; word-break: break-word;
    font-size: 11px; line-height: 1.4;
  }
  .sb-step-tooltip-hint {
    margin-top: 8px; padding: 6px 8px; border-radius: 6px;
    background: var(--vscode-textBlockQuote-background, rgba(255, 193, 7, 0.08));
    border-left: 3px solid var(--vscode-textBlockQuote-border, #e2b340);
  }
  .sb-step-tooltip-hint .sb-step-tooltip-value {
    font-size: 11px; font-style: italic;
    color: var(--vscode-descriptionForeground);
  }
</style>
</head>
<body>
  <!-- ── Logical Steps ──────────────────────────────────────────── -->
  <div class="sb-section">
    <div class="sb-section-title">LOGICAL STEPS</div>
    <button class="sb-action-btn sb-action-primary" id="btn-logical-step">📋 Add Step</button>
  </div>

  <!-- ── Hooks ──────────────────────────────────────────────────── -->
  <div class="sb-section">
    <div class="sb-section-title">HOOKS</div>
    <button class="sb-list-btn" id="btn-insert-setup">
      <span class="sb-list-icon">🔧</span><span class="sb-list-label">Insert [SETUP] block</span>
    </button>
    <button class="sb-list-btn" id="btn-insert-teardown">
      <span class="sb-list-icon">🧹</span><span class="sb-list-label">Insert [TEARDOWN] block</span>
    </button>
  </div>

  <!-- ── Proximity Builder ─────────────────────────────────────── -->
  <div class="sb-section">
    <div class="sb-section-title">PROXIMITY BUILDER</div>
    <div class="sb-builder-toggle-row" role="tablist" aria-label="Step type">
      <button class="sb-builder-toggle is-active" type="button" data-step-kind="click">CLICK</button>
      <button class="sb-builder-toggle" type="button" data-step-kind="fill">FILL</button>
      <button class="sb-builder-toggle" type="button" data-step-kind="verify">VERIFY</button>
    </div>

    <div class="sb-builder-grid">
      <label class="sb-builder-field">
        <span class="sb-builder-label">Target</span>
        <input class="sb-input" type="text" id="builder-target" placeholder="e.g. Save" />
      </label>

      <label class="sb-builder-field" id="builder-element-type-field">
        <span class="sb-builder-label">Element type</span>
        <select class="sb-select" id="builder-element-type">
          <option value="button">button</option>
          <option value="link">link</option>
          <option value="checkbox">checkbox</option>
          <option value="dropdown">dropdown</option>
          <option value="input">input</option>
          <option value="element">element</option>
        </select>
      </label>

      <label class="sb-builder-field" id="builder-fill-value-field" style="display:none;">
        <span class="sb-builder-label">Value</span>
        <input class="sb-input" type="text" id="builder-fill-value" placeholder="e.g. alex@example.com" />
      </label>

      <label class="sb-builder-field" id="builder-verify-assertion-field" style="display:none;">
        <span class="sb-builder-label">Assertion</span>
        <select class="sb-select" id="builder-verify-assertion">
          <option value="present">present</option>
          <option value="NOT present">NOT present</option>
          <option value="ENABLED">ENABLED</option>
          <option value="DISABLED">DISABLED</option>
          <option value="checked">checked</option>
          <option value="NOT checked">NOT checked</option>
        </select>
      </label>

      <label class="sb-builder-field">
        <span class="sb-builder-label">Context / Proximity</span>
        <select class="sb-select" id="builder-context-kind">
          <option value="none">No context</option>
          <option value="near">NEAR [text]</option>
          <option value="on_header">ON HEADER</option>
          <option value="on_footer">ON FOOTER</option>
          <option value="inside_row">INSIDE [container] row with [text]</option>
        </select>
      </label>

      <label class="sb-builder-field sb-builder-field-span" id="builder-context-value-field" style="display:none;">
        <span class="sb-builder-label" id="builder-context-value-label">Anchor text</span>
        <input class="sb-input" type="text" id="builder-context-value" placeholder="e.g. Cancel" />
      </label>

      <label class="sb-builder-field sb-builder-field-span" id="builder-inside-container-field" style="display:none;">
        <span class="sb-builder-label">Container</span>
        <input class="sb-input" type="text" id="builder-inside-container" placeholder="e.g. Actions" />
      </label>

      <label class="sb-builder-field sb-builder-field-span" id="builder-inside-row-text-field" style="display:none;">
        <span class="sb-builder-label">Row text</span>
        <input class="sb-input" type="text" id="builder-inside-row-text" placeholder="e.g. John Doe" />
      </label>
    </div>

    <div class="sb-preview-card">
      <div class="sb-preview-label">Preview</div>
      <code class="sb-preview-code" id="builder-preview">Click 'Target' button</code>
      <button class="sb-action-btn sb-action-primary" id="builder-insert-btn" disabled>Insert Preview Step</button>
    </div>
  </div>

  <!-- ── Live Page Scanner ──────────────────────────────────────── -->
  <div class="sb-section">
    <div class="sb-section-title">LIVE PAGE SCANNER</div>
    <div class="sb-scanner-row">
      <input class="sb-input sb-input-url" type="text" id="scanner-url-input" placeholder="https://example.com" />
      <button class="sb-scan-btn" id="run-live-scan-btn">🔍 Run Scan</button>
    </div>
    <button class="sb-record-btn" id="run-record-btn">🔴 Record Session</button>
  </div>

  <!-- ── Insert Step ────────────────────────────────────────────── -->
  <div class="sb-section">
    <div class="sb-section-title">INSERT STEP</div>
    <div class="sb-step-list">
      ${buttons}
    </div>
  </div>

  <script nonce="${nonce}">
    window.onerror = function(msg, src, line) {
      var d = document.createElement('div');
      d.style.cssText = 'color:#f44;padding:8px;font-size:11px;border:1px solid #f44;margin:4px;';
      d.textContent = 'JS Error (L' + line + '): ' + msg;
      document.body.prepend(d);
    };
    const vsc = acquireVsCodeApi();
    const CONTEXT_OPTIONS = {
      click: [
        { value: 'none', label: 'No context' },
        { value: 'near', label: 'NEAR [text]' },
        { value: 'on_header', label: 'ON HEADER' },
        { value: 'on_footer', label: 'ON FOOTER' },
        { value: 'inside_row', label: 'INSIDE [container] row with [text]' }
      ],
      fill: [
        { value: 'none', label: 'No context' },
        { value: 'near', label: 'NEAR [text]' },
        { value: 'inside_row', label: 'INSIDE [container] row with [text]' }
      ],
      verify: [
        { value: 'none', label: 'No context' },
        { value: 'near', label: 'NEAR [text]' },
        { value: 'on_header', label: 'ON HEADER' },
        { value: 'on_footer', label: 'ON FOOTER' },
        { value: 'inside_row', label: 'INSIDE [container] row with [text]' }
      ]
    };

    /* ── Read current form state directly from DOM ────────────────
       No separate state object: always reads live DOM values so
       VS Code's silent form-value restore after webview hide/show
       can never cause a stale-state bug.
    ── */
    function getStepKind() {
      var active = document.querySelector('.sb-builder-toggle.is-active');
      return active ? active.dataset.stepKind : 'click';
    }
    function getContextKind() {
      return document.getElementById('builder-context-kind').value || 'none';
    }
    function requiresContextValue(ctx) {
      return ctx === 'near';
    }
    function requiresInsideRowValues(ctx) {
      return ctx === 'inside_row';
    }
    function quoteDsl(value, fallback) {
      var SQ = String.fromCharCode(39);
      var BS = String.fromCharCode(92);
      var normalized = (value || '').trim() || fallback;
      return SQ + normalized.split(SQ).join(BS + SQ) + SQ;
    }
    function buildPreview() {
      var stepKind    = getStepKind();
      var contextKind = getContextKind();
      var target      = document.getElementById('builder-target').value || '';
      var ctxVal      = document.getElementById('builder-context-value').value || '';
      var insideContainer = document.getElementById('builder-inside-container').value || '';
      var insideRowText   = document.getElementById('builder-inside-row-text').value || '';
      var fillVal     = document.getElementById('builder-fill-value').value || '';
      var verifyAssertion = document.getElementById('builder-verify-assertion').value || 'present';
      var elemType    = document.getElementById('builder-element-type').value || 'button';
      var qt = quoteDsl(target, stepKind === 'fill' ? 'Field' : 'Target');
      var base = '';
      if (stepKind === 'click') {
        base = elemType === 'element' ? 'Click ' + qt : 'Click ' + qt + ' ' + elemType;
      } else if (stepKind === 'fill') {
        base = 'Fill ' + qt + ' field with ' + quoteDsl(fillVal, 'Value');
      } else if (stepKind === 'verify') {
        base = 'VERIFY that ' + qt + ' is ' + verifyAssertion;
      }
      if (contextKind === 'near')      return base + ' NEAR '   + quoteDsl(ctxVal, 'Anchor');
      if (contextKind === 'inside_row') return base + ' INSIDE ' + quoteDsl(insideContainer, 'Container') + ' row with ' + quoteDsl(insideRowText, 'Row text');
      if (contextKind === 'on_header') return base + ' ON HEADER';
      if (contextKind === 'on_footer') return base + ' ON FOOTER';
      return base;
    }
    function hasRequiredFields() {
      var stepKind    = getStepKind();
      var contextKind = getContextKind();
      var target  = document.getElementById('builder-target').value || '';
      var fillVal = document.getElementById('builder-fill-value').value || '';
      var ctxVal  = document.getElementById('builder-context-value').value || '';
      var insideContainer = document.getElementById('builder-inside-container').value || '';
      var insideRowText   = document.getElementById('builder-inside-row-text').value || '';
      if (!target.trim()) return false;
      if (stepKind === 'fill' && !fillVal.trim()) return false;
      if (requiresContextValue(contextKind) && !ctxVal.trim()) return false;
      if (requiresInsideRowValues(contextKind) && (!insideContainer.trim() || !insideRowText.trim())) return false;
      return true;
    }
    function show(id) { var el = document.getElementById(id); if (el) el.style.display = 'flex'; }
    function hide(id) { var el = document.getElementById(id); if (el) el.style.display = 'none'; }

    function syncContextOptions() {
      var stepKind = getStepKind();
      var select = document.getElementById('builder-context-kind');
      var current = select.value;
      var options = CONTEXT_OPTIONS[stepKind] || CONTEXT_OPTIONS.click;
      var valid = options.map(function(o) { return o.value; });
      select.innerHTML = options.map(function(o) {
        return '<option value="' + o.value + '">' + o.label + '</option>';
      }).join('');
      select.value = valid.indexOf(current) !== -1 ? current : 'none';
    }

    function syncBuilderUi() {
      var stepKind    = getStepKind();
      var contextKind = getContextKind();
      document.getElementById('builder-target').placeholder = stepKind === 'fill' ? 'e.g. Email' : stepKind === 'verify' ? 'e.g. Success banner' : 'e.g. Save';
      if (stepKind === 'click') { show('builder-element-type-field'); }   else { hide('builder-element-type-field'); }
      if (stepKind === 'fill')  { show('builder-fill-value-field'); }     else { hide('builder-fill-value-field'); }
      if (stepKind === 'verify') { show('builder-verify-assertion-field'); } else { hide('builder-verify-assertion-field'); }
      var contextField = document.getElementById('builder-context-value-field');
      var contextLabel = document.getElementById('builder-context-value-label');
      var contextInput = document.getElementById('builder-context-value');
      var insideContainerField = document.getElementById('builder-inside-container-field');
      var insideRowTextField = document.getElementById('builder-inside-row-text-field');
      if (requiresContextValue(contextKind)) {
        contextField.style.display = 'flex';
        contextLabel.textContent = 'Anchor text';
        contextInput.placeholder = 'e.g. Cancel';
      } else {
        contextField.style.display = 'none';
      }
      if (requiresInsideRowValues(contextKind)) {
        insideContainerField.style.display = 'flex';
        insideRowTextField.style.display = 'flex';
      } else {
        insideContainerField.style.display = 'none';
        insideRowTextField.style.display = 'none';
      }
      document.getElementById('builder-preview').textContent = buildPreview();
      document.getElementById('builder-insert-btn').disabled = !hasRequiredFields();
    }

    /* ── Fixed buttons ──────────────────────────────────────────── */
    document.getElementById('btn-logical-step').addEventListener('click', function() {
      vsc.postMessage({ command: 'insertStep', template: 'STEP : Description' });
    });
    document.getElementById('btn-insert-setup').addEventListener('click', function() {
      vsc.postMessage({ command: 'insertSetup' });
    });
    document.getElementById('btn-insert-teardown').addEventListener('click', function() {
      vsc.postMessage({ command: 'insertTeardown' });
    });

    document.querySelectorAll('.sb-builder-toggle').forEach(function(button) {
      button.addEventListener('click', function() {
        document.querySelectorAll('.sb-builder-toggle').forEach(function(b) { b.classList.remove('is-active'); });
        button.classList.add('is-active');
        syncContextOptions();
        syncBuilderUi();
      });
    });
    document.getElementById('builder-target').addEventListener('input', function() { syncBuilderUi(); });
    document.getElementById('builder-element-type').addEventListener('change', function() { syncBuilderUi(); });
    document.getElementById('builder-fill-value').addEventListener('input', function() { syncBuilderUi(); });
    document.getElementById('builder-verify-assertion').addEventListener('change', function() { syncBuilderUi(); });
    document.getElementById('builder-context-kind').addEventListener('change', function() { syncBuilderUi(); });
    document.getElementById('builder-context-value').addEventListener('input', function() { syncBuilderUi(); });
    document.getElementById('builder-inside-container').addEventListener('input', function() { syncBuilderUi(); });
    document.getElementById('builder-inside-row-text').addEventListener('input', function() { syncBuilderUi(); });
    document.getElementById('builder-insert-btn').addEventListener('click', function() {
      vsc.postMessage({ command: 'insertStep', template: buildPreview() });
    });

    /* ── Scanner ────────────────────────────────────────────────── */
    document.getElementById('run-live-scan-btn').addEventListener('click', function() {
      var urlVal = document.getElementById('scanner-url-input').value.trim();
      if (!urlVal) { document.getElementById('scanner-url-input').focus(); return; }
      vsc.postMessage({ command: 'runLiveScan', url: urlVal });
    });
    document.getElementById('run-record-btn').addEventListener('click', function() {
      var urlVal = document.getElementById('scanner-url-input').value.trim();
      if (!urlVal) { document.getElementById('scanner-url-input').focus(); return; }
      vsc.postMessage({ command: 'recordSession', url: urlVal });
    });

    /* ── DSL step buttons ───────────────────────────────────────── */
    var SNIPPET_MAP = ${JSON.stringify(snippetMap).replace(/<\//g, '<\\/')};
    document.querySelectorAll('.sb-list-btn[data-cmd-id]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var template = SNIPPET_MAP[btn.dataset.cmdId];
        if (template) { vsc.postMessage({ command: 'insertStep', template: template }); }
      });
    });

    /* ── Keyboard focus tooltips (hover is handled by CSS :hover) ───── */
    document.querySelectorAll('.sb-tooltip-wrap').forEach(function(wrap) {
      var btn = wrap.querySelector('.sb-list-btn');
      if (btn) {
        btn.addEventListener('focus', function() { wrap.classList.add('sb-focus'); });
        btn.addEventListener('blur', function() { wrap.classList.remove('sb-focus'); });
      }
    });

    syncContextOptions();
    syncBuilderUi();
  </script>
</body></html>`;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Generate a cryptographically random nonce string for the webview Content-Security-Policy. */
function getNonce(): string {
  return randomBytes(16).toString("hex");
}

/** Escape HTML special characters for safe insertion into webview markup. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Append a step to the active .hunt file.
 * Automatically inserts at the current cursor position, moving to a new line if needed.
 * Uses VS Code Snippets to position the cursor inside placeholders.
 *
 * Only operates on `vscode.window.activeTextEditor` — if the active editor
 * is not a .hunt file, shows a warning and returns without switching tabs.
 */
async function insertStep(template: string): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !editor.document.fileName.endsWith(".hunt")) {
    vscode.window.showWarningMessage("Please open a .hunt file to insert steps.");
    return;
  }

  const doc = editor.document;
  const activePos = editor.selection.active;

  // Guardrail: Do not allow inserting steps after a "DONE." command
  const textBeforeCursor = doc.getText(new vscode.Range(new vscode.Position(0, 0), activePos));
  if (/(^|\n)\s*DONE\.\s*(\n|$)/.test(textBeforeCursor)) {
    vscode.window.showWarningMessage(
      "Cannot add actions after 'DONE.'. Please move your cursor above it, or remove 'DONE.' to continue building."
    );
    return;
  }

  const line = doc.lineAt(activePos.line);

  let prefix = "";
  let insertPos = activePos;

  if (line.text.trim() !== "") {
    if (activePos.character === line.range.end.character) {
      prefix = "\n";
    } else {
      prefix = "\n";
      insertPos = line.range.end;
    }
  } else {
    if (template.startsWith("STEP") && activePos.line > 0) {
      if (doc.lineAt(activePos.line - 1).text.trim() !== "") {
        prefix = "\n";
      }
    }
  }

  if (prefix !== "" || insertPos.character !== activePos.character) {
    const ok = await editor.edit((eb) => {
      eb.insert(insertPos, prefix);
    });
    if (!ok) return;
    const newPos = new vscode.Position(insertPos.line + (prefix.includes("\n") ? 1 : 0), 0);
    editor.selection = new vscode.Selection(newPos, newPos);
  }

  let snippetString = template;
  if (template.includes('${')) {
    snippetString = template;
  } else if (template === "STEP : Description") {
    snippetString = "STEP ${1:1}: ${2:Description}";
  } else if (template === "CALL PYTHON module_name.function_name") {
    snippetString = "CALL PYTHON ${1:module_name}.${2:function_name}";
  } else if (template === "CALL PYTHON module_name.function_name 'arg1' {var}") {
    snippetString = "CALL PYTHON ${1:module_name}.${2:function_name} ${3:'arg1'} {${4:var}}";
  } else if (template === "CALL PYTHON module_name.function_name into {variable_name}") {
    snippetString = "CALL PYTHON ${1:module_name}.${2:function_name} into {${3:variable_name}}";
  } else if (template === "CALL PYTHON module_name.function_name 'arg1' {var} into {result}") {
    snippetString = "CALL PYTHON ${1:module_name}.${2:function_name} ${3:'arg1'} {${4:var}} into {${5:result}}";
  } else {
    let counter = 1;
    snippetString = snippetString.replace(/''/g, () => `'$\{${counter++}}'`);
    snippetString = snippetString.replace(/\{\}/g, () => `{$\{${counter++}}}`);
    snippetString = snippetString.replace("<KEY>", "${1:KEY}");
  }

  if (template.startsWith("STEP")) {
    snippetString += "\n";
  }

  await editor.insertSnippet(new vscode.SnippetString(snippetString));
}

// ── Hook commands ────────────────────────────────────────────────────────────

/**
 * Shared helper for hook/demo commands: operates strictly on the active
 * editor. If the active editor is not a .hunt file, shows a warning and
 * returns without switching tabs.
 */
async function _withHuntEditor(
  action: (editor: vscode.TextEditor) => Promise<void>
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !editor.document.fileName.endsWith(".hunt")) {
    vscode.window.showWarningMessage("Please open a .hunt file first.");
    return;
  }
  await action(editor);
}

/**
 * Insert a `[SETUP]` scaffold at the start of the cursor's line.
 * If an uncommented `[SETUP]` block already exists, show a warning instead.
 * Commented-out scaffolds (lines starting with #) are intentionally ignored.
 */
export async function insertSetupCommand(): Promise<void> {
  await _withHuntEditor(async (editor) => {
    if (/^\s*\[SETUP\]\s*$/m.test(editor.document.getText())) {
      vscode.window.showWarningMessage("A [SETUP] block already exists in this file.");
      return;
    }
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
    const workspaceRoot = workspaceFolder?.uri.fsPath ?? path.dirname(editor.document.uri.fsPath);
    const runtimeType = await detectRuntimeType(workspaceRoot);
    const cursor = editor.selection.active;
    const lineStart = new vscode.Position(cursor.line, 0);
    const prefix = cursor.line > 0 ? "\n" : "";
    const ok = await editor.edit((eb) => {
      eb.insert(lineStart, `${prefix}${getSetupScaffold(runtimeType)}\n`);
    });
    if (!ok) {
      vscode.window.showWarningMessage("Could not insert [SETUP] block — document may be read-only.");
    }
  });
}

/**
 * Insert a `[TEARDOWN]` scaffold at the start of the cursor's line.
 * If an uncommented `[TEARDOWN]` block already exists, show a warning instead.
 * Commented-out scaffolds (lines starting with #) are intentionally ignored.
 */
export async function insertTeardownCommand(): Promise<void> {
  await _withHuntEditor(async (editor) => {
    if (/^\s*\[TEARDOWN\]\s*$/m.test(editor.document.getText())) {
      vscode.window.showWarningMessage("A [TEARDOWN] block already exists in this file.");
      return;
    }
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
    const workspaceRoot = workspaceFolder?.uri.fsPath ?? path.dirname(editor.document.uri.fsPath);
    const runtimeType = await detectRuntimeType(workspaceRoot);
    const cursor = editor.selection.active;
    const lineStart = new vscode.Position(cursor.line, 0);
    const prefix = cursor.line > 0 ? "\n" : "";
    const ok = await editor.edit((eb) => {
      eb.insert(lineStart, `${prefix}${getTeardownScaffold(runtimeType)}\n`);
    });
    if (!ok) {
      vscode.window.showWarningMessage("Could not insert [TEARDOWN] block — document may be read-only.");
    }
  });
}

/**
 * Insert a numbered runtime-specific CALL step at the end
 * of the active .hunt file (same behaviour as the Step Builder buttons).
 * Registered as `manul.insertInlineCall`.
 */
export async function insertInlineCallCommand(): Promise<void> {
  await _withHuntEditor(async (editor) => {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
    const workspaceRoot = workspaceFolder?.uri.fsPath ?? path.dirname(editor.document.uri.fsPath);
    const runtimeType = await detectRuntimeType(workspaceRoot);
    const snippet = runtimeType === 'go'
      ? 'CALL GO ${1:package}.${2:function}${3: with args: "${4:arg}"}${5: into {${6:result}}}'
      : 'CALL PYTHON ${1:module}.${2:function}${3: with args: "${4:arg}"}${5: into {${6:result}}}';
    await insertStep(snippet);
  });
}

/**
 * "New Hunt File" command: reads `tests_home` from the workspace config,
 * prompts for a file name, creates the file with a starter template, and opens it.
 */
export async function newHuntFileCommand(
  _context: vscode.ExtensionContext
): Promise<void> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    vscode.window.showErrorMessage("No workspace folder open.");
    return;
  }
  const workspaceRoot = folders[0].uri.fsPath;

  const testsDir = getTestsHomeDir(workspaceRoot);

  const name = await vscode.window.showInputBox({
    prompt: "Hunt file name (without .hunt extension)",
    placeHolder: "my_test",
    validateInput: (v) =>
      /^[\w-]+$/.test(v.trim()) ? null : "Use letters, digits, - or _ only",
  });
  if (!name) { return; }

  if (!fs.existsSync(testsDir)) {
    fs.mkdirSync(testsDir, { recursive: true });
  }

  const filePath = path.join(testsDir, `${name}.hunt`);
  if (fs.existsSync(filePath)) {
    vscode.window.showErrorMessage(`File already exists: ${filePath}`);
    return;
  }

  const starter = `@context: \n@title: ${name}\n\nSTEP 1: Navigate\n    NAVIGATE to \n`;
  fs.writeFileSync(filePath, starter, "utf8");

  const doc = await vscode.workspace.openTextDocument(filePath);
  await vscode.window.showTextDocument(doc);

  // Position cursor at the end of the NAVIGATE line
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    const line = doc.lineAt(4); // "NAVIGATE to "
    const end = line.range.end;
    editor.selection = new vscode.Selection(end, end);
    editor.revealRange(new vscode.Range(end, end));
  }
}

function getTestsHomeDir(workspaceRoot: string): string {
  const cfgFile = path.join(workspaceRoot, getConfigFileName());
  let testsHome = "tests";
  try {
    const cfg = JSON.parse(fs.readFileSync(cfgFile, "utf8"));
    if (typeof cfg.tests_home === "string" && cfg.tests_home.trim()) {
      testsHome = cfg.tests_home.trim();
    }
  } catch {
    // config missing or malformed — use default tests/
  }

  return path.isAbsolute(testsHome)
    ? testsHome
    : path.join(workspaceRoot, testsHome);
}

/**
 * Run `manul scan <url> <outputFile>` and open the generated draft hunt file.
 * Uses spawn (argv array) so the URL is never interpreted by a shell, and large
 * page output does not hit Node's execFile maxBuffer limit.
 */
async function runLiveScanCommand(rawUrl: string): Promise<void> {
  // Accept a full http(s) URL or a bare hostname/path (auto-prefix https://).
  let parsedUrl: URL;
  let scanUrl = rawUrl.trim();
  try {
    parsedUrl = new URL(scanUrl);
  } catch {
    // Retry with https:// if it looks like a bare hostname (no spaces, no scheme).
    if (!scanUrl.includes(" ")) {
      try {
        scanUrl = "https://" + scanUrl;
        parsedUrl = new URL(scanUrl);
      } catch {
        vscode.window.showErrorMessage(
          "ManulEngine: Invalid URL. Enter a full URL or a bare hostname like example.com."
        );
        return;
      }
    } else {
      vscode.window.showErrorMessage(
        "ManulEngine: Invalid URL. Enter a full URL or a bare hostname like example.com."
      );
      return;
    }
  }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    vscode.window.showErrorMessage(
      "ManulEngine: Only http:// and https:// URLs are supported."
    );
    return;
  }

  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    vscode.window.showErrorMessage("ManulEngine: No workspace folder open.");
    return;
  }
  const workspaceRoot = folders[0].uri.fsPath;

  // Read tests_home from the configured config file (respects the manulEngine.configFile
  // setting, matching the behaviour of configPanel.ts and huntTestController.ts).
  let testsHome = "tests";
  try {
    const configFile = getConfigFileName();
    const cfgPath = path.join(workspaceRoot, configFile);
    const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
    if (typeof cfg.tests_home === "string" && cfg.tests_home.trim()) {
      testsHome = cfg.tests_home.trim();
    }
  } catch { /* config missing or malformed — use default */ }

  const outputDir = path.isAbsolute(testsHome)
    ? testsHome
    : path.join(workspaceRoot, testsHome);
  const outputFile = path.join(outputDir, "draft.hunt");

  let scanSucceeded = false;
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "ManulEngine: Scanning page...",
      cancellable: false,
    },
    async () => {
      const manulExe = await findManulExecutable(workspaceRoot);
      await new Promise<void>((resolve) => {
        // `manul scan` writes the hunt file to disk and may print a large page
        // snapshot to stdout.  Using spawn (instead of execFile) avoids the
        // 1 MB maxBuffer limit; we discard stdout since the result is on disk.
        const proc = spawn(manulExe, ["scan", scanUrl, outputFile], {
          cwd: workspaceRoot,
          stdio: ["ignore", "ignore", "pipe"],
        });
        let stderrBuf = "";
        let settled = false;
        proc.stderr.on("data", (chunk: Buffer) => { stderrBuf += chunk.toString(); });
        let timedOut = false;
        const killTimer = setTimeout(() => { timedOut = true; proc.kill(); }, 90_000);
        proc.on("error", (err) => {
          if (settled) { return; }
          settled = true;
          clearTimeout(killTimer);
          const detail = stderrBuf.trim() || err.message || String(err);
          vscode.window.showErrorMessage(`ManulEngine: Scan failed — unable to start manul: ${detail}`);
          resolve();
        });
        proc.on("close", (code) => {
          if (settled) { return; }
          settled = true;
          clearTimeout(killTimer);
          if (timedOut) {
            vscode.window.showErrorMessage("ManulEngine: Scan timed out after 90s.");
          } else if (code !== 0) {
            const detail = stderrBuf.trim() || `process exited with code ${code}`;
            vscode.window.showErrorMessage(`ManulEngine: Scan failed — ${detail}`);
          } else {
            scanSucceeded = true;
          }
          resolve();
        });
      });
    }
  );

  if (!scanSucceeded) { return; }

  if (fs.existsSync(outputFile)) {
    const openedDoc = await vscode.workspace.openTextDocument(outputFile);
    await vscode.window.showTextDocument(openedDoc);
  } else {
    vscode.window.showWarningMessage(
      `ManulEngine: Scan finished but ${outputFile} was not created.`
    );
  }
}

/**
 * Launch `manul record <url>` in a VS Code integrated terminal.
 * The recorder is interactive and long-running — the user watches DSL lines
 * appear in real-time and closes the browser window (or presses Ctrl+C) to stop.
 */
async function runRecordSessionCommand(rawUrl: string): Promise<void> {
  const url = rawUrl.trim();
  if (!url) {
    vscode.window.showErrorMessage("ManulEngine: Please enter a URL to record.");
    return;
  }

  // URL normalization and validation — mirror scan behaviour.
  let normalizedUrl = url;
  let parsed: URL;
  try {
    parsed = new URL(normalizedUrl);
  } catch {
    // Retry with https:// if it looks like a bare hostname (no spaces).
    if (!/\s/.test(normalizedUrl)) {
      try {
        normalizedUrl = "https://" + normalizedUrl;
        parsed = new URL(normalizedUrl);
      } catch {
        vscode.window.showErrorMessage(
          "ManulEngine: Please enter a valid URL to record (e.g. https://example.com)."
        );
        return;
      }
    } else {
      vscode.window.showErrorMessage(
        "ManulEngine: Please enter a valid URL to record (e.g. https://example.com)."
      );
      return;
    }
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    vscode.window.showErrorMessage(
      "ManulEngine: Only http:// and https:// URLs are supported for recording."
    );
    return;
  }
  // Guard against shell injection: refuse URLs containing quotes, backticks, $, or newlines.
  if (/["'`$\r\n]/.test(normalizedUrl)) {
    vscode.window.showErrorMessage(
      "ManulEngine: The URL contains unsupported characters. Please provide a standard URL."
    );
    return;
  }

  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    vscode.window.showErrorMessage("ManulEngine: No workspace folder open.");
    return;
  }
  const workspaceRoot = folders[0].uri.fsPath;

  let manulExe: string;
  try {
    manulExe = await findManulExecutable(workspaceRoot);
  } catch {
    vscode.window.showErrorMessage(
      "ManulEngine: Could not find the manul executable. Is ManulEngine installed?"
    );
    return;
  }

  // Reuse an existing recorder terminal or create a new one with a dedicated name.
  const existing = vscode.window.terminals.find((t) => t.name === RECORDER_TERMINAL_NAME);
  const terminal = existing ?? vscode.window.createTerminal({ name: RECORDER_TERMINAL_NAME, cwd: workspaceRoot });
  terminal.show();

  const shellBase = path.basename((vscode.env.shell || "").toLowerCase());
  const isPowerShell = shellBase === "powershell.exe" || shellBase === "pwsh" || shellBase === "pwsh.exe";
  const cmd = isPowerShell
    ? `& "${manulExe}" record '${normalizedUrl}'`
    : `"${manulExe}" record '${normalizedUrl}'`;
  terminal.sendText(cmd);
}
