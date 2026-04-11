import { describe, expect, it } from 'vitest'
import { HuntDocumentFormatter } from '../formatter'
import * as vscode from 'vscode'

/** Helper to construct a mock TextDocument */
class MockTextDocument {
  private lines: string[]
  public lineCount: number

  constructor(content: string) {
    this.lines = content.split('\n')
    this.lineCount = this.lines.length
  }

  lineAt(index: number) {
    const text = this.lines[index]
    return {
      text,
      range: new vscode.Range(index, 0, index, text.length),
    }
  }
}

describe('HuntDocumentFormatter', () => {
  it('preserves empty lines (removes whitespace)', () => {
    const doc = new MockTextDocument('   \n\n\t')
    const formatter = new HuntDocumentFormatter()
    const edits = formatter.provideDocumentFormattingEdits(doc as any, {} as any, {} as any)
    
    // Line 0 had '   ', expected to be replaced with empty string
    // Line 1 was empty, no change needed
    // Line 2 was '\t', expected to be replaced with empty string
    expect(edits).toEqual([
      { range: new vscode.Range(0, 0, 0, 3), newText: '' },
      { range: new vscode.Range(2, 0, 2, 1), newText: '' }
    ])
  })

  it('indents commands 4 spaces only when inside a block (STEP or [SETUP] etc)', () => {
    const code = [
      '@title: My Test',
      'Click the "Login" button',
      'STEP 1: Auth',
      'Click the "Login" button',
      'DONE.',
      'Click the "Login" button'
    ].join('\n')

    const doc = new MockTextDocument(code)
    const formatter = new HuntDocumentFormatter()
    const edits = formatter.provideDocumentFormattingEdits(doc as any, {} as any, {} as any)

    // @title... -> 0 space (already 0)
    // Click... (outside block) -> 0 space (already 0)
    // STEP 1... -> 0 space (already 0)
    // Click... (inside block) -> 4 spaces
    // DONE. -> 0 space (already 0)
    // Click... (outside block) -> 0 space (already 0)

    expect(edits).toEqual([
      { range: new vscode.Range(3, 0, 3, 24), newText: '    Click the "Login" button' }
    ])
  })

  it('adjusts existing indentation properly inside and outside blocks', () => {
    const code = [
      '    @title: My Test',
      '  STEP 1: Form',
      ' Fill field',
      '    Fill field 2',
      '        Fill field 3',
      '  DONE.',
      '  '
    ].join('\n')

    const doc = new MockTextDocument(code)
    const formatter = new HuntDocumentFormatter()
    const edits = formatter.provideDocumentFormattingEdits(doc as any, {} as any, {} as any)

    expect(edits).toEqual([
      { range: new vscode.Range(0, 0, 0, 19), newText: '@title: My Test' },
      { range: new vscode.Range(1, 0, 1, 14), newText: 'STEP 1: Form' },
      { range: new vscode.Range(2, 0, 2, 11), newText: '    Fill field' },
      // line 3 is already '    Fill field 2', no change
      { range: new vscode.Range(4, 0, 4, 20), newText: '    Fill field 3' },
      { range: new vscode.Range(5, 0, 5, 7), newText: 'DONE.' },
      { range: new vscode.Range(6, 0, 6, 2), newText: '' },
    ])
  })

  it('handles hook blocks [SETUP] and [TEARDOWN]', () => {
    const code = [
      '  [SETUP]',
      'CALL PYTHON helper',
      '   [END SETUP]',
      '[TEARDOWN]',
      '  CALL PYTHON cleanup',
      '[END TEARDOWN]'
    ].join('\n')

    const doc = new MockTextDocument(code)
    const formatter = new HuntDocumentFormatter()
    const edits = formatter.provideDocumentFormattingEdits(doc as any, {} as any, {} as any)

    expect(edits).toEqual([
      { range: new vscode.Range(0, 0, 0, 9), newText: '[SETUP]' },
      { range: new vscode.Range(1, 0, 1, 18), newText: '    CALL PYTHON helper' },
      { range: new vscode.Range(2, 0, 2, 14), newText: '[END SETUP]' },
      // line 3 '[TEARDOWN]' is already 0 indent
      { range: new vscode.Range(4, 0, 4, 21), newText: '    CALL PYTHON cleanup' },
      // line 5 '[END TEARDOWN]' is already 0 indent
    ])
  })

  it('indents comments depending on block scope', () => {
    const code = [
      '  # Top comment',
      'STEP 1: Example',
      '# Inside comment',
      'DONE.',
      '    # Outside comment'
    ].join('\n')

    const doc = new MockTextDocument(code)
    const formatter = new HuntDocumentFormatter()
    const edits = formatter.provideDocumentFormattingEdits(doc as any, {} as any, {} as any)

    expect(edits).toEqual([
      { range: new vscode.Range(0, 0, 0, 15), newText: '# Top comment' },
      { range: new vscode.Range(2, 0, 2, 16), newText: '    # Inside comment' },
      { range: new vscode.Range(4, 0, 4, 21), newText: '# Outside comment' }
    ])
  })

  it('formats IF/ELIF/ELSE headers at 4 spaces and body lines at 8 spaces', () => {
    const code = [
      'STEP 1: Adaptive login',
      "IF button 'SSO Login' exists:",
      "CLICK the 'SSO Login' button",
      "VERIFY that 'SSO Portal' is present",
      "ELIF text 'Sign In' is present:",
      "FILL 'Username' field with '{username}'",
      "CLICK the 'Sign In' button",
      'ELSE:',
      "CLICK the 'Create Account' link",
      'DONE.',
    ].join('\n')

    const doc = new MockTextDocument(code)
    const formatter = new HuntDocumentFormatter()
    const edits = formatter.provideDocumentFormattingEdits(doc as any, {} as any, {} as any)

    // Build the expected formatted document
    const expected = [
      'STEP 1: Adaptive login',
      "    IF button 'SSO Login' exists:",
      "        CLICK the 'SSO Login' button",
      "        VERIFY that 'SSO Portal' is present",
      "    ELIF text 'Sign In' is present:",
      "        FILL 'Username' field with '{username}'",
      "        CLICK the 'Sign In' button",
      '    ELSE:',
      "        CLICK the 'Create Account' link",
      'DONE.',
    ]

    // Apply edits to get the result
    const lines = code.split('\n')
    for (const edit of edits) {
      lines[(edit.range as any).startLine] = edit.newText
    }
    expect(lines).toEqual(expected)
  })

  it('resets conditional indent when action lines return to block level', () => {
    // Pre-formatted input: action line after ELSE body is at 4-space indent
    const code = [
      'STEP 1: Mixed',
      "    IF button 'X' exists:",
      "        CLICK the 'X' button",
      "    ELSE:",
      "        CLICK the 'Y' button",
      "    VERIFY that 'Done' is present",
      'DONE.',
    ].join('\n')

    const doc = new MockTextDocument(code)
    const formatter = new HuntDocumentFormatter()
    const edits = formatter.provideDocumentFormattingEdits(doc as any, {} as any, {} as any)

    const expected = [
      'STEP 1: Mixed',
      "    IF button 'X' exists:",
      "        CLICK the 'X' button",
      '    ELSE:',
      "        CLICK the 'Y' button",
      "    VERIFY that 'Done' is present",
      'DONE.',
    ]

    const lines = code.split('\n')
    for (const edit of edits) {
      lines[(edit.range as any).startLine] = edit.newText
    }
    expect(lines).toEqual(expected)
  })
})
