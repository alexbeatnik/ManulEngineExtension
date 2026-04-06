import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export function registerDoctorCommand(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand('manul.doctor', async () => {
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Manul Doctor: Running System Diagnostics",
            cancellable: false
        }, async (_progress) => {
            let report = "<h2>🩺 Manul System Diagnostics Report</h2><ul>";
            
            try {
                const { stdout: pythonOut } = await execAsync('python3 -c "import sys; print(sys.version.split(\' \')[0])"').catch(() => execAsync('python -c "import sys; print(sys.version.split(\' \')[0])"'));
                report += `<li>✅ <b>Python:</b> ${pythonOut.trim()}</li>`;
            } catch {
                report += `<li>❌ <b>Python:</b> Not found in PATH. Install Python >= 3.10.</li>`;
            }

            try {
                const { stdout: manulOut } = await execAsync('python3 -c "import manul; print(manul.__version__)"').catch(() => execAsync('python -c "import manul; print(manul.__version__)"'));
                report += `<li>✅ <b>ManulEngine (Global):</b> v${manulOut.trim()}</li>`;
            } catch {
                report += `<li>⚠️ <b>ManulEngine:</b> Global module not found (may be inside a venv or workspace executable path is used).</li>`;
            }

            try {
                const { stdout: pwOut } = await execAsync('python3 -m playwright --version').catch(() => execAsync('python -m playwright --version'));
                report += `<li>✅ <b>Playwright:</b> ${pwOut.trim()}</li>`;
            } catch {
                report += `<li>❌ <b>Playwright:</b> Not found or failing to run <code>playwright install</code>.</li>`;
            }
            
            report += "</ul><p><i>If you are using a local workspace executable path, global metrics may show ⚠️ but the runner will still work.</i></p>";

            const panel = vscode.window.createWebviewPanel('manulDoctor', 'Manul Doctor', vscode.ViewColumn.Active, {});
            panel.webview.html = `
                <html>
                    <body style="padding: 20px; font-family: var(--vscode-editor-font-family); color: var(--vscode-editor-foreground);">
                        ${report}
                    </body>
                </html>`;
        });
    });

    context.subscriptions.push(disposable);
}