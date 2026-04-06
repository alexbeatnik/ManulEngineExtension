import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  RE_METADATA,
  RE_HOOK_OPEN,
  RE_HOOK_CLOSE,
  RE_STEP,
  RE_DONE,
  RE_COMMENT,
  PYTHON_ENV_FLAGS,
  VENV_CANDIDATES,
  SHELL_LOOKUP_TIMEOUT_MS,
  LIVE_SCAN_TIMEOUT_MS,
  TERMINAL_NAME,
  DEBUG_TERMINAL_NAME,
  readConfigField,
  getConfigFileName,
} from '../constants'

// ── Regex patterns ──────────────────────────────────────────────────────────

describe('RE_METADATA', () => {
  it('matches all supported metadata directives', () => {
    const directives = [
      '@context:', '@title:', '@blueprint:',
      '@tags:', '@var:', '@script:', '@data:', '@schedule:',
    ]
    for (const d of directives) {
      expect(RE_METADATA.test(d)).toBe(true)
    }
  })

  it('matches with leading whitespace', () => {
    expect(RE_METADATA.test('  @tags: smoke')).toBe(true)
  })

  it('does not match non-metadata lines', () => {
    expect(RE_METADATA.test('Navigate to login')).toBe(false)
    expect(RE_METADATA.test('# comment')).toBe(false)
    expect(RE_METADATA.test('@unknown: something')).toBe(false)
  })
})

describe('RE_HOOK_OPEN', () => {
  it('matches [SETUP] and [TEARDOWN]', () => {
    expect(RE_HOOK_OPEN.test('[SETUP]')).toBe(true)
    expect(RE_HOOK_OPEN.test('[TEARDOWN]')).toBe(true)
  })

  it('matches with leading whitespace', () => {
    expect(RE_HOOK_OPEN.test('  [SETUP]')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(RE_HOOK_OPEN.test('[setup]')).toBe(true)
    expect(RE_HOOK_OPEN.test('[Teardown]')).toBe(true)
  })

  it('does not match end hooks', () => {
    expect(RE_HOOK_OPEN.test('[END SETUP]')).toBe(false)
  })
})

describe('RE_HOOK_CLOSE', () => {
  it('matches [END SETUP] and [END TEARDOWN]', () => {
    expect(RE_HOOK_CLOSE.test('[END SETUP]')).toBe(true)
    expect(RE_HOOK_CLOSE.test('[END TEARDOWN]')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(RE_HOOK_CLOSE.test('[end setup]')).toBe(true)
  })

  it('does not match opening hooks', () => {
    expect(RE_HOOK_CLOSE.test('[SETUP]')).toBe(false)
  })
})

describe('RE_STEP', () => {
  it('matches STEP header lines', () => {
    expect(RE_STEP.test('STEP 1: Click the button')).toBe(true)
    expect(RE_STEP.test('STEP:')).toBe(true)
    expect(RE_STEP.test('  STEP 3: Navigate')).toBe(true)
  })

  it('matches numbered prefix format', () => {
    expect(RE_STEP.test('1. STEP 1: Click')).toBe(true)
  })

  it('does not match non-step lines', () => {
    expect(RE_STEP.test('Click the button')).toBe(false)
    expect(RE_STEP.test('# STEP comment')).toBe(false)
  })
})

describe('RE_DONE', () => {
  it('matches DONE variants', () => {
    expect(RE_DONE.test('DONE.')).toBe(true)
    expect(RE_DONE.test('DONE')).toBe(true)
    expect(RE_DONE.test('  DONE.  ')).toBe(true)
  })

  it('matches numbered prefix', () => {
    expect(RE_DONE.test('5. DONE.')).toBe(true)
  })

  it('does not match DONE inside a sentence', () => {
    expect(RE_DONE.test('DONE with the task')).toBe(false)
  })
})

describe('RE_COMMENT', () => {
  it('matches comment lines', () => {
    expect(RE_COMMENT.test('# This is a comment')).toBe(true)
    expect(RE_COMMENT.test('  # indented comment')).toBe(true)
  })

  it('does not match non-comment lines', () => {
    expect(RE_COMMENT.test('STEP 1: Click')).toBe(false)
    expect(RE_COMMENT.test('Navigate to #anchor')).toBe(false)
  })
})

// ── Plain constants ─────────────────────────────────────────────────────────

describe('constants', () => {
  it('PYTHON_ENV_FLAGS sets PYTHONUNBUFFERED', () => {
    expect(PYTHON_ENV_FLAGS).toEqual({ PYTHONUNBUFFERED: '1' })
  })

  it('VENV_CANDIDATES lists common venv dirs', () => {
    expect(VENV_CANDIDATES).toContain('.venv')
    expect(VENV_CANDIDATES).toContain('venv')
    expect(VENV_CANDIDATES.length).toBeGreaterThanOrEqual(3)
  })

  it('SHELL_LOOKUP_TIMEOUT_MS is a positive number', () => {
    expect(SHELL_LOOKUP_TIMEOUT_MS).toBeGreaterThan(0)
  })

  it('LIVE_SCAN_TIMEOUT_MS is a positive number', () => {
    expect(LIVE_SCAN_TIMEOUT_MS).toBeGreaterThan(0)
  })

  it('terminal names are non-empty strings', () => {
    expect(TERMINAL_NAME.length).toBeGreaterThan(0)
    expect(DEBUG_TERMINAL_NAME.length).toBeGreaterThan(0)
  })
})

// ── readConfigField ─────────────────────────────────────────────────────────

describe('readConfigField', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns default when config file does not exist', () => {
    const result = readConfigField('/nonexistent/path', 'key', 'fallback')
    expect(result).toBe('fallback')
  })

  it('returns the value from a valid config file', () => {
    const fs = require('fs')
    const path = require('path')
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ baseUrl: 'https://example.com' }))
    vi.spyOn(path, 'join').mockReturnValue('/fake/manul_engine_configuration.json')

    const result = readConfigField('/fake', 'baseUrl', '')
    expect(result).toBe('https://example.com')
  })

  it('returns default when the key is missing', () => {
    const fs = require('fs')
    const path = require('path')
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ otherKey: 42 }))
    vi.spyOn(path, 'join').mockReturnValue('/fake/manul_engine_configuration.json')

    const result = readConfigField('/fake', 'missingKey', 'default')
    expect(result).toBe('default')
  })

  it('returns default when value type mismatches', () => {
    const fs = require('fs')
    const path = require('path')
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ count: 'not-a-number' }))
    vi.spyOn(path, 'join').mockReturnValue('/fake/manul_engine_configuration.json')

    const result = readConfigField('/fake', 'count', 42)
    expect(result).toBe(42)
  })

  it('returns default when JSON is malformed', () => {
    const fs = require('fs')
    const path = require('path')
    vi.spyOn(fs, 'readFileSync').mockReturnValue('{invalid json}')
    vi.spyOn(path, 'join').mockReturnValue('/fake/manul_engine_configuration.json')

    const result = readConfigField('/fake', 'key', 'safe')
    expect(result).toBe('safe')
  })
})

// ── getConfigFileName ───────────────────────────────────────────────────────

describe('getConfigFileName', () => {
  it('returns default config filename when vscode setting is empty', () => {
    // The vscode mock returns undefined for all get() calls
    expect(getConfigFileName()).toBe('manul_engine_configuration.json')
  })
})
