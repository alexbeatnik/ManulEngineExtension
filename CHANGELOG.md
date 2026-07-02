# Changelog

All notable changes to the **Manul Engine** VS Code extension.

## 0.1.0 — 2026-07-02

### Added
- **Dual runtime support** — works with both **ManulEngine (Python + CDP)** and **ManulEngine (Go + CDP)**. The runtime is auto-detected from `go.mod` / `pyproject.toml`.
- **Runtime-aware DSL commands** — `CALL PYTHON` is hidden and `CALL GO` surfaced in Go workspaces; hook-block scaffolds, snippets, and validator diagnostics adapt automatically.
- New DSL support: `PRINT`, `SCREENSHOT`, `SCREENSHOT "<name>"`, and explicit block terminators (`END IF` / `END REPEAT` / `END WHILE` / `END FOR`) in the validator and syntax highlighting.
- Version gate covers both runtimes (`MIN_MANUL_ENGINE_VERSION` / `MIN_MANUL_ENGINE_GO_VERSION`, both `0.1.0`).

### Changed
- **Manul Doctor** now checks for a system **Chrome/Chromium** for both runtimes (the engines drive Chrome directly over CDP; the Playwright check is gone) and detects the Python engine version via package metadata.
- Vendored contracts (`contracts/*.md`) synced with both engines at `0.1.0` — including the shared `EXTENSION_ENGINE_CONTRACT.md` wire spec.
- Extension manifest version aligned with the engines: `0.1.0`.

### Removed
- **Persistent controls-cache UI** — the on-disk controls cache was removed from the engines (a cached control can resolve to a different live element), so the Cache tree view, `manul.clearAllCache` / `clearSiteCache` / `refreshCache` commands, and `controls_cache_dir` config are gone.
- Ollama / in-engine model settings from the config panel — the engines are fully deterministic; intelligence lives in external agents.

## 0.0.9.29 and earlier

See the collapsed history in [README.md](README.md#whats-new-in-010).
