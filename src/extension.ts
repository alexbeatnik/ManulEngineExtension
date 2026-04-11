import * as vscode from "vscode";
import * as path from "path";
import {
  createHuntTestController,
  runHuntFileViaController,
  runHuntFileInTerminalCommand,
} from "./huntTestController";
import { findManulExecutable, runHuntFileDebugPanel, getHuntBreakpointLines, checkManulEngineVersion } from "./huntRunner";
import { DebugControlPanel } from "./debugControlPanel";
import { ConfigPanelProvider, generateConfigCommand } from "./configPanel";
import { StepBuilderProvider, newHuntFileCommand, insertSetupCommand, insertTeardownCommand, insertInlinePythonCallCommand } from "./stepBuilderPanel";
import {
  CacheTreeProvider,
  CacheItem,
  clearAllCacheCommand,
  clearSiteCacheCommand,
} from "./cacheTreeProvider";
import { DEBUG_TERMINAL_NAME, TERMINAL_NAME, getConfigFileName } from "./constants";
import { MANUL_DSL_COMMANDS, getManulDslContextSuggestions } from "./shared";
import { HuntDocumentFormatter } from "./formatter";
import { SchedulerPanel } from "./schedulerPanel";
import { ExplainHoverProvider, ExplainOutputParser, clearExplanations } from "./explainHoverProvider";
import { registerHuntDiagnostics } from "./huntDiagnostics";
import { registerDoctorCommand } from "./manulDoctor";
import { disposeExplainScorePanel } from "./explainScorePanel";

// ── Hunt keyword decoration highlighter ──────────────────────────────────────
// Bypasses textMateRules / theme limitations by applying VS Code decorations
// directly. Colors are configurable via manulEngine.highlightColors setting.
const VERIFY_RE   = /\b(VERIFY\s+VISUAL|VERIFY\s+SOFTLY|VERIFY\s+that|VERIFY)\b/gi;
const SYSTEM_RE   = /\b(NAVIGATE\s+to|NAVIGATE|OPEN\s+APP|EXTRACT|SCROLL\s+DOWN|SCROLL|PRESS\s+ENTER|PRESS|RIGHT\s+CLICK|UPLOAD|MOCK\s+(?:GET|POST|PUT|PATCH|DELETE)|WAIT\s+FOR\s+RESPONSE|WAIT\s+FOR|WAIT|DONE|DOUBLE\s+CLICK|CLICK|HOVER|DRAG|CALL\s+PYTHON|SCAN\s+PAGE|SET|PRINT|DEBUG\s+VARS|DEBUG|PAUSE)\b/gi;
const COND_RE     = /(?:^|\n)\s*(?:\d+\.\s*)?(IF|ELIF|ELSE)\b/gi;
const ACTION_RE   = /\b(Fill|Type|Select|Choose|Check|Uncheck|Locate|Enter)\b/gi;

const DEFAULT_COLORS = { system: "#569CD6", conditional: "#C586C0", action: "#DCDCAA", verify: "#4EC9B0" };

function readHuntColors(): typeof DEFAULT_COLORS {
  const cfg = vscode.workspace.getConfiguration("manulEngine");
  const user = cfg.get<Record<string, string>>("highlightColors") ?? {};
  return { ...DEFAULT_COLORS, ...user };
}

function createHuntDecoTypes(colors: typeof DEFAULT_COLORS): {
  system: vscode.TextEditorDecorationType;
  cond: vscode.TextEditorDecorationType;
  action: vscode.TextEditorDecorationType;
  verify: vscode.TextEditorDecorationType;
} {
  return {
    system: vscode.window.createTextEditorDecorationType({ color: colors.system }),
    cond:   vscode.window.createTextEditorDecorationType({ color: colors.conditional }),
    action: vscode.window.createTextEditorDecorationType({ color: colors.action }),
    verify: vscode.window.createTextEditorDecorationType({ color: colors.verify }),
  };
}

function collectRanges(doc: vscode.TextDocument, re: RegExp, group: number): vscode.Range[] {
  const text = doc.getText();
  const ranges: vscode.Range[] = [];
  let m: RegExpExecArray | null;
  re.lastIndex = 0;
  while ((m = re.exec(text)) !== null) {
    const kw = m[group];
    const kwStart = m.index + m[0].indexOf(kw);
    ranges.push(new vscode.Range(doc.positionAt(kwStart), doc.positionAt(kwStart + kw.length)));
  }
  return ranges;
}

