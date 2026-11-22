import { ChevronRightIcon, FileIcon, FolderIcon, LockKeyholeIcon } from '@lucide/solid'
import { For, Show, createSignal } from 'solid-js'
import { Button } from '@/components/ui/button.solid.tsx'
import { cn, errorMessage, useAction } from '@/sdk/solid'
import type { DirectoryResult } from './types.ts'
import { List } from './session.ts'

export function Directory(props: {
  path: string
  selected: string | null
  refresh: number
  openFile(path: string): void
  initial?: DirectoryResult
}) {
  const listing = useAction(List, { path: props.path }, {
    on: () => props.refresh,
    focus: true,
  })
  const data = () => props.initial ?? listing.data()
  return (
    <Show when={!listing.error() || !!props.initial} fallback={
      <p role="alert" class="px-3 py-2 text-[12px] text-error">
        {errorMessage(listing.error())}
      </p>
    }>
      <Show when={data()} fallback={
        <p role="status" class="px-3 py-2 font-mono text-[11px] text-muted-foreground">
          Loading…
        </p>
      }>
        {(directory) => (
          <ul class="min-w-0" aria-label={props.path || 'Project files'}>
            <For each={directory().entries} keyed={(item) => item.path}>
              {(entry) => (
                <TreeEntry
                  entry={entry()}
                  selected={props.selected}
                  refresh={props.refresh}
                  openFile={props.openFile}
                />
              )}
            </For>
            <Show when={!directory().entries.length}>
              <li class="px-3 py-2 font-mono text-[11px] text-muted-foreground">Empty folder</li>
            </Show>
            <Show when={directory().truncated}>
              <li class="px-3 py-2 text-[11px] text-warning">Only first 1,000 entries shown.</li>
            </Show>
          </ul>
        )}
      </Show>
    </Show>
  )
}

function TreeEntry(props: {
  entry: DirectoryResult['entries'][number]
  selected: string | null
  refresh: number
  openFile(path: string): void
}) {
  const [open, setOpen] = createSignal(false)
  const folder = () => props.entry.kind === 'directory'
  const blocked = () => props.entry.kind === 'blocked'
  return (
    <li>
      <Button
        aria-current={props.selected === props.entry.path ? 'page' : undefined}
        aria-expanded={folder() ? open() : undefined}
        class={cn(
          'flex h-auto w-full min-w-0 items-center justify-start gap-1.5 rounded-sm px-2 py-1.5 text-left font-mono text-[11.5px] font-normal whitespace-normal hover:bg-accent/50 disabled:cursor-not-allowed disabled:text-muted-foreground/50',
          props.selected === props.entry.path && 'bg-accent text-foreground',
        )}
        disabled={blocked()}
        onClick={() => folder() ? setOpen(!open()) : props.openFile(props.entry.path)}
        title={props.entry.reason ?? props.entry.path}
        type="button"
        size={null}
        variant={null}
      >
        <ChevronRightIcon class={cn(
          'size-3 shrink-0 text-muted-foreground',
          !folder() && 'invisible',
          open() && 'rotate-90',
        )} />
        <Show when={folder()} fallback={
          <Show when={blocked()} fallback={<FileIcon class="size-3.5 shrink-0 text-muted-foreground" />}>
            <LockKeyholeIcon class="size-3.5 shrink-0 text-muted-foreground" />
          </Show>
        }>
          <FolderIcon class="size-3.5 shrink-0 text-muted-foreground" />
        </Show>
        <span class="min-w-0 truncate">{props.entry.name}</span>
      </Button>
      <Show when={folder() && open()}>
        <div class="ml-3 border-l border-border/50 pl-1">
          <Directory path={props.entry.path} selected={props.selected}
            refresh={props.refresh} openFile={props.openFile} />
        </div>
      </Show>
    </li>
  )
}
