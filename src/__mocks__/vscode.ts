/** Minimal vscode module mock for unit testing. */
export const workspace = {
  workspaceFolders: undefined as any[] | undefined,
  textDocuments: [] as any[],
  findFiles: async () => [],
  createFileSystemWatcher: () => ({ onDidCreate: () => ({ dispose: () => {} }), onDidChange: () => ({ dispose: () => {} }), onDidDelete: () => ({ dispose: () => {} }), dispose: () => {} }),
  onDidOpenTextDocument: () => ({ dispose: () => {} }),
  onDidSaveTextDocument: () => ({ dispose: () => {} }),
  onDidCloseTextDocument: () => ({ dispose: () => {} }),
  onDidChangeTextDocument: () => ({ dispose: () => {} }),
  getConfiguration: (_section?: string) => ({
    get: <T>(_key: string, defaultValue?: T): T | undefined => defaultValue,
  }),
}

export const languages = {
  createDiagnosticCollection: (name: string) => ({
    name,
    set: () => {},
    delete: () => {},
    clear: () => {},
    dispose: () => {},
  }),
}

export enum DiagnosticSeverity {
  Error = 0,
  Warning = 1,
  Information = 2,
  Hint = 3,
}

export class Diagnostic {
  source?: string
  code?: string | number
  constructor(
    public range: Range,
    public message: string,
    public severity: DiagnosticSeverity = DiagnosticSeverity.Error
  ) {}
}

export class ThemeIcon {
  constructor(public readonly id: string) {}
}

export enum CompletionItemKind {
  Text = 0,
  Method = 1,
  Function = 2,
  Constructor = 3,
  Field = 4,
  Variable = 5,
  Class = 6,
  Interface = 7,
  Module = 8,
  Property = 9,
  Unit = 10,
  Value = 11,
  Enum = 12,
  Keyword = 13,
  Snippet = 14,
  Color = 15,
  File = 16,
  Reference = 17,
  Folder = 18,
}

export class CompletionItem {
  label: string
  kind?: CompletionItemKind
  constructor(label: string, kind?: CompletionItemKind) {
    this.label = label
    this.kind = kind
  }
}

export class SnippetString {
  value: string
  constructor(value: string) {
    this.value = value
  }
}

export class MarkdownString {
  value: string
  constructor(value?: string) {
    this.value = value ?? ''
  }
  appendCodeblock(code: string, _language?: string): this {
    this.value += '\n' + code
    return this
  }
}

export class Uri {
  fsPath: string

  constructor(fsPath: string) {
    this.fsPath = fsPath
  }

  static file(fsPath: string): Uri {
    return new Uri(fsPath)
  }

  toString(): string {
    return `file://${this.fsPath}`
  }
}

export class Position {
  constructor(public line: number, public character: number) {}
}

export class Range {
  constructor(
    public startLine: number,
    public startCharacter: number,
    public endLine: number,
    public endCharacter: number
  ) {}
}

export class TextEdit {
  static replace(range: any, newText: string) {
    return { range, newText }
  }
}

export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2,
}

export class TreeItem {
  constructor(public readonly label: string, public readonly collapsibleState?: TreeItemCollapsibleState) {}
}

export class CodeLens {
  constructor(public range: Range, public command?: any) {}
}

export class EventEmitter<T> {
  event = (listener: (e: T) => any) => ({ dispose: () => {} })
  fire(data?: T): void {}
}

export const debug = {
  breakpoints: [] as any[]
}

export enum TestRunProfileKind {
  Run = 1,
  Debug = 2,
  Coverage = 3
}

export const tests = {
  createTestController: (id: string, label: string) => ({
    id,
    label,
    items: {
      replace: () => {},
      add: () => {},
      get: () => {},
      delete: () => {},
      forEach: () => {},
    },
    createTestItem: () => ({}),
    createRunProfile: () => ({}),
    resolveHandler: undefined as any,
  })
}
