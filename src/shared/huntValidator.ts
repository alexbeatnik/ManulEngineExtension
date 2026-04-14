import manulDslContractJson from './manul-dsl-contract.json'

export type ManulDslContract = typeof manulDslContractJson
export const MANUL_DSL_CONTRACT: ManulDslContract = manulDslContractJson

export type HuntValidationDiagnosticCode =
  | 'invalid-command'
  | 'invalid-hook-block'
  | 'hook-mismatch'
  | 'unclosed-hook-block'
  | 'invalid-conditional'
  | 'orphaned-branch'
  | 'invalid-loop'

export interface HuntValidationDiagnostic {
  line: number
  startColumn: number
  endColumn: number
  message: string
  code: HuntValidationDiagnosticCode
}

type HookBlockState = {
  closeTag: string
  line: number
}

const QUOTED_FRAGMENT_PATTERN = String.raw`(?:'[^'\n]*'|"[^"\n]*")`
const QUOTED_FRAGMENT_RE = new RegExp(QUOTED_FRAGMENT_PATTERN, 'g')
const NUMBERED_PREFIX_RE = /^\s*(?:\d+\.\s*)?/
const TRAILING_PERIOD_RE = /\s*\.\s*$/
const VERIFY_STATE_RE = /(present|NOT\s+present|ENABLED|DISABLED|checked|NOT\s+checked)$/i
const STRICT_VERIFY_RE = new RegExp(
  String.raw`^VERIFY\s+${QUOTED_FRAGMENT_PATTERN}\s+(button|field|element|input)\s+HAS\s+(TEXT|PLACEHOLDER|VALUE)\s+${QUOTED_FRAGMENT_PATTERN}$`,
  'i',
)
const WAIT_FOR_ELEMENT_RE = new RegExp(
  String.raw`^WAIT\s+FOR\s+${QUOTED_FRAGMENT_PATTERN}\s+TO\s+(BE\s+(VISIBLE|HIDDEN)|DISAPPEAR)$`,
  'i',
)
const WAIT_FOR_RESPONSE_RE = new RegExp(
  String.raw`^WAIT\s+FOR\s+RESPONSE\s+${QUOTED_FRAGMENT_PATTERN}$`,
  'i',
)
const EXTRACT_RE = new RegExp(
  String.raw`^EXTRACT\s+the\s+${QUOTED_FRAGMENT_PATTERN}\s+into\s+\{[A-Za-z_]\w*\}$`,
  'i',
)
const SET_RE = /^SET\s+(\{[A-Za-z_]\w*\}|[A-Za-z_]\w*)\s*=\s*.+$/i
const MOCK_RE = new RegExp(
  String.raw`^MOCK\s+(GET|POST|PUT|PATCH|DELETE)\s+${QUOTED_FRAGMENT_PATTERN}\s+with\s+${QUOTED_FRAGMENT_PATTERN}$`,
  'i',
)
const UPLOAD_RE = new RegExp(
  String.raw`^UPLOAD\s+${QUOTED_FRAGMENT_PATTERN}\s+to\s+${QUOTED_FRAGMENT_PATTERN}$`,
  'i',
)
const PRESS_RE = new RegExp(
  String.raw`^PRESS\s+[A-Za-z0-9+_\-]+(?:\s+on\s+${QUOTED_FRAGMENT_PATTERN})?$`,
  'i',
)
const CALL_PYTHON_TARGET_RE = /^(\{[A-Za-z_]\w*\}(\.[A-Za-z_]\w*)?|[A-Za-z_]\w*(\.[A-Za-z_]\w*)+)(?=\s|$)/i
const CONTEXTUAL_SUFFIX_RE = new RegExp(
  String.raw`\s+(?:NEAR\s+${QUOTED_FRAGMENT_PATTERN}|ON\s+(HEADER|FOOTER)|INSIDE\s+${QUOTED_FRAGMENT_PATTERN}\s+row\s+with\s+${QUOTED_FRAGMENT_PATTERN})\s*$`,
  'i',
)

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildAlternation(values: string[]): string {
  return values.map(escapeRegExp).join('|')
}

export const RE_METADATA = new RegExp(
  `^\\s*(?:${buildAlternation([
    ...MANUL_DSL_CONTRACT.metadata.map((item) => item.label),
    '@blueprint:',
  ])})`,
  'i',
)