function applyHuntDecorations(
  editor: vscode.TextEditor,
  types: ReturnType<typeof createHuntDecoTypes>,
): void {
  if (editor.document.languageId !== "hunt") { return; }
  const doc = editor.document;

  // Build set of comment line numbers so decorations skip them
  const commentLines = new Set<number>();
  for (let i = 0; i < doc.lineCount; i++) {
    if (/^\s*#/.test(doc.lineAt(i).text)) { commentLines.add(i); }
  }

  // Build list of exclusion intervals per line (quoted strings + STEP descriptions)
  const QUOTE_RE = /(?:'[^']*'|"[^"]*")/g;
  const STEP_DESC_RE = /^(\s*(?:\d+\.\s*)?STEP\s*\d*\s*:)/i;
  const excludedIntervals: Map<number, [number, number][]> = new Map();
  for (let i = 0; i < doc.lineCount; i++) {
    if (commentLines.has(i)) { continue; }
    const line = doc.lineAt(i).text;
    const intervals: [number, number][] = [];
    // Exclude STEP header description (everything after the colon)
    const stepMatch = STEP_DESC_RE.exec(line);
    if (stepMatch) { intervals.push([stepMatch[1].length, line.length]); }
    // Exclude quoted strings
    QUOTE_RE.lastIndex = 0;
    let qm: RegExpExecArray | null;
    while ((qm = QUOTE_RE.exec(line)) !== null) {
      intervals.push([qm.index, qm.index + qm[0].length]);
    }
    if (intervals.length > 0) { excludedIntervals.set(i, intervals); }
  }

  const notExcluded = (r: vscode.Range) => {
    if (commentLines.has(r.start.line)) { return false; }
    const intervals = excludedIntervals.get(r.start.line);
    if (!intervals) { return true; }
    const col = r.start.character;
    return !intervals.some(([s, e]) => col >= s && col < e);
  };

  const verifyRanges = collectRanges(doc, VERIFY_RE, 1).filter(notExcluded);
  const verifySet = new Set(verifyRanges.map((r) => `${r.start.line}:${r.start.character}`));
  const systemAll = collectRanges(doc, SYSTEM_RE, 1).filter(notExcluded);
  const systemRanges = systemAll.filter((r) => !verifySet.has(`${r.start.line}:${r.start.character}`));

  editor.setDecorations(types.verify, verifyRanges);
  editor.setDecorations(types.system, systemRanges);
  editor.setDecorations(types.cond,   collectRanges(doc, COND_RE, 1).filter(notExcluded));
  editor.setDecorations(types.action, collectRanges(doc, ACTION_RE, 1).filter(notExcluded));
}

function registerHuntHighlighter(context: vscode.ExtensionContext): void {
  let types = createHuntDecoTypes(readHuntColors());
  context.subscriptions.push(types.system, types.cond, types.action, types.verify);

  const refresh = (editor?: vscode.TextEditor) => {
    if (editor) { applyHuntDecorations(editor, types); }
  };

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  vscode.window.visibleTextEditors.forEach((e) => refresh(e));
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((e) => refresh(e)),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (debounceTimer) { clearTimeout(debounceTimer); }
      debounceTimer = setTimeout(() => {
        const editor = vscode.window.visibleTextEditors.find((ed) => ed.document === e.document);
        refresh(editor);
      }, 100);
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration("manulEngine.highlightColors")) { return; }
      types.system.dispose(); types.cond.dispose(); types.action.dispose(); types.verify.dispose();
      types = createHuntDecoTypes(readHuntColors());
      context.subscriptions.push(types.system, types.cond, types.action, types.verify);
      vscode.window.visibleTextEditors.forEach((ed) => refresh(ed));
    }),
  );
}

