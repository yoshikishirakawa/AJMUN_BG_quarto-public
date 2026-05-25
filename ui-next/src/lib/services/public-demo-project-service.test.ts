import { afterEach, describe, expect, it, vi } from 'vitest'
import { PublicDemoProjectService } from './public-demo-project-service'

const fixture = {
  version: '1.0',
  metadata: { title: 'Demo', author: 'Public', date: '2026-05-25' },
  chapters: [{ id: 'intro', title: 'Intro', order: 0, localPath: 'content/intro.md', type: 'document', images: [] }],
  style: {},
  buildOptions: {},
  conversionRules: [],
  createdAt: '2026-05-25T00:00:00Z',
  updatedAt: '2026-05-25T00:00:00Z',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('PublicDemoProjectService', () => {
  it('loads public fixture content through static GET requests only', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => fixture })
      .mockResolvedValueOnce({ ok: true, text: async () => '# Demo' })
    vi.stubGlobal('fetch', fetchMock)

    const service = new PublicDemoProjectService()
    await service.loadProject()
    const chapter = await service.getChapter('intro')

    expect(chapter.content).toBe('# Demo')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls.every(([url]) => String(url).includes('/api/') === false)).toBe(true)
  })

  it('rejects persistence operations in the public demo adapter', async () => {
    const service = new PublicDemoProjectService()

    await expect(service.updateChapterContent('intro', 'changed')).rejects.toThrow('公開デモではこの操作を利用できません。')
    await expect(service.saveProject(fixture as never)).rejects.toThrow('公開デモではこの操作を利用できません。')
  })
})
