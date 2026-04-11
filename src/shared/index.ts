// ---------------------------------------------------------------------------
// Extension-local runtime contracts, parsers, and validators
// ---------------------------------------------------------------------------

export const MIN_MANUL_ENGINE_VERSION = '0.0.9.28'

export type StepStatus = 'pending' | 'running' | 'pass' | 'fail' | 'skipped'

export interface TestStep {
  id: string
  description: string
  status: StepStatus
}

export interface TestBlock {
  id: string
  status: StepStatus
}

export type RunStatus = 'running' | 'success' | 'error' | 'cancelled'

export const DEFAULT_CONFIG_FILENAME = 'manul_engine_configuration.json'
export const PAUSE_MARKER = '\x00MANUL_DEBUG_PAUSE\x00'
export const EXPLAIN_NEXT_MARKER = '\x00MANUL_EXPLAIN_NEXT\x00'

/** JSON payload from the engine's `explain-next` stdin token response. */
export interface ExplainNextResult {
  step: string;
  /** Normalized confidence score in the range [0.0, 1.0]. */
  score: number;
  confidence_label: string;
  target_found: boolean;
  target_element: string | null;
  explanation: string;
  risk: string;
  suggestion: string | null;
  /** Raw heuristic score in the range [0.0, 1.0], or null when unavailable. */
  heuristic_score: number | null;
  heuristic_match: string | null;
}
export const STEP_LINE_RE = /(?:\[[^\]]*\s*)?(STEP\s+\d+)(?:\s*[:@][^\]]*\])?\s*[:\s]\s*(.+)/i
export const FAIL_LINE_RE = /❌|FAIL(?:ED)?|ERROR/i
export const BLOCK_LOG_RE = /^\s*\[(?:[^\]]*\s+)?BLOCK\s+(START|PASS|FAIL)\]\s+(.+?)\s*$/i

export function parseEngineLogLine(line: string): TestBlock | null {
  const match = line.match(BLOCK_LOG_RE)
  if (!match) {
    return null
  }

  const marker = match[1].toUpperCase()
  const id = match[2].trim()
  const status: StepStatus = marker === 'START'
    ? 'running'
    : marker === 'PASS'
      ? 'pass'
      : 'fail'

  return { id, status }
}

export {
  MANUL_DSL_CONTRACT,
  RE_COMMENT,
  RE_DONE,
  RE_ELIF,
  RE_ELSE,
  RE_HOOK_CLOSE,
  RE_HOOK_OPEN,
  RE_IF,
  RE_METADATA,
  RE_STEP,
  isValidHuntActionLine,
  validateHuntDocument,
} from './huntValidator'
export type {
  HuntValidationDiagnostic,
  HuntValidationDiagnosticCode,
  ManulDslContract,
} from './huntValidator'

export function parseVersion(version: string): number[] {
  return version
    .replace(/^v/i, '')
    .split('.')
    .map((segment) => {
      const parsed = parseInt(segment, 10)
      return Number.isNaN(parsed) ? 0 : parsed
    })
}

export interface ManulDslCommand {
  id: string
  label: string
  icon: string
  uiText: string
  snippet: string
  description: string
  example: string
  /** Optional note about element-type hints being recommended but not required. */
  hintNote?: string
}

export type ManulDslContextKeyword = 'NEAR' | 'ON' | 'INSIDE' | 'WITH'

export interface ManulDslContextSuggestion {
  label: ManulDslContextKeyword
  snippet: string
  description: string
}

export const MANUL_DSL_CONTEXT_SUGGESTIONS: Record<ManulDslContextKeyword, ManulDslContextSuggestion> = {
  NEAR: {
    label: 'NEAR',
    snippet: "NEAR '${1:anchor}'",
    description: 'Bias candidate matching toward an element near a quoted anchor.',
  },
  ON: {
    label: 'ON',
    snippet: 'ON ${1|HEADER,FOOTER|}',
    description: 'Bias candidate matching toward the header or footer region.',
  },
  INSIDE: {
    label: 'INSIDE',
    snippet: "INSIDE '${1:container}' row",
    description: 'Start an INSIDE row qualifier before adding the row text with WITH.',
  },
  WITH: {
    label: 'WITH',
    snippet: "with '${1:text}'",
    description: 'Completes an INSIDE row qualifier with the row text anchor.',
  },
}

