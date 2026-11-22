import { showSurface, type LinkRenderer } from '@/sdk/solid'
import { Match, Switch, createMemo } from 'solid-js'
import { fileLinkPath, fileRequests } from './links.ts'

export const FileLink: LinkRenderer = (props) => {
  const path = createMemo(() => fileLinkPath(props.href))
  return (
    <Switch fallback={props.core}>
      <Match when={path() === null}>
        <span title="Invalid Files link encoding">{props.children} (invalid Files link)</span>
      </Match>
      <Match when={path() !== undefined}>
        <a
          href={props.href}
          title={`Open ${path()} in project Files`}
          onClick={(event) => {
            const file = path()
            if (typeof file !== 'string') return
            event.preventDefault()
            fileRequests.request(file)
            showSurface('files')
          }}
        >
          {props.children}
        </a>
      </Match>
    </Switch>
  )
}
