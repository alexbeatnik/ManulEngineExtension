// Re-export from @manul/shared — the engine log parser is the single source of truth.
export type { StepStatus, TestBlock } from '@manul/shared';
export { parseEngineLogLine } from '@manul/shared';