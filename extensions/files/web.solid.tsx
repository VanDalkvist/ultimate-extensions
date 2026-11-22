import { FileIcon, FilesIcon, FolderTreeIcon, RefreshCwIcon, XIcon } from '@lucide/solid'
import { For, Show, createEffect, createMemo, createSignal, onSettled } from 'solid-js'
import { Button } from '@/components/ui/button.solid.tsx'
import { SegmentedControl, SegmentedControlItem } from '@/components/ui/segmented-control.solid.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog.solid.tsx'
import {
  cn,
  defineWebExtension,
  errorMessage,
  formatBytes,
  Header,
  Sidebar,
  StatusLine,
  useAction,
  useExtensionUiState,
} from '@/sdk/solid'
import type { DirectoryResult } from './types.ts'
import { dirty, type FileBuffer } from './buffers.ts'
import { List, session } from './session.ts'
import { Directory } from './tree.solid.tsx'
import { MarkdownEditor } from './markdown-editor.solid.tsx'
import { MarkdownPreview } from './markdown-preview.solid.tsx'
import { previewReason } from './markdown-document.ts'
import { FileLink } from './file-link.solid.tsx'
import { fileRequests } from './links.ts'

function FilesSurface() {
  const [refresh, setRefresh] = createSignal(0)
  const [treeOpen, setTreeOpen] = createSignal(false)
  const listing = useAction(List, { path: '' }, { on: refresh, focus: true })
  const refreshFiles = () => setRefresh((count) => count + 1)
  return (
    <>
      <div class="flex min-h-0 flex-1">
        <Sidebar />
        <main class="flex min-w-0 flex-1 flex-col" data-files-surface>
          <Header>
            <span class="flex items-center gap-2 text-[13px] font-medium">
              <FilesIcon class="size-4 text-muted-foreground" /> Files
            </span>
            <Button
              aria-label={treeOpen() ? 'Show editor' : 'Show files'}
              class="ml-auto md:hidden"
              size="icon-sm"
              variant="ghost"
              onClick={() => setTreeOpen((open) => !open)}
            >
              {treeOpen() ? <XIcon class="size-4" /> : <FolderTreeIcon class="size-4" />}
            </Button>
          </Header>
          <Show
            when={!listing.error()}
            fallback={
              <div
                role="alert"
                class="m-4 rounded-lg border border-error/30 bg-error/5 p-4 text-[13px]"
              >
                <p>{errorMessage(listing.error())}</p>
                <Button class="mt-3" size="sm" variant="outline" onClick={refreshFiles}>
                  Retry
                </Button>
              </div>
            }
          >
            <Show
              when={listing.data()}
              fallback={
                <output class="block p-5 font-mono text-[12px] text-muted-foreground">
                  Loading project files…
                </output>
              }
            >
              {(data) => (
                <Show when={data().root} keyed>
                  {(root) => (
                    <Workspace
                      root={root}
                      listing={data()}
                      treeOpen={treeOpen()}
                      setTreeOpen={setTreeOpen}
                      refresh={refresh()}
                      onRefresh={refreshFiles}
                    />
                  )}
                </Show>
              )}
            </Show>
          </Show>
        </main>
      </div>
      <StatusLine />
    </>
  )
}

