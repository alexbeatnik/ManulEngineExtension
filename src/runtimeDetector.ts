import * as path from "path";
import * as fs from "fs";
import { execFile } from "child_process";
import { findManulExecutable } from "./huntRunner";

export type ManulRuntimeType = "python" | "go" | "unknown";

interface RuntimeInfo {
  type: ManulRuntimeType;
  version: string;
}

const _runtimeCache = new Map<string, RuntimeInfo>();

/**
 * Detect whether the workspace uses ManulEngine (Python) or ManulHeart (Go).
 *
 * Detection order:
 *  1. If a `go.mod` exists in the workspace root → Go (ManulHeart).
 *  2. If a `pyproject.toml` / `setup.py` / `requirements.txt` exists → Python (ManulEngine).
 *  3. Run `manul --version` and inspect the output string:
 *     - contains "heart" or "manul-heart" → Go
 *     - otherwise → Python
 */
export async function detectRuntimeType(workspaceRoot: string): Promise<ManulRuntimeType> {
  const info = await detectRuntime(workspaceRoot);
  return info.type;
}

export async function detectRuntime(workspaceRoot: string): Promise<RuntimeInfo> {
  const cached = _runtimeCache.get(workspaceRoot);
  if (cached) {
    return cached;
  }

  // 1. Heuristic: look for project metadata files
  const hasGoMod = fs.existsSync(path.join(workspaceRoot, "go.mod"));
  const hasPyProject =
    fs.existsSync(path.join(workspaceRoot, "pyproject.toml")) ||
    fs.existsSync(path.join(workspaceRoot, "setup.py")) ||
    fs.existsSync(path.join(workspaceRoot, "requirements.txt"));

  if (hasGoMod && !hasPyProject) {
    const result: RuntimeInfo = { type: "go", version: "" };
    _runtimeCache.set(workspaceRoot, result);
    return result;
  }
  if (hasPyProject && !hasGoMod) {
    const result: RuntimeInfo = { type: "python", version: "" };
    _runtimeCache.set(workspaceRoot, result);
    return result;
  }

  // 2. Probe the manul executable version string
  try {
    const manulExe = await findManulExecutable(workspaceRoot);
    const versionStr = await getManulVersionString(manulExe);
    const lower = versionStr.toLowerCase();
    if (lower.includes("heart") || lower.includes("manul-heart")) {
      const result: RuntimeInfo = { type: "go", version: versionStr };
      _runtimeCache.set(workspaceRoot, result);
      return result;
    }
    // Default to python for any other version string
    const result: RuntimeInfo = { type: "python", version: versionStr };
    _runtimeCache.set(workspaceRoot, result);
    return result;
  } catch {
    // Fallback: if go.mod exists anywhere in the tree, lean toward Go
    if (hasGoMod) {
      const result: RuntimeInfo = { type: "go", version: "" };
      _runtimeCache.set(workspaceRoot, result);
      return result;
    }
    const result: RuntimeInfo = { type: "python", version: "" };
    _runtimeCache.set(workspaceRoot, result);
    return result;
  }
}

async function getManulVersionString(manulExe: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    execFile(manulExe, ["--version"], { timeout: 5000 }, (err, stdout) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(stdout.trim());
    });
  });
}

export function clearRuntimeCache(workspaceRoot: string): void {
  _runtimeCache.delete(workspaceRoot);
}
