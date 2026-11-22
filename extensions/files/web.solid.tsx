import { FileIcon, FilesIcon, FolderTreeIcon, RefreshCwIcon, XIcon } from '@lucide/solid'
import { For, Show, createMemo, createSignal, onSettled } from 'solid-js'
import { Button } from '@/components/ui/button.solid.tsx'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog.solid.tsx'
import {
  cn, defineWebExtension, errorMessage, formatBytes, Header, Sidebar,
  StatusLine, useAction, useExtensionUiState,
} from '@/sdk/solid'
import type { DirectoryResult } from './types.ts'
import { dirty } from './buffers.ts'
import type { FileBuffer } from './buffers.ts'
import { List, useFiles } from './session.ts'
import { Directory } from './tree.solid.tsx'
import { MarkdownEditor } from './markdown-editor.solid.tsx'
import { MarkdownPreview } from './markdown-preview.solid.tsx'
import { previewReason } from './markdown-document.ts'
import { FileLink } from './link.solid.tsx'
import { fileRequests } from './links.ts'

function FilesSurface() {
  const [refresh, setRefresh] = createSignal(0)
  const [treeOpen, setTreeOpen] = createSignal(false)
  const listing = useAction(List, { path: '' }, { on: refresh, focus: true })
  return (
    <>
      <div class="flex min-h-0 flex-1">
        <Sidebar />
        <main class="flex min-w-0 flex-1 flex-col" data-files-surface>
          <Header>
            <span class="flex items-center gap-2 text-[13px] font-medium">
              <FilesIcon class="size-4 text-muted-foreground" />Files
            </span>
            <Button
              aria-label={treeOpen() ? 'Show editor' : 'Show files'}
              class="ml-auto md:hidden"
              size="sm" variant="ghost"
              onClick={() => setTreeOpen(!treeOpen())}
            >
              <Show when={treeOpen()} fallback={<FolderTreeIcon class="size-4" />}>
                <XIcon class="size-4" />
              </Show>
            </Button>
          </Header>
          <Show when={!listing.error()} fallback={
            <div role="alert" class="m-4 rounded-lg border border-error/30 bg-error/5 p-4 text-[13px]">
              <p>{errorMessage(listing.error())}</p>
              <Button class="mt-3" size="sm" variant="outline"
                onClick={() => setRefresh((v) => v + 1)}>Retry</Button>
            </div>
          }>
            <Show when={listing.data()} fallback={
              <p role="status" class="p-5 font-mono text-[12px] text-muted-foreground">
                Loading project files…
              </p>
            }>
              {(data) => (
                <Workspace
                  listing={data()}
                  treeOpen={treeOpen}
                  setTreeOpen={setTreeOpen}
                  refresh={refresh}
                  onRefresh={() => setRefresh((v) => v + 1)}
                />
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
  listing: DirectoryResult
  treeOpen: () => boolean
  setTreeOpen(open: boolean): void
  refresh: () => number
  onRefresh(): void
}) {
  const files = useFiles(props.listing.root)
  const active = createMemo(() => files.state().tabs.find((file) => file.path === files.state().active))
  const [preview, setPreview] = useExtensionUiState('preview', true)
  const [confirm, setConfirm] = createSignal<{ path: string; action: 'close' | 'reload' } | null>(null)
  const markdown = () => !!active() && /\.(md|mdx|markdown)$/i.test(active()!.path)
  const ready = () => !!active() && !active()!.loading && !!active()!.version
  let richEdit: { id: number; text: string } | null = null
  let releaseDiscard: (() => void) | null = null

  const previewIssue = createMemo(() => {
    const file = active()
    if (!markdown() || !file) return undefined
    // Do not reparse an editor's own echo while the caret is active.
    if (preview() && richEdit?.id === file.id && richEdit.text === file.text) return undefined
    return previewReason(file.path, file.text)
  })
  const showPreview = () => markdown() && preview()

  function discard(file: FileBuffer, action: 'close' | 'reload') {
    const current = files.get().tabs.find((item) => item.id === file.id)
    if (!current || current.saving) return
    if (dirty(current)) {
      if (files.pause(current.id)) {
        releaseDiscard = () => files.resume(current.id)
        setConfirm({ path: current.path, action })
      }
    } else {
      richEdit = null
      files[action](current.path)
    }
  }
  function cancelDiscard() {
    releaseDiscard?.()
    releaseDiscard = null
    setConfirm(null)
  }
  function openFile(path: string) {
    richEdit = null
    files.open(path)
    props.setTreeOpen(false)
  }

  onSettled(() => {
    function takeRequest() {
      const request = fileRequests.get()
      if (!request) return
      richEdit = null
      files.open(request.path)
      props.setTreeOpen(false)
      fileRequests.consume(request)
    }
    const unsubscribe = fileRequests.subscribe(takeRequest)
    takeRequest()
    function keydown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        const file = active()
        if (file && !confirm()) files.save(file.id)
      }
    }
    window.addEventListener('keydown', keydown)
    return () => {
      unsubscribe()
      window.removeEventListener('keydown', keydown)
      releaseDiscard?.()
    }
  })

  return (
    <>
      <Show when={files.state().storageError}>
        <p role="alert" class="border-b border-warning/30 bg-warning/5 px-3 py-2 text-[12px] text-warning">
          {files.state().storageError}
        </p>
      </Show>
      <div class="flex min-h-0 flex-1">
        <section aria-label="File editor"
          class={cn('min-h-0 min-w-0 flex-1 flex-col',
            props.treeOpen() ? 'max-md:hidden md:flex' : 'flex')}>
          <Show when={files.state().tabs.length > 0}>
            <div aria-label="Open files"
              class="flex shrink-0 overflow-x-auto border-b border-border/70">
              <For each={files.state().tabs} keyed={(item) => item.id}>
                {(file) => (
                  <div class={cn('group flex shrink-0 items-center border-r border-border/50',
                    file().path === files.state().active && 'bg-accent/50')}>
                    <Button
                      aria-current={file().path === files.state().active ? 'page' : undefined}
                      class={cn('flex h-auto max-w-64 items-center gap-2 border-b-2 border-transparent px-3 py-2 font-mono text-[11.5px] font-normal text-muted-foreground hover:text-foreground',
                        file().path === files.state().active && 'border-brand text-foreground')}
                      size={null} variant={null}
                      title={file().path}
                      onClick={() => openFile(file().path)}
                    >
                      <FileIcon class="size-3 shrink-0" />
                      <span class="truncate">{file().path.split('/').at(-1)}</span>
                      <Show when={dirty(file())}>
                        <span aria-label="Modified" class="size-1.5 shrink-0 rounded-full bg-brand" />
                      </Show>
                    </Button>
                    <Button
                      aria-label={`Close ${file().path}`}
                      class="mr-1 size-6 p-1 text-muted-foreground disabled:opacity-40"
                      size={null} variant="ghost"
                      disabled={file().saving}
                      onClick={() => discard(file(), 'close')}
                    >
                      <XIcon class="size-3" />
                    </Button>
                  </div>
                )}
              </For>
            </div>
          </Show>
          <Show when={active()} fallback={
            <div class="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
              <FilesIcon class="size-7 text-muted-foreground/40" />
              <p class="text-[13px] text-muted-foreground">Open a file to read or edit it.</p>
              <p class="max-w-sm text-[12px] leading-relaxed text-muted-foreground/60">
                Text and Markdown, saved automatically after you edit. Files are in the project
                directory, not a branch checkout.
              </p>
              <Button class="md:hidden" onClick={() => props.setTreeOpen(true)}
                size="sm" variant="outline">Browse files</Button>
            </div>
          }>
            {(file) => (
              <>
                <div class="flex min-w-0 flex-wrap items-center gap-2 border-b border-border/70 px-3 py-2">
                  <span class="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground"
                    title={file().path}>{file().path}</span>
                  <Show when={markdown() && ready()}>
                    <div class="flex gap-0.5 rounded-md border border-border/70 p-0.5"
                      role="group" aria-label="Document view">
                      <Button
                        aria-label="Preview document"
                        aria-pressed={showPreview()}
                        class={cn('h-auto rounded px-2 py-1 text-[11px] font-normal text-muted-foreground',
                          showPreview() && 'bg-accent text-foreground')}
                        size={null} variant={null}
                        title={previewIssue()
                          ? 'Read-only Preview; use Source to preserve syntax.'
                          : undefined}
                        onClick={() => { richEdit = null; setPreview(true) }}
                      >Preview</Button>
                      <Button
                        aria-label="Edit document source"
                        aria-pressed={!showPreview()}
                        class={cn('h-auto rounded px-2 py-1 text-[11px] font-normal text-muted-foreground',
                          !showPreview() && 'bg-accent text-foreground')}
                        size={null} variant={null}
                        onClick={() => { richEdit = null; setPreview(false) }}
                      >Source</Button>
                    </div>
                  </Show>
                  <Button aria-label="Reload from disk"
                    disabled={file().loading || file().saving}
                    onClick={() => discard(file(), 'reload')}
                    size="sm" variant="ghost">
                    <RefreshCwIcon class="size-3.5" />
                  </Button>
                  <span class="font-mono text-[10.5px] text-muted-foreground">Autosave</span>
                </div>
                <Show when={file().conflict}>
                  <div role="alert" class="border-b border-warning/30 bg-warning/5 px-3 py-2 text-[12px] text-warning">
                    The file changed on disk. Autosave is paused and your draft is kept; copy
                    it before reloading the file. Nothing was overwritten.
                  </div>
                </Show>
                <Show when={file().error}>
                  <p role="alert" class="border-b border-error/30 bg-error/5 px-3 py-2 text-[12px] text-error">
                    {file().error}
                    <Show when={ready() && !file().conflict}>
                      <Button class="ml-2" onClick={() => files.retry(file().id)}
                        size="sm" variant="outline">Retry autosave</Button>
                    </Show>
                  </p>
                </Show>
                <Show when={file().restored}>
                  <p role="status" class="border-b border-border/70 px-3 py-2 text-[11px] text-muted-foreground">
                    Restored draft kept in this browser tab. Autosave resumes when you edit, or
                    choose Resume; the disk version is checked first.
                    <Show when={!file().conflict && !file().error}>
                      <Button class="ml-2" onClick={() => files.retry(file().id)}
                        size="sm" variant="outline">Resume autosave</Button>
                    </Show>
                  </p>
                </Show>
                <Show when={previewIssue() && ready()}>
                  <p role="status" class="border-b border-border/70 px-3 py-2 text-[11px] text-muted-foreground">
                    Preview is read-only for this document. Edit in Source to preserve its syntax.
                  </p>
                </Show>
                <Show when={!file().loading} fallback={
                  <p role="status" class="p-5 font-mono text-[12px] text-muted-foreground">
                    Loading file…
                  </p>
                }>
                  <Show when={ready()} fallback={
                    <div class="p-5 text-[12px] text-muted-foreground">
                      This file could not be opened. Choose another file or reload to retry.
                    </div>
                  }>
                    <Show when={showPreview()} fallback={
                      <Show when={file().id} keyed>
                        {() => (
                          <textarea
                            aria-label={`Edit ${file().path}`}
                            autocapitalize="off" autocorrect="off" spellcheck={false} wrap="off"
                            class="min-h-0 w-full flex-1 resize-none bg-background px-4 py-4 font-mono text-[13px] leading-6 text-foreground outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
                            value={file().text}
                            onInput={(event) => files.edit(file().id, event.currentTarget.value)}
                          />
                        )}
                      </Show>
                    }>
                      <div aria-label="Markdown preview" class="min-h-0 flex-1 overflow-auto">
                        <div class="mx-auto max-w-3xl px-5 py-6 text-[14px] leading-relaxed">
                          <Show when={previewIssue()} fallback={
                            <Show when={file().id} keyed>
                              {() => <MarkdownEditor
                                path={file().path}
                                value={file().text}
                                onChange={(text) => {
                                  richEdit = { id: file().id, text }
                                  files.edit(file().id, text)
                                }}
                              />}
                            </Show>
                          }>
                            <MarkdownPreview value={file().text} />
                          </Show>
                        </div>
                      </div>
                    </Show>
                  </Show>
                </Show>
                <Show when={ready()}>
                  <div role="status"
                    class="flex items-center gap-3 border-t border-border/70 px-3 py-1.5 font-mono text-[10.5px] text-muted-foreground">
                    <span class={cn(file().conflict ? 'text-warning' : dirty(file()) && 'text-brand')}>
                      {file().saving ? 'Saving…'
                        : file().conflict ? 'Conflict · draft kept'
                        : file().error ? 'Autosave paused · draft kept'
                        : dirty(file()) ? file().restored ? 'Recovered draft' : 'Waiting to save…'
                        : 'Saved automatically'}
                    </span>
                    <span>UTF-8</span>
                    <span class="ml-auto">
                      {file().text.split('\n').length} lines ·{' '}
                      {formatBytes(new TextEncoder().encode(file().text).length)}
                    </span>
                  </div>
                </Show>
              </>
            )}
          </Show>
        </section>
        <aside aria-label="Project file tree"
          class={cn(
            'min-h-0 w-full shrink-0 flex-col border-l border-border/70 md:flex md:w-64! lg:w-72!',
            props.treeOpen() ? 'flex' : 'max-md:hidden',
          )}>
          <div class="flex shrink-0 items-center justify-between border-b border-border/70 px-3 py-2">
            <span class="section-label">Project files</span>
            <Button aria-label="Refresh files" onClick={props.onRefresh} size="sm" variant="ghost">
              <RefreshCwIcon class="size-3.5" />
            </Button>
          </div>
          <div class="min-h-0 flex-1 overflow-auto p-1.5">
            <Directory
              path="" selected={files.state().active}
              refresh={props.refresh()} openFile={openFile}
              initial={props.listing}
            />
          </div>
          <p class="border-t border-border/70 px-3 py-2 text-[10.5px] leading-relaxed text-muted-foreground/60">
            Generated folders and credentials are excluded. Text files up to 512 KiB.
          </p>
        </aside>
      </div>
      <Dialog
        open={confirm() !== null}
        onOpenChange={(open) => { if (!open) cancelDiscard() }}
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
            <Button onClick={cancelDiscard} variant="outline">Keep editing</Button>
            <Button disabled={files.state().tabs.some((item) =>
                item.path === confirm()?.path && item.saving)}
              onClick={() => {
                const pending = confirm()
                if (pending && files[pending.action](pending.path)) {
                  releaseDiscard = null
                  richEdit = null
                  setConfirm(null)
                }
              }}
            >Discard draft</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
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
