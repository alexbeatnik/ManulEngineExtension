import * as vscode from 'vscode'
import * as path from 'path'
import { validateHuntDocument } from './shared'
import { detectRuntimeType } from './runtimeDetector'

const HUNT_DIAGNOSTICS_COLLECTION = 'manul-hunt'

async function refreshHuntDiagnostics(
  document: vscode.TextDocument,
  diagnostics: vscode.DiagnosticCollection,
): Promise<void> {
  const isHuntDocument = document.languageId === 'hunt' || document.fileName.endsWith('.hunt')
  if (!isHuntDocument) {
    diagnostics.delete(document.uri)
    return
  }

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri)
  const workspaceRoot = workspaceFolder?.uri.fsPath ?? path.dirname(document.uri.fsPath)
  const runtimeType = await detectRuntimeType(workspaceRoot)

  const entries = validateHuntDocument(document.getText(), runtimeType).map((item) => {
    const range = new vscode.Range(
      item.line - 1,
      Math.max(0, item.startColumn - 1),
      item.line - 1,
      Math.max(0, item.endColumn - 1),
    )
    const diagnostic = new vscode.Diagnostic(range, item.message, vscode.DiagnosticSeverity.Error)
    diagnostic.source = 'manul'
    diagnostic.code = item.code
    return diagnostic
  })

  diagnostics.set(document.uri, entries)
}

export async function registerHuntDiagnostics(context: vscode.ExtensionContext): Promise<void> {
  const diagnostics = vscode.languages.createDiagnosticCollection(HUNT_DIAGNOSTICS_COLLECTION)
  context.subscriptions.push(diagnostics)

  const refresh = async (document: vscode.TextDocument): Promise<void> => {
    await refreshHuntDiagnostics(document, diagnostics)
  }

  await Promise.all(vscode.workspace.textDocuments.map((doc) => refresh(doc)))

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(refresh),
    vscode.workspace.onDidSaveTextDocument(refresh),
    vscode.workspace.onDidCloseTextDocument((document) => diagnostics.delete(document.uri)),
    vscode.workspace.onDidChangeTextDocument((event) => refresh(event.document)),
  )
}