function Workspace(props: {
  root: string
  listing: DirectoryResult
  treeOpen: boolean
  setTreeOpen: (open: boolean) => void
  refresh: number
  onRefresh: () => void
}) {
  const files = createMemo(() => session(props.root))
  const [state, setState] = createSignal(() => files().get())
  createEffect(files, (current) => current.subscribe(() => setState(current.get())))
  createEffect(
    () => ({ current: files(), tabs: state().tabs }),
    ({ current, tabs }) => {
      current.load(tabs)
    },
  )
  const active = createMemo(() => state().tabs.find((file) => file.path === state().active))
  const [preview, setPreview] = useExtensionUiState('preview', true)
  const [confirm, setConfirm] = createSignal<{ path: string; action: 'close' | 'reload' } | null>(
    null,
  )
  const activePath = createMemo(() => active()?.path)
  const activeText = createMemo(() => active()?.text)
  const activeId = createMemo(() => active()?.id)
  const markdown = () => /\.(md|mdx|markdown)$/i.test(activePath() ?? '')
  const showPreview = () => markdown() && preview()
  const ready = () => !active()?.loading && !!active()?.version
  let richEdit: { id: number; text: string } | undefined
  let releaseDiscard: (() => void) | undefined

  const openTarget = () => ({ current: files(), setTreeOpen: props.setTreeOpen })
  function openFile(path: string, { current, setTreeOpen } = openTarget()) {
    richEdit = undefined
    current.open(path)
    setTreeOpen(false)
  }
  createEffect(openTarget, (target) => {
    const sync = () => {
      const request = fileRequests.get()
      if (!request) return
      openFile(request.path, target)
      fileRequests.consume(request)
    }
    const unsubscribe = fileRequests.subscribe(sync)
    sync()
    return unsubscribe
  })
  onSettled(() => {
    function keydown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 's') return
      event.preventDefault()
      const id = activeId()
      if (id !== undefined && !confirm()) files().save(id)
    }
    window.addEventListener('keydown', keydown)
    return () => {
      releaseDiscard?.()
      window.removeEventListener('keydown', keydown)
    }
  })
  const previewIssue = createMemo(() => {
    const path = activePath()
    const text = activeText()
    const id = activeId()
    if (path === undefined || text === undefined || !markdown()) return undefined
    if (preview() && richEdit?.id === id && richEdit?.text === text) return undefined
    return previewReason(path, text)
  })

  function discard(id: number, action: 'close' | 'reload') {
    const currentSession = files()
    const current = currentSession.get().tabs.find((item) => item.id === id)
    if (!current || current.saving) return
    if (!dirty(current)) {
      richEdit = undefined
      currentSession[action](current.path)
    } else if (currentSession.pause(id)) {
      releaseDiscard = () => currentSession.resume(id)
      setConfirm({ path: current.path, action })
    }
  }
  function cancelDiscard() {
    releaseDiscard?.()
    releaseDiscard = undefined
    setConfirm(null)
  }
  const documentView = (): 'preview' | 'source' => (showPreview() ? 'preview' : 'source')
  function changeView(next: ReturnType<typeof documentView>) {
    richEdit = undefined
    setPreview(next === 'preview')
  }

  return (
    <>
      {state().storageError && (
        <p
          role="alert"
          class="border-b border-warning/30 bg-warning/5 px-3 py-2 text-[12px] text-warning"
        >
          {state().storageError}
        </p>
      )}
      <div class="flex min-h-0 flex-1">
        <section
          aria-label="File editor"
          class={cn(
            'min-h-0 min-w-0 flex-1 flex-col',
            props.treeOpen ? 'max-md:hidden md:flex' : 'flex',
          )}
        >
          <Show when={state().tabs.length > 0}>
            <div
              aria-label="Open files"
              class="flex shrink-0 overflow-x-auto border-b border-border/70"
            >
              <For each={state().tabs} keyed={(file) => file.id}>
                {(file) => (
                  <div
                    class={cn(
                      'group flex shrink-0 items-center border-r border-border/50',
                      file().path === state().active && 'bg-accent/50',
                    )}
                  >
                    <Button
                      aria-label={`Activate ${file().path}`}
                      aria-current={file().path === state().active ? 'page' : undefined}
                      class={cn(
                        'max-w-64 gap-2 rounded-none border-b-2 border-transparent px-3 py-2 font-mono text-[11.5px] font-normal text-muted-foreground hover:text-foreground',
                        file().path === state().active && 'border-brand text-foreground',
                      )}
                      onClick={() => openFile(file().path)}
                      title={file().path}
                      size={null}
                      variant={null}
                    >
                      <FileIcon class="size-3 shrink-0" />
                      <span class="truncate">{file().path.split('/').at(-1)}</span>
                      {dirty(file()) && (
                        <span
                          aria-label="Modified"
                          class="size-1.5 shrink-0 rounded-full bg-brand"
                        />
                      )}
                    </Button>
                    <Button
                      aria-label={`Close ${file().path}`}
                      class="mr-1 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                      disabled={file().saving}
                      onClick={() => discard(file().id, 'close')}
                      size={null}
                      variant={null}
                    >
                      <XIcon class="size-3" />
                    </Button>
                  </div>
                )}
              </For>
            </div>
          </Show>
          <Show
            when={active()}
            fallback={
              <div class="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
                <FilesIcon class="size-7 text-muted-foreground/40" />
                <p class="text-[13px] text-muted-foreground">Open a file to read or edit it.</p>
                <p class="max-w-sm text-[12px] leading-relaxed text-muted-foreground/60">
                  Text and Markdown, saved automatically after you edit. Files are in the project
                  directory, not a branch checkout.
                </p>
                <Button
                  class="md:hidden"
                  onClick={() => props.setTreeOpen(true)}
                  size="sm"
                  variant="outline"
                >
                  Browse files
                </Button>
              </div>
            }
          >
            {(file) => (
              <>
                <div class="flex min-w-0 flex-wrap items-center gap-2 border-b border-border/70 px-3 py-2">
                  <span
                    class="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground"
                    title={file().path}
                  >
                    {file().path}
                  </span>
                  <Show when={markdown() && ready()}>
                    <SegmentedControl
                      aria-label="Document view"
                      class="gap-0.5"
                      bind={[documentView, changeView]}
                    >
                      <SegmentedControlItem
                        value="preview"
                        class="h-auto rounded px-2 py-1 font-sans"
                        title={
                          previewIssue()
                            ? 'Read-only Preview; edit in Source to preserve syntax.'
                            : undefined
                        }
                      >
                        Preview
                      </SegmentedControlItem>
                      <SegmentedControlItem
                        value="source"
                        class="h-auto rounded px-2 py-1 font-sans"
                      >
                        Source
                      </SegmentedControlItem>
                    </SegmentedControl>
                  </Show>
                  <Button
                    aria-label="Reload from disk"
                    disabled={file().loading || file().saving}
                    onClick={() => discard(file().id, 'reload')}
                    size="icon-sm"
                    variant="ghost"
                  >
                    <RefreshCwIcon class="size-3.5" />
                  </Button>
                  <span class="font-mono text-[10.5px] text-muted-foreground">Autosave</span>
                </div>
                {file().conflict && (
                  <div
                    role="alert"
                    class="border-b border-warning/30 bg-warning/5 px-3 py-2 text-[12px] text-warning"
                  >
                    The file changed on disk. Autosave is paused and your draft is kept; copy it
                    before reloading the file. Nothing was overwritten.
                  </div>
                )}
                {file().error && (
                  <p
                    role="alert"
                    class="border-b border-error/30 bg-error/5 px-3 py-2 text-[12px] text-error"
                  >
                    {file().error}
                    {ready() && !file().conflict && (
                      <Button
                        class="ml-2"
                        onClick={() => files().retry(file().id)}
                        size="xs"
                        variant="outline"
                      >
                        Retry autosave
                      </Button>
                    )}
                  </p>
                )}
                {file().restored && (
                  <output class="block border-b border-border/70 px-3 py-2 text-[11px] text-muted-foreground">
                    Restored draft kept in this browser tab. Autosave resumes when you edit, or
                    choose Resume; the disk version is checked first.
                    {!file().conflict && !file().error && (
                      <Button
                        class="ml-2"
                        onClick={() => files().retry(file().id)}
                        size="xs"
                        variant="outline"
                      >
                        Resume autosave
                      </Button>
                    )}
                  </output>
                )}
                {previewIssue() && ready() && (
                  <output class="block border-b border-border/70 px-3 py-2 text-[11px] text-muted-foreground">
                    Preview is read-only for this document. Edit in Source to preserve its syntax.
                  </output>
                )}
                <Show
                  when={!file().loading}
                  fallback={
                    <output class="block p-5 font-mono text-[12px] text-muted-foreground">
                      Loading file…
                    </output>
                  }
                >
                  <Show
                    when={ready()}
                    fallback={
                      <div class="p-5 text-[12px] text-muted-foreground">
                        This file could not be opened. Choose another file or reload to retry.
                      </div>
                    }
                  >
                    <Show when={file().id} keyed>
                      {(id) => (
                        <Show
                          when={showPreview()}
                          fallback={
                            <textarea
                              aria-label={`Edit ${file().path}`}
                              autocapitalize="off"
                              autocorrect="off"
                              class="min-h-0 w-full flex-1 resize-none bg-background px-4 py-4 font-mono text-[13px] leading-6 text-foreground outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
                              onInput={(event) => files().edit(id, event.currentTarget.value)}
                              spellcheck="false"
                              value={file().text}
                              wrap="off"
                            />
                          }
                        >
                          <div aria-label="Markdown preview" class="min-h-0 flex-1 overflow-auto">
                            <div class="mx-auto max-w-3xl px-5 py-6 text-[14px] leading-relaxed">
                              <Show
                                when={previewIssue()}
                                fallback={
                                  <MarkdownEditor
                                    path={file().path}
                                    value={file().text}
                                    onChange={(text) => {
                                      richEdit = { id, text }
                                      files().edit(id, text)
                                    }}
                                  />
                                }
                              >
                                <MarkdownPreview value={file().text} />
                              </Show>
                            </div>
                          </div>
                        </Show>
                      )}
                    </Show>
                    <output class="flex items-center gap-3 border-t border-border/70 px-3 py-1.5 font-mono text-[10.5px] text-muted-foreground">
                      <span
                        class={cn(file().conflict ? 'text-warning' : dirty(file()) && 'text-brand')}
                      >
                        {saveStatus(file())}
                      </span>
                      <span>UTF-8</span>
                      <span class="ml-auto">
                        {file().text.split('\n').length} lines ·{' '}
                        {formatBytes(new TextEncoder().encode(file().text).length)}
                      </span>
                    </output>
                  </Show>
                </Show>
              </>
            )}
          </Show>
        </section>
        <aside
          aria-label="Project file tree"
          class={cn(
            'min-h-0 w-full shrink-0 flex-col border-l border-border/70 md:flex md:w-64! lg:w-72!',
            props.treeOpen ? 'flex' : 'max-md:hidden',
          )}
        >
          <div class="flex shrink-0 items-center justify-between border-b border-border/70 px-3 py-2">
            <span class="section-label">Project files</span>
            <Button
              aria-label="Refresh files"
              onClick={() => props.onRefresh()}
              size="icon-sm"
              variant="ghost"
            >
              <RefreshCwIcon class="size-3.5" />
            </Button>
          </div>
          <div class="min-h-0 flex-1 overflow-auto p-1.5">
            <Directory
              path=""
              selected={state().active}
              refresh={props.refresh}
              openFile={openFile}
              data={props.listing}
            />
          </div>
          <p class="border-t border-border/70 px-3 py-2 text-[10.5px] leading-relaxed text-muted-foreground/60">
            Generated folders and credentials are excluded. Text files up to 512 KiB.
          </p>
        </aside>
      </div>
      <Dialog
        open={confirm() !== null}
        onOpenChange={(open) => {
          if (!open) cancelDiscard()
        }}
      >
        <DialogContent>
          <DialogTitle>Discard unsaved changes?</DialogTitle>
          <DialogDescription class="break-all">
            {confirm()?.path} has a draft in this tab.{' '}
            {confirm()?.action === 'reload'
              ? 'Reloading replaces it with the current file on disk.'
              : 'Closing removes this draft.'}
          </DialogDescription>
          <div class="flex justify-end gap-2">
            <Button onClick={cancelDiscard} variant="outline">
              Keep editing
            </Button>
            <Button
              disabled={state().tabs.some((file) => file.path === confirm()?.path && file.saving)}
              onClick={() => {
                const decision = confirm()
                if (decision && files()[decision.action](decision.path)) {
                  releaseDiscard = undefined
                  richEdit = undefined
                  setConfirm(null)
                }
              }}
            >
              Discard draft
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function saveStatus(file: FileBuffer) {
  if (file.saving) return 'Saving…'
  if (file.conflict) return 'Conflict · draft kept'
  if (file.error) return 'Autosave paused · draft kept'
  if (!dirty(file)) return 'Saved automatically'
  return file.restored ? 'Recovered draft' : 'Waiting to save…'
}

export default defineWebExtension({
  link: FileLink,
  surfaces: [
    {
      id: 'files',
      title: 'Files',
      icon: FilesIcon,
      description: 'Browse and edit the project directory',
      order: 80,
      component: FilesSurface,
    },
  ],
  commands: [
    { id: 'files.open', title: 'Open Files', run: (context) => context.showSurface('files') },
  ],
})
