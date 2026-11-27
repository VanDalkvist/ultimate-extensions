import {
  ChevronRightIcon,
  FileIcon,
  FolderIcon,
  LockKeyholeIcon,
  RefreshCwIcon,
  SearchIcon,
  XIcon,
} from '@lucide/solid'
import { For, Show, createSignal } from 'solid-js'
import { Button } from '@/components/ui/button.solid.tsx'
import { Form } from '@/components/ui/form.solid.tsx'
import { Input } from '@/components/ui/input.solid.tsx'
import { cn, errorMessage, writerNow } from '@/sdk/solid'
import type { DirectoryResult, FilesEntry } from './types.ts'
import { FileMenu, FileWriteDialog, SearchFiles } from './operations.solid.tsx'
import type { WriteRequest } from './operations.solid.tsx'
import { useFilesQuery } from './query.solid.tsx'
import { List } from './session.ts'

type TreeProps = {
  selected: string | null
  refresh: number
  openFile: (path: string) => void
}

type TreeControls = Pick<Parameters<typeof FileMenu>[0], 'onWrite' | 'onFeedback'> & {
  expanded: (path: string) => boolean
  toggle: (path: string) => void
}

type DirectoryProps = TreeProps & { path: string; controls: TreeControls }

type ProjectTreeProps = TreeProps & {
  data: DirectoryResult | undefined
  loading?: boolean
  error?: unknown
  onRefresh: () => void
  onRename: (path: string, destination: string, identity: string) => Promise<void>
  onCreated: (path: string) => void
}

const noticeClass = 'block px-3 py-2 text-[11px] text-muted-foreground'

