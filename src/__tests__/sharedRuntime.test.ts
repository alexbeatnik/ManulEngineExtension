import { describe, it, expect } from 'vitest'
import {
  parseEngineLogLine,
  parseVersion,
  compareVersions,
  MANUL_DSL_COMMANDS,
  MANUL_DSL_CONTRACT,
  getManulDslContextSuggestions,
  MIN_MANUL_ENGINE_VERSION,
  DEFAULT_CONFIG_FILENAME,
  PAUSE_MARKER,
  STEP_LINE_RE,
  FAIL_LINE_RE,
  BLOCK_LOG_RE,
  validateHuntDocument,
} from '../shared'

// ── parseEngineLogLine ──────────────────────────────────────────────────────

describe('parseEngineLogLine', () => {
  it('returns null for non-block lines', () => {
    expect(parseEngineLogLine('Hello world')).toBeNull()
    expect(parseEngineLogLine('STEP 1: Click button')).toBeNull()
    expect(parseEngineLogLine('')).toBeNull()
  })

  it('parses BLOCK START lines', () => {
    const result = parseEngineLogLine('[BLOCK START] Login flow')
    expect(result).toEqual({ id: 'Login flow', status: 'running' })
  })

  it('parses BLOCK PASS lines', () => {
    const result = parseEngineLogLine('[BLOCK PASS] Login flow')
    expect(result).toEqual({ id: 'Login flow', status: 'pass' })
  })

  it('parses BLOCK FAIL lines', () => {
    const result = parseEngineLogLine('[BLOCK FAIL] Checkout step')
    expect(result).toEqual({ id: 'Checkout step', status: 'fail' })
  })

  it('handles prefixed block lines (e.g. timestamps)', () => {
    const result = parseEngineLogLine('  [INFO BLOCK START] Setup phase')
    expect(result).toEqual({ id: 'Setup phase', status: 'running' })
  })

  it('is case-insensitive for marker keywords', () => {
    const result = parseEngineLogLine('[block pass] My Test')
    expect(result).toEqual({ id: 'My Test', status: 'pass' })
  })

  it('trims whitespace from block IDs', () => {
    const result = parseEngineLogLine('[BLOCK START]   Padded name   ')
    expect(result).toEqual({ id: 'Padded name', status: 'running' })
  })
})

// ── parseVersion ────────────────────────────────────────────────────────────

describe('parseVersion', () => {
  it('parses a 3-segment version', () => {
    expect(parseVersion('1.2.3')).toEqual([1, 2, 3])
  })

  it('parses a 4-segment version', () => {
    expect(parseVersion('0.0.9.10')).toEqual([0, 0, 9, 10])
  })

  it('parses a 2-segment version', () => {
    expect(parseVersion('3.5')).toEqual([3, 5])
  })

  it('strips leading v prefix', () => {
    expect(parseVersion('v1.2.3')).toEqual([1, 2, 3])
    expect(parseVersion('V0.0.9.10')).toEqual([0, 0, 9, 10])
  })

  it('treats non-numeric segments as 0', () => {
    expect(parseVersion('1.beta.3')).toEqual([1, 0, 3])
  })
})

// ── compareVersions ─────────────────────────────────────────────────────────

describe('compareVersions', () => {
  it('returns 0 for equal versions', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('0.0.9.10', '0.0.9.10')).toBe(0)
  })

  it('returns negative when a < b', () => {
    expect(compareVersions('0.0.9', '0.0.10')).toBeLessThan(0)
    expect(compareVersions('1.0.0', '2.0.0')).toBeLessThan(0)
    expect(compareVersions('0.0.9.9', '0.0.9.10')).toBeLessThan(0)
  })

  it('returns positive when a > b', () => {
    expect(compareVersions('2.0.0', '1.0.0')).toBeGreaterThan(0)
    expect(compareVersions('0.0.10', '0.0.9')).toBeGreaterThan(0)
    expect(compareVersions('0.0.9.10', '0.0.9.9')).toBeGreaterThan(0)
  })

  it('handles different-length version strings', () => {
    expect(compareVersions('1.0', '1.0.0')).toBe(0)
    expect(compareVersions('1.0.1', '1.0')).toBeGreaterThan(0)
  })

  it('strips v prefix before comparing', () => {
    expect(compareVersions('v1.0.0', '1.0.0')).toBe(0)
  })
})

// ── MANUL_DSL_COMMANDS contract integrity ───────────────────────────────────

