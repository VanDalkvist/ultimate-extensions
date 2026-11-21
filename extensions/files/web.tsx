import { FileIcon, FilesIcon, FolderTreeIcon, RefreshCwIcon, XIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
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
} from '@/sdk'
import type { DirectoryResult } from './types.ts'
import { dirty } from './buffers.tsx'
import type { FileBuffer } from './buffers.tsx'
import { List, useFiles } from './session.tsx'
import { Directory } from './tree.tsx'
import { MarkdownEditor } from './markdown-editor.tsx'
import { MarkdownPreview } from './markdown-preview.tsx'
import { previewReason } from './markdown-document.tsx'
import { FileLink, fileRequests } from './links.tsx'

function FilesSurface() {
  const [refresh, setRefresh] = useState(0)
  const [treeOpen, setTreeOpen] = useState(false)
  const listing = useAction(List, { path: '' }, { on: refresh, focus: true })
  return (
    <>
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="flex min-w-0 flex-1 flex-col" data-files-surface>
          <Header>
            <span className="flex items-center gap-2 text-[13px] font-medium">
              <FilesIcon className="size-4 text-muted-foreground" /> Files
            </span>
            <Button
              aria-label={treeOpen ? 'Show editor' : 'Show files'}
              className="ml-auto md:hidden"
              size="icon-sm"
              variant="ghost"
              onClick={() => setTreeOpen(!treeOpen)}
            >
              {treeOpen ? <XIcon className="size-4" /> : <FolderTreeIcon className="size-4" />}
            </Button>
          </Header>
          {listing.error ? (
            <div
              role="alert"
              className="m-4 rounded-lg border border-error/30 bg-error/5 p-4 text-[13px]"
            >
              <p>{errorMessage(listing.error)}</p>
              <Button
                className="mt-3"
                size="sm"
                variant="outline"
                onClick={() => setRefresh(refresh + 1)}
              >
                Retry
              </Button>
            </div>
          ) : listing.data ? (
            <Workspace
              key={listing.data.root}
              listing={listing.data}
              treeOpen={treeOpen}
              setTreeOpen={setTreeOpen}
              refresh={refresh}
              onRefresh={() => setRefresh(refresh + 1)}
            />
          ) : (
            <p role="status" className="p-5 font-mono text-[12px] text-muted-foreground">
              Loading project files…
            </p>
          )}
        </main>
      </div>
      <StatusLine />
    </>
  )
}

