You are working in the ManulEngine extension workspace. The repository contains the VS Code extension and a shared TypeScript package used to keep runtime contracts, parsers, and version rules aligned with the Python ManulEngine runtime.

Follow these rules exactly:

1. Preserve npm workspace package boundaries. Root package.json orchestrates the workspace; package-specific build logic stays inside the relevant package.
2. Keep shared runtime contracts centralized in packages/shared/src/index.ts when both extension source and packaged runtime need the same constant, parser, or version rule.
3. Execute ManulEngine with real child processes only. Use child_process.spawn, keep stdout and stderr streaming, and forward real log lines to VS Code surfaces.
4. Never simulate execution, fake terminal output, stub engine responses, or inject mock logs during a run. The extension UI must reflect the real ManulEngine process state.
5. Preserve unbuffered engine output. When spawning the Python CLI, keep PYTHONUNBUFFERED=1 so logs stream live.
6. Enforce strict version pinning for this repository state. Use ManulEngine 0.0.9.26 exactly when writing installation commands, and keep shared version guards synchronized with that runtime pin unless explicitly changed by the user.
7. Do not hardcode a different ManulEngine version in scripts, docs, CI steps, lockfile expectations, or packaging logic.
8. Treat .hunt files as first-class assets. Preserve editor, scanner, test explorer, formatter, hover/debugger, and future run-visualization flows around .hunt discovery and execution.
9. Use the existing TypeScript types and naming conventions. Prefer extending current interfaces over inventing parallel shapes.
10. Keep code changes minimal and architectural. Fix root causes instead of adding UI workarounds for process or runtime concerns.
11. When documenting or implementing ManulEngine heuristics, use normalized confidence scores in the range 0.0 to 1.0. Do not invent integer scoring systems or percentages unless the engine explicitly returns them.
12. Do not convert confidence values into arbitrary 1-10, 0-100, or raw integer scales.
13. Keep README.md technically honest. State alpha status when applicable, avoid marketing claims that overstate reliability, and place the changelog section at the bottom of README immediately before the license section.
14. Do not claim a feature is complete unless there is concrete extension behavior and runtime support to back it up.
15. For the VS Code extension in packages/extension, prefer direct packaging from packages/extension with `npm exec -- vsce package`; do not revive isolated `.vsix-build-*` staging workarounds unless the user explicitly asks for them.
16. Keep extension packaging self-contained. Preserve packages/extension/package.json `files`, preserve `"vsce": { "dependencies": false }`, and do not rely on packaging workspace `node_modules/@manul/shared`.
17. Preserve packages/extension/scripts/prepare-vsce-runtime.mjs. The current packaging flow builds `@manul/shared`, copies packages/shared/dist into packages/extension/out/shared-runtime, and rewrites compiled `require("@manul/shared")` imports to `require("./shared-runtime")` for the packaged VSIX runtime.
18. If extension packaging changes are needed, validate the final VSIX contents and confirm the packaged compiled output references `./shared-runtime` instead of `@manul/shared`.