describe('MANUL_DSL_COMMANDS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(MANUL_DSL_COMMANDS)).toBe(true)
    expect(MANUL_DSL_COMMANDS.length).toBeGreaterThan(0)
  })

  it('has unique IDs', () => {
    const ids = MANUL_DSL_COMMANDS.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has unique labels', () => {
    const labels = MANUL_DSL_COMMANDS.map((c) => c.label)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('every command has all required fields', () => {
    for (const cmd of MANUL_DSL_COMMANDS) {
      expect(cmd.id).toBeTruthy()
      expect(cmd.label).toBeTruthy()
      expect(cmd.icon).toBeTruthy()
      expect(typeof cmd.uiText).toBe('string')
      expect(cmd.snippet).toBeTruthy()
      expect(cmd.description).toBeTruthy()
      expect(cmd.example).toBeTruthy()
    }
  })

  it('snippet contains the label keyword or a recognizable command keyword', () => {
    for (const cmd of MANUL_DSL_COMMANDS) {
      // Each snippet should contain at least one meaningful word from the label or uiText
      const combinedText = `${cmd.snippet} ${cmd.uiText}`.toLowerCase()
      // At minimum, the snippet should not be empty
      expect(cmd.snippet.length).toBeGreaterThan(0)
      // The snippet should share at least one word with the uiText
      const snippetWords = cmd.snippet.replace(/\$\{[^}]*\}/g, '').trim().split(/\s+/)
      const uiWords = cmd.uiText.replace(/'/g, '').trim().split(/\s+/)
      const overlap = snippetWords.some((w) =>
        uiWords.some((u) => u.toLowerCase() === w.toLowerCase())
      )
      expect(overlap).toBe(true)
    }
  })

  it('includes the essential commands', () => {
    const ids = new Set(MANUL_DSL_COMMANDS.map((c) => c.id))
    const essentials = [
      'navigate', 'open-app', 'click', 'fill-field', 'verify',
      'verify-text-strict', 'verify-placeholder', 'verify-value',
      'wait', 'wait-for-element', 'call-python', 'done', 'debug', 'debug-vars', 'extract',
    ]
    for (const id of essentials) {
      expect(ids.has(id)).toBe(true)
    }
  })
})

describe('getManulDslContextSuggestions', () => {
  it('suggests NEAR, ON, and INSIDE after click steps', () => {
    expect(getManulDslContextSuggestions("Click 'Save' button ").map((item) => item.label)).toEqual([
      'NEAR',
      'ON',
      'INSIDE',
    ])
  })

  it('suggests NEAR and INSIDE after fill steps', () => {
    expect(getManulDslContextSuggestions("Fill 'Email' ").map((item) => item.label)).toEqual([
      'NEAR',
      'INSIDE',
    ])
    expect(getManulDslContextSuggestions("Fill 'Email' field with 'alex@example.com' ").map((item) => item.label)).toEqual([
      'NEAR',
      'INSIDE',
    ])
  })

  it('suggests WITH after INSIDE row context', () => {
    expect(getManulDslContextSuggestions("Click 'Delete' button INSIDE 'Actions' row ").map((item) => item.label)).toEqual([
      'WITH',
    ])
  })

  it('returns no contextual suggestions for unrelated text', () => {
    expect(getManulDslContextSuggestions('VERIFY that ')).toEqual([])
  })

  it('suggests NEAR, ON, and INSIDE after verify steps', () => {
    expect(getManulDslContextSuggestions("VERIFY that 'Dashboard' is present ").map((item) => item.label)).toEqual([
      'NEAR',
      'ON',
      'INSIDE',
    ])
    expect(getManulDslContextSuggestions("Verify 'Search' field has value 'Alex' ").map((item) => item.label)).toEqual([
      'NEAR',
      'ON',
      'INSIDE',
    ])
  })
})

// ── Regex constants ─────────────────────────────────────────────────────────

describe('STEP_LINE_RE', () => {
  it('matches standard step lines', () => {
    const match = 'STEP 1: Navigate to login'.match(STEP_LINE_RE)
    expect(match).not.toBeNull()
    expect(match![1]).toBe('STEP 1')
    expect(match![2]).toBe('Navigate to login')
  })

  it('matches step lines with bracket prefixes', () => {
    const match = '[INFO STEP 3 @plan]: Click button'.match(STEP_LINE_RE)
    expect(match).not.toBeNull()
    expect(match![1]).toBe('STEP 3')
  })
})

