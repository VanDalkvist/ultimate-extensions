import { EllipsisIcon } from '@lucide/solid'
import { MenuContextTrigger } from '@ui-sdk/solid/menu'
import { For, Show, createSignal } from 'solid-js'
import type { JSX } from '@solidjs/web'
import { Button } from '@/components/ui/button.solid.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog.solid.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.solid.tsx'
import { Form } from '@/components/ui/form.solid.tsx'
import { Input } from '@/components/ui/input.solid.tsx'
import { actionRef, api, errorMessage, writerNow, writingAs } from '@/sdk/solid'
import { fileMarkdownLink } from './links.ts'
import type { FilesEntry } from './types.ts'

export const SearchFiles = actionRef<
  { query: string },
  { entries: FilesEntry[]; truncated: boolean }
>('files', 'search')
const Create = actionRef<{ path: string; kind: 'file' | 'directory' }, { path: string }>(
  'files',
  'create',
)
const Duplicate = actionRef<{ path: string; destination: string }, { path: string }>(
  'files',
  'duplicate',
)
const Upload = actionRef<{ path: string; secretBytes: string }, { path: string }>('files', 'upload')
const uploadLimit = 512 * 1024

const titles = {
  file: 'New file',
  directory: 'New folder',
  upload: 'Upload file',
  duplicate: 'Duplicate file',
  rename: 'Rename',
  path: 'Copy path',
  link: 'Copy Markdown link',
}

type Write = 'file' | 'directory' | 'upload' | 'duplicate' | 'rename'
type Operation = Write | 'path' | 'link'
export type WriteRequest =
  | { operation: Exclude<Write, 'rename'>; path: string }
  | { operation: 'rename'; path: string; identity: string }

function options(kind: FilesEntry['kind'] | undefined): Operation[] {
  if (!kind) return ['file', 'directory', 'upload']
  if (kind === 'directory') return ['file', 'directory', 'upload', 'rename', 'path']
  if (kind === 'file') return ['rename', 'duplicate', 'path', 'link']
  return []
}

