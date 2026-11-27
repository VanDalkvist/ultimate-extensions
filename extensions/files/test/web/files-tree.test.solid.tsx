import { createAgent } from '@ui-sdk/core/agent'
import { expect, it } from 'vitest'
import { expectDistinctAgentNames } from '@runtime/test/web/agent-names.ts'
import { renderSolid } from '@runtime/test/web/solid-dom-setup.ts'
import { ProjectTree } from '../../tree.solid.tsx'

it('gives search, root actions and each file row distinct agent names', async () => {
  const agent = createAgent()
  const root = renderSolid(() => (
    <ProjectTree
      data={{
        root: '/fixture',
        path: '',
        entries: [
          { name: 'notes', path: 'notes', kind: 'directory', identity: 'folder-identity' },
          { name: 'notes.md', path: 'notes.md', kind: 'file', identity: 'file-identity' },
        ],
        truncated: false,
      }}
      selected={null}
      refresh={0}
      openFile={() => {}}
      onRefresh={() => {}}
      onRename={() => Promise.resolve()}
      onCreated={() => {}}
    />
  ))
  expect(root.querySelector('[aria-label="File actions for notes.md"]')).not.toBeNull()
  await expectDistinctAgentNames(agent)
})
