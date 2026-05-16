import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as vscode from 'vscode'
import { registerHuntDiagnostics } from '../huntDiagnostics'
import * as manulShared from '../shared'

vi.mock('../shared', () => ({
  validateHuntDocument: vi.fn(),
}))

describe('huntDiagnostics', () => {
  let setMock: ReturnType<typeof vi.fn>
  let deleteMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.resetAllMocks()
    setMock = vi.fn()
    deleteMock = vi.fn()
    vi.spyOn(vscode.languages, 'createDiagnosticCollection').mockReturnValue({
      name: 'manul-hunt',
      set: setMock,
      delete: deleteMock,
      clear: vi.fn(),
      dispose: vi.fn(),
    } as any)
  })

  it('ignores non-hunt documents', async () => {
    const context = { subscriptions: [] } as any
    const doc = {
      languageId: 'typescript',
      fileName: 'main.ts',
      uri: vscode.Uri.file('main.ts'),
      getText: () => 'const a = 1',
    }
    
    // override workspace documents
    vscode.workspace.textDocuments = [doc] as any

    await registerHuntDiagnostics(context)

    expect(deleteMock).toHaveBeenCalledWith(doc.uri)
    expect(setMock).not.toHaveBeenCalled()
  })

  it('validates hunt documents using the extension-local shared module', async () => {
    vi.mocked(manulShared.validateHuntDocument).mockReturnValue([
      {
        line: 2,
        startColumn: 5,
        endColumn: 10,
        message: 'Unknown command',
        code: 'invalid-command',
      },
    ] as any)

    const context = { subscriptions: [] } as any
    const doc = {
      languageId: 'hunt',
      fileName: 'test.hunt',
      uri: vscode.Uri.file('test.hunt'),
      getText: () => '@title: Test',
    }
    vscode.workspace.textDocuments = [doc] as any

    await registerHuntDiagnostics(context)

    expect(setMock).toHaveBeenCalledTimes(1)
    
    const [uri, diagnostics] = setMock.mock.calls[0]
    expect(uri).toBe(doc.uri)
    expect(diagnostics).toHaveLength(1)
    
    const diag = diagnostics[0]
    expect(diag.message).toBe('Unknown command')
    expect(diag.code).toBe('invalid-command')
    expect(diag.range.startLine).toBe(1)      // 2 - 1
    expect(diag.range.startCharacter).toBe(4) // 5 - 1
    expect(diag.range.endLine).toBe(1)
    expect(diag.range.endCharacter).toBe(9)
  })
})