export function activate(context: vscode.ExtensionContext): void {
  registerHuntHighlighter(context);
  registerDoctorCommand(context);
  // Output channel reused across debug runs from the editor button / context menu.
  const debugOutputChannel = vscode.window.createOutputChannel("ManulEngine Debug");
  context.subscriptions.push(debugOutputChannel);

  // ── Debug terminal tracking & Highlight status bar item ─────────────────────
  // Shows the "$(eye) Highlight Target" status bar button whenever a
  // "ManulEngine Debug" terminal is open (i.e. --debug mode is active).
  const highlightItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  highlightItem.text = "$(eye) Highlight Target";
  highlightItem.tooltip = "Scroll the browser to the engine's current target element";
  highlightItem.command = "manul.debugHighlight";
  context.subscriptions.push(highlightItem);

  function _refreshDebugContext(): void {
    const active = vscode.window.terminals.some(
      (t) => t.name === DEBUG_TERMINAL_NAME
    );
    vscode.commands.executeCommand("setContext", "manulDebugSessionActive", active);
    if (active) {
      highlightItem.show();
    } else {
      highlightItem.hide();
    }
  }

  context.subscriptions.push(
    vscode.window.onDidOpenTerminal(() => _refreshDebugContext()),
    vscode.window.onDidCloseTerminal(() => _refreshDebugContext()),
  );
  _refreshDebugContext(); // set initial state
  // ── Test Controller (Test Explorer) ────────────────────────────────────────
  const ctrl = createHuntTestController(context);
  registerHuntDiagnostics(context);

  // ── Step Builder Webview Panel ────────────────────────────────────────────
  const stepBuilderProvider = new StepBuilderProvider();
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      StepBuilderProvider.viewType,
      stepBuilderProvider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  // ── Config Webview Panel ───────────────────────────────────────────────────
  const configProvider = new ConfigPanelProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ConfigPanelProvider.viewId,
      configProvider
    )
  );

  // ── Cache Tree View ────────────────────────────────────────────────────────
  const cacheProvider = new CacheTreeProvider();
  const cacheView = vscode.window.createTreeView("manul.cacheView", {
    treeDataProvider: cacheProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(cacheView);

  // ── Commands ───────────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand("manul.runHuntFile", async (uri?: vscode.Uri) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (!target || !target.fsPath.endsWith(".hunt")) {
        vscode.window.showWarningMessage("Please open or select a .hunt file.");
        return;
      }
      return runHuntFileViaController(ctrl, target);
    }),

    vscode.commands.registerCommand("manul.debugHuntFile", async (uri?: vscode.Uri) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (!target || !target.fsPath.endsWith(".hunt")) {
        vscode.window.showWarningMessage("Please open or select a .hunt file.");
        return;
      }
      const roots = vscode.workspace.workspaceFolders ?? [];
      const workspaceRoot =
        vscode.workspace.getWorkspaceFolder(target)?.uri.fsPath
        ?? roots[0]?.uri.fsPath
        ?? path.dirname(target.fsPath);
      const manulExe = await findManulExecutable(workspaceRoot);
      const breakLines = getHuntBreakpointLines(target.fsPath);
      debugOutputChannel.clear();
      debugOutputChannel.show(true);
      debugOutputChannel.appendLine(`🐾 ManulEngine Debug — ${path.basename(target.fsPath)}`);
      const panel = DebugControlPanel.getInstance(context);
      // Clear previous explain cache for this file and set up the parser
      const fileUri = target.toString();
      clearExplanations(fileUri);
      const explainParser = new ExplainOutputParser(target.fsPath);
      try {
        await runHuntFileDebugPanel(
          manulExe,
          target.fsPath,
          (chunk) => {
            debugOutputChannel.append(chunk);
            // Feed each line to the explain parser to capture scoring data
            for (const line of chunk.split("\n")) {
              explainParser.feed(line);
            }
          },
          undefined,
          breakLines,
          (step, idx, sendExplainNext) => {
            explainParser.setCurrentStep(idx);
            return panel.showPause(step, idx, target.fsPath, (stepOverride) => {
              sendExplainNext(stepOverride);
            });
          },
          (result) => {
            panel.updateExplainResult(result);
          },
          () => { panel.abort(); }
        );
        debugOutputChannel.appendLine("\n✅ Debug run complete.");
      } finally {
        panel.dispose();
        disposeExplainScorePanel();
      }
    }),

    vscode.commands.registerCommand(
      "manul.runHuntFileInTerminal",
      (uri?: vscode.Uri) => runHuntFileInTerminalCommand(uri)
    ),

    vscode.commands.registerCommand("manul.newHuntFile", () =>
      newHuntFileCommand(context)
    ),

    vscode.commands.registerCommand("manul.insertSetup", () =>
      insertSetupCommand()
    ),

    vscode.commands.registerCommand("manul.insertTeardown", () =>
      insertTeardownCommand()
    ),

    vscode.commands.registerCommand("manul.insertInlinePythonCall", () =>
      insertInlinePythonCallCommand()
    ),

    vscode.commands.registerCommand("manul.generateConfig", () =>
      generateConfigCommand()
    ),

    vscode.commands.registerCommand("manul.debugHighlight", () => {
      // Prefer the dedicated debug terminal; fall back to "ManulEngine"
      // (terminal-based normal run) and finally to whatever terminal is active.
      const terminal =
        vscode.window.terminals.find((t) => t.name === DEBUG_TERMINAL_NAME) ??
        vscode.window.terminals.find((t) => t.name === TERMINAL_NAME) ??
        vscode.window.activeTerminal;
      if (!terminal) {
        vscode.window.showWarningMessage(
          "ManulEngine: No active debug terminal found. Run a hunt file with --debug first."
        );
        return;
      }
      // Bring the terminal into focus (preservesFocus=true keeps text-editor focus)
      // then send 'h' to the waiting Python debug prompt.
      terminal.show(true);
      terminal.sendText("h");
    }),

    vscode.commands.registerCommand("manul.refreshCache", () =>
      cacheProvider.refresh()
    ),

    vscode.commands.registerCommand(
      "manul.clearAllCache",
      () => clearAllCacheCommand(cacheProvider)
    ),

    vscode.commands.registerCommand(
      "manul.clearSiteCache",
      (item: CacheItem) => clearSiteCacheCommand(item, cacheProvider)
    ),

    vscode.commands.registerCommand("manul-engine.openScheduler", () =>
      SchedulerPanel.render(context.extensionUri)
    )
  );

  // Refresh cache view when workspace folders change
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => cacheProvider.refresh())
  );

  // Refresh config view when the config file changes
  const configWatcher = vscode.workspace.createFileSystemWatcher(
    `**/${getConfigFileName()}`
  );
  context.subscriptions.push(configWatcher);
  configWatcher.onDidChange(() => cacheProvider.refresh());

  // ── Engine version check (fire-and-forget at startup) ──────────────────────
  // Resolves the executable path once to avoid a duplicate shell probe, then
  // warns the user if the installed ManulEngine is below the minimum version.
  const _versionCheckRoot = (vscode.workspace.workspaceFolders ?? [])[0]?.uri.fsPath;
  if (_versionCheckRoot) {
    findManulExecutable(_versionCheckRoot)
      .then((manulExe) => checkManulEngineVersion(manulExe))
      .then((warning) => {
        if (warning) {
          vscode.window.showWarningMessage(`ManulEngine: ${warning}`);
        }
      })
      .catch(() => {});
  }

  // ── Hunt file formatter ────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider(
      { language: "hunt" },
      new HuntDocumentFormatter()
    )
  );

  // ── Format button (editor title bar) ───────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand("manul.formatHuntFile", () =>
      vscode.commands.executeCommand("editor.action.formatDocument")
    )
  );

  // ── Explain Heuristics HoverProvider ────────────────────────────────────────
  // Shows explain scoring data as hover tooltips on lines that were resolved
  // during a debug run (--explain is auto-injected in debug mode).
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { language: "hunt" },
      new ExplainHoverProvider()
    )
  );

  // ── .hunt DSL IntelliSense (autocompletion + snippets) ─────────────────────
  // Maps MANUL_DSL_COMMANDS from the extension-local shared module into VS Code CompletionItems,
  // plus hook blocks ([SETUP], [TEARDOWN]) and metadata directives (@context, etc.).
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      { language: "hunt" },
      {
        provideCompletionItems(
          document: vscode.TextDocument,
          position: vscode.Position
        ): vscode.CompletionItem[] {
          const linePrefix = document.lineAt(position).text.slice(0, position.character);

          // ── Metadata completions (triggered by "@" at column 0) ─────────
          if (/^\s*@\w*$/.test(linePrefix)) {
            const metaEntries: { label: string; snippet: string; description: string }[] = [
              { label: "@context:",  snippet: "@context: ${1:description}",      description: "Brief context or purpose of this hunt file." },
              { label: "@title:",    snippet: "@title: ${1:Suite Name}",         description: "Short display name for the test suite." },
              { label: "@blueprint:",snippet: "@blueprint: ${1:Suite Name}",     description: "Backward-compatible alias for @title." },
              { label: "@var:",      snippet: "@var: {${1:name}} = ${2:value}",  description: "Declares a static variable for the run." },
              { label: "@script:",   snippet: "@script: {${1:alias}} = ${2:scripts.helpers}", description: "Declares a dotted Python module or callable alias for later CALL PYTHON steps." },
              { label: "@tags:",     snippet: "@tags: ${1:smoke, regression}",   description: "Comma-separated tags for filtering." },
              { label: "@data:",     snippet: "@data: ${1:path/to/file.json}",   description: "Declares a JSON or CSV data source for data-driven runs." },
              { label: "@schedule:", snippet: "@schedule: ${1|every 30 seconds,every 1 minute,every 5 minutes,every 15 minutes,every 1 hour,daily at 09:00,every monday|}", description: "Declares a schedule expression for daemon mode." },
            ];
            return metaEntries.map((m, idx) => {
              const item = new vscode.CompletionItem(m.label, vscode.CompletionItemKind.Property);
              item.insertText = new vscode.SnippetString(m.snippet);
              item.documentation = new vscode.MarkdownString(m.description);
              item.sortText = `0_meta_${String(idx).padStart(2, "0")}`;
              return item;
            });
          }

          // ── Hook block completions ──────────────────────────────────────
          if (/^\s*\[?\w*$/.test(linePrefix)) {
            const hookBlocks: { label: string; snippet: string; description: string }[] = [
              {
                label: "[SETUP]",
                snippet: "[SETUP]\n${1:CALL PYTHON module_name.function_name}\n[END SETUP]",
                description: "Setup block — runs before the first step.",
              },
              {
                label: "[TEARDOWN]",
                snippet: "[TEARDOWN]\n${1:CALL PYTHON module_name.function_name}\n[END TEARDOWN]",
                description: "Teardown block — runs after all steps.",
              },
            ];
            const hookItems = hookBlocks.map((h, idx) => {
              const item = new vscode.CompletionItem(h.label, vscode.CompletionItemKind.Struct);
              item.insertText = new vscode.SnippetString(h.snippet);
              item.documentation = new vscode.MarkdownString(h.description);
              item.sortText = `1_hook_${String(idx).padStart(2, "0")}`;
              return item;
            });
            // Fall through — also include DSL commands below
            return [
              ...hookItems,
              ...buildDslCompletionItems(linePrefix),
            ];
          }

          // ── STEP header shortcut ────────────────────────────────────────
          // Also include DSL commands by default so they appear everywhere
          return buildDslCompletionItems(linePrefix);
        },
      },
      "@",  // trigger on "@" for metadata directives
      "[",  // trigger on "[" for hook blocks
      " ",
      "'",
      '"'
    )
  );
}

