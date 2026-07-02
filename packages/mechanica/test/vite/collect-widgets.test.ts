import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { collectWidgets } from '@/vite/collect-widgets'

const widgetsDir = join(import.meta.dirname, '../fixtures/widgets')

describe('collectWidgets', () => {
  it('generates a module importing every defineWidget module, skipping others', async () => {
    const code = await collectWidgets(widgetsDir, async (id) => ({ id }))

    expect(code).toContain('export const widgetsList = [widget0, widget1]')
    expect(code).toContain('cta.widget.ts')
    expect(code).toContain('embed.widget.ts') // nested directories are walked
    expect(code).not.toContain('helper.ts') // no defineWidget → skipped
  })

  it('skips files that resolve to nothing', async () => {
    const code = await collectWidgets(widgetsDir, async () => null)
    expect(code).toContain('export const widgetsList = []')
  })

  it('returns an empty list for a missing directory', async () => {
    const code = await collectWidgets(join(widgetsDir, 'does-not-exist'), async (id) => ({ id }))
    expect(code).toContain('export const widgetsList = []')
  })
})
