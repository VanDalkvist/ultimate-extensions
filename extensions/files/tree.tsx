import { ChevronRightIcon, FileIcon, FolderIcon, LockKeyholeIcon } from 'lucide-react'
import { useState } from 'react'
import { cn, errorMessage, useAction } from '@/sdk'
import type { DirectoryResult } from './types.ts'
import { List } from './session.tsx'

export function Directory({
  path,
  selected,
  refresh,
  openFile,
  initial,
}: {
  path: string
  selected: string | null
  refresh: number
  openFile: (path: string) => void
  initial?: DirectoryResult
}) {
  const listing = useAction(List, { path }, { on: refresh, focus: true, enabled: !initial })
  const data = initial ?? listing.data
  if (listing.error)
    return (
      <p role="alert" className="px-3 py-2 text-[12px] text-error">
        {errorMessage(listing.error)}
      </p>
    )
  if (!data)
    return (
      <p role="status" className="px-3 py-2 font-mono text-[11px] text-muted-foreground">
        Loading…
      </p>
    )
  return (
    <ul className="min-w-0" aria-label={path || 'Project files'}>
      {data.entries.map((entry) => (
        <TreeEntry
          key={entry.path}
          entry={entry}
          selected={selected}
          refresh={refresh}
          openFile={openFile}
        />
      ))}
      {data.entries.length === 0 && (
        <li className="px-3 py-2 font-mono text-[11px] text-muted-foreground">Empty folder</li>
      )}
      {data.truncated && (
        <li className="px-3 py-2 text-[11px] text-warning">
          Only the first 1,000 entries are shown.
        </li>
      )}
    </ul>
  )
}

function TreeEntry({
  entry,
  selected,
  refresh,
  openFile,
}: {
  entry: DirectoryResult['entries'][number]
  selected: string | null
  refresh: number
  openFile: (path: string) => void
}) {
  const [open, setOpen] = useState(false)
  const folder = entry.kind === 'directory'
  const blocked = entry.kind === 'blocked'
  const Icon = folder ? FolderIcon : blocked ? LockKeyholeIcon : FileIcon
  return (
    <li>
      <button
        aria-current={selected === entry.path ? 'page' : undefined}
        aria-expanded={folder ? open : undefined}
        className={cn(
          'flex w-full min-w-0 items-center gap-1.5 rounded-sm px-2 py-1.5 text-left font-mono text-[11.5px] hover:bg-accent/50 disabled:cursor-not-allowed disabled:text-muted-foreground/50',
          selected === entry.path && 'bg-accent text-foreground',
        )}
        disabled={blocked}
        onClick={() => (folder ? setOpen(!open) : openFile(entry.path))}
        title={entry.reason ?? entry.path}
        type="button"
      >
        <ChevronRightIcon
          className={cn(
            'size-3 shrink-0 text-muted-foreground',
            !folder && 'invisible',
            open && 'rotate-90',
          )}
        />
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 truncate">{entry.name}</span>
      </button>
      {folder && open && (
        <div className="ml-3 border-l border-border/50 pl-1">
          <Directory path={entry.path} selected={selected} refresh={refresh} openFile={openFile} />
        </div>
      )}
    </li>
  )
}
