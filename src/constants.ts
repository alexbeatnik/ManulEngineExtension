/**
 * Shared constants used across the ManulEngine VS Code extension.
 */

import * as vscode from "vscode";
import { DEFAULT_CONFIG_FILENAME, PAUSE_MARKER } from "./shared";
export { DEFAULT_CONFIG_FILENAME, PAUSE_MARKER };
export {
  RE_COMMENT,
  RE_DONE,
  RE_HOOK_CLOSE,
  RE_HOOK_OPEN,
  RE_METADATA,
  RE_STEP,
} from "./shared";

/** Terminal name for normal (non-debug) hunt runs. */
export const TERMINAL_NAME = "ManulEngine";

/** Terminal name for interactive debug runs. */
export const DEBUG_TERMINAL_NAME = "ManulEngine Debug";

/** Terminal name for the background daemon process. */
export const DAEMON_TERMINAL_NAME = "Manul Daemon";

/** Output channel name for Explain Heuristics output. */
export const EXPLAIN_OUTPUT_CHANNEL = "ManulEngine: Explain Heuristics";

/** Environment flags for spawning Python/engine subprocesses. */
export const PYTHON_ENV_FLAGS: Record<string, string> = { PYTHONUNBUFFERED: "1" };

/** Common virtual-environment directory names to probe when locating the manul executable. */
export const VENV_CANDIDATES = ['.venv', 'venv', 'env', '.env'] as const;

/** Timeout for shell-based executable discovery (ms). */
export const SHELL_LOOKUP_TIMEOUT_MS = 3000;

/** Timeout for live page scan operations (ms). */
export const LIVE_SCAN_TIMEOUT_MS = 90_000;

/**
 * Read a single field from the workspace's manul_engine_configuration.json.
 * Returns the `defaultValue` when the config cannot be read or the field is
 * missing / has the wrong type.
 */
export function readConfigField<T>(workspaceRoot: string, key: string, defaultValue: T): T {
  const path = require("path");
  const fs = require("fs");
  try {
    const cfgPath = path.join(workspaceRoot, getConfigFileName());
    const raw = JSON.parse(fs.readFileSync(cfgPath, "utf-8")) as Record<string, unknown>;
    const value = raw[key];
    if (value !== undefined && value !== null && typeof value === typeof defaultValue) {
      return value as T;
    }
  } catch { /* config not found or malformed */ }
  return defaultValue;
}

/**
 * Read the effective config file name from VS Code settings,
 * falling back to the default.
 */
export function getConfigFileName(): string {
  const raw = vscode.workspace
    .getConfiguration("manulEngine")
    .get<string | undefined>("configFile");
  const trimmed = (raw ?? "").trim();
  return trimmed === "" ? DEFAULT_CONFIG_FILENAME : trimmed;
}
