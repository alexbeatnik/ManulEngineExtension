<p align="center">
    <img src="images/icon128.png" alt="ManulEngine Extension" width="128" />
</p>

# ManulEngine — VS Code Extension

[![Manul Engine Extension](https://img.shields.io/visual-studio-marketplace/v/manul-engine.manul-engine?label=Manul%20Engine%20Extension&logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=manul-engine.manul-engine)
[![PyPI](https://img.shields.io/pypi/v/manul-engine?label=PyPI&logo=pypi)](https://pypi.org/project/manul-engine/)
[![PyPI Downloads](https://static.pepy.tech/personalized-badge/manul-engine?period=total&units=INTERNATIONAL_SYSTEM&left_color=BLACK&right_color=GREEN&left_text=downloads)](https://pepy.tech/projects/manul-engine)
[![MCP Server](https://img.shields.io/visual-studio-marketplace/v/manul-engine.manul-mcp-server?label=MCP%20Server&logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=manul-engine.manul-mcp-server)
[![Status: Alpha](https://img.shields.io/badge/status-alpha-d97706)](#status)

Author, run, and debug `.hunt` automation scripts inside VS Code — E2E testing, RPA, synthetic monitoring, and AI-agent execution from a single editor. Language support, one-click execution, interactive debug stepping, Step Builder, configuration UI, and cache management for [ManulEngine](https://github.com/alexbeatnik/ManulEngine).

> **Status: Alpha.** Solo-developed, actively battle-tested. The extension and runtime are feature-rich but still being hardened on real-world projects. No promises about stability. The goal is strong debugging ergonomics and transparent execution, not inflated claims.

---

## Dual-persona workflow

ManulEngine bridges non-technical authors and engineering teams. You don't write selectors — you write scripts.

- **QA / Business Analysts / Ops:** Write automation in plain English — no Python, CSS, or XPath. The deterministic heuristics engine resolves elements reliably across UI changes. The same scripts work for testing, RPA, and monitoring.
- **Developers / SDETs:** No more maintaining thousands of brittle `page.locator()` calls. For complex custom widgets, write a Python control hook with the full Playwright API. The rest of the team keeps writing plain English — your hook handles the Playwright logic behind the scenes.

---

## Features

### Hunt file language support

- Syntax highlighting for `.hunt` files
- Comment toggling (`#`)
- Bracket/quote matching and auto-closing
- File icon in the explorer

### Run hunt files

Three ways to execute a `.hunt` file:

| Method | How |
|--------|-----|
| **Editor title button** | Click the `▶` icon in the top-right when a `.hunt` file is open |
| **Explorer context menu** | Right-click a `.hunt` file → *ManulEngine: Run Hunt File* |
| **Terminal mode** | Right-click → *ManulEngine: Run Hunt File in Terminal* (raw integrated terminal) |

Output streams live into a dedicated **ManulEngine** output channel.

### Debug mode

Place breakpoints by clicking the editor gutter next to any step number. Then run the **Debug** profile in Test Explorer (or use `ManulEngine: Debug Hunt File` from the Command Palette).

- Execution pauses at each breakpointed step with a floating **QuickPick overlay** — no modal dialogs
- **Next Step** — advance exactly one step and pause again
- **Continue All** — run until the next gutter breakpoint or end of hunt
- **Explain Next Step** — request the live heuristic explanation for the paused step, shown inline in the same QuickPick without stealing focus
- **Stop** in Test Explorer dismisses the QuickPick and terminates the run cleanly; Python never hangs
- Editing the paused step line and triggering **Explain Next Step** again sends the current editor text to the engine instead of stale cached text
- **Persistent magenta highlight** — the resolved target element is outlined with a `4px solid #ff00ff` border + glow while paused; removed automatically before the action executes
- **Linux:** VS Code window is raised via `xdotool`/`wmctrl` and a 5-second system notification via `notify-send` on pause
- Uses `--break-lines` protocol (piped stdio): Python emits a marker on stdout; the extension responds on stdin

### Test Explorer integration

Hunt files appear in the **VS Code Test Explorer** as top-level items (one per file). Two run profiles:

- **Run** (default) — normal execution via the output panel
- **Debug** — gutter breakpoints with the floating QuickPick pause overlay

For both profiles:

- Each block/step is shown as a child item with pass/fail status
- Failed steps display the engine output as the failure message
- Steps never reached are marked as skipped
- Child items are created from the engine's live hierarchical stdout — block start events create nested children during the run, pass/fail events update those items in place. Test Explorer reflects the real runtime timeline, not a reconstructed summary.

### Configuration panel

An interactive sidebar for editing `manul_engine_configuration.json` without touching the file directly.

| Setting | Description |
|---------|-------------|
| **Model** | Ollama model name. Leave blank for heuristics-only mode (recommended default). |
| **AI Policy** | `prior` or `strict` — only relevant when a model is set. |
| **AI Threshold** | Score cutoff before optional LLM fallback. `null` = auto. |
| **AI Always** | Always call the LLM picker. Disabled when no model is set. |
| **Browser** | Chromium, Firefox, or WebKit. |
| **Browser Args** | Extra launch flags (comma-separated). |
| **Headless** | Run browser headless. |
| **Timeouts** | Action and navigation timeouts in ms. |
| **Controls Cache** | Persistent per-site cache storing resolved locators on disk across runs. |
| **Semantic Cache** | In-session cache granting a 1.0 perfect score on reuse. Resets when the process ends. |
| **Auto-Annotate** | Inserts `# 📍 Auto-Nav:` comments on URL changes during runs. |
| **Workers** | Max concurrent hunt files in Test Explorer (1–4). |

Changes save to `manul_engine_configuration.json` at the workspace root. A *Generate Default Config* button creates the file if absent. An *Add Default Prompts* button copies built-in prompt templates into `prompts/`. Ollama status indicator shows live reachability at `localhost:11434` with model autocomplete.

### Cache browser

The **Cache** sidebar tree shows per-site entries from ManulEngine's persistent controls cache:

- Browse sites and their cached page entries
- Clear cache for a specific site (trash icon on hover)
- Clear all entries at once (toolbar button)
- Refresh the tree manually

### Step Builder

A sidebar panel for inserting hunt steps with a single click — no typing required.

- **New Hunt File** — prompts for a name, creates a `.hunt` with a starter template in the `tests_home` directory, and opens it
- **Live Page Scanner** — paste a URL and click **Run Scan**; the extension invokes `manul scan <URL>` as a child process, then opens the generated `draft.hunt` automatically
- **Step buttons** — generated from the shared DSL registry, covering the full runtime command set: `OPEN APP`, explicit waits, strict `VERIFY` checks, `VERIFY SOFTLY`, `VERIFY VISUAL`, `WAIT FOR RESPONSE`, `MOCK`, `SCAN PAGE`, `CALL PYTHON`, `SET`, `DEBUG VARS`, and the rest of the core verbs
- **Contextual builder** — compose `NEAR`, `ON HEADER`, `ON FOOTER`, and `INSIDE '<container>' row with '<text>'` qualifiers without typing DSL by hand
- **Proximity Builder** — interactive form for contextual Click / Fill / Verify steps with qualifier picker, target/anchor inputs, and live DSL preview before inserting
- **Hooks buttons** — insert pre-filled `[SETUP]` / `[TEARDOWN]` blocks; **Add Demo Tests** copies bundled demo hunts into the workspace
- Each click appends to the active `.hunt` file and positions the cursor inside the first `''` pair

### Hunt DSL autocomplete

`CompletionItemProvider` for `.hunt` files with three layers:

- **Metadata directives** — `@context:`, `@title:`, `@blueprint:`, `@var:`, `@script:`, `@tags:`, `@data:`, `@schedule:`
- **Hook blocks** — `[SETUP]` and `[TEARDOWN]`
- **DSL snippets** — every command from the `MANUL_DSL_COMMANDS` registry with tab-stop placeholders

Completions are sourced from the shared runtime module — adding a DSL command there automatically exposes it in both the completion list and the Step Builder sidebar.

### Visual explainability (hover tooltips)

Run a hunt in **Debug Mode**, then hover over any step line. A rich Markdown tooltip shows the full per-element scoring breakdown — Text, Attributes, Semantics, Proximity, Cache — attached to the exact line.

- **Hover tooltips** on each resolved step with the full scoring rationale
- **Dedicated output channel** — scoring breakdown routed to "ManulEngine: Explain Heuristics", separate from test output

Together these form a layered debug workflow: Test Explorer shows *where* the run is, QuickPick controls *how* execution moves, hover explains *why* the runtime chose the current target.

---

## Quickstart

### Install

```bash
pip install manul-engine==0.0.9.28
playwright install chromium
```

Optional local AI fallback (not required):

```bash
pip install "manul-engine[ai]==0.0.9.28"
ollama pull qwen2.5:0.5b && ollama serve
```

### Configure

Install the extension:

```bash
code --install-extension manul-engine.manul-engine
```

Open your project folder in VS Code. The extension activates automatically when a `.hunt` file is present. Run `ManulEngine: Generate Default Config` from the Command Palette to create `manul_engine_configuration.json`:

```json
{
  "model": null,
  "browser": "chromium",
  "controls_cache_enabled": true,
  "semantic_cache_enabled": true
}
```

This is the minimal recommended config — fully heuristics-only, no AI dependency.

### Run

Open or create a `.hunt` file and click `▶` in the editor title bar, or use:

```bash
# from the integrated terminal
manul tests/login.hunt
manul tests/
manul --headless --html-report tests/
```

The extension delegates execution to the real runtime, so the same workspace can use normal browser hunts, desktop/Electron hunts through `OPEN APP` + `executable_path`, and Python-backed hooks without any extension-specific rewrite.

---

## Example hunt file

```text
@context: Login and verify dashboard
@title: smoke_login
@tags: smoke, auth

@var: {user_email} = user@example.com
@var: {password}   = secret
@script: {auth}    = helpers.auth

STEP 1: Login
    NAVIGATE to https://example.com/login
    FILL 'Email' field with '{user_email}'
    VERIFY "Email" field has value "{user_email}"
    FILL 'Password' field with '{password}'
    CALL PYTHON {auth}.issue_token into {login_token}
    CLICK the 'Sign In' button
    VERIFY that 'Welcome' is present

DONE.
```

See the [ManulEngine README](https://github.com/alexbeatnik/ManulEngine) for the full DSL reference.

---

## Custom controls

Some UI elements cannot be reliably targeted by heuristics: React virtual tables, canvas datepickers, WebGL widgets. **Custom Controls** route specific `.hunt` steps to hand-written Playwright Python while the hunt file stays plain English.

1. Create a `controls/` directory in the workspace root.
2. Add a `.py` file with a `@custom_control` handler:
   ```python
   # controls/booking.py
   from manul_engine import custom_control

   @custom_control(page="Checkout Page", target="React Datepicker")
   async def handle_datepicker(page, action_type, value):
       await page.locator(".react-datepicker__input-container input").fill(value or "")
   ```
3. Map the URL to `"Checkout Page"` in `pages.json` (editable via the Config Panel).
4. Write a normal `.hunt` step:
   ```text
   FILL 'React Datepicker' with '2026-12-25'
   ```

Custom Controls are loaded automatically on engine startup. Debug breakpoints, Test Explorer, and live output streaming all work identically whether a step uses a custom control or the standard heuristic pipeline.

> **Team workflow:** QA authors keep writing plain English. SDETs own the `controls/` directory. The `.hunt` file never changes when the underlying Playwright logic evolves.

---

## Auto-detection of the `manul` executable

The extension probes the following locations in order (platform-aware):

1. Custom path from `manulEngine.manulPath` setting
2. `.venv/bin/manul` in the workspace root (also `venv/`, `env/`, `.env/`)
3. `~/.local/bin/manul` (pip --user, Linux/macOS)
4. `~/Library/Python/*/bin/manul` (pip --user, macOS)
5. `~/.local/pipx/venvs/manul-engine/bin/manul` (pipx)
6. `/opt/homebrew/bin/manul` (Homebrew, Apple Silicon)
7. `/usr/local/bin/manul`, `/usr/bin/manul` (system-wide)
8. Shell login init lookup (`$SHELL -lc 'command -v manul'`) — sources fish/zsh/bash/pyenv/conda init
9. Windows: `%APPDATA%\Python\*\Scripts\manul.exe`, `%LOCALAPPDATA%\Programs\Python\*\Scripts\manul.exe`

---

## Extension settings

| Setting | Default | Description |
|---------|---------|-------------|
| `manulEngine.manulPath` | `""` | Absolute path to the `manul` CLI. Leave empty to auto-detect. |
| `manulEngine.configFile` | `manul_engine_configuration.json` | Config file name resolved from the workspace root. |
| `manulEngine.workers` | `null` | Max concurrent hunt files in Test Explorer. Overrides `workers` in config. |
| `manulEngine.htmlReport` | `false` | Generate a self-contained HTML report after each run. |
| `manulEngine.retries` | `0` | Retry failed hunt files N times before marking as failed (0–10). |
| `manulEngine.screenshotMode` | `"on-fail"` | `none`, `on-fail`, or `always`. |
| `manulEngine.testsHome` | `"tests"` | Directory where Step Builder creates new hunt files. |
| `manulEngine.autoAnnotate` | `false` | Sets `MANUL_AUTO_ANNOTATE=true` for runs. |
| `manulEngine.explainMode` | `false` | Always enable detailed heuristic explain output. |
| `manulEngine.verifyMaxRetries` | `null` | Override runtime polling retry count for `VERIFY` steps. |
| `manulEngine.debugPauseTimeoutSeconds` | `300` | Auto-resume unattended debug pause after N seconds. `0` disables. |
| `manulEngine.browser` | `"chromium"` | `chromium`, `firefox`, `webkit`, `chrome`, `msedge`, or `electron`. |

---

## System requirements

| | Minimum | Recommended |
|---|---|---|
| **Python** | 3.11+ | 3.12+ |
| **RAM** | 4 GB | 8 GB |
| **GPU** | none | none |
| **Model** | — (heuristics-only) | `qwen2.5:0.5b` |

---

## Ecosystem

### ManulEngine runtime

The deterministic Playwright-backed runtime that interprets `.hunt` files. Resolves DOM elements with weighted heuristic scoring (`DOMScorer` + `TreeWalker`), no CSS selectors, no cloud APIs.

```bash
pip install manul-engine==0.0.9.28
```

[PyPI](https://pypi.org/project/manul-engine/) · [GitHub](https://github.com/alexbeatnik/ManulEngine)

### MCP Server for GitHub Copilot

A separate extension that turns ManulEngine into a native MCP server. Copilot Chat gains tools like `manul_run_step`, `manul_run_goal`, `manul_scan_page`, and `manul_save_hunt` — driving a real browser session from natural language.

```bash
code --install-extension manul-engine.manul-mcp-server
```

[Marketplace](https://marketplace.visualstudio.com/items?itemName=manul-engine.manul-mcp-server) · [Developer guide](https://github.com/alexbeatnik/ManulMcpServer)

### Python API (`ManulSession`)

Async context manager for pure-Python automation. Routes every call through the full heuristic pipeline.

```python
from manul_engine import ManulSession

async with ManulSession(headless=True) as session:
    await session.navigate("https://example.com/login")
    await session.fill("Username field", "admin")
    await session.click("Log in button")
    await session.verify("Welcome")
```

---

## What's New in 0.0.9.28

- Bumped extension manifest to `0.0.928` and pinned ManulEngine runtime to `0.0.9.28`.
- README rewritten to match the ManulEngine documentation style — no emojis in headers, clean separators, consolidated quickstart flow.

<details>
<summary>0.0.9.27</summary>

- Replaced `Math.random()` nonces with `crypto.randomBytes` in all webview panels.
- Moved explain-next results into the floating debug QuickPick; removed the modal score panel flow.
- Centralized hunt process spawn argument/env construction; removed duplicate `--explain` injection.
- TTL-based eviction for cached login-shell `manul` lookups.
- Oversized stdout/JSON guards, pause-timeout cleanup, safer stdin writes during backpressure.
- Normalized config writes through a strict allowlist.
- Added `LIVE_SCAN_TIMEOUT_MS` kill timeout to explain runs.
- Fixed inline `require("child_process")` in `explainLensProvider` to top-level import.

</details>

<details>
<summary>0.0.9.26</summary>

- Moved the VS Code extension from `packages/extension` to the repository root.
- Kept runtime contracts and shared logic under `src/shared`.
- Preserved the pinned ManulEngine runtime at `0.0.9.26` and manifest version at `0.0.926`.

</details>

## License

**Version:** 0.0.928

Apache-2.0. See `LICENSE`.