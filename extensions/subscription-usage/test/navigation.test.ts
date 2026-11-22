import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { openUsageDetails } from '../navigation.ts'

test('status-line click navigates before opening the actual Usage panel', () => {
  const events: string[] = []
  openUsageDetails({
    showSurface: (value) => events.push('surface:' + value),
    openPanel: (value) => events.push('panel:' + value),
  })
  assert.deepEqual(events, ['surface:agent', 'panel:subscription-usage'])
})

test('installed Usage includes its new navigation module and Solid facet', () => {
  const install = readFileSync(new URL('../../../scripts/install-subscription-usage.sh', import.meta.url), 'utf8')
  assert.match(install, /navigation\.ts/)
  assert.match(install, /web\.solid\.tsx/)
  const web = readFileSync(new URL('../web.solid.tsx', import.meta.url), 'utf8')
  assert.match(web, /StatusButton/)
  assert.match(web, /openUsageDetails\(\{ showSurface, openPanel \}\)/)
})
