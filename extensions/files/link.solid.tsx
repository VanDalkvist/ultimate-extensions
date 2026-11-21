/** @jsxImportSource @solidjs/web */
import { createMemo } from 'solid-js'
import { showSurface } from '@/sdk/solid'
import type { LinkRenderer } from '@/sdk/solid'
import { fileLinkPath, requestFile } from './links.ts'

export const FileLink: LinkRenderer = (props) => {
  const path = createMemo(() => fileLinkPath(props.href))
  return (
    <>
      {path() === undefined ? (
        props.core
      ) : path() === null ? (
        <span title="Invalid Files link encoding">{props.children} (invalid Files link)</span>
      ) : (
        <a
          href={props.href}
          title={`Open ${path()} in project Files`}
          onClick={(event) => {
            const target = path()
            if (typeof target !== 'string') return
            event.preventDefault()
            requestFile(target)
            showSurface('files')
          }}
        >
          {props.children}
        </a>
      )}
    </>
  )
}
