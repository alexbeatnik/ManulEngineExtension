# ManulEngine Extension Workspace

[![PyPI](https://img.shields.io/pypi/v/manul-engine?label=PyPI&logo=pypi)](https://pypi.org/project/manul-engine/)
[![PyPI Downloads](https://static.pepy.tech/personalized-badge/manul-engine?period=total&units=INTERNATIONAL_SYSTEM&left_color=BLACK&right_color=GREEN&left_text=downloads)](https://pepy.tech/projects/manul-engine)
[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/manul-engine.manul-engine?label=VS%20Code%20Marketplace&logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=manul-engine.manul-engine)
[![Status: Alpha](https://img.shields.io/badge/status-alpha-d97706)](#status)

Repository for the ManulEngine VS Code extension and the shared TypeScript package that keeps runtime contracts, parsers, validators, and version guards aligned with the Python engine.

## Status

> **Status: Alpha.**
> **Developed by a single person.**
>
> The extension is usable, but the repository is still evolving quickly. The goal is reliable execution and transparent tooling, not inflated claims.

## Packages

| Package | Purpose |
| --- | --- |
| `manul-engine` | VS Code extension for authoring, running, debugging, formatting, and inspecting `.hunt` automation files |
| `@manul/shared` | Shared parsers, runtime constants, Hunt validation, and DSL metadata used by the extension source and packaged runtime |

## Repository Layout

```text
packages/
  extension/   # VS Code extension
  shared/      # Shared contracts, parsers, and validation
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

Build the shared package and extension:

```bash
npm run build:shared
npm run build:extension
```

## Development

From the repository root:

```bash
npm run build            # build shared + extension
npm run build:shared     # build @manul/shared
npm run build:extension  # compile the VS Code extension
npm test                 # run shared + extension tests
```

From `packages/extension/`:

```bash
npm run compile
npm test
npm exec -- vsce package
```

The extension executes the real `manul` CLI and surfaces real stdout/stderr. Shared parser or contract changes should land in `packages/shared` first, then be rebuilt before packaging the extension.

## Contracts

The pinned runtime version for this repository state is `0.0.9.26`.

- Hunt DSL validation is sourced from `packages/shared/src/manul-dsl-contract.json`.
- Shared runtime version guards live in `packages/shared/src/index.ts`.
- Full release contracts are stored in `contracts/` for reference and downstream tooling.
- Extension packaging keeps `@manul/shared` self-contained through `packages/extension/scripts/prepare-vsce-runtime.mjs`.
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

- removed the desktop IDE package and converted the repository to extension + shared only
- synchronized shared runtime contracts and version guards to `0.0.9.26`
- refreshed repository metadata and setup instructions for the extension-only workflow

## License

See `packages/extension/LICENSE`.
- removed ~95 lines of dead LSP code from Studio `EditorPane.tsx` and unused `formatBytes` from `Sidebar.tsx`
- added Vitest test suites: 31 tests for `@manul/shared` (parsers, version helpers, DSL contract integrity, regex constants) and 29 tests for the extension (regex patterns, constants, config reader)
- added `@manul/shared` README with full export table and design rules
- persisted Autosave toggle state across sessions using `localStorage`
- bumped the monorepo, Studio, shared package, and pinned ManulEngine runtime to `0.0.9.10`
- updated Studio and VS Code Step Builder templates for the expanded Hunt DSL step set in ManulEngine 0.0.9.10
- aligned Studio and VS Code extension parsing around the shared hierarchical block log format in `@manul/shared`
- added nested step and block-level test updates across Studio and the VS Code Test Explorer flow
- tightened monorepo documentation so root setup, package boundaries, and runtime versioning stay synchronized

## License

Licensing is package-specific in this repository. The VS Code extension license file is available at `packages/extension/LICENSE`.