# 😼 ManulEngine — VS Code Extension

![Alpha](https://img.shields.io/badge/status-alpha-bf5b04)
![ManulEngine 0.0.9.27](https://img.shields.io/badge/manul--engine-0.0.9.27-1f6feb)
![Manul Product Line](https://img.shields.io/badge/product%20line-Manul-111827)
[![PyPI Downloads](https://static.pepy.tech/personalized-badge/manul-engine?period=total&units=INTERNATIONAL_SYSTEM&left_color=BLACK&right_color=GREEN&left_text=downloads)](https://pepy.tech/projects/manul-engine)
[![PyPI](https://img.shields.io/pypi/v/manul-engine?label=PyPI&logo=pypi)](https://pypi.org/project/manul-engine/)
[![MCP Server](https://img.shields.io/visual-studio-marketplace/v/manul-engine.manul-mcp-server?label=MCP%20Server&logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=manul-engine.manul-mcp-server)

The official VS Code extension for the **ManulEngine Deterministic Web & Desktop Automation Runtime**.

The pinned ManulEngine runtime for this repository state is `0.0.9.27`. The VS Code extension manifest uses the compatible package version `0.0.927` because VS Code does not accept four-segment manifest versions.

Author, run, and debug `.hunt` automation scripts for E2E testing, RPA workflows, synthetic monitoring, and AI-agent execution — all from a single editor. The extension provides Hunt DSL language support, one-click execution, interactive debug stepping, a Step Builder sidebar, configuration UI, and cache management for [ManulEngine](https://github.com/alexbeatnik/ManulEngine).

ManulEngine is a Playwright-backed runtime that interprets plain-English `.hunt` DSL scripts deterministically — resolving DOM elements with JavaScript heuristics (`DOMScorer` + `TreeWalker`), no CSS selectors, no cloud APIs. Automate browsers and desktop apps with the same DSL. Whether you are writing QA test suites, automating repetitive business tasks, or building production health monitors, the workflow is the same: write a `.hunt` file, hit Run.

> The Manul goes hunting and never returns without its prey.

> **Status: Alpha.**
> **Developed by a single person.**
>
> The extension and runtime are feature-rich, but they are still being battle-tested on real-world projects. There are no promises or guarantees of stability. The goal is strong debugging ergonomics and transparent execution, not inflated claims.

---

## 🤝 Dual Persona Workflow — Automation for Humans, Power for Engineers

ManulEngine bridges the gap between non-technical authors and engineering teams. You don't write selectors — you write scripts.

* **For QA / Business Analysts / Ops:** Open a `.hunt` file and write automation scenarios in plain English — no Python, CSS, or XPath needed. The deterministic heuristics engine resolves elements reliably across UI changes. The same scripts work for testing, RPA, and monitoring.
* **For Developers / SDETs:** No more maintaining thousands of brittle `page.locator()` calls. For complex custom UI elements, write a Python control hook with the full Playwright API. The rest of the team keeps writing plain English — your hook handles the Playwright logic behind the scenes.

---

## VS Code Extension Features

> Hunt DSL language support, one-click runner, interactive debug runner with gutter breakpoints, Step Builder for plain-English `.hunt` scripts, configuration UI, and cache browser for [ManulEngine](https://github.com/alexbeatnik/ManulEngine) — the Deterministic Web & Desktop Automation Runtime for E2E testing, RPA, synthetic monitoring, and AI-agent execution.

## Features

### 🎨 Hunt File Language Support
- Syntax highlighting for `.hunt` files
- Comment toggling (`#`)
- Bracket/quote matching and auto-closing
- File icon in the explorer

### ▶️ Run Hunt Files
Three ways to run a `.hunt` file:

| Method | How |
|--------|-----|
| **Editor title button** | Click the `▶` icon in the top-right of the editor when a `.hunt` file is open |
| **Explorer context menu** | Right-click a `.hunt` file → *ManulEngine: Run Hunt File* |
| **Terminal mode** | Right-click → *ManulEngine: Run Hunt File in Terminal* (runs raw in the integrated terminal) |

Output streams live into a dedicated **ManulEngine** output channel. ✅ / ❌ status is appended on completion.

### 🐛 Debug Mode
Place breakpoints by clicking the editor gutter next to any step number in a `.hunt` file. Then run the **Debug** profile in Test Explorer (or use `ManulEngine: Debug Hunt File` from the Command Palette / editor title).

- Execution pauses at each breakpointed step with a floating **QuickPick overlay** — no modal dialogs, no Cancel button
- **⏭ Next Step** — advance exactly one step and pause again
- **▶ Continue All** — run until the next gutter breakpoint or end of hunt
- **Stop button** — clicking Stop in Test Explorer dismisses the QuickPick and terminates the run cleanly; Python never hangs
- **👁 Highlight Element** — a third QuickPick option that re-scrolls the browser to the persistently highlighted target element and re-shows the pause overlay without advancing the step
- **Linux:** VS Code window is raised via `xdotool`/`wmctrl` and a 5-second system notification appears via `notify-send` when execution pauses
- **Persistent magenta highlight** — the resolved target element is outlined with a `4px solid #ff00ff` border + glow while execution is paused; the highlight is removed automatically just before the action executes
- Debug output streams live into the **ManulEngine Debug** output channel
- Uses `--break-lines` protocol (piped stdio): Python emits a marker on stdout; extension responds on stdin — browser opens and navigates normally on step 1

### 🧪 Test Explorer Integration
Hunt files appear in the **VS Code Test Explorer** as top-level test items (one per file). Two run profiles are available:
- **Run** (default) — runs the hunt normally using the output panel
- **Debug** — runs with gutter breakpoints and the floating QuickPick pause overlay (see Debug Mode above)

For both profiles:
- Each block/step is shown as a child item with pass/fail status
- Failed steps display the engine output as the failure message
- Steps that were never reached are marked as skipped
- The step tree is cleared after the run so the explorer shows the correct file-level count

The child items are created from the engine's live hierarchical stdout rather than from a fake local progress model.

- block start events create nested children during the run
- pass/fail events update those exact child items in place
- Test Explorer reflects the real runtime timeline, not a reconstructed summary after the process exits

### ⚙️ Configuration Panel
An interactive sidebar panel for editing `manul_engine_configuration.json` without touching the file directly.

- **Model** — Ollama model name (leave blank for **heuristics-only mode** — the recommended default)
- **AI Policy** — `prior` (heuristic as hint) or `strict` — only relevant when a model is set
- **AI Threshold** — score cutoff before optional LLM fallback (`null` = auto)
- **AI Always** — always call the LLM picker (automatically disabled when no model is set; not recommended)
- **Browser** — browser engine: Chromium, Firefox, or WebKit
- **Browser Args** — extra launch flags for the browser (comma-separated)
- **Headless** — run browser headless
- **Timeouts** — action and navigation timeouts in ms
- **Persistent Controls Cache / Semantic Cache** — two separate cache toggles: **Persistent Controls Cache** (`controls_cache_enabled`) stores resolved locators on disk per site/page across runs; **Semantic Cache** (`semantic_cache_enabled`) remembers resolved elements within a single run (grants a 1.0 perfect confidence score on reuse, resets when the process ends). Both default to enabled and can be toggled independently from the sidebar
- **Auto-Annotate Page Navigation** — when enabled, the engine automatically inserts `# 📍 Auto-Nav:` comments in the hunt file whenever the browser URL changes during a run (after clicks, form submissions, etc.) — not just on explicit `NAVIGATE` steps. Page names are resolved from `pages.json`; if no mapping is found the full URL is used instead
- **Log truncation** — max length for element names and LLM thoughts in logs
- **Workers** — max number of hunt files to run concurrently in Test Explorer (1–4)
- **Ollama status indicator** — live dot showing whether Ollama is reachable at `localhost:11434`, with model autocomplete from the running instance

Changes are saved to `manul_engine_configuration.json` at the workspace root. An **Add Default Prompts** button copies built-in prompt templates into `prompts/` if they don't already exist. A *Generate Default Config* button creates the file if it doesn't exist yet.

The runtime config file includes the full engine key set, including `browser_args`, `ai_always`, `ai_policy`, `ai_threshold`, `controls_cache_dir`, `tests_home`, `auto_annotate`, `retries`, `screenshot`, and `html_report` in addition to the more commonly edited fields above.

This README remains the public reference for that same config surface, including the full key table and representative `MANUL_*` override examples. The panel edits the full runtime config file, not a reduced extension-specific subset.

### 🗂️ Cache Browser
The **Cache** sidebar tree shows per-site cache entries created by ManulEngine's persistent controls cache. You can:
- Browse sites and their cached page entries
- Clear the cache for a specific site (trash icon on hover)
- Clear all cache entries at once (toolbar button)
- Refresh the tree manually

### 🧱 Step Builder
A sidebar panel that lets you insert hunt steps with a single click — no typing required.

- **＋ New Hunt File** button — prompts for a name, creates a `.hunt` file with a starter template in the `tests_home` directory (configured via `tests_home` in `manul_engine_configuration.json`, defaults to `tests/`), and opens it
- **🔍 Live Page Scanner** — paste any URL into the sidebar text input and click **Run Scan**; the extension invokes `manul scan <URL>` as a child process with a progress notification, then automatically opens the freshly generated `tests_home/draft.hunt` in the editor — no terminal required
- **Step buttons** — the sidebar is generated from the shared DSL registry and now covers the current runtime command set: `OPEN APP`, explicit waits, strict `VERIFY` text/placeholder/value checks, `VERIFY SOFTLY`, `VERIFY VISUAL`, `WAIT FOR RESPONSE`, `MOCK`, `SCAN PAGE`, `CALL PYTHON` with optional args/capture, `SET`, `DEBUG VARS`, and the rest of the core Hunt verbs
- **Contextual builder** — compose `NEAR`, `ON HEADER`, `ON FOOTER`, and `INSIDE '<container>' row with '<text>'` qualifiers without typing the DSL by hand
- **🐍 Call Python** — inserts the current unified snippet form: `CALL PYTHON module.function [with args: ...] [into {result}]`
- **Hooks buttons** — **🔧 Insert [SETUP]** and **🧹 Insert [TEARDOWN]** insert pre-filled hook blocks with `CALL PYTHON module.function` placeholders; **🎯 Add Demo Tests** copies the bundled demo hunts (`demoqa`, `mega`, `rahul`, `saucedemo`) into the workspace `tests_home` folder in one click
- **Hook-aware scaffolds** — setup/teardown snippets now include `PRINT` + `CALL PYTHON` examples so file-local hooks mirror the current engine contract more closely
- **Scan Page** — inserts `SCAN PAGE` or a snippet with optional `into {filename}` output capture
- **Proximity Builder** — an interactive form for composing contextual Click, Fill, and Verify steps. Toggle between Click / Fill / Verify modes, pick a qualifier (`NEAR`, `ON HEADER`, `ON FOOTER`, `INSIDE ... row with ...`), fill in the target and row/anchor values, and preview the generated DSL line before inserting it
- Each click appends to the currently open `.hunt` file and positions the cursor inside the first `''` pair for immediate editing
- Requires the `.hunt` file to be the active editor tab.

### ✏️ Hunt DSL Autocomplete

The extension registers a `CompletionItemProvider` for `.hunt` files that offers three layers of inline suggestions as you type:

- **Metadata directives** — `@context:`, `@title:`, `@blueprint:`, `@var:`, `@script:`, `@tags:`, `@data:`, `@schedule:`
- **Hook blocks** — `[SETUP]` and `[TEARDOWN]` for pre/post execution steps
- **Current DSL snippets** — every command from the shared `MANUL_DSL_COMMANDS` registry is offered as a snippet with tab-stop placeholders, including the newer wait/mock/debug/python forms

Completions are sourced from the extension-local shared runtime module, so adding a new DSL command there automatically exposes it in the completion list and the Step Builder sidebar — no manual sync needed.

### 🔍 Visual Explainability (Hover Tooltips)

No more guessing why a step clicked the wrong element. Run a hunt in **Debug Mode** (via Test Explorer Debug profile or `--break-lines`), then **hover over any step line** in the `.hunt` file. A rich Markdown tooltip appears instantly, showing the full per-element scoring breakdown — Text, Attributes, Semantics, Proximity, Cache — attached to the exact line.

- **Hover tooltips:** Rich Markdown tooltip on each resolved step line — see exactly why the engine chose a specific element
- **Dedicated output channel:** Scoring breakdown is also routed to "ManulEngine: Explain Heuristics" — separate from test output
Together, these form a layered debug workflow:

- Test Explorer shows where the run is
- QuickPick debug flow controls how execution moves
- hover explains why the runtime chose the current target

---

## 💻 System Requirements

| | Minimum | Recommended |
|---|---|---|
| **CPU** | any | modern laptop |
| **RAM** | 4 GB | 8 GB |
| **GPU** | none | none |
| **Model** | — (heuristics-only) | `qwen2.5:0.5b` |

## Requirements

- **ManulEngine** installed in the workspace or globally:
  ```bash
  pip install manul-engine==0.0.9.27         # global / user
  # or in a project venv:
  pip install -e .
  ```
- **Python 3.11+**
- **Playwright** browsers (installed by ManulEngine's setup)
- **Ollama** (optional) — only needed as a last-resort self-healing fallback when the deterministic heuristics engine cannot confidently resolve an element
  ```bash
  pip install ollama   # Python client library
  ```
  Plus the [Ollama app](https://ollama.com) running locally with a model pulled (e.g. `ollama pull qwen2.5:0.5b`)

---

## Auto-detection of the `manul` executable

The extension probes the following locations in order (platform-aware):

1. Custom path from **`manulEngine.manulPath`** setting (if set and exists)
2. `.venv/bin/manul` in the workspace root (also checks `venv/`, `env/`, `.env/`)
3. `~/.local/bin/manul` (pip --user, Linux/macOS)
4. `~/Library/Python/*/bin/manul` (pip --user, macOS)
5. `~/.local/pipx/venvs/manul-engine/bin/manul` (pipx)
6. `/opt/homebrew/bin/manul` (Homebrew, Apple Silicon)
7. `/usr/local/bin/manul`, `/usr/bin/manul` (system-wide)
8. Shell login init lookup (`$SHELL -lc 'command -v manul'`) — sources fish/zsh/bash/pyenv/conda init so shims are found
9. Windows: `%APPDATA%\Python\*\Scripts\manul.exe`, `%LOCALAPPDATA%\Programs\Python\*\Scripts\manul.exe`

---

## Extension Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `manulEngine.manulPath` | `""` | Absolute path to the `manul` CLI. Leave empty to auto-detect. |
| `manulEngine.configFile` | `manul_engine_configuration.json` | Config file name resolved from the workspace root. |
| `manulEngine.workers` | `null` | Max concurrent hunt files in Test Explorer. Overrides `workers` in config. Leave empty to use the config value (default: 1). |
| `manulEngine.htmlReport` | `false` | Generate a self-contained HTML report after each run (saved to `reports/manul_report.html`). |
| `manulEngine.retries` | `0` | Number of times to retry a failed hunt file before marking it as failed (0–10). |
| `manulEngine.screenshotMode` | `"on-fail"` | Screenshot capture mode: `none`, `on-fail` (failed steps only), `always` (every step). |

---

## Getting Started

1. Install ManulEngine:
  ```bash
  pip install manul-engine==0.0.9.27
  playwright install chromium
  ```

2. Open your project folder in VS Code. The extension activates automatically when a `.hunt` file is present.

3. Run `ManulEngine: Generate Default Config` from the Command Palette to create `manul_engine_configuration.json`.

4. Open the **ManulEngine** activity bar panel to configure Ollama and cache settings.

5. Open or create a `.hunt` file and click ▶ to run it.

The extension delegates execution to the real runtime, so the same workspace can use:

- normal browser hunts
- desktop/Electron hunts through `OPEN APP` + `executable_path`
- Python-backed hooks and custom controls without any extension-specific rewrite

---

## Example Hunt File

```hunt
@context: Login and verify dashboard
@title: smoke_login
@tags: smoke, auth

@var: {user_email} = user@example.com
@var: {password}   = secret
@script: {auth}    = helpers.auth

STEP 1: Login
  NAVIGATE to https://example.com/login
  Fill 'Email' field with '{user_email}'
  Verify 'Email' field has value '{user_email}'
  Fill 'Password' field with '{password}'
  CALL PYTHON {auth}.issue_token into {login_token}
  Click the 'Sign In' button
  VERIFY that 'Welcome' is present.
DONE.
```

See the [ManulEngine README](https://github.com/alexbeatnik/ManulEngine) for the full step reference.

---

## 🎛️ Custom Controls — Python Power Behind Simple Steps

Some UI elements cannot be reliably targeted by heuristics or AI: React virtual tables, canvas datepickers, WebGL widgets, and similar custom components. **Custom Controls** bridge the gap by routing specific `.hunt` steps to hand-written Playwright Python — while the hunt file stays plain English.

**How it works:**

1. Create a `controls/` directory in your workspace root.
2. Add a `.py` file with a `@custom_control` handler:
  ```python
  # controls/booking.py
  from manul_engine import custom_control

  @custom_control(page="Checkout Page", target="React Datepicker")
  async def handle_datepicker(page, action_type, value):
     await page.locator(".react-datepicker__input-container input").fill(value or "")
  ```
3. Map the URL to `"Checkout Page"` in `pages.json` (editable via the Config Panel).
4. Write a normal `.hunt` step — no special syntax required:
  ```text
  Fill 'React Datepicker' with '2026-12-25'
  ```

The extension runs `.hunt` files via the same `manul` CLI. Custom Controls are loaded automatically on engine startup — no extension configuration needed. Debug breakpoints, Test Explorer integration, and live output streaming all work exactly the same whether a step uses a custom control or the standard heuristic pipeline.

> **Team workflow:** QA authors keep writing plain English. SDETs own the `controls/` directory. The `.hunt` file never needs to change when the underlying Playwright logic evolves.

The same compatibility story applies to `[SETUP]`, `[TEARDOWN]`, and inline `CALL PYTHON` steps: the extension is a UI surface over the runtime, not a parallel execution engine with its own reduced feature subset.

---

## 🐍 Public Python API (`ManulSession`)

For users who prefer writing automation in pure Python — or want to integrate ManulEngine into existing pytest suites and RPA scripts — the runtime exports `ManulSession`: an async context manager that owns the Playwright lifecycle and exposes clean methods (`navigate`, `click`, `fill`, `verify`, `extract`, etc.). Every call routes through the same smart-resolution pipeline used by `.hunt` file execution.

```python
from manul_engine import ManulSession

async with ManulSession(headless=True) as session:
   await session.navigate("https://example.com/login")
   await session.fill("Username field", "admin")
   await session.click("Log in button")
   await session.verify("Welcome")
```

Use `ManulSession` when you want programmatic control. Use `.hunt` files with the VS Code extension when you want shared QA artifacts, Test Explorer integration, and interactive debugging.

See the [ManulEngine README](https://github.com/alexbeatnik/ManulEngine) for the full API reference.

### ⚡ Parallel Execution Support

The extension respects the runtime `workers` setting and the `manulEngine.workers` VS Code setting when running multiple hunt files.

- bounded concurrency keeps the Test Explorer responsive
- per-file output and child status remain associated with the correct file item
- nested results still update live while multiple hunts are running in parallel

## Changelog

### 0.0.9.27

- bumped extension manifest to `0.0.927` and pinned ManulEngine runtime to `0.0.9.27`
- replaced `Math.random()` nonces with `crypto.randomBytes` in all webview panels
- fixed inline `require("child_process")` in `explainLensProvider` to top-level import
- added `LIVE_SCAN_TIMEOUT_MS` kill timeout to explain runs to prevent indefinite hangs

### 0.0.9.26

- moved the VS Code extension from `packages/extension` to the repository root
- kept runtime contracts and shared logic under `src/shared`
- preserved the pinned ManulEngine runtime line at `0.0.9.26` and the extension manifest version at `0.0.926`

## License

See `LICENSE`.