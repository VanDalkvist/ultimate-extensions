export interface FilesEntry {
  name: string
  path: string
  kind: 'directory' | 'file' | 'blocked'
  reason?: string
}

export interface DirectoryResult {
  root: string
  path: string
  entries: FilesEntry[]
  truncated: boolean
}

export interface FileResult {
  path: string
  secretText: string
  version: string
  bytes: number
}

export type SaveResult =
  | { status: 'saved'; version: string; bytes: number }
  | { status: 'conflict' }
