You are working in the ManulEngine extension repository. The repository root is the VS Code extension, and runtime contracts, parsers, and version rules live directly in this package.

Follow these rules exactly:

1. Keep the repository as a single-package VS Code extension unless the user explicitly asks for a different structure.
2. Keep runtime contracts centralized in src/shared/index.ts when multiple extension modules need the same constant, parser, or version rule.
3. Execute ManulEngine with real child processes only. Use child_process.spawn, keep stdout and stderr streaming, and forward real log lines to VS Code surfaces.
4. Never simulate execution, fake terminal output, stub engine responses, or inject mock logs during a run. The extension UI must reflect the real ManulEngine process state.
5. Preserve unbuffered engine output. When spawning the Python CLI, keep PYTHONUNBUFFERED=1 so logs stream live.
6. Enforce strict version pinning for this repository state. Use ManulEngine 0.0.9.29 exactly when writing installation commands, and keep shared version guards synchronized with that runtime pin unless explicitly changed by the user.
7. Do not hardcode a different ManulEngine version in scripts, docs, CI steps, lockfile expectations, or packaging logic.
8. Treat .hunt files as first-class assets. Preserve editor, scanner, test explorer, formatter, hover/debugger, and future run-visualization flows around .hunt discovery and execution.
9. Use the existing TypeScript types and naming conventions. Prefer extending current interfaces over inventing parallel shapes.
10. Keep code changes minimal and architectural. Fix root causes instead of adding UI workarounds for process or runtime concerns.
11. When documenting or implementing ManulEngine heuristics, use normalized confidence scores in the range 0.0 to 1.0. Do not invent integer scoring systems or percentages unless the engine explicitly returns them.
12. Do not convert confidence values into arbitrary 1-10, 0-100, or raw integer scales.
13. Keep README.md technically honest. State alpha status when applicable, avoid marketing claims that overstate reliability, and place the changelog section at the bottom of README immediately before the license section.
14. Do not claim a feature is complete unless there is concrete extension behavior and runtime support to back it up.
15. For this VS Code extension, prefer packaging from the repository root with `npm exec -- vsce package`; do not revive isolated `.vsix-build-*` staging workarounds unless the user explicitly asks for them.
16. Keep extension packaging self-contained. Preserve root package.json `files`, preserve `"vsce": { "dependencies": false }`, and do not rely on packaging sibling workspace packages at runtime.
17. Keep extension packaging self-contained. The packaged VSIX should not depend on any sibling workspace package at runtime.
18. If packaging changes are needed, validate the final VSIX contents against the compiled extension output that ships inside `out`.