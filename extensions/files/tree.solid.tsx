import { ChevronRightIcon, FileIcon, FolderIcon, LockKeyholeIcon } from '@lucide/solid'
import { For, Show, createSignal } from 'solid-js'
import { Button } from '@/components/ui/button.solid.tsx'
import { cn, errorMessage, useAction } from '@/sdk/solid'
import type { DirectoryResult } from './types.ts'
import { List } from './session.ts'

type TreeProps = {
  path: string
  selected: string | null
  refresh: number
  openFile: (path: string) => void
}

export function Directory(props: TreeProps & { data: DirectoryResult }) {
  return (
    <ul class="min-w-0" aria-label={props.path || 'Project files'}>
      <For each={props.data.entries} keyed={(entry) => entry.path}>
        {(entry) => (
          <TreeEntry
            path={entry().path}
            entry={entry()}
            selected={props.selected}
            refresh={props.refresh}
            openFile={props.openFile}
          />
        )}
      </For>
      {props.data.entries.length === 0 && (
        <li class="px-3 py-2 font-mono text-[11px] text-muted-foreground">Empty folder</li>
      )}
      {props.data.truncated && (
        <li class="px-3 py-2 text-[11px] text-warning">Only the first 1,000 entries are shown.</li>
      )}
    </ul>
  )
}

function NestedDirectory(props: TreeProps) {
  const listing = useAction(
    List,
    {
      get path() {
        return props.path
      },
    },
    { on: () => props.refresh, focus: true },
  )
  return (
    <Show
      when={!listing.error()}
      fallback={
        <p role="alert" class="px-3 py-2 text-[12px] text-error">
          {errorMessage(listing.error())}
        </p>
      }
    >
      <Show
        when={listing.data()}
        fallback={
          <output class="block px-3 py-2 font-mono text-[11px] text-muted-foreground">
            Loading…
          </output>
        }
      >
        {(data) => (
          <Directory
            path={props.path}
            selected={props.selected}
            refresh={props.refresh}
            openFile={props.openFile}
            data={data()}
          />
        )}
      </Show>
    </Show>
  )
}

function TreeEntry(props: TreeProps & { entry: DirectoryResult['entries'][number] }) {
  const [open, setOpen] = createSignal(false)
  const folder = () => props.entry.kind === 'directory'
  const blocked = () => props.entry.kind === 'blocked'
  return (
    <li>
      <Button
        aria-label={`${folder() ? 'Toggle folder' : 'Open'} ${props.path}`}
        aria-current={props.selected === props.path ? 'page' : undefined}
        aria-expanded={folder() ? (open() ? 'true' : 'false') : undefined}
        class={cn(
          'w-full min-w-0 justify-start gap-1.5 rounded-sm px-2 py-1.5 text-left font-mono text-[11.5px] font-normal hover:bg-accent/50 disabled:text-muted-foreground/50',
          props.selected === props.path && 'bg-accent text-foreground',
        )}
        disabled={blocked()}
        variant={null}
        size={null}
        onClick={() => {
          if (folder()) setOpen((value) => !value)
          else props.openFile(props.path)
        }}
        title={props.entry.reason ?? props.path}
      >
        <ChevronRightIcon
          class={cn(
            'size-3 shrink-0 text-muted-foreground',
            !folder() && 'invisible',
            open() && 'rotate-90',
          )}
        />
        <Show
          when={folder()}
          fallback={
            blocked() ? (
              <LockKeyholeIcon class="size-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <FileIcon class="size-3.5 shrink-0 text-muted-foreground" />
            )
          }
        >
          <FolderIcon class="size-3.5 shrink-0 text-muted-foreground" />
        </Show>
        <span class="min-w-0 truncate">{props.entry.name}</span>
      </Button>
      <Show when={folder() && open()}>
        <div class="ml-3 border-l border-border/50 pl-1">
          <NestedDirectory
            path={props.path}
            selected={props.selected}
            refresh={props.refresh}
            openFile={props.openFile}
          />
        </div>
      </Show>
    </li>
  )
}
