import * as vscode from 'vscode'
import { validateHuntDocument } from '@manul/shared'

const HUNT_DIAGNOSTICS_COLLECTION = 'manul-hunt'

function refreshHuntDiagnostics(
  document: vscode.TextDocument,
  diagnostics: vscode.DiagnosticCollection,
): void {
  const isHuntDocument = document.languageId === 'hunt' || document.fileName.endsWith('.hunt')
  if (!isHuntDocument) {
    diagnostics.delete(document.uri)
    return
  }

  const entries = validateHuntDocument(document.getText()).map((item) => {
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

export function registerHuntDiagnostics(context: vscode.ExtensionContext): void {
  const diagnostics = vscode.languages.createDiagnosticCollection(HUNT_DIAGNOSTICS_COLLECTION)
  context.subscriptions.push(diagnostics)

  const refresh = (document: vscode.TextDocument): void => {
    refreshHuntDiagnostics(document, diagnostics)
  }

  for (const document of vscode.workspace.textDocuments) {
    refresh(document)
  }

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(refresh),
    vscode.workspace.onDidSaveTextDocument(refresh),
    vscode.workspace.onDidCloseTextDocument((document) => diagnostics.delete(document.uri)),
    vscode.workspace.onDidChangeTextDocument((event) => refresh(event.document)),
  )
}