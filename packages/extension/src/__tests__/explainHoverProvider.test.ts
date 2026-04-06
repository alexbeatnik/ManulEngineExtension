import { afterEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

import {
  buildStepLineMap,
  clearAllExplanations,
  ExplainOutputParser,
  getExplanation,
} from '../explainHoverProvider'

function writeTempHunt(contents: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'manul-explain-'))
  const filePath = path.join(dir, 'sample.hunt')
  fs.writeFileSync(filePath, contents, 'utf8')
  return filePath
}

describe('buildStepLineMap', () => {
  afterEach(() => {
    clearAllExplanations()
  })

  it('maps only executable action lines and skips logical STEP headers and DONE', () => {
    const filePath = writeTempHunt([
      '@context: Demo',
      '@script: {auth} = helpers.auth',
      '',
      'STEP 1: Login',
      "    Fill 'Email' field with 'a@example.com'",
      "    Verify 'Email' field has value 'a@example.com'",
      'DONE.',
      '',
    ].join('\n'))

    const map = buildStepLineMap(filePath)
    expect(map.get(1)).toBe(4)
    expect(map.get(2)).toBe(5)
    expect(map.size).toBe(2)
  })
})

describe('ExplainOutputParser', () => {
  afterEach(() => {
    clearAllExplanations()
  })

  it('stores explanations for current engine format without emoji markers', () => {
    const filePath = writeTempHunt([
      '@context: Demo',
      '',
      'STEP 1: Login',
      "    Click the 'Login' button",
      'DONE.',
    ].join('\n'))

    const parser = new ExplainOutputParser(filePath)
    parser.setCurrentStep(1)
    parser.feed('┌─ EXPLAIN: Target = "Login"')
    parser.feed('│  Step: Click the \'Login\' button')
    parser.feed('└─ Decision: selected "Login" with score 0.593')

    const fileUri = `file://${filePath}`
    const explanation = getExplanation(fileUri, 3)
    expect(explanation).toContain('Heuristic Explanation')
    expect(explanation).toContain('EXPLAIN: Target = "Login"')
    expect(getExplanation(fileUri, 2)).toBeUndefined()
  })

  it('also accepts legacy explain markers with emoji and bracketed step lines', () => {
    const filePath = writeTempHunt([
      '@context: Demo',
      '',
      "    Verify 'Dashboard' field has value 'Ready'",
    ].join('\n'))

    const parser = new ExplainOutputParser(filePath)
    parser.feed('[🐾 STEP 1 @plan] Verify dashboard')
    parser.feed('┌─ 🔍 EXPLAIN: Target = "Dashboard"')
    parser.feed('│  Candidate: field')
    parser.feed('└─ ✅ Decision: selected "Dashboard"')

    const explanation = getExplanation(`file://${filePath}`, 2)
    expect(explanation).toContain('Dashboard')
  })

  it('falls back to ACTION START ordering when explicit step markers are absent', () => {
    const filePath = writeTempHunt([
      '@context: Demo',
      '',
      'STEP 1: Login',
      "    Fill 'Username' with 'standard_user'",
      "    Fill 'Password' with 'secret_sauce'",
      'DONE.',
    ].join('\n'))

    const parser = new ExplainOutputParser(filePath)
    parser.feed("[ACTION START] Fill 'Username' with 'standard_user'")
    parser.feed('┌─ 🔍 EXPLAIN: Target = "Username"')
    parser.feed("│  Step: Fill 'Username' with 'standard_user'")
    parser.feed('└─ ✅ Decision: selected "Username" with score 0.888')

    parser.feed("[ACTION START] Fill 'Password' with 'secret_sauce'")
    parser.feed('┌─ 🔍 EXPLAIN: Target = "Password"')
    parser.feed("│  Step: Fill 'Password' with 'secret_sauce'")
    parser.feed('└─ ✅ Decision: selected "Password" with score 1.000')

    expect(getExplanation(`file://${filePath}`, 3)).toContain('Username')
    expect(getExplanation(`file://${filePath}`, 4)).toContain('Password')
  })
})