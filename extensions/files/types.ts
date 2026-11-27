export interface FilesEntry {
  name: string
  path: string
  kind: 'directory' | 'file' | 'blocked'
  reason?: string
  identity?: string
}

export interface SearchResult {
  entries: FilesEntry[]
  truncated: boolean
}

export interface DirectoryResult extends SearchResult {
  root: string
  path: string
}

export interface FileResult {
  path: string
  secretText: string
  identity: string
  version: string
  bytes: number
}

export type SaveResult =
  | { status: 'saved'; identity: string; version: string; bytes: number }
  | { status: 'conflict' }
