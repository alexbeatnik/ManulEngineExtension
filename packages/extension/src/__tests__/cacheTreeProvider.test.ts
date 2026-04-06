import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { CacheTreeProvider, CacheItem } from '../cacheTreeProvider'

vi.mock('fs')
vi.mock('path', async (importOriginal) => {
  const actual = await importOriginal<typeof import('path')>()
  return {
    ...actual,
    join: vi.fn((...args) => actual.join(...args)),
    basename: vi.fn((...args) => actual.basename(...args)),
  }
})

describe('CacheItem', () => {
  it('creates an item with correct properties', () => {
    vi.spyOn(fs, 'readdirSync').mockReturnValue([] as any)
    vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false, size: 0 } as any)
    
    const item = new CacheItem('test-label', 'test-path', 'root', vscode.TreeItemCollapsibleState.None)
    expect(item.label).toBe('test-label')
    expect(item.dirPath).toBe('test-path')
    expect(item.kind).toBe('root')
    expect(item.tooltip).toBe('test-path')
    expect(item.collapsibleState).toBe(vscode.TreeItemCollapsibleState.None)
  })
})

describe('CacheTreeProvider', () => {
  let provider: CacheTreeProvider

  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(vscode.workspace, 'workspaceFolders', 'get').mockReturnValue([{ uri: vscode.Uri.file('/mock/workspace'), name: 'workspace', index: 0 }] as const)
    vi.spyOn(process, 'cwd').mockReturnValue('/mock/cwd')
  })

  it('can be instantiated', () => {
    provider = new CacheTreeProvider()
    expect(provider).toBeInstanceOf(CacheTreeProvider)
  })

  it('getTreeItem returns the element itself', () => {
    provider = new CacheTreeProvider()
    const item = new CacheItem('label', 'path', 'root', vscode.TreeItemCollapsibleState.None)
    expect(provider.getTreeItem(item)).toBe(item)
  })

  it('getChildren returns top-level roots when no element is provided', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    vi.spyOn(fs, 'readdirSync').mockImplementation((dirPath: any) => {
      const p = String(dirPath)
      if (p.includes('example.com')) {
        return [
          { name: 'some-file.txt', isDirectory: () => false },
        ] as any
      }
      return [
        { name: 'example.com', isDirectory: () => true },
        { name: 'run_123', isDirectory: () => true }, // should be ignored
      ] as any
    })
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ controls_cache_dir: 'mock-cache' }))
    
    provider = new CacheTreeProvider()
    const children = await (provider as any).getChildren()
    expect(children).toHaveLength(1)
    expect(children[0].label).toBe('example.com')
    expect(children[0].kind).toBe('site')
  })

  it('getChildren returns default message when cache dir missing', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false)
    provider = new CacheTreeProvider()
    const children = await (provider as any).getChildren()
    expect(children).toHaveLength(1)
    expect(children[0].label).toBe('No cache directory found')
    expect(children[0].kind).toBe('root')
  })
})
