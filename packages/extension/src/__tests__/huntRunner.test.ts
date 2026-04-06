import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as vscode from 'vscode'
import * as path from 'path'
import { getBrowserFlags, getHuntBreakpointLines } from '../huntRunner'

describe('huntRunner', () => {
  describe('getBrowserFlags', () => {
    let mockGet: ReturnType<typeof vi.fn>
    let mockInspect: ReturnType<typeof vi.fn>

    beforeEach(() => {
      vi.resetAllMocks()
      mockGet = vi.fn()
      mockInspect = vi.fn().mockReturnValue(undefined)
      
      vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
        get: mockGet,
        inspect: mockInspect,
      } as any)
    })

    it('returns empty when no explicit browser configuration is found', () => {
      const result = getBrowserFlags()
      expect(result.args).toEqual([])
      expect(result.env).toEqual({})
    })

    it('returns WebKit args for webkit', () => {
      mockInspect.mockReturnValue({ workspaceValue: 'webkit' })
      const result = getBrowserFlags()
      expect(result.args).toEqual(['--browser', 'webkit'])
      expect(result.env).toEqual({})
    })

    it('translates chrome into chromium channel', () => {
      mockInspect.mockReturnValue({ globalValue: 'chrome' })
      const result = getBrowserFlags()
      expect(result.args).toEqual(['--browser', 'chromium'])
      expect(result.env).toEqual({ MANUL_CHANNEL: 'chrome' })
    })

    it('translates msedge into chromium channel', () => {
      mockInspect.mockReturnValue({ workspaceFolderValue: 'msedge' })
      const result = getBrowserFlags()
      expect(result.args).toEqual(['--browser', 'chromium'])
      expect(result.env).toEqual({ MANUL_CHANNEL: 'msedge' })
    })

    it('handles electron browser type', () => {
      mockInspect.mockReturnValue({ workspaceValue: 'electron' })
      const result = getBrowserFlags()
      expect(result.args).toEqual(['--browser', 'electron'])
      expect(result.env).toEqual({})
    })
  })

  describe('getHuntBreakpointLines', () => {
    beforeEach(() => {
      vi.resetAllMocks()
    })

    it('returns empty array when there are no breakpoints', () => {
      vscode.debug.breakpoints = []
      const result = getHuntBreakpointLines('/mock/test.hunt')
      expect(result).toEqual([])
    })

    it('returns only enabled SourceBreakpoints matching the file', () => {
      const mockUri = vscode.Uri.file('/mock/test.hunt')
      const mockOtherUri = vscode.Uri.file('/mock/other.hunt')

      class MockSourceBreakpoint {
        constructor(
          public enabled: boolean,
          public location: { uri: any, range: { start: { line: number } } }
        ) {}
      }
      
      // Make it pass the `instanceof vscode.SourceBreakpoint` check
      Object.defineProperty(vscode, 'SourceBreakpoint', {
        value: MockSourceBreakpoint,
        writable: true
      })

      vscode.debug.breakpoints = [
        new MockSourceBreakpoint(true, { uri: mockUri, range: { start: { line: 5 } } }) as any,     // Line 6 (1-indexed)
        new MockSourceBreakpoint(false, { uri: mockUri, range: { start: { line: 10 } } }) as any,   // Disabled
        new MockSourceBreakpoint(true, { uri: mockOtherUri, range: { start: { line: 2 } } }) as any,// Wrong file
        new MockSourceBreakpoint(true, { uri: mockUri, range: { start: { line: 15 } } }) as any,    // Line 16
        { enabled: true } as any // Not a SourceBreakpoint
      ]

      const result = getHuntBreakpointLines('/mock/test.hunt')
      expect(result).toEqual([6, 16])
    })
  })
})