function Workspace({
  listing,
  treeOpen,
  setTreeOpen,
  refresh,
  onRefresh,
}: {
  listing: DirectoryResult
  treeOpen: boolean
  setTreeOpen: (open: boolean) => void
  refresh: number
  onRefresh: () => void
}) {
  const files = useFiles(listing.root)
  const active = files.tabs.find((file) => file.path === files.active)
  const [preview, setPreview] = useExtensionUiState('preview', true)
  const [confirm, setConfirm] = useState<{ path: string; action: 'close' | 'reload' } | null>(null)
  const markdown = active && /\.(md|mdx|markdown)$/i.test(active.path)
  const ready = active && !active.loading && !!active.version
  const richEdit = useRef<{ id: number; text: string } | null>(null)
  const releaseDiscard = useRef<(() => void) | null>(null)
  useEffect(
    () => () => {
      releaseDiscard.current?.()
    },
    [],
  )
  const request = useSyncExternalStore(fileRequests.subscribe, fileRequests.get)
  useEffect(() => {
    if (!request) return
    richEdit.current = null
    files.open(request.path)
    setTreeOpen(false)
    fileRequests.consume(request)
  }, [request, files])
  const activePath = active?.path
  const activeText = active?.text
  const activeId = active?.id
  const previewIssue = useMemo(() => {
    if (!markdown || activePath === undefined || activeText === undefined) return undefined
    // The mounted editor already owns this text. Do not reparse its output and lose focus mid-keystroke (#2840).
    const emitted = richEdit.current
    if (preview && emitted && emitted.id === activeId && emitted.text === activeText)
      return undefined
    return previewReason(activePath, activeText)
  }, [activePath, activeText, activeId, markdown, preview])
  const showPreview = !!markdown && preview

  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        if (active && !confirm) files.save(active.id)
      }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [active, files, confirm])

  function discard(file: FileBuffer, action: 'close' | 'reload') {
    const current = files.get().tabs.find((item) => item.id === file.id)
    if (!current || current.saving) return
    if (dirty(current)) {
      if (files.pause(current.id)) {
        releaseDiscard.current = () => files.resume(current.id)
        setConfirm({ path: current.path, action })
      }
    } else {
      richEdit.current = null
      files[action](current.path)
    }
  }
  function cancelDiscard() {
    releaseDiscard.current?.()
    releaseDiscard.current = null
    setConfirm(null)
  }
  function openFile(path: string) {
    richEdit.current = null
    files.open(path)
    setTreeOpen(false)
  }

  return (
    <>
      {files.storageError && (
        <p
          role="alert"
          className="border-b border-warning/30 bg-warning/5 px-3 py-2 text-[12px] text-warning"
        >
          {files.storageError}
        </p>
      )}
      <div className="flex min-h-0 flex-1">
        <section
          aria-label="File editor"
          className={cn(
            'min-h-0 min-w-0 flex-1 flex-col',
            treeOpen ? 'max-md:hidden md:flex' : 'flex',
          )}
        >
          {files.tabs.length > 0 && (
            <div
              aria-label="Open files"
              className="flex shrink-0 overflow-x-auto border-b border-border/70"
            >
              {files.tabs.map((file) => (
                <div
                  key={file.id}
                  className={cn(
                    'group flex shrink-0 items-center border-r border-border/50',
                    file.path === files.active && 'bg-accent/50',
                  )}
                >
                  <button
                    aria-current={file.path === files.active ? 'page' : undefined}
                    className={cn(
                      'flex max-w-64 items-center gap-2 border-b-2 border-transparent px-3 py-2 font-mono text-[11.5px] text-muted-foreground hover:text-foreground',
                      file.path === files.active && 'border-brand text-foreground',
                    )}
                    onClick={() => openFile(file.path)}
                    title={file.path}
                    type="button"
                  >
                    <FileIcon className="size-3 shrink-0" />
                    <span className="truncate">{file.path.split('/').at(-1)}</span>
                    {dirty(file) && (
                      <span
                        aria-label="Modified"
                        className="size-1.5 shrink-0 rounded-full bg-brand"
                      />
                    )}
                  </button>
                  <button
                    aria-label={`Close ${file.path}`}
                    className="mr-1 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
                    disabled={file.saving}
                    onClick={() => discard(file, 'close')}
                    type="button"
                  >
                    <XIcon className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {active ? (
            <>
              <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-border/70 px-3 py-2">
                <span
                  className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground"
                  title={active.path}
                >
                  {active.path}
                </span>
                {markdown && ready && (
                  <div
                    className="flex gap-0.5 rounded-md border border-border/70 p-0.5"
                    role="group"
                    aria-label="Document view"
                  >
                    <button
                      aria-pressed={showPreview}
                      className={cn(
                        'rounded px-2 py-1 text-[11px] text-muted-foreground disabled:opacity-40',
                        showPreview && 'bg-accent text-foreground',
                      )}
                      title={
                        previewIssue
                          ? 'Read-only Preview; edit in Source to preserve syntax.'
                          : undefined
                      }
                      onClick={() => {
                        richEdit.current = null
                        setPreview(true)
                      }}
                      type="button"
                    >
                      Preview
                    </button>
                    <button
                      aria-pressed={!showPreview}
                      className={cn(
                        'rounded px-2 py-1 text-[11px] text-muted-foreground',
                        !showPreview && 'bg-accent text-foreground',
                      )}
                      onClick={() => {
                        richEdit.current = null
                        setPreview(false)
                      }}
                      type="button"
                    >
                      Source
                    </button>
                  </div>
                )}
                <Button
                  aria-label="Reload from disk"
                  disabled={active.loading || active.saving}
                  onClick={() => discard(active, 'reload')}
                  size="icon-sm"
                  variant="ghost"
                >
                  <RefreshCwIcon className="size-3.5" />
                </Button>
                <span className="font-mono text-[10.5px] text-muted-foreground">Autosave</span>
              </div>
              {active.conflict && (
                <div
                  role="alert"
                  className="border-b border-warning/30 bg-warning/5 px-3 py-2 text-[12px] text-warning"
                >
                  The file changed on disk. Autosave is paused and your draft is kept; copy it
                  before reloading the file. Nothing was overwritten.
                </div>
              )}
              {active.error && (
                <p
                  role="alert"
                  className="border-b border-error/30 bg-error/5 px-3 py-2 text-[12px] text-error"
                >
                  {active.error}
                  {ready && !active.conflict && (
                    <Button
                      className="ml-2"
                      onClick={() => files.retry(active.id)}
                      size="xs"
                      variant="outline"
                    >
                      Retry autosave
                    </Button>
                  )}
                </p>
              )}
              {active.restored && (
                <p
                  role="status"
                  className="border-b border-border/70 px-3 py-2 text-[11px] text-muted-foreground"
                >
                  Restored draft kept in this browser tab. Autosave resumes when you edit, or choose
                  Resume; the disk version is checked first.
                  {!active.conflict && !active.error && (
                    <Button
                      className="ml-2"
                      onClick={() => files.retry(active.id)}
                      size="xs"
                      variant="outline"
                    >
                      Resume autosave
                    </Button>
                  )}
                </p>
              )}
              {previewIssue && ready && (
                <p
                  role="status"
                  className="border-b border-border/70 px-3 py-2 text-[11px] text-muted-foreground"
                >
                  Preview is read-only for this document. Edit in Source to preserve its syntax.
                </p>
              )}
              {active.loading ? (
                <p role="status" className="p-5 font-mono text-[12px] text-muted-foreground">
                  Loading file…
                </p>
              ) : ready ? (
                showPreview ? (
                  <div aria-label="Markdown preview" className="min-h-0 flex-1 overflow-auto">
                    <div className="mx-auto max-w-3xl px-5 py-6 text-[14px] leading-relaxed">
                      {previewIssue ? (
                        <MarkdownPreview value={active.text} />
                      ) : (
                        <MarkdownEditor
                          key={active.id}
                          path={active.path}
                          value={active.text}
                          onChange={(text) => {
                            richEdit.current = { id: active.id, text }
                            files.edit(active.id, text)
                          }}
                        />
                      )}
                    </div>
                  </div>
                ) : (
                  <textarea
                    key={active.id}
                    aria-label={`Edit ${active.path}`}
                    autoCapitalize="off"
                    autoCorrect="off"
                    className="min-h-0 w-full flex-1 resize-none bg-background px-4 py-4 font-mono text-[13px] leading-6 text-foreground outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
                    onChange={(event) => files.edit(active.id, event.target.value)}
                    spellCheck={false}
                    value={active.text}
                    wrap="off"
                  />
                )
              ) : (
                <div className="p-5 text-[12px] text-muted-foreground">
                  This file could not be opened. Choose another file or reload to retry.
                </div>
              )}
              {ready && (
                <div
                  role="status"
                  className="flex items-center gap-3 border-t border-border/70 px-3 py-1.5 font-mono text-[10.5px] text-muted-foreground"
                >
                  <span
                    className={cn(active.conflict ? 'text-warning' : dirty(active) && 'text-brand')}
                  >
                    {active.saving
                      ? 'Saving…'
                      : active.conflict
                        ? 'Conflict · draft kept'
                        : active.error
                          ? 'Autosave paused · draft kept'
                          : dirty(active)
                            ? active.restored
                              ? 'Recovered draft'
                              : 'Waiting to save…'
                            : 'Saved automatically'}
                  </span>
                  <span>UTF-8</span>
                  <span className="ml-auto">
                    {active.text.split('\n').length} lines ·{' '}
                    {formatBytes(new TextEncoder().encode(active.text).length)}
                  </span>
                </div>
              )}
            </>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
              <FilesIcon className="size-7 text-muted-foreground/40" />
              <p className="text-[13px] text-muted-foreground">Open a file to read or edit it.</p>
              <p className="max-w-sm text-[12px] leading-relaxed text-muted-foreground/60">
                Text and Markdown, saved automatically after you edit. Files are in the project
                directory, not a branch checkout.
              </p>
              <Button
                className="md:hidden"
                onClick={() => setTreeOpen(true)}
                size="sm"
                variant="outline"
              >
                Browse files
              </Button>
            </div>
          )}
        </section>
        <aside
          aria-label="Project file tree"
          className={cn(
            // GenUI can repeat .w-full after the host's responsive utilities (#653).
            'min-h-0 w-full shrink-0 flex-col border-l border-border/70 md:flex md:w-64! lg:w-72!',
            // A later extension's .hidden utility must not hide this tree on desktop (#653).
            treeOpen ? 'flex' : 'max-md:hidden',
          )}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-border/70 px-3 py-2">
            <span className="section-label">Project files</span>
            <Button aria-label="Refresh files" onClick={onRefresh} size="icon-sm" variant="ghost">
              <RefreshCwIcon className="size-3.5" />
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-1.5">
            <Directory
              path=""
              selected={files.active}
              refresh={refresh}
              openFile={openFile}
              initial={listing}
            />
          </div>
          <p className="border-t border-border/70 px-3 py-2 text-[10.5px] leading-relaxed text-muted-foreground/60">
            Generated folders and credentials are excluded. Text files up to 512 KiB.
          </p>
        </aside>
      </div>
      <Dialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) cancelDiscard()
        }}
      >
        <DialogContent>
          <DialogTitle>Discard unsaved changes?</DialogTitle>
          <DialogDescription className="break-all">
            {confirm?.path} has a draft in this tab.{' '}
            {confirm?.action === 'reload'
              ? 'Reloading replaces it with the current file on disk.'
              : 'Closing removes this draft.'}
          </DialogDescription>
          <div className="flex justify-end gap-2">
            <Button onClick={cancelDiscard} variant="outline">
              Keep editing
            </Button>
            <Button
              disabled={files.tabs.some((file) => file.path === confirm?.path && file.saving)}
              onClick={() => {
                if (confirm && files[confirm.action](confirm.path)) {
                  releaseDiscard.current = null
                  richEdit.current = null
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