describe('FAIL_LINE_RE', () => {
  it('matches failure indicators', () => {
    expect(FAIL_LINE_RE.test('❌ Test failed')).toBe(true)
    expect(FAIL_LINE_RE.test('FAILED at step 2')).toBe(true)
    expect(FAIL_LINE_RE.test('ERROR: timeout')).toBe(true)
  })

  it('does not match success lines', () => {
    expect(FAIL_LINE_RE.test('✅ All passed')).toBe(false)
    expect(FAIL_LINE_RE.test('OK')).toBe(false)
  })
})

// ── Constants ───────────────────────────────────────────────────────────────

describe('constants', () => {
  it('MIN_MANUL_ENGINE_VERSION is a valid version', () => {
    const parts = parseVersion(MIN_MANUL_ENGINE_VERSION)
    expect(parts.length).toBeGreaterThanOrEqual(2)
    expect(parts.every((n) => typeof n === 'number' && n >= 0)).toBe(true)
  })

  it('DEFAULT_CONFIG_FILENAME ends with .json', () => {
    expect(DEFAULT_CONFIG_FILENAME.endsWith('.json')).toBe(true)
  })

  it('PAUSE_MARKER contains the expected protocol string', () => {
    expect(PAUSE_MARKER).toContain('MANUL_DEBUG_PAUSE')
  })

  it('BLOCK_LOG_RE matches the expected format', () => {
    expect(BLOCK_LOG_RE.test('[BLOCK START] test')).toBe(true)
    expect(BLOCK_LOG_RE.test('[BLOCK PASS] test')).toBe(true)
    expect(BLOCK_LOG_RE.test('[BLOCK FAIL] test')).toBe(true)
    expect(BLOCK_LOG_RE.test('not a block line')).toBe(false)
  })

  it('shared contract version stays aligned with the runtime pin', () => {
    expect(MANUL_DSL_CONTRACT.version).toBe(MIN_MANUL_ENGINE_VERSION)
  })
})

