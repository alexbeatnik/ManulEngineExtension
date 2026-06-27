import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { randomBytes } from "crypto";
import { DEFAULT_CONFIG_FILENAME, getConfigFileName } from "./constants";

// ── Default configuration values ─────────────────────────────────────────────

const DEFAULT_CONFIG = {
  _note:
    "ManulEngine configuration. All keys are optional. Env vars MANUL_* always override.",
  headless: false,
  browser: "chromium",
  channel: null,
  executable_path: null,
  browser_args: [],
  timeout: 5000,
  nav_timeout: 30000,
  semantic_cache_enabled: true,
  log_name_maxlen: 0,
  log_thought_maxlen: 0,
  workers: 1,
  tests_home: "tests",
  auto_annotate: false,
  custom_controls_dirs: ["controls"],
  retries: 0,
  screenshot: "on-fail",
  html_report: false,
  verify_max_retries: 15,
  explain_mode: false,
};

// ── WebviewViewProvider ───────────────────────────────────────────────────────

export class ConfigPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = "manul.configView";

  private _view?: vscode.WebviewView;
  private readonly _workspaceRoot: string;

  constructor(private readonly _context: vscode.ExtensionContext) {
    const folders = vscode.workspace.workspaceFolders;
    this._workspaceRoot = folders?.[0]?.uri.fsPath ?? process.cwd();
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this._getHtml(webviewView.webview);

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(
      async (msg: { command: string; config?: Record<string, unknown> }) => {
        switch (msg.command) {
          case "load":
            webviewView.webview.postMessage({
              command: "config",
              config: this._readConfig(),
              exists: this._configExists(),
            });
            break;

          case "save":
            if (msg.config) {
              this._writeConfig(msg.config);
              vscode.window.showInformationMessage(
                "ManulEngine: configuration saved."
              );
            }
            break;

          case "generate":
            this._writeConfig(DEFAULT_CONFIG);
            webviewView.webview.postMessage({
              command: "config",
              config: this._readConfig(),
              exists: true,
            });
            vscode.window.showInformationMessage(
              "ManulEngine: default configuration file created."
            );
            break;

          case "open":
            vscode.workspace
              .openTextDocument(this._configPath())
              .then((doc) => vscode.window.showTextDocument(doc));
            break;
        }
      },
      undefined,
      this._context.subscriptions
    );
  }

  private _configPath(): string {
    const name = getConfigFileName();
    return path.join(this._workspaceRoot, name);
  }

  private _configExists(): boolean {
    return fs.existsSync(this._configPath());
  }

  private _normalizeConfig(config: Record<string, unknown>): Record<string, unknown> {
    const { custom_modules_dirs: legacyCustomModulesDirs } = config;
    const customControlsDirs = Array.isArray(config.custom_controls_dirs)
      ? config.custom_controls_dirs
      : Array.isArray(legacyCustomModulesDirs)
        ? legacyCustomModulesDirs
        : DEFAULT_CONFIG.custom_controls_dirs;

    // H-3: strict allowlist — only copy keys that exist in DEFAULT_CONFIG.
    // Unknown / injected keys are silently dropped.
    const allowedKeys = Object.keys(DEFAULT_CONFIG) as (keyof typeof DEFAULT_CONFIG)[];
    const result: Record<string, unknown> = {};
    for (const key of allowedKeys) {
      result[key] = key in config ? config[key] : DEFAULT_CONFIG[key];
    }
    result.custom_controls_dirs = customControlsDirs;
    return result;
  }

  private _readConfig(): Record<string, unknown> {
    try {
      const raw = fs.readFileSync(this._configPath(), "utf-8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const normalizedConfig = this._normalizeConfig(parsed);
      if (Object.prototype.hasOwnProperty.call(parsed, "custom_modules_dirs")) {
        this._writeConfig(normalizedConfig);
      }
      return normalizedConfig;
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  }

  private _writeConfig(config: Record<string, unknown>): void {
    const p = this._configPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(this._normalizeConfig(config), null, 2) + "\n", "utf-8");
  }

  private _getHtml(_webview: vscode.Webview): string {
    const nonce = randomBytes(16).toString("hex");
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>ManulEngine Config</title>
  <style>
    body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size);
           color: var(--vscode-foreground); padding: 10px; }
    h2 { font-size: 1.1em; margin-bottom: 8px; }
    label { display: block; margin-top: 10px; font-weight: bold; font-size: 0.95em; }
    input[type=text], input[type=number], select {
      width: 100%; box-sizing: border-box; padding: 4px 6px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, #444); border-radius: 3px;
      font-size: 1em; }
    input[type=checkbox] { margin-top: 6px; }
    .checkbox-row { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
    .checkbox-row label { margin-top: 0; }
    .hint { font-size: 0.85em; color: var(--vscode-descriptionForeground); margin-top: 2px; }
    .btn-row { display: flex; gap: 8px; margin-top: 16px; flex-wrap: wrap; }
    .btn-row-sticky { position: sticky; bottom: 0; padding: 8px 0; background: var(--vscode-sideBar-background, var(--vscode-editor-background)); z-index: 1; border-top: 1px solid var(--vscode-widget-border, transparent); }
    button {
      padding: 5px 12px; border: none; border-radius: 3px; cursor: pointer;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground); font-size: 0.95em; }
    button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground); }
    #no-config { display: none; margin-bottom: 12px; padding: 8px;
      background: var(--vscode-editorWarning-background, #3a3000);
      border-left: 3px solid var(--vscode-editorWarning-foreground, #cca700);
      font-size: 0.92em; }
  </style>
</head>
<body>
  <div id="no-config">
    ⚠️ No <code>manul_engine_configuration.json</code> found in workspace root.
    <div class="btn-row" style="margin-top:8px">
      <button id="btn-generate">Generate Default Config</button>
    </div>
  </div>

  <div id="form">
    <div class="checkbox-row">
      <input type="checkbox" id="headless"/>
      <label for="headless">headless</label>
    </div>
    <div class="hint">Run browser in headless mode.</div>

    <label>browser
      <select id="browser">
        <option value="chromium">Chromium (default — launch system Chrome)</option>
        <option value="electron">Electron / attach to a running Chrome over CDP</option>
      </select>
    </label>
    <div class="hint">Both runtimes drive system Chrome over CDP. Use channel/executable_path to pick a specific binary.</div>

    <label>browser_args
      <input type="text" id="browser_args" placeholder="e.g. --disable-gpu, --lang=uk"/>
    </label>
    <div class="hint">Extra launch flags passed to the browser, comma-separated. Chromium always gets --no-sandbox --start-maximized.</div>

      <label>channel
        <input type="text" id="channel" placeholder="e.g. chrome, msedge, chrome-beta"/>
      </label>
      <div class="hint">Chrome/Chromium channel to launch (chrome, msedge, chrome-beta, chromium).</div>

    <label>executable_path
      <input type="text" id="executable_path" placeholder="e.g. /usr/bin/discord or C:\\...\\Discord.exe"/>
    </label>
    <div class="hint">Absolute path to a custom Chromium-based browser or Electron app executable. Overrides the default browser if set.</div>

    <label>timeout (ms)
      <input type="number" id="timeout" min="500" step="500"/>
    </label>
    <div class="hint">Default action timeout.</div>

    <label>nav_timeout (ms)
      <input type="number" id="nav_timeout" min="1000" step="1000"/>
    </label>
    <div class="hint">Navigation timeout.</div>

    <div class="checkbox-row">
      <input type="checkbox" id="semantic_cache_enabled"/>
      <label for="semantic_cache_enabled">Semantic Cache</label>
    </div>
    <div class="hint">Remembers resolved elements within a single run (grants a 1.0 perfect confidence score on reuse). Disable for fully fresh resolution on every step — useful when debugging flaky tests.</div>

    <label>log_name_maxlen
      <input type="number" id="log_name_maxlen" min="0"/>
    </label>
    <div class="hint">Truncate element names in logs (0 = no limit).</div>

    <label>log_thought_maxlen
      <input type="number" id="log_thought_maxlen" min="0"/>
    </label>
    <div class="hint">Truncate LLM thought strings in logs (0 = no limit).</div>

    <label>workers
      <select id="workers">
        <option value="1">1 (sequential, default)</option>
        <option value="2">2</option>
        <option value="3">3</option>
        <option value="4">4</option>
      </select>
    </label>
    <div class="hint">Max hunt files to run in parallel. Each worker spawns a separate browser process.</div>

    <label>tests_home
      <input type="text" id="tests_home" placeholder="tests"/>
    </label>
    <div class="hint">Directory where new hunt files are created by the Step Builder panel. Relative to workspace root or absolute path.</div>

    <div class="checkbox-row">
      <input type="checkbox" id="auto_annotate"/>
      <label for="auto_annotate">Auto-Annotate Page Navigation</label>
    </div>
    <div class="hint">Automatically inserts <code># 📍 Auto-Nav:</code> comments into hunt files whenever the browser URL changes during a run.</div>

    <label>custom_controls_dirs
      <input type="text" id="custom_controls_dirs" placeholder="controls"/>
    </label>
    <div class="hint">Comma-separated list of directories scanned for <code>@custom_control</code> handlers only. Relative to workspace root. Default: <code>controls</code>. <code>CALL PYTHON</code> helper resolution is handled separately by the runtime and does not depend on this field.</div>

    <h2 style="margin-top:20px;border-top:1px solid var(--vscode-widget-border,#444);padding-top:14px">📊 Reporting &amp; Retries</h2>

    <label>retries
      <input type="number" id="retries" min="0" max="10" step="1"/>
    </label>
    <div class="hint">Retry failed hunt files up to N times. Tests that pass on retry are marked as <em>flaky</em>. 0 = no retries.</div>

    <label>screenshot
      <select id="screenshot">
        <option value="on-fail">on-fail (default)</option>
        <option value="always">always</option>
        <option value="none">none</option>
      </select>
    </label>
    <div class="hint">When to capture browser screenshots during test execution.</div>

    <div class="checkbox-row">
      <input type="checkbox" id="html_report"/>
      <label for="html_report">Generate HTML Report</label>
    </div>
    <div class="hint">Produce a self-contained <code>manul_report.html</code> after each test run with dashboard stats, per-step results, and embedded screenshots.</div>

      <label>verify_max_retries
        <input type="number" id="verify_max_retries" min="1" step="1"/>
      </label>
      <div class="hint">Maximum polling retries for VERIFY steps before declaring failure (default 15).</div>

      <div class="checkbox-row">
        <input type="checkbox" id="explain_mode"/>
        <label for="explain_mode">Explain Mode</label>
      </div>
      <div class="hint">Print detailed per-channel heuristic score breakdown for each element resolution.</div>

      <div class="btn-row btn-row-sticky">
        <button id="btn-save">💾 Save</button>
        <button id="btn-open" class="secondary">Open in Editor</button>
      </div>
  </div>

  <script nonce="${nonce}">
    const vsc = acquireVsCodeApi();

    function g(id) { return document.getElementById(id); }

    function doGenerate() { vsc.postMessage({ command: 'generate' }); }
    function doOpen()     { vsc.postMessage({ command: 'open' }); }

    function doSave() {
      const cfg = {
        headless: g('headless').checked,
        browser: g('browser').value,
        browser_args: g('browser_args').value.trim().split(/[,\\s]+/).map(s => s.trim()).filter(Boolean),
          channel: g('channel').value.trim() || null,
        executable_path: g('executable_path').value.trim() || null,
        timeout: parseInt(g('timeout').value, 10) || 5000,
        nav_timeout: parseInt(g('nav_timeout').value, 10) || 30000,
        semantic_cache_enabled: g('semantic_cache_enabled').checked,
        log_name_maxlen: (v => isNaN(v) ? 0 : v)(parseInt(g('log_name_maxlen').value, 10)),
        log_thought_maxlen: (v => isNaN(v) ? 0 : v)(parseInt(g('log_thought_maxlen').value, 10)),
        workers: parseInt(g('workers').value, 10) || 1,
        tests_home: g('tests_home').value.trim() || 'tests',
        auto_annotate: g('auto_annotate').checked,
        custom_controls_dirs: g('custom_controls_dirs').value.trim().split(/[,\\s]+/).map(s => s.trim()).filter(Boolean),
        retries: (v => isNaN(v) ? 0 : Math.max(0, v))(parseInt(g('retries').value, 10)),
        screenshot: g('screenshot').value || 'on-fail',
        html_report: g('html_report').checked,
              verify_max_retries: (v => isNaN(v) ? 15 : Math.max(1, v))(parseInt(g('verify_max_retries').value, 10)),
              explain_mode: g('explain_mode').checked,
      };
      vsc.postMessage({ command: 'save', config: cfg });
    }

    function doLoad(config, exists) {
      g('no-config').style.display = exists ? 'none' : 'block';
      g('headless').checked    = !!config.headless;
      const _validBrowsers = ['chromium', 'electron'];
      g('browser').value       = _validBrowsers.includes(config.browser) ? config.browser : 'chromium';
      g('browser_args').value  = Array.isArray(config.browser_args) ? config.browser_args.join(', ') : '';
        g('channel').value = config.channel ?? '';
      g('executable_path').value = config.executable_path ?? '';
      g('timeout').value       = config.timeout ?? 5000;
      g('nav_timeout').value   = config.nav_timeout ?? 30000;
      g('semantic_cache_enabled').checked = config.semantic_cache_enabled !== false;
      g('log_name_maxlen').value          = config.log_name_maxlen ?? 0;
      g('log_thought_maxlen').value       = config.log_thought_maxlen ?? 0;
      const _w = Math.min(4, Math.max(1, parseInt(String(config.workers ?? 1), 10)));
      g('workers').value                  = String(isNaN(_w) ? 1 : _w);
      g('tests_home').value               = config.tests_home ?? 'tests';
      g('auto_annotate').checked           = !!config.auto_annotate;
      const _customControlsDirs = Array.isArray(config.custom_controls_dirs)
        ? config.custom_controls_dirs
        : Array.isArray(config.custom_modules_dirs)
          ? config.custom_modules_dirs
          : ['controls'];
      g('custom_controls_dirs').value        = _customControlsDirs.join(', ');
      g('retries').value                     = config.retries ?? 0;
      const _validScreenshot = ['on-fail', 'always', 'none'];
      g('screenshot').value                  = _validScreenshot.includes(config.screenshot) ? config.screenshot : 'on-fail';
      g('html_report').checked               = !!config.html_report;
      g('verify_max_retries').value          = config.verify_max_retries ?? '15';
      g('explain_mode').checked              = !!config.explain_mode;
    }

    g('btn-generate').addEventListener('click', doGenerate);
    g('btn-save').addEventListener('click', doSave);
    g('btn-open').addEventListener('click', doOpen);

    window.addEventListener('message', function(event) {
      var msg = event.data;
      if (msg.command === 'config') {
        doLoad(msg.config, msg.exists);
      }
    });

    vsc.postMessage({ command: 'load' });
  </script>
</body>
</html>`;
  }
}

/** Command: generate default config file. */
export function generateConfigCommand(): void {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    vscode.window.showWarningMessage("No workspace folder open.");
    return;
  }
  const configPath = path.join(
    folders[0].uri.fsPath,
    DEFAULT_CONFIG_FILENAME
  );
  if (fs.existsSync(configPath)) {
    vscode.window
      .showWarningMessage(
        `${DEFAULT_CONFIG_FILENAME} already exists. Overwrite?`,
        "Yes",
        "No"
      )
      .then((choice) => {
        if (choice === "Yes") {
          writeDefault(configPath);
        }
      });
    return;
  }
  writeDefault(configPath);
}

function writeDefault(configPath: string): void {
  fs.writeFileSync(
    configPath,
    JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n",
    "utf-8"
  );
  vscode.workspace
    .openTextDocument(configPath)
    .then((doc) => vscode.window.showTextDocument(doc));
  vscode.window.showInformationMessage(
    "ManulEngine: default configuration generated."
  );
}