const QUOTED_FRAGMENT = String.raw`(?:'[^'\n]*'|"[^"\n]*")`
const CLICK_CONTEXT_RE = new RegExp(
  String.raw`^\s*(?:Click|DOUBLE\s+CLICK|Check|Uncheck|HOVER)(?:\s+the|\s+over)?\s+${QUOTED_FRAGMENT}(?:\s+(?:button|link|checkbox|dropdown|input))?\s*$`,
  'i'
)
const ACTION_CONTEXT_RE = new RegExp(
  String.raw`^\s*(?:Fill|Type|Select|Choose|Drag)\b.*${QUOTED_FRAGMENT}.*$`,
  'i'
)
const VERIFY_CONTEXT_RE = new RegExp(
  String.raw`^\s*(?:VERIFY(?:\s+SOFTLY)?\s+that\s+${QUOTED_FRAGMENT}\s+is\s+(?:present|NOT\s+present|ENABLED|DISABLED|checked|NOT\s+checked)|VERIFY\s+${QUOTED_FRAGMENT}\s+(?:button|field|element|input)\s+HAS\s+(?:TEXT|PLACEHOLDER|VALUE)\s+${QUOTED_FRAGMENT})\s*$`,
  'i'
)
const INSIDE_ROW_CONTEXT_RE = new RegExp(
  String.raw`\bINSIDE\s+${QUOTED_FRAGMENT}\s+row\s*$`,
  'i'
)

export function getManulDslContextSuggestions(linePrefix: string): ManulDslContextSuggestion[] {
  const prefix = linePrefix.trimEnd()

  if (INSIDE_ROW_CONTEXT_RE.test(prefix)) {
    return [MANUL_DSL_CONTEXT_SUGGESTIONS.WITH]
  }

  if (ACTION_CONTEXT_RE.test(prefix)) {
    return [
      MANUL_DSL_CONTEXT_SUGGESTIONS.NEAR,
      MANUL_DSL_CONTEXT_SUGGESTIONS.INSIDE,
    ]
  }

  if (VERIFY_CONTEXT_RE.test(prefix)) {
    return [
      MANUL_DSL_CONTEXT_SUGGESTIONS.NEAR,
      MANUL_DSL_CONTEXT_SUGGESTIONS.ON,
      MANUL_DSL_CONTEXT_SUGGESTIONS.INSIDE,
    ]
  }

  if (CLICK_CONTEXT_RE.test(prefix)) {
    return [
      MANUL_DSL_CONTEXT_SUGGESTIONS.NEAR,
      MANUL_DSL_CONTEXT_SUGGESTIONS.ON,
      MANUL_DSL_CONTEXT_SUGGESTIONS.INSIDE,
    ]
  }

  return []
}