// ── DSL completion helper ──────────────────────────────────────────────────
// Converts MANUL_DSL_COMMANDS from the extension-local shared module into VS Code CompletionItems
// with proper snippet tab-stops, documentation, and sorting order.

function buildDslCompletionItems(linePrefix = ""): vscode.CompletionItem[] {
  // STEP header convenience shortcut
  const stepItem = new vscode.CompletionItem("STEP", vscode.CompletionItemKind.Keyword);
  stepItem.insertText = new vscode.SnippetString("STEP ${1:1}: ${2:Description}");
  stepItem.documentation = new vscode.MarkdownString("Inserts a numbered logical step header.");
  stepItem.detail = "STEP 1: Navigate to login page";
  stepItem.sortText = "2_step";

  const contextualItems = getManulDslContextSuggestions(linePrefix).map((suggestion, idx) => {
    const item = new vscode.CompletionItem(suggestion.label, vscode.CompletionItemKind.Keyword);
    item.insertText = new vscode.SnippetString(suggestion.snippet);
    item.documentation = new vscode.MarkdownString(suggestion.description);
    item.detail = suggestion.snippet;
    item.sortText = `1_context_${String(idx).padStart(2, "0")}`;
    return item;
  });

  return [
    ...contextualItems,
    stepItem,
    ...MANUL_DSL_COMMANDS.map((cmd, idx) => {
      const item = new vscode.CompletionItem(cmd.label, vscode.CompletionItemKind.Snippet);
      item.insertText = new vscode.SnippetString(cmd.snippet);
      const md = new vscode.MarkdownString();
      md.appendMarkdown(`${cmd.description}\n\n`);
      if (cmd.hintNote) {
        md.appendMarkdown(`> 💡 ${cmd.hintNote}\n\n`);
      }
      md.appendMarkdown(`**Example**\n\n\`\`\`text\n${cmd.example}\n\`\`\``);
      item.documentation = md;
      item.detail = cmd.example;
      item.sortText = `3_dsl_${String(idx).padStart(2, "0")}`;
      return item;
    }),
  ];
}

export function deactivate(): void {
  // no-op — cleanup handled by subscriptions
}