export const RE_HOOK_OPEN = new RegExp(
  `^\\s*(?:${buildAlternation(MANUL_DSL_CONTRACT.hookBlocks.map((item) => item.openTag))})\\s*$`,
  'i',
)

export const RE_HOOK_CLOSE = new RegExp(
  `^\\s*(?:${buildAlternation(MANUL_DSL_CONTRACT.hookBlocks.map((item) => item.closeTag))})\\s*$`,
  'i',
)

export const RE_STEP = /^\s*(?:\d+\.\s*)?STEP\s*\d*\s*:/i
export const RE_DONE = /^\s*(?:\d+\.\s*)?DONE\s*\.?\s*$/i
export const RE_COMMENT = new RegExp(`^\\s*${escapeRegExp(MANUL_DSL_CONTRACT.comments.lineComment)}`)
export const RE_IF = /^\s*(?:\d+\.\s*)?IF\b.+:\s*$/i
export const RE_ELIF = /^\s*(?:\d+\.\s*)?ELIF\b.+:\s*$/i
export const RE_ELSE = /^\s*(?:\d+\.\s*)?ELSE\s*:\s*$/i
export const RE_REPEAT = /^\s*(?:\d+\.\s*)?REPEAT\s+\d+\s+TIMES\s*:\s*$/i
export const RE_FOR_EACH = /^\s*(?:\d+\.\s*)?FOR\s+EACH\s+\{?\w+\}?\s+IN\s+\{?\w+\}?\s*:\s*$/i
export const RE_WHILE = /^\s*(?:\d+\.\s*)?WHILE\b.+:\s*$/i

/** Matches IF/ELIF without trailing colon — used for helpful diagnostics. */
const RE_IF_NO_COLON = /^\s*(?:\d+\.\s*)?IF\b.+[^:\s]\s*$/i
const RE_ELIF_NO_COLON = /^\s*(?:\d+\.\s*)?ELIF\b.+[^:\s]\s*$/i
const RE_ELSE_MALFORMED = /^\s*(?:\d+\.\s*)?ELSE\b(?!\s*:).*/i

/** Matches loop headers without trailing colon — used for helpful diagnostics. */
const RE_REPEAT_NO_COLON = /^\s*(?:\d+\.\s*)?REPEAT\s+\d+\s+TIMES\s*$/i
const RE_FOR_EACH_NO_COLON = /^\s*(?:\d+\.\s*)?FOR\s+EACH\s+\{?\w+\}?\s+IN\s+\{?\w+\}?\s*$/i
const RE_WHILE_NO_COLON = /^\s*(?:\d+\.\s*)?WHILE\b.+[^:\s]\s*$/i

function countQuotedFragments(line: string): number {
  return line.match(QUOTED_FRAGMENT_RE)?.length ?? 0
}

function startsWithWord(line: string, word: string): boolean {
  return new RegExp(`^${escapeRegExp(word)}\\b`, 'i').test(line)
}

function normalizeActionLine(line: string): string {
  let normalized = line.replace(NUMBERED_PREFIX_RE, '').trim()

  while (true) {
    const stripped = normalized.replace(CONTEXTUAL_SUFFIX_RE, '').trimEnd()
    if (stripped === normalized) {
      break
    }
    normalized = stripped
  }

  return normalized.replace(TRAILING_PERIOD_RE, '').trimEnd()
}

function isCallPythonLine(line: string): boolean {
  const normalized = normalizeActionLine(line)
  const match = normalized.match(/^CALL\s+PYTHON\s+(.+)$/i)
  if (!match) {
    return false
  }

  return CALL_PYTHON_TARGET_RE.test(match[1].trim())
}

function isPrintLine(line: string): boolean {
  return /^PRINT\s+.+$/i.test(normalizeActionLine(line))
}

function isClickLikeLine(line: string): boolean {
  const normalized = normalizeActionLine(line)
  return startsWithWord(normalized, 'Click') && countQuotedFragments(normalized) >= 1
}

function isDoubleClickLine(line: string): boolean {
  const normalized = normalizeActionLine(line)
  return /^DOUBLE\s+CLICK\b/i.test(normalized) && countQuotedFragments(normalized) >= 1
}

