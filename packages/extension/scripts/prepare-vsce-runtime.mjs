import { cpSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const extensionRoot = path.resolve(scriptDir, "..");
const sharedRoot = path.resolve(extensionRoot, "..", "shared");
const sharedDistDir = path.join(sharedRoot, "dist");
const outDir = path.join(extensionRoot, "out");
const packagedRuntimePath = path.join(outDir, "shared-runtime");
const stagedSharedDir = path.join(extensionRoot, "node_modules", "@manul", "shared");

function rewriteSharedImports(currentDir) {
  for (const entry of readdirSync(currentDir)) {
    const entryPath = path.join(currentDir, entry);
    const entryStat = statSync(entryPath);

    if (entryStat.isDirectory()) {
      rewriteSharedImports(entryPath);
      continue;
    }

    if (!entryStat.isFile() || !entryPath.endsWith(".js") || entryPath === packagedRuntimePath) {
      continue;
    }

    const original = readFileSync(entryPath, "utf8");
    const rewritten = original
      .replaceAll('require("@manul/shared")', 'require("./shared-runtime")')
      .replaceAll("require('@manul/shared')", "require('./shared-runtime')");

    if (rewritten !== original) {
      writeFileSync(entryPath, rewritten);
    }
  }
}

rmSync(stagedSharedDir, { recursive: true, force: true });
rmSync(packagedRuntimePath, { recursive: true, force: true });
rmSync(`${packagedRuntimePath}.js`, { force: true });
cpSync(sharedDistDir, packagedRuntimePath, { recursive: true });
rewriteSharedImports(outDir);