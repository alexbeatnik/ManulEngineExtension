import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as vscode from 'vscode'
import { ExplainLensProvider } from '../explainLensProvider'

describe('ExplainLensProvider', () => {
  let provider: ExplainLensProvider
  let mockGet: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.resetAllMocks()
    provider = new ExplainLensProvider()
    mockGet = vi.fn().mockReturnValue(true) // explainCodeLens is true by default
    
    vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
      get: mockGet,
    } as any)
  })

  it('returns empty array if document is not hunt', () => {
    const doc = {
      languageId: 'typescript',
      lineCount: 1,
      lineAt: () => ({ text: 'CLICK "Button"' }),
    } as any
    
    const lenses = provider.provideCodeLenses(doc, {} as any)
    expect(lenses).toEqual([])
  })

  it('returns empty array if explainCodeLens is disabled', () => {
    mockGet.mockReturnValue(false)
    const doc = {
      languageId: 'hunt',
      lineCount: 1,
      lineAt: () => ({ text: 'CLICK "Button"' }),
    } as any
    
    const lenses = provider.provideCodeLenses(doc, {} as any)
    expect(lenses).toEqual([])
  })

  it('creates lenses only for actionable hunt lines', () => {
    const lines = [
      '# This is a comment',
      'STEP 1: Log in',
      'Fill "Username" with "admin"',
      'Type "password" into "Password"',
      'CLICK "Login"',
      'WAIT 2',
      'SCROLL DOWN',
      'VERIFY that "Welcome" is present',
      'EXTRACT the "Total" into {total}',
      'DONE.',
    ]
    
    const doc = {
      languageId: 'hunt',
      lineCount: lines.length,
      lineAt: (i: number) => ({ text: lines[i] }),
      uri: vscode.Uri.file('test.hunt')
    } as any

    const lenses = provider.provideCodeLenses(doc, {} as any)
    
    // Actionable lines: Fill (idx 2), Type (idx 3), CLICK (idx 4), VERIFY (idx 7), EXTRACT (idx 8)
    expect(lenses).toHaveLength(5)
    
    expect(lenses[0].range.startLine).toBe(2)
    expect(lenses[0].command?.command).toBe('manul.explainHuntFile')
    
    expect(lenses[1].range.startLine).toBe(3)
    expect(lenses[2].range.startLine).toBe(4)
    expect(lenses[3].range.startLine).toBe(7)
    expect(lenses[4].range.startLine).toBe(8)
  })
})
