import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { detectRuntimeType } from './runtimeDetector';
import { findManulExecutable } from './huntRunner';

const execFileAsync = promisify(execFile);

/** Escape HTML special characters so process output cannot inject markup into the webview. */
function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function registerDoctorCommand(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand('manul.doctor', async () => {
        const folders = vscode.workspace.workspaceFolders;
        const workspaceRoot = folders?.[0]?.uri.fsPath ?? process.cwd();
        const runtimeType = await detectRuntimeType(workspaceRoot);

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Manul Doctor: Running System Diagnostics",
            cancellable: false
        }, async (_progress) => {
            let report = "<h2>🩺 Manul System Diagnostics Report</h2><ul>";

            if (runtimeType === 'go') {
                // Go runtime checks
                try {
                    const { stdout: goOut } = await execFileAsync('go', ['version']);
                    report += `<li>✅ <b>Go:</b> ${escapeHtml(goOut.trim())}</li>`;
                } catch {
                    report += `<li>❌ <b>Go:</b> Not found in PATH. Install Go >= 1.26.</li>`;
                }

                try {
                    const manulExe = await findManulExecutable(workspaceRoot);
                    const { stdout: manulOut } = await execFileAsync(manulExe, ['--version']);
                    report += `<li>✅ <b>ManulEngine (Go):</b> ${escapeHtml(manulOut.trim())}</li>`;
                } catch {
                    report += `<li>⚠️ <b>ManulEngine (Go):</b> Executable not found. Run <code>make install</code> or <code>go build -o manul ./cmd/manul</code>.</li>`;
                }
            } else {
                // Python runtime checks
                try {
                    const { stdout: pythonOut } = await execFileAsync('python3', ['-c', "import sys; print(sys.version.split(' ')[0])"])
                        .catch(() => execFileAsync('python', ['-c', "import sys; print(sys.version.split(' ')[0])"]));
                    report += `<li>✅ <b>Python:</b> ${escapeHtml(pythonOut.trim())}</li>`;
                } catch {
                    report += `<li>❌ <b>Python:</b> Not found in PATH. Install Python >= 3.10.</li>`;
                }

                const versionSnippet = "from importlib.metadata import version; print(version('manul-engine'))";
                try {
                    const { stdout: manulOut } = await execFileAsync('python3', ['-c', versionSnippet])
                        .catch(() => execFileAsync('python', ['-c', versionSnippet]));
                    report += `<li>✅ <b>ManulEngine (Global):</b> v${escapeHtml(manulOut.trim())}</li>`;
                } catch {
                    report += `<li>⚠️ <b>ManulEngine:</b> Global module not found (may be inside a venv or workspace executable path is used).</li>`;
                }
            }

            // Both runtimes drive a system-installed Chrome/Chromium over CDP.
            try {
                const { stdout: chromeOut } = await execFileAsync('google-chrome', ['--version'])
                    .catch(() => execFileAsync('chromium', ['--version']))
                    .catch(() => execFileAsync('chromium-browser', ['--version']));
                report += `<li>✅ <b>Chrome/Chromium:</b> ${escapeHtml(chromeOut.trim())}</li>`;
            } catch {
                report += `<li>❌ <b>Chrome/Chromium:</b> Not found in PATH. ManulEngine drives a system-installed Chrome over CDP.</li>`;
            }

            report += "</ul><p><i>If you are using a local workspace executable path, global metrics may show ⚠️ but the runner will still work.</i></p>";

            const panel = vscode.window.createWebviewPanel('manulDoctor', 'Manul Doctor', vscode.ViewColumn.Active, {
                enableScripts: false,
            });
            panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Manul Doctor</title>
</head>
<body style="padding: 20px; font-family: var(--vscode-editor-font-family); color: var(--vscode-editor-foreground);">
    ${report}
</body>
</html>`;
        });
    });

    context.subscriptions.push(disposable);
}