export function ProjectTree(props: ProjectTreeProps) {
  const [expanded, setExpanded] = createSignal(new Set<string>())
  const [draft, setDraft] = createSignal('')
  const [query, setQuery] = createSignal('')
  const [request, setRequest] = createSignal<WriteRequest | null>(null)
  const [feedback, setFeedback] = createSignal<{ text: string; error?: boolean } | null>(null)
  let searchField: HTMLInputElement | undefined
  let writeTrigger: HTMLElement | undefined

  const controls: TreeControls = {
    expanded: (path) => expanded().has(path),
    toggle(path) {
      setExpanded((previous) => {
        const next = new Set(previous)
        if (next.has(path)) next.delete(path)
        else next.add(path)
        return next
      })
    },
    onWrite(next, trigger) {
      writeTrigger = trigger
      setRequest(next)
    },
    onFeedback: setFeedback,
  }

  function succeeded(write: WriteRequest, path: string) {
    if (write.operation === 'rename') {
      const from = write.path
      setExpanded(
        (previous) =>
          new Set(
            [...previous].map((entry) =>
              entry === from || entry.startsWith(`${from}/`)
                ? `${path}${entry.slice(from.length)}`
                : entry,
            ),
          ),
      )
    } else {
      const slash = path.lastIndexOf('/')
      if (slash >= 0) setExpanded((previous) => new Set([...previous, path.slice(0, slash)]))
      if (write.operation === 'file') props.onCreated(path)
      if (write.operation === 'upload') setFeedback({ text: `Uploaded ${path}.` })
      if (write.operation === 'duplicate') setFeedback({ text: `Copied to ${path}.` })
    }
    props.onRefresh()
  }

  return (
    <>
      <div class="shrink-0 border-b border-border/70 px-3 pb-2 pt-1.5">
        <div class="mb-1 flex items-center justify-between">
          <span class="section-label">Project files</span>
          <div class="flex items-center gap-0.5">
            <Button
              aria-label="Refresh files"
              onClick={() => props.onRefresh()}
              size="icon-sm"
              variant="ghost"
            >
              <RefreshCwIcon class="size-3.5" aria-hidden="true" />
            </Button>
            <Show when={props.data}>
              <FileMenu onWrite={controls.onWrite} onFeedback={controls.onFeedback} />
            </Show>
          </div>
        </div>
        <Form class="flex min-w-0 items-center gap-0.5">
          <Input
            ref={searchField}
            value={draft()}
            onValueChange={(value) => {
              setDraft(value)
              if (!value.trim()) setQuery('')
            }}
            aria-label="Search project files"
            data-agent-hidden
            placeholder="Search files…"
          />
          <Button
            aria-label="Run file search"
            title="Search files"
            type="submit"
            size="icon-sm"
            variant="ghost"
            data-agent-confirm="Search project files"
            onClick={() => {
              if (writerNow() === 'person') {
                setQuery(draft().trim())
                setFeedback(null)
              }
            }}
          >
            <SearchIcon class="size-3.5" aria-hidden="true" />
          </Button>
          <Show when={draft()}>
            <Button
              aria-label="Clear file search"
              size="icon-sm"
              variant="ghost"
              onClick={() => {
                setDraft('')
                setQuery('')
                searchField?.focus()
              }}
            >
              <XIcon class="size-3.5" aria-hidden="true" />
            </Button>
          </Show>
        </Form>
      </div>
      <Show when={feedback()}>
        {(message) => (
          <p
            role={message().error ? 'alert' : 'status'}
            class={cn(noticeClass, 'shrink-0 break-words', message().error && 'text-error')}
          >
            {message().text}
          </p>
        )}
      </Show>
      <div class="min-h-0 flex-1 overflow-auto p-1.5">
        <Show
          when={query()}
          keyed
          fallback={
            <>
              <ListingStatus loading={props.loading ?? !props.data} error={props.error} />
              <Show when={props.data}>
                {(data) => (
                  <Directory
                    path=""
                    data={data()}
                    selected={props.selected}
                    refresh={props.refresh}
                    openFile={props.openFile}
                    controls={controls}
                  />
                )}
              </Show>
            </>
          }
        >
          {(term) => (
            <SearchResults
              query={term}
              selected={props.selected}
              refresh={props.refresh}
              openFile={props.openFile}
              controls={controls}
              revealFolder={(path) => {
                const parts = path.split('/')
                setExpanded(
                  (previous) =>
                    new Set([
                      ...previous,
                      ...parts.map((_, index) => parts.slice(0, index + 1).join('/')),
                    ]),
                )
                setDraft('')
                setQuery('')
                searchField?.focus()
              }}
            />
          )}
        </Show>
      </div>
      <Show when={request()} keyed>
        {(write) => (
          <FileWriteDialog
            request={write}
            onClose={() => setRequest(null)}
            onRename={props.onRename}
            onSuccess={succeeded}
            finalFocus={() => (writeTrigger?.isConnected ? writeTrigger : (searchField ?? null))}
          />
        )}
      </Show>
    </>
  )
}

function ListingStatus(props: { loading: boolean; error?: unknown; search?: boolean }) {
  return (
    <Show
      when={!props.error}
      fallback={
        <p role="alert" class={cn(noticeClass, 'break-words text-error')}>
          {errorMessage(props.error)}
        </p>
      }
    >
      <Show when={props.loading}>
        <output class={noticeClass}>{props.search ? 'Searching…' : 'Loading…'}</output>
      </Show>
    </Show>
  )
}

function SearchResults(
  props: TreeProps & {
    query: string
    controls: TreeControls
    revealFolder: (path: string) => void
  },
) {
  const search = useFilesQuery(SearchFiles, () => ({ query: props.query }), {
    on: () => props.refresh,
  })
  return (
    <>
      <ListingStatus loading={search.loading()} error={search.error()} search />
      <Show when={search.data()}>
        {(data) => (
          <>
            <p class={noticeClass}>
              Results for <span class="break-all font-mono">{props.query}</span>
            </p>
            <Show
              when={data().entries.length}
              fallback={<p class={noticeClass}>No matching files.</p>}
            >
              <ul aria-label="File search results">
                <For each={data().entries} keyed={(entry) => entry.path}>
                  {(entry) => (
                    <TreeEntry
                      entry={entry()}
                      path={entry().path}
                      selected={props.selected}
                      refresh={props.refresh}
                      openFile={props.openFile}
                      controls={props.controls}
                      revealFolder={props.revealFolder}
                    />
                  )}
                </For>
              </ul>
            </Show>
            <Show when={data().truncated}>
              <p class={cn(noticeClass, 'text-warning')}>
                Search was limited. Try a more specific name or path.
              </p>
            </Show>
          </>
        )}
      </Show>
    </>
  )
}