describe('validateHuntDocument', () => {
  it('accepts contract-backed click variants with contextual qualifiers', () => {
    const diagnostics = validateHuntDocument([
      "STEP 1: Product actions",
      "    Click 'Add to cart' NEAR 'Sauce Labs Backpack'",
      "    Click the 'Menu' button ON HEADER",
      "    Click the 'Delete' button INSIDE 'Actions' row with 'John Doe'",
      'DONE.',
    ].join('\n'))

    expect(diagnostics).toEqual([])
  })

  it('accepts Type and Verify forms from the parser contract', () => {
    const diagnostics = validateHuntDocument([
      'STEP 1: Login',
      "    Type 'alex@example.com' into 'Email'",
      "    VERIFY that 'Dashboard' is present",
      "    Verify 'Email' field has value 'alex@example.com'",
      "    VERIFY VISUAL 'Hero banner'",
      'DONE.',
    ].join('\n'))

    expect(diagnostics).toEqual([])
  })

  it('accepts CALL PYTHON alias and capture variants', () => {
    const diagnostics = validateHuntDocument([
      '@script: {auth} = scripts.auth_helpers',
      '@script: {issue_token} = scripts.auth_helpers.issue_token',
      'STEP 1: Auth',
      "    CALL PYTHON {auth}.issue_token with args: '{email}' into {token}",
      "    CALL PYTHON {issue_token} with args: '{email}' into {token}",
      '    CALL PYTHON scripts.helpers.issue_token',
      'DONE.',
    ].join('\n'))

    expect(diagnostics).toEqual([])
  })

  it('accepts supported hook block commands and rejects unsupported ones', () => {
    const validDiagnostics = validateHuntDocument([
      '@script: {bootstrap} = scripts.helpers.bootstrap',
      '[SETUP]',
      '    PRINT "Preparing setup"',
      '    CALL PYTHON {bootstrap}',
      '[END SETUP]',
    ].join('\n'))
    const invalidDiagnostics = validateHuntDocument([
      '[SETUP]',
      "    Click 'Login' button",
      '[END SETUP]',
    ].join('\n'))

    expect(validDiagnostics).toEqual([])
    expect(invalidDiagnostics).toHaveLength(1)
    expect(invalidDiagnostics[0].code).toBe('invalid-hook-block')
  })

  it('reports malformed commands', () => {
    const diagnostics = validateHuntDocument([
      'STEP 1: Broken line',
      '    Do the impossible thing',
      'DONE.',
    ].join('\n'))

    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0].code).toBe('invalid-command')
  })

  it('accepts well-formed IF/ELIF/ELSE blocks without diagnostics', () => {
    const diagnostics = validateHuntDocument([
      'STEP 1: Conditional',
      "    IF button 'Save' exists:",
      "        CLICK the 'Save' button",
      "    ELIF text 'Error' is present:",
      "        VERIFY that 'Error' is present",
      '    ELSE:',
      "        VERIFY that 'Fallback' is present",
      'DONE.',
    ].join('\n'))

    expect(diagnostics).toEqual([])
  })

  it('reports IF missing trailing colon', () => {
    const diagnostics = validateHuntDocument([
      "IF button 'Save' exists",
      "    CLICK the 'Save' button",
      'DONE.',
    ].join('\n'))

    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0].code).toBe('invalid-conditional')
    expect(diagnostics[0].message).toContain('must end with a colon')
  })

  it('reports ELIF missing trailing colon', () => {
    const diagnostics = validateHuntDocument([
      "IF button 'Save' exists:",
      "    CLICK the 'Save' button",
      "ELIF text 'Error' is present",
      "    VERIFY that 'Error' is present",
      'DONE.',
    ].join('\n'))

    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0].code).toBe('invalid-conditional')
  })

  it('reports malformed ELSE with extra text', () => {
    const diagnostics = validateHuntDocument([
      "IF button 'Save' exists:",
      "    CLICK the 'Save' button",
      'ELSE something',
      'DONE.',
    ].join('\n'))

    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0].code).toBe('invalid-conditional')
    expect(diagnostics[0].message).toContain('ELSE')
  })

  it('reports orphaned ELIF without preceding IF', () => {
    const diagnostics = validateHuntDocument([
      "ELIF text 'Error' is present:",
      "    VERIFY that 'Error' is present",
      'DONE.',
    ].join('\n'))

    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0].code).toBe('orphaned-branch')
    expect(diagnostics[0].message).toContain('ELIF must follow')
  })

  it('reports orphaned ELSE without preceding IF', () => {
    const diagnostics = validateHuntDocument([
      'ELSE:',
      "    VERIFY that 'Fallback' is present",
      'DONE.',
    ].join('\n'))

    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0].code).toBe('orphaned-branch')
    expect(diagnostics[0].message).toContain('ELSE must follow')
  })

  it('reports ELIF after ELSE', () => {
    const diagnostics = validateHuntDocument([
      "IF button 'X' exists:",
      "    CLICK the 'X' button",
      'ELSE:',
      "    VERIFY that 'a' is present",
      "ELIF text 'b' is present:",
      "    VERIFY that 'b' is present",
      'DONE.',
    ].join('\n'))

    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0].code).toBe('orphaned-branch')
  })

  it('reports duplicate ELSE in the same block', () => {
    const diagnostics = validateHuntDocument([
      "IF button 'X' exists:",
      "    CLICK the 'X' button",
      'ELSE:',
      "    VERIFY that 'a' is present",
      'ELSE:',
      "    VERIFY that 'b' is present",
      'DONE.',
    ].join('\n'))

    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0].code).toBe('orphaned-branch')
  })

  it('handles nested IF/ELIF/ELSE without false positives', () => {
    const diagnostics = validateHuntDocument([
      "STEP 1: nested conditionals",
      "    IF button 'Save' exists:",
      "        CLICK the 'Save' button",
      "        IF text 'Are you sure?' is present:",
      "            CLICK the 'Confirm' button",
      "        ELSE:",
      "            VERIFY that 'Saved' is present",
      "    ELIF button 'Submit' exists:",
      "        CLICK the 'Submit' button",
      "    ELSE:",
      "        VERIFY that 'No action' is present",
      'DONE.',
    ].join('\n'))

    expect(diagnostics).toHaveLength(0)
  })

  it('detects orphaned ELIF in nested block', () => {
    const diagnostics = validateHuntDocument([
      "STEP 1: nested orphan",
      "    IF button 'A' exists:",
      "        IF text 'B' is present:",
      "            CLICK the 'B' button",
      "        ELSE:",
      "            VERIFY that 'C' is present",
      "        ELIF text 'D' is present:",
      "            VERIFY that 'D' is present",
      'DONE.',
    ].join('\n'))

    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0].code).toBe('orphaned-branch')
    expect(diagnostics[0].line).toBe(7)
  })
})