function isCheckLine(line: string): boolean {
  const normalized = normalizeActionLine(line)
  return startsWithWord(normalized, 'Check') && countQuotedFragments(normalized) >= 1
}

function isUncheckLine(line: string): boolean {
  const normalized = normalizeActionLine(line)
  return startsWithWord(normalized, 'Uncheck') && countQuotedFragments(normalized) >= 1
}

function isFillLine(line: string): boolean {
  const normalized = normalizeActionLine(line)
  return startsWithWord(normalized, 'Fill') && /\bwith\b/i.test(normalized) && countQuotedFragments(normalized) >= 2
}

function isTypeLine(line: string): boolean {
  const normalized = normalizeActionLine(line)
  return startsWithWord(normalized, 'Type') && /\binto\b/i.test(normalized) && countQuotedFragments(normalized) >= 2
}

function isSelectLine(line: string): boolean {
  const normalized = normalizeActionLine(line)
  return /^(Select|Choose)\b/i.test(normalized) && /\bfrom\b/i.test(normalized) && countQuotedFragments(normalized) >= 2
}

function isHoverLine(line: string): boolean {
  const normalized = normalizeActionLine(line)
  return /^HOVER\b/i.test(normalized) && countQuotedFragments(normalized) >= 1
}

function isDragLine(line: string): boolean {
  const normalized = normalizeActionLine(line)
  return startsWithWord(normalized, 'Drag') && /\bdrop\b/i.test(normalized) && countQuotedFragments(normalized) >= 2
}

function isNavigateLine(line: string): boolean {
  return /^NAVIGATE\s+to\s+.+$/i.test(normalizeActionLine(line))
}

function isOpenAppLine(line: string): boolean {
  return /^OPEN\s+APP$/i.test(normalizeActionLine(line))
}

function isScrollLine(line: string): boolean {
  return /^SCROLL\s+DOWN(?:\s+inside(?:\s+the)?\s+.+)?$/i.test(normalizeActionLine(line))
}

function isWaitLine(line: string): boolean {
  const normalized = normalizeActionLine(line)
  if (WAIT_FOR_RESPONSE_RE.test(normalized) || WAIT_FOR_ELEMENT_RE.test(normalized)) {
    return true
  }

  return /^WAIT\s+\d+(\.\d+)?$/i.test(normalized)
}

function isExtractLine(line: string): boolean {
  return EXTRACT_RE.test(normalizeActionLine(line))
}

function isVerifyLine(line: string): boolean {
  const normalized = normalizeActionLine(line)

  if (/^VERIFY\s+VISUAL\b/i.test(normalized)) {
    return countQuotedFragments(normalized) >= 1
  }

  if (STRICT_VERIFY_RE.test(normalized)) {
    return true
  }

  if (!/^VERIFY(?:\s+SOFTLY)?\s+that\b/i.test(normalized)) {
    return false
  }

  return countQuotedFragments(normalized) >= 1 && VERIFY_STATE_RE.test(normalized)
}

function isPressLine(line: string): boolean {
  const normalized = normalizeActionLine(line)
  return /^PRESS\s+ENTER$/i.test(normalized) || PRESS_RE.test(normalized)
}

function isRightClickLine(line: string): boolean {
  const normalized = normalizeActionLine(line)
  return /^RIGHT\s+CLICK\b/i.test(normalized) && countQuotedFragments(normalized) >= 1
}

function isUploadLine(line: string): boolean {
  return UPLOAD_RE.test(normalizeActionLine(line))
}

function isMockLine(line: string): boolean {
  return MOCK_RE.test(normalizeActionLine(line))
}

function isScanPageLine(line: string): boolean {
  return /^SCAN\s+PAGE(?:\s+into\s+\{[^}\n]+\})?$/i.test(normalizeActionLine(line))
}

function isSetLine(line: string): boolean {
  return SET_RE.test(normalizeActionLine(line))
}

function isDebugVarsLine(line: string): boolean {
  return /^DEBUG\s+VARS$/i.test(normalizeActionLine(line))
}

function isDebugLine(line: string): boolean {
  return /^(DEBUG|PAUSE)$/i.test(normalizeActionLine(line))
}