export function FileMenu(props: {
  entry?: FilesEntry
  children?: JSX.Element
  onWrite: (request: WriteRequest, trigger: HTMLElement | undefined) => void
  onFeedback: (message: { text: string; error?: boolean } | null) => void
}) {
  let trigger: HTMLButtonElement | undefined
  async function select(value: string) {
    if (writerNow() !== 'person') return
    const operation = options(props.entry?.kind).find((option) => option === value)
    if (!operation) return
    const path = props.entry?.path ?? ''
    props.onFeedback(null)
    if (operation === 'rename') {
      const identity = props.entry?.identity
      if (identity) props.onWrite({ operation, path, identity }, trigger)
      else props.onFeedback({ text: 'Refresh the file list before renaming.', error: true })
      return
    }
    if (operation !== 'path' && operation !== 'link') {
      props.onWrite({ operation, path }, trigger)
      return
    }
    try {
      await navigator.clipboard.writeText(operation === 'path' ? path : fileMarkdownLink(path))
      props.onFeedback({ text: operation === 'path' ? 'Path copied.' : 'Markdown link copied.' })
    } catch (error) {
      props.onFeedback({ text: `Could not copy: ${errorMessage(error)}`, error: true })
    }
  }
  return (
    <DropdownMenu onAction={(value) => void select(value)}>
      <Show when={props.entry} fallback={props.children}>
        <MenuContextTrigger class="min-w-0 flex-1">{props.children}</MenuContextTrigger>
      </Show>
      <DropdownMenuTrigger
        ref={trigger}
        aria-label={
          props.entry
            ? `${props.entry.kind === 'directory' ? 'Folder' : 'File'} actions for ${props.entry.path}`
            : 'Project file actions'
        }
        data-agent-confirm="Open file actions"
        class="grid size-7 shrink-0 place-items-center rounded-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <EllipsisIcon class="size-3.5" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <For each={options(props.entry?.kind)}>
          {(option) => (
            <DropdownMenuItem value={option} data-agent-confirm={titles[option]}>
              {titles[option]}
            </DropdownMenuItem>
          )}
        </For>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function parentOf(path: string) {
  return path.slice(0, Math.max(0, path.lastIndexOf('/')))
}

function nameOf(path: string) {
  return path.slice(path.lastIndexOf('/') + 1)
}

function initialName(request: WriteRequest) {
  const name = nameOf(request.path)
  if (request.operation === 'rename') return name
  if (request.operation !== 'duplicate') return ''
  const dot = name.lastIndexOf('.')
  return dot > 0 ? `${name.slice(0, dot)} copy${name.slice(dot)}` : `${name} copy`
}

function destinationOf(folder: string, name: string) {
  if (!name || name === '.' || name === '..' || /[/\\]/.test(name)) {
    throw new Error('Enter a name without slashes. This keeps it in the same folder.')
  }
  return folder ? `${folder}/${name}` : name
}

export function FileWriteDialog(props: {
  request: WriteRequest
  onClose: () => void
  onRename: (path: string, destination: string, identity: string) => Promise<void>
  onSuccess: (request: WriteRequest, path: string) => void
  finalFocus: () => HTMLElement | null
}) {
  const [name, setName] = createSignal(() => initialName(props.request))
  const [file, setFile] = createSignal<File>()
  const [pending, setPending] = createSignal(false)
  const [error, setError] = createSignal('')
  const folder = () =>
    props.request.operation === 'rename' || props.request.operation === 'duplicate'
      ? parentOf(props.request.path)
      : props.request.path
  const label = () =>
    ({
      file: 'Create file',
      directory: 'Create folder',
      upload: 'Upload',
      duplicate: 'Create copy',
      rename: 'Save name',
    })[props.request.operation]

  async function write(request: WriteRequest, destination: string) {
    const { operation, path } = request
    if (operation === 'rename') {
      await props.onRename(path, destination, request.identity)
      return destination
    }
    if (operation === 'duplicate') return (await api.action(Duplicate, { path, destination })).path
    if (operation !== 'upload') {
      return (await api.action(Create, { path: destination, kind: operation })).path
    }
    const local = file()
    if (!local) throw new Error('Choose a file to upload.')
    if (local.size > uploadLimit) throw new Error('Choose a file no larger than 512 KiB.')
    const secretBytes = new Uint8Array(await local.arrayBuffer()).toBase64()
    return (await writingAs('person', () => api.action(Upload, { path: destination, secretBytes })))
      .path
  }

  async function submit() {
    if (writerNow() !== 'person' || pending()) return
    const request = props.request
    setPending(true)
    setError('')
    try {
      const destination = destinationOf(folder(), name())
      if (request.operation === 'rename' && destination === request.path) {
        props.onClose()
        return
      }
      const path = await write(request, destination)
      const onSuccess = props.onSuccess
      writingAs('person', () => onSuccess(request, path))
      props.onClose()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !pending() && props.onClose()}>
      <DialogContent showCloseButton={false} finalFocus={props.finalFocus}>
        <DialogTitle>{titles[props.request.operation]}</DialogTitle>
        <DialogDescription class="break-all">
          <Show
            when={props.request.operation === 'rename' || props.request.operation === 'duplicate'}
            fallback={`In ${folder() || 'the project root'}`}
          >
            {props.request.path}
          </Show>
        </DialogDescription>
        <Form class="grid gap-3">
          <Show when={props.request.operation === 'upload'}>
            <label class="grid gap-1 text-xs text-muted-foreground" data-agent-hidden>
              Local file (up to 512 KiB)
              <input
                type="file"
                disabled={pending()}
                class="min-w-0 text-foreground file:mr-2 file:rounded-sm file:border-0 file:bg-accent file:px-2 file:py-1 file:text-foreground"
                onChange={(event) => {
                  const local = event.currentTarget.files?.[0]
                  setFile(local)
                  setName(local?.name ?? '')
                  setError('')
                }}
              />
            </label>
          </Show>
          <label class="grid gap-1 text-xs text-muted-foreground">
            Name
            <Input
              aria-label="Destination name"
              data-agent-hidden
              value={name()}
              disabled={pending()}
              onValueChange={(value) => setName(value)}
            />
          </label>
          <Show when={error()}>
            <p role="alert" class="break-words text-xs text-error">
              {error()}
            </p>
          </Show>
          <div class="flex justify-end gap-2">
            <Button variant="outline" disabled={pending()} onClick={() => props.onClose()}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={pending() || (props.request.operation === 'upload' && !file())}
              data-agent-confirm={label()}
              onClick={submit}
            >
              {label()}
            </Button>
          </div>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
