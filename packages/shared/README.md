# @manul/shared

[![PyPI Downloads](https://static.pepy.tech/personalized-badge/manul-engine?period=total&units=INTERNATIONAL_SYSTEM&left_color=BLACK&right_color=GREEN&left_text=downloads)](https://pepy.tech/projects/manul-engine)

Shared TypeScript package used by the **ManulEngine VS Code extension**.

This package is the single source of truth for constants, parsers, Hunt validation, and DSL definitions that the extension runtime and packaging flow rely on.

## What It Exports

| Export | Kind | Purpose |
|--------|------|---------|
| `MANUL_DSL_COMMANDS` | `ManulDslCommand[]` | Shared Hunt DSL command registry — drives both the Step Builder UI and Monaco/VS Code autocomplete |
| `ManulDslCommand` | interface | Shape of a single DSL command entry (id, label, icon, uiText, snippet, description, example) |
| `parseEngineLogLine()` | function | Parses a single engine stdout line into a structured `TestBlock` update, or `null` |
| `parseVersion()` | function | Splits a dotted version string into `number[]` (handles 2–4 segments, strips `v` prefix) |
| `compareVersions()` | function | Compares two version strings → negative / 0 / positive |
| `STEP_LINE_RE` | RegExp | Matches engine step lines, captures step id + description |
| `FAIL_LINE_RE` | RegExp | Matches failure markers in engine output |
| `BLOCK_LOG_RE` | RegExp | Matches hierarchical block logger lines (START / PASS / FAIL) |
| `MIN_MANUL_ENGINE_VERSION` | string | Pinned minimum engine version for this release |
| `DEFAULT_CONFIG_FILENAME` | string | `manul_engine_configuration.json` |
| `PAUSE_MARKER` | string | Debug pause protocol marker emitted on stdout |
| `StepStatus`, `TestStep`, `TestBlock` | types | Step and block status contracts |
| `RunStatus` | type | High-level run status |
## Build

```bash
npm run build        # compile to dist/
npm run typecheck    # type-check without emitting
```

## Test

```bash
npm test             # vitest run (36 tests)
npm run test:watch   # vitest in watch mode
```

Tests cover `parseEngineLogLine`, `parseVersion`, `compareVersions`, `MANUL_DSL_COMMANDS` contract integrity, and all regex constants.

## Design Rules

- Every export is consumed by at least one downstream package.
- If a parser, constant, or type is duplicated across extension runtime and packaging code, move it here.
- Keep this package dependency-free (no runtime deps, only TypeScript + Vitest dev deps).