export function isValidHuntActionLine(line: string, options: { insideHookBlock?: boolean } = {}): boolean {
  if (options.insideHookBlock) {
    return isPrintLine(line) || isCallPythonLine(line)
  }

  return [
    isNavigateLine,
    isOpenAppLine,
    isClickLikeLine,
    isDoubleClickLine,
    isCheckLine,
    isUncheckLine,
    isFillLine,
    isTypeLine,
    isSelectLine,
    isHoverLine,
    isDragLine,
    isScrollLine,
    isWaitLine,
    isExtractLine,
    isVerifyLine,
    isPressLine,
    isRightClickLine,
    isUploadLine,
    isMockLine,
    isScanPageLine,
    isCallPythonLine,
    isSetLine,
    isDebugVarsLine,
    isDebugLine,
  ].some((validate) => validate(line))
}

function makeDiagnostic(
  lineNumber: number,
  lineText: string,
  message: string,
  code: HuntValidationDiagnosticCode,
): HuntValidationDiagnostic {
  const firstNonWhitespace = lineText.search(/\S/)
  const startColumn = firstNonWhitespace >= 0 ? firstNonWhitespace + 1 : 1
  const endColumn = Math.max(startColumn + 1, lineText.length + 1)

  return {
    line: lineNumber,
    startColumn,
    endColumn,
    message,
    code,
  }
}

type ConditionalState = 'if' | 'elif' | 'else'
type ConditionalFrame = { state: ConditionalState; indent: number }

function indentLevel(line: string): number {
  const match = line.match(/^(\s*)/)
  return match ? match[1].length : 0
}