export const MANUL_DSL_COMMANDS: ManulDslCommand[] = [
  { id: 'navigate',              label: 'Navigate',              icon: '🌐', uiText: "NAVIGATE to ''",                                                  snippet: 'NAVIGATE to ${1:url}',                                                        description: 'Navigates the browser to a specific URL and waits for DOM settlement.',                 example: 'NAVIGATE to https://example.com/login' },
  { id: 'open-app',              label: 'Open App',              icon: '📦', uiText: 'OPEN APP',                                                         snippet: 'OPEN APP',                                                                    description: 'Attaches to an Electron or desktop app window instead of navigating to a URL.',        example: 'OPEN APP' },
  { id: 'click',                 label: 'Click',                 icon: '🖱️', uiText: "CLICK the ''",                                                snippet: "CLICK the '${1:target}'${2: button}",                                         description: 'Clicks a resolved element in clickable interaction mode.',                              example: "CLICK the 'Login' button", hintNote: 'Element type hint (button, link, element) is optional but recommended for scoring accuracy.' },
  { id: 'double-click',          label: 'Double Click',          icon: '🖱️', uiText: "DOUBLE CLICK the ''",                                             snippet: "DOUBLE CLICK the '${1:target}'",                                              description: 'Double-clicks a resolved element.',                                                     example: "DOUBLE CLICK the 'Project row'" },
  { id: 'check',                 label: 'Check',                 icon: '☑️', uiText: "Check the checkbox for ''",                                       snippet: "Check the checkbox for '${1:target}'",                                        description: 'Checks a checkbox element.',                                                            example: "Check the checkbox for 'Remember me'" },
  { id: 'uncheck',               label: 'Uncheck',               icon: '☐', uiText: "Uncheck the checkbox for ''",                                      snippet: "Uncheck the checkbox for '${1:target}'",                                      description: 'Unchecks a checkbox element.',                                                          example: "Uncheck the checkbox for 'Subscribe'" },
  { id: 'fill-field',            label: 'Fill Field',            icon: '⌨️',  uiText: "Fill '' field with ''",                                           snippet: "Fill '${1:target}' field with '${2:value}'",                                  description: 'Types text into a resolved input or textarea element.',                                  example: "Fill 'Email' field with 'user@example.com'", hintNote: 'Element type hint (field, input) is optional but recommended for scoring accuracy.' },
  { id: 'type-into',             label: 'Type Into',             icon: '⌨️',  uiText: "Type '' into ''",                                                 snippet: "Type '${1:value}' into '${2:target}'",                                        description: 'Types text into a resolved element using the Type verb.',                                example: "Type 'secret123' into 'Password'" },
  { id: 'select',                label: 'Select',                icon: '📋', uiText: "Select '' from the '' dropdown",                                   snippet: "Select '${1:option}' from the '${2:target}' dropdown",                        description: 'Selects an option from a native select or a custom dropdown.',                           example: "Select 'Ukraine' from the 'Country' dropdown", hintNote: 'Element type hint (dropdown) is optional but recommended for scoring accuracy.' },
  { id: 'hover',                 label: 'Hover',                 icon: '🔍', uiText: "HOVER over the ''",                                                snippet: "HOVER over the '${1:target}'",                                                description: 'Hovers over a resolved element.',                                                       example: "HOVER over the 'Profile menu'" },
  { id: 'drag-drop',             label: 'Drag & Drop',           icon: '↕️',  uiText: "Drag '' and drop it into ''",                                     snippet: "Drag '${1:source}' and drop it into '${2:destination}'",                      description: 'Drags one resolved element and drops it onto another.',                                  example: "Drag 'Task A' and drop it into 'Done column'" },
  { id: 'scroll-down',           label: 'Scroll Down',           icon: '⬇️',  uiText: 'SCROLL DOWN',                                                     snippet: 'SCROLL DOWN${1: inside the ${2:container}}',                                  description: 'Scrolls the main page down, or scrolls a named container when one is provided.',        example: 'SCROLL DOWN inside the results panel' },
  { id: 'wait',                  label: 'Wait',                  icon: '⏸️',  uiText: 'WAIT 2',                                                          snippet: 'WAIT ${1:seconds}',                                                           description: 'Sleeps for the specified number of seconds.',                                           example: 'WAIT 2' },
  { id: 'wait-for-element',      label: 'Wait For Element',      icon: '👁️', uiText: "Wait for '' to be visible",                                        snippet: "Wait for '${1:target}' to ${2|be visible,be hidden,disappear|}",             description: 'Waits for a quoted element to become visible, hidden, or disappear.',                   example: "Wait for 'Loading spinner' to disappear" },
  { id: 'wait-response',         label: 'Wait Response',         icon: '📡', uiText: 'WAIT FOR RESPONSE ""',                                             snippet: 'WAIT FOR RESPONSE "${1:url_pattern}"',                                       description: 'Blocks until a matching network response arrives.',                                      example: 'WAIT FOR RESPONSE "/api/orders"' },
  { id: 'extract',               label: 'Extract',               icon: '📤', uiText: "EXTRACT the '' into {variable}",                                   snippet: "EXTRACT the '${1:target}' into {${2:variable}}",                              description: 'Extracts text content from an element into a runtime variable.',                         example: "EXTRACT the 'Order ID' into {order_id}" },
  { id: 'verify',                label: 'Verify',                icon: '✅', uiText: "VERIFY that '' is present",                                        snippet: "VERIFY that '${1:target}' is ${2|present,NOT present,ENABLED,DISABLED,checked,NOT checked|}", description: 'Asserts that a target is present, absent, enabled, disabled, checked, or not checked.', example: "VERIFY that 'Dashboard' is present" },
  { id: 'verify-text-strict',    label: 'Verify Text',           icon: '📝', uiText: "Verify '' element has text ''",                                   snippet: "Verify '${1:element_name}' ${2|button,field,element,input|} has text '${3:Expected Text}'", description: 'Performs a strict text equality check against the resolved element.',                  example: "Verify 'Save' button has text 'Save changes'" },
  { id: 'verify-placeholder',    label: 'Verify Placeholder',    icon: '🧷', uiText: "Verify '' field has placeholder ''",                              snippet: "Verify '${1:element_name}' ${2|button,field,element,input|} has placeholder '${3:Expected Placeholder}'", description: 'Performs a strict placeholder equality check against the resolved element.', example: "Verify 'Email' field has placeholder 'name@example.com'" },
  { id: 'verify-value',          label: 'Verify Value',          icon: '🔎', uiText: "Verify '' field has value ''",                                    snippet: "Verify '${1:element_name}' ${2|button,field,element,input|} has value '${3:Expected Value}'", description: 'Performs a strict current-value equality check against the resolved element.',      example: "Verify 'Email' field has value 'captain@manul.com'" },
  { id: 'verify-softly',         label: 'Verify Softly',         icon: '⚠️',  uiText: "VERIFY SOFTLY that '' is present",                                snippet: "VERIFY SOFTLY that '${1:target}' is ${2|present,NOT present,ENABLED,DISABLED,checked,NOT checked|}", description: 'Records a non-fatal assertion failure without stopping the run.',              example: "VERIFY SOFTLY that 'Optional banner' is present" },
  { id: 'verify-visual',         label: 'Verify Visual',         icon: '📸', uiText: "VERIFY VISUAL ''",                                                 snippet: "VERIFY VISUAL '${1:element}'",                                                description: 'Captures and compares a visual baseline for the target element.',                        example: "VERIFY VISUAL 'Product card'" },
  { id: 'press-enter',           label: 'Press Enter',           icon: '↩️',  uiText: 'PRESS ENTER',                                                     snippet: 'PRESS ENTER',                                                                 description: 'Presses Enter on the currently focused element.',                                        example: 'PRESS ENTER' },
  { id: 'press-key',             label: 'Press Key',             icon: '⌨️',  uiText: 'PRESS Escape',                                                    snippet: "PRESS ${1:Key}${2: on '${3:target}'}",                                        description: 'Presses any key or key combination globally or on a specific target.',                  example: "PRESS Escape on 'Search input'" },
  { id: 'right-click',           label: 'Right Click',           icon: '🖱️',  uiText: "RIGHT CLICK ''",                                                  snippet: "RIGHT CLICK '${1:target}'",                                                   description: 'Right-clicks a resolved element to open a context menu.',                                example: "RIGHT CLICK 'File row'" },
  { id: 'upload-file',           label: 'Upload File',           icon: '📎', uiText: "UPLOAD '' to ''",                                                  snippet: "UPLOAD '${1:file_path}' to '${2:target}'",                                    description: 'Uploads a local file to a file-input element.',                                         example: "UPLOAD 'fixtures/avatar.png' to 'Profile photo'" },
  { id: 'mock-request',          label: 'Mock Request',          icon: '🎭', uiText: "MOCK GET \"\" with ''",                                             snippet: "MOCK ${1|GET,POST,PUT,PATCH,DELETE|} \"${2:url_pattern}\" with '${3:mock_file}'", description: 'Intercepts matching network requests and fulfills them from a local mock file.',       example: "MOCK GET \"/api/profile\" with 'mocks/profile.json'" },
  { id: 'scan-page',             label: 'Scan Page',             icon: '🔍', uiText: 'SCAN PAGE',                                                         snippet: 'SCAN PAGE${1: into {${2:filename}}}',                                         description: 'Scans the current page for interactive elements and optionally writes a draft file.',    example: 'SCAN PAGE into {draft.hunt}' },
  { id: 'call-python',           label: 'Call Python',           icon: '🐍', uiText: 'CALL PYTHON module.function',                                      snippet: 'CALL PYTHON ${1:module}.${2:function}${3: with args: "${4:arg}"}${5: into {${6:result}}}', description: 'Executes a synchronous Python helper inline with dotted imports or @script aliases, plus optional arguments and capture.', example: 'CALL PYTHON {auth}.issue_token with args: "{email}" into {token}' },
  { id: 'set-variable',          label: 'Set Variable',          icon: '📝', uiText: 'SET {variable} = value',                                            snippet: 'SET {${1:variable}} = ${2:value}',                                             description: 'Sets or updates a runtime variable for later placeholder substitution.',                 example: 'SET {environment} = staging' },
  { id: 'debug',                 label: 'Debug',                 icon: '🐛', uiText: 'DEBUG',                                                            snippet: 'DEBUG',                                                                       description: 'Pauses execution at this step in interactive debug flows.',                              example: 'DEBUG' },
  { id: 'debug-vars',            label: 'Debug Vars',            icon: '🔬', uiText: 'DEBUG VARS',                                                       snippet: 'DEBUG VARS',                                                                  description: 'Prints the current state of all runtime variables.',                                     example: 'DEBUG VARS' },
  { id: 'pause',                 label: 'Pause',                 icon: '⏸️', uiText: 'PAUSE',                                                            snippet: 'PAUSE',                                                                       description: 'Alias for a debug pause marker in hunt files.',                                          example: 'PAUSE' },
  { id: 'done',                  label: 'Done',                  icon: '🏁', uiText: 'DONE.',                                                            snippet: 'DONE.',                                                                       description: 'Explicitly ends the mission.',                                                           example: 'DONE.' },
  { id: 'if-block',               label: 'IF',                    icon: '🔀', uiText: "IF button 'Save' exists:",                                            snippet: "IF ${1:condition}:\n        ${2:action}",                                     description: 'Block-style conditional branching with indented body.',                                  example: "IF button 'Save' exists:\n        CLICK the 'Save' button" },
  { id: 'elif-block',             label: 'ELIF',                  icon: '🔀', uiText: "ELIF text 'Error' is present:",                                       snippet: "ELIF ${1:condition}:\n        ${2:action}",                                   description: 'Alternative branch in an IF block.',                                                    example: "ELIF text 'Error' is present:\n        VERIFY that 'Error' is present" },
  { id: 'else-block',             label: 'ELSE',                  icon: '🔀', uiText: 'ELSE:',                                                               snippet: "ELSE:\n        ${1:action}",                                                  description: 'Default branch in an IF block.',                                                        example: "ELSE:\n        VERIFY that 'Fallback' is present" },
]

export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  const len = Math.max(pa.length, pb.length)
  for (let index = 0; index < len; index += 1) {
    const diff = (pa[index] ?? 0) - (pb[index] ?? 0)
    if (diff !== 0) {
      return diff
    }
  }
  return 0
}