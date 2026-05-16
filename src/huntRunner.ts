import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { execFile, spawn, ChildProcess } from "child_process";
import * as vscode from "vscode";
import { PAUSE_MARKER, EXPLAIN_NEXT_MARKER, DEBUG_TERMINAL_NAME, PYTHON_ENV_FLAGS, getConfigFileName } from "./constants";
import { MIN_MANUL_ENGINE_VERSION, MIN_MANUL_HEART_VERSION, parseVersion, ExplainNextResult } from "./shared";
import { ManulRuntimeType } from "./runtimeDetector";

/**
 * Quote a single argument for safe use inside a terminal send-text command.
 *
 * Uses single-quoting so spaces and most shell metacharacters are treated
 * literally by the target shell.  Embedded single quotes are escaped with
 * the conventional shell idiom so no metacharacter can break out of the
 * quoted string.
 *
 * @param arg    – the argument to quote (e.g. a file path or executable path)
 * @param psMode – true when the target shell is PowerShell / pwsh
 */
function quoteShellArg(arg: string, psMode: boolean): string {
  if (psMode) {
    // PowerShell single-quoted strings: double up embedded single quotes.
    return "'" + arg.replace(/'/g, "''") + "'";
  }
  // POSIX (bash / zsh / fish / sh): use '\'' to embed a literal single quote.
  return "'" + arg.replace(/'/g, "'\\''" ) + "'";
}

/**
 * Run `manulExe --version`, parse the reported version, and compare it
 * against the minimum version for the detected runtime.  Returns a user-facing
 * warning string when the installed version is too old; undefined when the
 * version is acceptable or cannot be determined.
 */
export async function checkManulEngineVersion(manulExe: string, runtimeType?: ManulRuntimeType): Promise<string | undefined> {
  return new Promise<string | undefined>((resolve) => {
    execFile(manulExe, ['--version'], { timeout: 5000 }, (_err, stdout) => {
      const match = stdout.trim().match(/(\d+(?:\.\d+)+)/);
      if (!match) { resolve(undefined); return; }
      const installed = match[1];
      const iv = parseVersion(installed);

      const isGo = runtimeType === 'go' || stdout.toLowerCase().includes('heart');
      const minVersion = isGo ? MIN_MANUL_HEART_VERSION : MIN_MANUL_ENGINE_VERSION;
      const installHint = isGo
        ? `Run: go build -o manul ./cmd/manul`
        : `Run: pip install --upgrade "manul-engine==${MIN_MANUL_ENGINE_VERSION}"`;
      const productName = isGo ? 'ManulHeart' : 'ManulEngine';

      const mv = parseVersion(minVersion);
      for (let i = 0; i < Math.max(iv.length, mv.length); i++) {
        const a = iv[i] ?? 0;
        const b = mv[i] ?? 0;
        if (a < b) {
          resolve(
            `v${installed} is installed but this extension requires ${productName} >= v${minVersion}. ` +
            installHint
          );
          return;
        }
        if (a > b) { break; }
      }
      resolve(undefined);
    });
  });
}

/**
 * Read the manulEngine.browser setting and return the CLI flags needed.
 * For native Playwright browsers (chromium, firefox, webkit) returns
 * ["--browser", name].  For system-installed channel browsers (chrome,
 * msedge) returns ["--browser", "chromium"] and sets MANUL_CHANNEL in
 * the env so the JSON config override is not required.
 *
 * If the browser setting is not explicitly set in VS Code (i.e. only the
 * default value applies), this returns empty args/env so that
 * manul_engine_configuration.json controls the browser selection.
 */
export function getBrowserFlags(): { args: string[]; env: Record<string, string> } {
  const cfg = vscode.workspace.getConfiguration("manulEngine");
  const inspected = cfg.inspect<string>("browser");
  const explicitValue =
    inspected?.workspaceFolderValue ??
    inspected?.workspaceValue ??
    inspected?.globalValue;
  // No explicit override in VS Code: let the JSON config / engine defaults decide.
  if (!explicitValue) {
    return { args: [], env: {} };
  }
  const browser = explicitValue.trim().toLowerCase();
  if (browser === "chrome" || browser === "msedge") {
    return { args: ["--browser", "chromium"], env: { MANUL_CHANNEL: browser } };
  }
  if (browser === "electron") {
    return { args: ["--browser", "electron"], env: {} };
  }
  return { args: ["--browser", browser], env: {} };
}

/**
 * Read executable_path from the project's config file (name resolved via
 * getConfigFileName / manulEngine.configFile). Returns the trimmed string
 * or undefined if not set.
 */
function readExecutablePath(workspaceRoot: string): string | undefined {
  try {
    const cfgPath = path.join(workspaceRoot, getConfigFileName());
    if (!fs.existsSync(cfgPath)) { return undefined; }
    const raw = JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
    const ep = raw?.executable_path;
    if (typeof ep === "string" && ep.trim()) { return ep.trim(); }
  } catch { /* ignore */ }
  return undefined;
}

/**
 * Probe candidate paths in order, then falls back to a one-time async
 * login-shell lookup using the user's configured shell (`vscode.env.shell` →
 * `$SHELL`), so fish/zsh/bash init scripts and tools like conda, pyenv, and
 * asdf that inject shims via shell hooks are correctly resolved.
 *
 * The shell result is cached per workspaceRoot so the async lookup runs at
 * most once per workspace per extension-host session.
 */

// Per-workspace cache of in-flight/resolved promises — concurrent calls for the
// same workspaceRoot share one lookup rather than each spawning a shell.
// Each entry also stores a timestamp for TTL-based eviction.
const _shellCache = new Map<string, { promise: Promise<string>; ts: number }>();
/** Cache TTL in milliseconds (5 minutes). */
const _SHELL_CACHE_TTL_MS = 5 * 60 * 1000;

export async function findManulExecutable(workspaceRoot: string): Promise<string> {
  const custom = vscode.workspace
    .getConfiguration("manulEngine")
    .get<string>("manulPath", "")
    .trim();
  if (custom) {
    if (fs.existsSync(custom)) {
      return custom;
    }
    // Path is configured but doesn't exist — warn and fall through to auto-detection.
    vscode.window.showWarningMessage(
      `ManulEngine: configured manulPath "${custom}" not found. Falling back to auto-detection.`
    );
  }

  const isWin = process.platform === "win32";

  // Ordered list of static candidate paths to probe (synchronous, no overhead).
  // Unix-only paths are excluded on Windows to avoid spurious existsSync probes.
  const candidates: string[] = [
    // 1. Project-local venv — check common folder names (.venv, venv, env, .env)
    ...(['.venv', 'venv', 'env', '.env'].map((dir) =>
      isWin
        ? path.join(workspaceRoot, dir, 'Scripts', 'manul.exe')
        : path.join(workspaceRoot, dir, 'bin', 'manul')
    )),
    // 2+. Platform-specific user-level install locations
    ...(!isWin ? [
      // 2. pip --user install — Linux and macOS Intel common path
      path.join(os.homedir(), ".local", "bin", "manul"),
      // 3. macOS only: pip --user may install to ~/Library/Python/<ver>/bin.
      // Guard with platform and existsSync to avoid a thrown exception on Linux.
      ...(() => {
        if (process.platform !== "darwin") { return []; }
        const base = path.join(os.homedir(), "Library", "Python");
        if (!fs.existsSync(base)) { return []; }
        try {
          return fs.readdirSync(base)
            .map((v) => path.join(base, v, "bin", "manul"))
            .filter((p) => fs.existsSync(p));
        } catch { return []; }
      })(),
      // 4. pipx-managed venv for manul-engine (user-level)
      path.join(os.homedir(), ".local", "pipx", "venvs", "manul-engine", "bin", "manul"),
      // 5. macOS Homebrew — Apple Silicon default prefix
      "/opt/homebrew/bin/manul",
      // 6. system-wide installs
      "/usr/local/bin/manul",
      "/usr/bin/manul",
    ] : [
      // Windows: pip --user installs scripts under %APPDATA%\Python\<ver>\Scripts
      // and %LOCALAPPDATA%\Programs\Python\<ver>\Scripts. Scan both trees.
      ...(() => {
        const results: string[] = [];
        for (const base of [
          process.env.APPDATA ? path.join(process.env.APPDATA, "Python") : "",
          process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Programs", "Python") : "",
        ]) {
          if (!base || !fs.existsSync(base)) { continue; }
          try {
            for (const entry of fs.readdirSync(base)) {
              const candidate = path.join(base, entry, "Scripts", "manul.exe");
              if (fs.existsSync(candidate)) { results.push(candidate); }
            }
          } catch { /* ignore */ }
        }
        return results;
      })(),
    ]),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // Return the cached promise if a lookup is already in-flight or completed for
  // this workspace — prevents concurrent calls from each spawning a shell.
  // Evict stale entries after TTL so a deleted venv is re-probed.
  const cached = _shellCache.get(workspaceRoot);
  if (cached && (Date.now() - cached.ts < _SHELL_CACHE_TTL_MS)) {
    return cached.promise;
  }
  _shellCache.delete(workspaceRoot);

  // Async login-shell lookup — sources the user's real shell init so that
  // conda/pyenv/asdf/direnv shims are visible. Uses execFile with an explicit
  // argv array so the shell path is never parsed by another shell (no injection
  // risk even if the path contains spaces). cwd is set to workspaceRoot so
  // directory-sensitive tools (direnv, asdf) resolve against the project.
  const promise = new Promise<string>((resolve) => {
    if (isWin) {
      // `where` is a built-in on Windows; no shell wrapping needed.
      execFile("where", ["manul"], { cwd: workspaceRoot, timeout: 3000 }, (err, stdout) => {
        // `where` can return multiple matches; pick the first that actually exists.
        const found = stdout.split("\n").map(l => l.trim()).find(l => l && fs.existsSync(l));
        resolve(!err && found ? found : "manul");
      });
    } else {
      // Prefer vscode.env.shell (the terminal shell the user configured in VS Code),
      // then fall back to $SHELL. If neither is set, skip the lookup entirely.
      const shell = vscode.env.shell || process.env.SHELL;
      if (!shell) {
        resolve("manul");
        return;
      }
      // Normalise shell name: lowercase and strip .exe suffix so comparisons
      // work on Windows paths (e.g. "fish.exe") and mixed-case entries.
      const shellName = path.basename(shell).toLowerCase().replace(/\.exe$/, "");
      let shellArgs: string[];
      if (shellName === "fish") {
        // fish supports -l (login) and -c but not -i; pass as separate args.
        shellArgs = ["-l", "-c", "command -v manul"];
      } else if (shellName === "sh" || shellName === "dash" || shellName === "ash") {
        shellArgs = ["-c", "command -v manul"];
      } else {
        // bash, zsh, ksh, and most other POSIX-compatible shells.
        shellArgs = ["-l", "-i", "-c", "command -v manul"];
      }
      // argv array avoids shell re-parsing of the shell path (no injection risk).
      execFile(shell, shellArgs, { cwd: workspaceRoot, timeout: 3000 }, (err, stdout) => {
        // Login/interactive shells can emit banners or warnings before the path.
        // Scan all lines and pick the first one that resolves to an existing file.
        const found = stdout.split("\n").map(l => l.trim()).find(l => l && fs.existsSync(l));
        resolve(!err && found ? found : "manul");
      });
    }
  });

  // Store the promise immediately so any concurrent callers await the same lookup.
  // If the lookup fell back to the plain "manul" string (shell init failed or timed
  // out), evict the cache so the next call retries rather than permanently locking
  // in the failure for the rest of the extension-host session.
  const entry = promise.then((result) => {
    if (result === "manul") {
      _shellCache.delete(workspaceRoot);
    }
    return result;
  });
  _shellCache.set(workspaceRoot, { promise: entry, ts: Date.now() });
  return entry;
}

/**
 * Build the CLI args and env for spawning ManulEngine.
 *
 * Centralises the duplicated logic that was previously scattered across
 * `runHunt()` and `runHuntFileDebugPanel()`.
 *
 * @param forceExplain – always inject `--explain` regardless of the user
 *   setting (used by the debug-panel code path so heuristic scoring data
 *   is available for the HoverProvider).
 */
interface SpawnConfigOptions {
  breakLines?: number[];
  forceExplain?: boolean;
}

function buildSpawnConfig(
  huntFile: string,
  opts: SpawnConfigOptions = {}
): { args: string[]; env: Record<string, string>; cwd: string } {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(
    vscode.Uri.file(huntFile)
  );
  const cwd = workspaceFolder?.uri.fsPath ?? path.dirname(huntFile);

  const browserFlags = getBrowserFlags();
  const args = [...browserFlags.args, "--workers", "1"];

  if (opts.breakLines && opts.breakLines.length > 0) {
    args.push("--break-lines", opts.breakLines.join(","));
  }

  const cfg = vscode.workspace.getConfiguration("manulEngine");
  const retries = cfg.get<number>("retries", 0);
  if (retries > 0) { args.push("--retries", String(retries)); }

  const screenshot = cfg.get<string>("screenshotMode", "on-fail");
  if (screenshot && screenshot !== "on-fail") { args.push("--screenshot", screenshot); }

  if (cfg.get<boolean>("htmlReport", false)) { args.push("--html-report"); }

  // Add --explain once: either forced (debug panel) or via setting—never both.
  if (opts.forceExplain || cfg.get<boolean>("explainMode", false)) {
    args.push("--explain");
  }

  const verifyMaxRetries = cfg.get<number | null>("verifyMaxRetries", null);

  args.push(huntFile);

  const autoAnnotate = cfg.get<boolean>("autoAnnotate", false);
  const execPath = readExecutablePath(cwd);

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    ...PYTHON_ENV_FLAGS,
    ...browserFlags.env,
    ...(autoAnnotate ? { MANUL_AUTO_ANNOTATE: "true" } : {}),
    ...(verifyMaxRetries !== null ? { MANUL_VERIFY_MAX_RETRIES: String(verifyMaxRetries) } : {}),
    ...(execPath ? { MANUL_EXECUTABLE_PATH: execPath } : {}),
  };

  return { args, env, cwd };
}

/** Spawn manul <huntFile> and stream output. Resolves with exit code. */
export function runHunt(
  manulExe: string,
  huntFile: string,
  onData: (chunk: string) => void,
  token?: vscode.CancellationToken,
  breakLines?: number[]
): Promise<number> {
  return new Promise((resolve, reject) => {
    const { args, env, cwd } = buildSpawnConfig(huntFile, { breakLines });

    let proc: ChildProcess;
    try {
      proc = spawn(manulExe, args, { cwd, env });
    } catch (err) {
      reject(err);
      return;
    }

    proc.stdout?.on("data", (d: Buffer) => onData(d.toString()));
    proc.stderr?.on("data", (d: Buffer) => onData(d.toString()));
    proc.on("close", (code) => resolve(code ?? 1));
    proc.on("error", reject);

    token?.onCancellationRequested(() => {
      proc.kill();
      resolve(1);
    });
  });
}

/**
 * Run hunt file in the output-panel (piped) using the ManulEngine
 * pause-protocol over stdout/stdin (without passing the CLI --debug flag).
 *
 * When Python writes  \x00MANUL_DEBUG_PAUSE\x00{"step":"…","idx":N}\n
 * `onPause(step, idx)` is called (the VS Code Webview panel or any custom UI).
 * Its return value ("next" | "continue") is written to the process stdin.
 *
 * Gutter breakpoints also emit the marker (no Playwright Inspector).
 * Regular output lines are forwarded to onData as usual.
 * The function has the same extended signature as runHunt + onPause, and is
 * wrapped as HuntRunFn in huntTestController.ts.
 */
export function runHuntFileDebugPanel(
  manulExe: string,
  huntFile: string,
  onData: (chunk: string) => void,
  token?: vscode.CancellationToken,
  breakLines?: number[],
  onPause?: (step: string, idx: number, sendExplainNext: (stepOverride?: string) => void) => Promise<"next" | "continue" | "debug-stop" | "stop-test">,
  onExplainNextResult?: (result: ExplainNextResult) => void,
  onPauseTimeout?: () => void
): Promise<number> {
  return new Promise((resolve, reject) => {
    const { args, env, cwd } = buildSpawnConfig(huntFile, {
      breakLines,
      forceExplain: true,
    });

    let proc: ChildProcess;
    try {
      proc = spawn(manulExe, args, {
        cwd,
        stdio: ["pipe", "pipe", "pipe"],
        env,
      });
    } catch (err) {
      reject(err);
      return;
    }

    // Line-buffer stdout so we can detect pause markers reliably even if data
    // arrives in chunks smaller than a full line.
    let stdoutBuf = "";
    /** Safety cap: discard the buffer if a single line exceeds 1 MB (H-1). */
    const MAX_LINE_LEN = 1_048_576;
    /** Max JSON payload size we will parse (512 KB) (H-2). */
    const MAX_JSON_LEN = 524_288;
    // Track whether we're currently inside a pause (waiting for user action).
    // The engine re-emits the PAUSE_MARKER after non-breaking tokens like
    // explain-next — we must ignore re-emitted markers while a pause is active.
    let pauseActive = false;
    proc.stdout?.on("data", (d: Buffer) => {
      stdoutBuf += d.toString();
      if (stdoutBuf.length > MAX_LINE_LEN) {
        console.warn("[ManulEngine] stdoutBuf exceeded 1 MB — discarding partial line");
        stdoutBuf = "";
        return;
      }
      const lines = stdoutBuf.split("\n");
      stdoutBuf = lines.pop() ?? "";
      for (const line of lines) {
        // ── Explain-next result marker ───────────────────────────────────
        const explainIdx = line.indexOf(EXPLAIN_NEXT_MARKER);
        if (explainIdx !== -1) {
          const jsonPart = line.substring(explainIdx + EXPLAIN_NEXT_MARKER.length);
          if (jsonPart.length > MAX_JSON_LEN) { continue; } // H-2: skip oversized payloads
          try {
            const result = JSON.parse(jsonPart) as ExplainNextResult;
            onExplainNextResult?.(result);
          } catch { /* ignore malformed JSON */ }
          continue; // don't forward marker lines to onData
        }

        // ── Debug pause marker ───────────────────────────────────────────
        const markerIdx = line.indexOf(PAUSE_MARKER);
        if (markerIdx !== -1) {
          // The engine re-emits the pause marker after non-breaking tokens
          // (explain-next, highlight, explain).  Ignore the re-emit.
          if (pauseActive) { continue; }
          pauseActive = true;
          // Parse the JSON payload that follows the pause marker.
          const jsonPart = line.substring(markerIdx + PAUSE_MARKER.length);
          let step = "";
          let idx = 0;
          if (jsonPart.length <= MAX_JSON_LEN) { // H-2: skip oversized payloads
            try {
              const parsed = JSON.parse(jsonPart) as { step?: string; idx?: number };
              step = parsed.step ?? "";
              idx = parsed.idx ?? 0;
            } catch { /* ignore malformed JSON — still respond so Python doesn't hang */ }
          }

          // Helper: send explain-next request to the engine without resolving
          // the pause.  The engine will respond with EXPLAIN_NEXT_MARKER on
          // stdout and then re-emit the pause marker.
          const sendExplainNext = (stepOverride?: string) => {
            if (proc.exitCode === null && proc.stdin && !proc.stdin.destroyed) {
              const msg = stepOverride
                ? `explain-next ${JSON.stringify({ step: stepOverride })}\n`
                : "explain-next\n";
              proc.stdin.write(msg);
            }
          };

          // Show the Webview panel (if onPause provided) or fall back to
          // a notification.  Either way write the response to stdin so the
          // blocked Python readline() unblocks.
          const pausePromise: Thenable<"next" | "continue" | "debug-stop" | "stop-test"> = onPause
            ? onPause(step, idx, sendExplainNext)
            : (() => {
                const shortStep = step.length > 100 ? step.substring(0, 100) + "…" : step;
                return vscode.window
                  .showInformationMessage(
                    `🐛 Debug — step ${idx}: ${shortStep}`,
                    { modal: false },
                    "⏭ Next Step",
                    "▶ Continue All"
                  )
                  .then((choice) =>
                    choice === "▶ Continue All" ? "continue" : "next"
                  );
              })();
          // Race the pause promise against an idle timeout so the Python process
          // is never blocked indefinitely when the user walks away or the UI freezes.
          const _pauseTimeoutSec = Math.max(
            0,
            vscode.workspace.getConfiguration("manulEngine").get<number>("debugPauseTimeoutSeconds", 300)
          );
          // H-4: store timeout handle so we can clear it when the pause resolves,
          // preventing the timer callback from firing after the promise settles.
          let _pauseTimer: ReturnType<typeof setTimeout> | undefined;
          const _timedPause: Promise<"next" | "continue" | "debug-stop" | "stop-test"> =
            _pauseTimeoutSec > 0
              ? Promise.race([
                  Promise.resolve(pausePromise).then((v) => { clearTimeout(_pauseTimer); return v; }),
                  new Promise<"continue">((res) => {
                    _pauseTimer = setTimeout(() => {
                      onPauseTimeout?.();
                      vscode.window.setStatusBarMessage(
                        `⏱ ManulEngine: debug pause timed out — resuming.`, 5000
                      );
                      res("continue");
                    }, _pauseTimeoutSec * 1000);
                  }),
                ])
              : Promise.resolve(pausePromise);
          _timedPause.then(
            (choice: "next" | "continue" | "debug-stop" | "stop-test") => {
              // The pause is resolved — the next PAUSE_MARKER we see will
              // be for a genuinely new step, not a re-emit after explain-next.
              pauseActive = false;

              // Guard against writing to stdin after the process has already
              // exited or the stream has been closed/destroyed (e.g. user
              // pressed Stop while the QuickPick was open).
              if (choice === "stop-test") {
                // Send abort token so Python can clean up, then kill the process.
                if (proc.exitCode === null && proc.stdin && !proc.stdin.destroyed) {
                  proc.stdin.write("abort\n");
                }
                setTimeout(() => { if (proc.exitCode === null) { proc.kill(); } }, 500);
              } else {
                // For debug-stop, send the payload to Python so it clears all breakpoints.
                const stdinPayload = choice === "debug-stop" ? "debug-stop" : choice;
                if (proc.exitCode === null && proc.stdin && !proc.stdin.destroyed) {
                  proc.stdin.write(stdinPayload + "\n");
                }
              }
            },
            () => { /* swallow QuickPick errors to avoid unhandled rejections */ }
          );
        } else {
          onData(line + "\n");
        }
      }
    });

    // Prevent "write after end" / EPIPE crashes from propagating to the
    // extension host when stdin closes while a response is in flight.
    proc.stdin?.on("error", () => { /* ignore stdin errors */ });

    proc.stderr?.on("data", (d: Buffer) => onData(d.toString()));
    proc.on("close", (code) => resolve(code ?? 1));
    proc.on("error", reject);

    token?.onCancellationRequested(() => {
      proc.kill();
      resolve(1);
    });
  });
}

/**
 * Run hunt file in interactive terminal with --debug flag.
 * The user can press ENTER to advance each step, or type 'pause' to open
 * the Playwright Inspector. Gutter breakpoints are also honoured via --break-lines.
 */
export async function runHuntFileDebugInTerminal(
  uri: vscode.Uri,
  workspaceRoot: string,
  manulExe: string
): Promise<void> {
  const shellBase = path.basename((vscode.env.shell || "").toLowerCase());
  const isPowerShell = shellBase === "powershell.exe" || shellBase === "pwsh" || shellBase === "pwsh.exe";
  const breakLines = getHuntBreakpointLines(uri.fsPath);
  const breakFlag = breakLines.length > 0 ? ` --break-lines ${breakLines.join(",")}` : "";
  const termBrowserFlags = getBrowserFlags();
  const quotedBrowserArgs = termBrowserFlags.args.map((arg) => quoteShellArg(arg, isPowerShell));
  const browserFlag = quotedBrowserArgs.length > 0 ? ` ${quotedBrowserArgs.join(" ")}` : "";
  const command = isPowerShell
    ? `& ${quoteShellArg(manulExe, true)}${browserFlag} --debug${breakFlag} ${quoteShellArg(uri.fsPath, true)}`
    : `${quoteShellArg(manulExe, false)}${browserFlag} --debug${breakFlag} ${quoteShellArg(uri.fsPath, false)}`;
  const terminal = vscode.window.createTerminal({
    name: DEBUG_TERMINAL_NAME,
    cwd: workspaceRoot,
    env: { ...PYTHON_ENV_FLAGS, ...termBrowserFlags.env },
  });
  terminal.show();
  terminal.sendText(command);
}

/**
 * Return 1-based file line numbers of all enabled VS Code breakpoints set
 * inside a given hunt file.  These are passed to the manul CLI as
 * `--break-lines 3,7` so the engine pauses (page.pause()) before each
 * matching step.  Breakpoints show as unverified (grey) in the gutter because
 * ManulEngine does not ship a DAP debug adapter — they still stop execution.
 */
export function getHuntBreakpointLines(huntFilePath: string): number[] {
  const fileFsPath = vscode.Uri.file(huntFilePath).fsPath;
  return vscode.debug.breakpoints
    .filter((bp): bp is vscode.SourceBreakpoint => bp instanceof vscode.SourceBreakpoint)
    .filter((bp) => bp.enabled && bp.location.uri.fsPath === fileFsPath)
    .map((bp) => bp.location.range.start.line + 1); // VS Code lines are 0-based
}