export function validateHuntDocument(content: string): HuntValidationDiagnostic[] {
  const diagnostics: HuntValidationDiagnostic[] = []
  const lines = content.split(/\r?\n/)
  let hookState: HookBlockState | null = null
  const conditionalStack: ConditionalFrame[] = []

  function currentConditional(indent: number): ConditionalFrame | null {
    for (let i = conditionalStack.length - 1; i >= 0; i--) {
      if (conditionalStack[i].indent === indent) {
        return conditionalStack[i]
      }
      if (conditionalStack[i].indent < indent) {
        return null
      }
    }
    return null
  }

  function setConditional(indent: number, state: ConditionalState): void {
    // Remove any frames with indent strictly greater than current (deeper nested blocks that ended)
    while (conditionalStack.length > 0 && conditionalStack[conditionalStack.length - 1].indent > indent) {
      conditionalStack.pop()
    }
    const existing = conditionalStack.length > 0 && conditionalStack[conditionalStack.length - 1].indent === indent
      ? conditionalStack[conditionalStack.length - 1]
      : null
    if (existing) {
      existing.state = state
    } else {
      conditionalStack.push({ state, indent })
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1
    const line = lines[index]
    const trimmed = line.trim()

    if (!trimmed || RE_COMMENT.test(line) || RE_METADATA.test(line)) {
      continue
    }

    if (RE_STEP.test(line) || RE_DONE.test(line)) {
      conditionalStack.length = 0
      continue
    }

    const indent = indentLevel(line)

    // ── Hook block open/close must be checked before conditionals ────────
    if (RE_HOOK_OPEN.test(line)) {
      conditionalStack.length = 0
      if (hookState) {
        diagnostics.push(
          makeDiagnostic(lineNumber, line, 'Nested hook blocks are not supported.', 'invalid-hook-block'),
        )
        continue
      }

      const hook = MANUL_DSL_CONTRACT.hookBlocks.find((item) => new RegExp(`^\\s*${escapeRegExp(item.openTag)}\\s*$`, 'i').test(line))
      if (hook) {
        hookState = { closeTag: hook.closeTag, line: lineNumber }
      }
      continue
    }

    if (RE_HOOK_CLOSE.test(line)) {
      conditionalStack.length = 0
      if (!hookState) {
        diagnostics.push(
          makeDiagnostic(lineNumber, line, 'Hook block closing tag does not match any open hook block.', 'hook-mismatch'),
        )
        continue
      }

      if (!new RegExp(`^\\s*${escapeRegExp(hookState.closeTag)}\\s*$`, 'i').test(line)) {
        diagnostics.push(
          makeDiagnostic(lineNumber, line, `Expected ${hookState.closeTag} before closing the hook block.`, 'hook-mismatch'),
        )
        continue
      }

      hookState = null
      continue
    }

    // ── Well-formed IF/ELIF/ELSE — validate structural ordering ──────────
    // Conditionals are not allowed inside hook blocks; skip and let them
    // fall through to isValidHuntActionLine() which rejects them.
    if (!hookState) {
      if (RE_IF.test(line)) {
        setConditional(indent, 'if')
        continue
      }

      if (RE_ELIF.test(line)) {
        const frame = currentConditional(indent)
        if (!frame || frame.state === 'else') {
          diagnostics.push(
            makeDiagnostic(lineNumber, line, 'ELIF must follow an IF or another ELIF block.', 'orphaned-branch'),
          )
        }
        setConditional(indent, 'elif')
        continue
      }

      if (RE_ELSE.test(line)) {
        const frame = currentConditional(indent)
        if (!frame || frame.state === 'else') {
          diagnostics.push(
            makeDiagnostic(lineNumber, line, 'ELSE must follow an IF or ELIF block.', 'orphaned-branch'),
          )
        }
        setConditional(indent, 'else')
        continue
      }

      // ── Malformed conditionals — missing colon ──────────────────────────
      if (RE_IF_NO_COLON.test(line)) {
        diagnostics.push(
          makeDiagnostic(lineNumber, line, 'IF condition must end with a colon. Example: IF button \'Save\' exists:', 'invalid-conditional'),
        )
        setConditional(indent, 'if')
        continue
      }

      if (RE_ELIF_NO_COLON.test(line)) {
        diagnostics.push(
          makeDiagnostic(lineNumber, line, 'ELIF condition must end with a colon. Example: ELIF text \'Error\' is present:', 'invalid-conditional'),
        )
        setConditional(indent, 'elif')
        continue
      }

      if (RE_ELSE_MALFORMED.test(line)) {
        diagnostics.push(
          makeDiagnostic(lineNumber, line, 'ELSE must be followed by a colon and nothing else. Example: ELSE:', 'invalid-conditional'),
        )
        setConditional(indent, 'else')
        continue
      }

      // ── Well-formed loop headers ────────────────────────────────────────
      if (RE_REPEAT.test(line) || RE_FOR_EACH.test(line) || RE_WHILE.test(line)) {
        // Loops create a block scope like IF — push onto the conditional
        // stack so body lines get deeper indent and the frame is popped
        // when indent returns to the header level.
        setConditional(indent, 'if')
        continue
      }

      // ── Malformed loops — missing colon ─────────────────────────────────
      if (RE_REPEAT_NO_COLON.test(line)) {
        diagnostics.push(
          makeDiagnostic(lineNumber, line, 'REPEAT loop must end with a colon. Example: REPEAT 3 TIMES:', 'invalid-loop'),
        )
        continue
      }

      if (RE_FOR_EACH_NO_COLON.test(line)) {
        diagnostics.push(
          makeDiagnostic(lineNumber, line, 'FOR EACH loop must end with a colon. Example: FOR EACH {item} IN {items}:', 'invalid-loop'),
        )
        continue
      }

      if (RE_WHILE_NO_COLON.test(line)) {
        diagnostics.push(
          makeDiagnostic(lineNumber, line, 'WHILE loop must end with a colon. Example: WHILE button \'Next\' exists:', 'invalid-loop'),
        )
        continue
      }
    }

    // ── Pop stale conditional frames ────────────────────────────────────
    // Any non-empty, non-branch line at indent <= a conditional header's
    // indent means that conditional scope has ended.
    if (!hookState) {
      while (conditionalStack.length > 0 && conditionalStack[conditionalStack.length - 1].indent >= indent) {
        conditionalStack.pop()
      }
    }

    if (!isValidHuntActionLine(line, { insideHookBlock: Boolean(hookState) })) {
      diagnostics.push(
        makeDiagnostic(
          lineNumber,
          line,
          hookState
            ? 'Unsupported hook block command. Only PRINT and CALL PYTHON are allowed inside hook blocks.'
            : 'Unknown or malformed Manul DSL command.',
          hookState ? 'invalid-hook-block' : 'invalid-command',
        ),
      )
    }
  }

  if (hookState) {
    diagnostics.push(
      makeDiagnostic(
        hookState.line,
        lines[hookState.line - 1] ?? '',
        `Hook block is not closed. Expected ${hookState.closeTag}.`,
        'unclosed-hook-block',
      ),
    )
  }

  return diagnostics
}