function Directory(props: DirectoryProps & { data: DirectoryResult }) {
  return (
    <ul class="min-w-0" aria-label={props.path || 'Project file list'}>
      <For each={props.data.entries} keyed={(entry) => entry.path}>
        {(entry) => (
          <TreeEntry
            path={entry().path}
            entry={entry()}
            selected={props.selected}
            refresh={props.refresh}
            openFile={props.openFile}
            controls={props.controls}
          />
        )}
      </For>
      <Show when={props.data.entries.length === 0}>
        <li class={noticeClass}>Empty folder</li>
      </Show>
      <Show when={props.data.truncated}>
        <li class={cn(noticeClass, 'text-warning')}>Only the first 1,000 entries are shown.</li>
      </Show>
    </ul>
  )
}

function NestedDirectory(props: DirectoryProps) {
  const listing = useFilesQuery(List, () => ({ path: props.path }), {
    on: () => props.refresh,
    focus: true,
  })
  return (
    <>
      <ListingStatus loading={listing.loading() && !listing.data()} error={listing.error()} />
      <Show when={listing.data()}>
        {(data) => (
          <Directory
            path={props.path}
            selected={props.selected}
            refresh={props.refresh}
            openFile={props.openFile}
            data={data()}
            controls={props.controls}
          />
        )}
      </Show>
    </>
  )
}

function TreeEntry(
  props: DirectoryProps & { entry: FilesEntry; revealFolder?: (path: string) => void },
) {
  const open = () => !props.revealFolder && props.controls.expanded(props.path)
  const folder = () => props.entry.kind === 'directory'
  const blocked = () => props.entry.kind === 'blocked'
  const row = () => (
    <Button
      aria-label={`${folder() && !props.revealFolder ? 'Toggle folder' : 'Open'} ${props.path}`}
      data-agent-confirm={folder() ? 'Read this folder' : 'Open this project file'}
      aria-current={props.selected === props.path ? 'page' : undefined}
      aria-expanded={folder() && !props.revealFolder ? (open() ? 'true' : 'false') : undefined}
      class="w-full min-w-0 justify-start gap-1.5 rounded-sm px-2 py-1.5 text-left font-mono text-[11.5px] font-normal hover:bg-accent/50 disabled:text-muted-foreground/50"
      disabled={blocked()}
      variant={null}
      size={null}
      onClick={() => {
        if (writerNow() !== 'person') return
        if (!folder()) props.openFile(props.path)
        else if (props.revealFolder) props.revealFolder(props.path)
        else props.controls.toggle(props.path)
      }}
      title={props.entry.reason ?? props.path}
    >
      <Show when={!props.revealFolder}>
        <ChevronRightIcon
          class={cn(
            'size-3 shrink-0 text-muted-foreground',
            !folder() && 'invisible',
            open() && 'rotate-90',
          )}
          aria-hidden="true"
        />
      </Show>
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
      <span class="min-w-0 truncate">{props.revealFolder ? props.path : props.entry.name}</span>
    </Button>
  )
  return (
    <li>
      <div
        class={cn(
          'flex min-w-0 items-center rounded-sm',
          props.selected === props.path && 'bg-accent text-foreground',
        )}
      >
        <Show when={!blocked()} fallback={row()}>
          <FileMenu
            entry={props.entry}
            onWrite={props.controls.onWrite}
            onFeedback={props.controls.onFeedback}
          >
            {row()}
          </FileMenu>
        </Show>
      </div>
      <Show when={folder() && open()}>
        <div class="ml-3 border-l border-border/50 pl-1">
          <NestedDirectory
            path={props.path}
            selected={props.selected}
            refresh={props.refresh}
            openFile={props.openFile}
            controls={props.controls}
          />
        </div>
      </Show>
    </li>
  )
}
