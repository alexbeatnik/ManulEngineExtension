# ManulEngine Extension Workspace

[![PyPI](https://img.shields.io/pypi/v/manul-engine?label=PyPI&logo=pypi)](https://pypi.org/project/manul-engine/)
[![PyPI Downloads](https://static.pepy.tech/personalized-badge/manul-engine?period=total&units=INTERNATIONAL_SYSTEM&left_color=BLACK&right_color=GREEN&left_text=downloads)](https://pepy.tech/projects/manul-engine)
[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/manul-engine.manul-engine?label=VS%20Code%20Marketplace&logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=manul-engine.manul-engine)
[![Status: Alpha](https://img.shields.io/badge/status-alpha-d97706)](#status)

Repository for the ManulEngine VS Code extension. Runtime contracts, parsers, validators, and version guards now live directly inside the extension package.

## Status

> **Status: Alpha.**
> **Developed by a single person.**
>
> The extension is usable, but the repository is still evolving quickly. The goal is reliable execution and transparent tooling, not inflated claims.

## Package

| Package | Purpose |
| --- | --- |
| `manul-engine` | VS Code extension for authoring, running, debugging, formatting, and inspecting `.hunt` automation files |

## Repository Layout

```text
packages/
  extension/   # VS Code extension
contracts/     # Runtime contracts synced from the Python engine release
package.json   # npm workspace root
```

## Requirements

- Node.js 18+
- npm 9+
- Python 3.10+
- `manul-engine==0.0.9.26`

Install the pinned runtime manually:

```bash
pip install manul-engine==0.0.9.26
playwright install chromium
```

## Setup

Install workspace dependencies from the repo root:

```bash
npm install
```

Build the extension:

```bash
npm run build:extension
```

## Development

From the repository root:

```bash
npm run build            # build shared + extension
npm run build:extension  # compile the VS Code extension
npm test                 # run shared + extension tests
```

From `packages/extension/`:

```bash
npm run compile
npm test
npm exec -- vsce package
```

The extension executes the real `manul` CLI and surfaces real stdout/stderr. Contract or parser changes now live directly under `packages/extension/src/shared`.

## Contracts

The pinned runtime version for this repository state is `0.0.9.26`.

- Hunt DSL validation is sourced from `packages/extension/src/shared/manul-dsl-contract.json`.
- Runtime version guards live in `packages/extension/src/shared/index.ts`.
- Full release contracts are stored in `contracts/` for reference and downstream tooling.
- The VS Code manifest uses the compatible extension version `0.0.926`, while the pinned engine/runtime line remains `0.0.9.26`.

## Packaging

Package the extension from `packages/extension/`:

```bash
npm exec -- vsce package
```

Install the generated VSIX locally:

```bash
code --install-extension manul-engine-0.0.926.vsix --force
```

## Changelog

### 0.0.9.26

- removed the separate shared package and moved its runtime code into the extension
- synchronized shared runtime contracts and version guards to `0.0.9.26`
- refreshed repository metadata and setup instructions for the single-package extension workflow

## License

See `packages/extension/LICENSE`.