import { IProjectService } from '../project-service'
import { ProjectData, Chapter, ProjectMetadata, FullpageImageConfig } from '@/types'
import { publicDemoAssetUrl } from '@/lib/public-demo'

const disabled = async () => {
  throw new Error('公開デモではこの操作を利用できません。')
}

export class PublicDemoProjectService implements IProjectService {
  private project: ProjectData | null = null

  async loadProject(): Promise<ProjectData> {
    const response = await fetch(publicDemoAssetUrl('sample-project.json'))
    if (!response.ok) {
      throw new Error('デモ用プロジェクトを読み込めませんでした。')
    }
    this.project = await response.json() as ProjectData
    return this.project
  }

  async getChapter(id: string): Promise<{ chapter: Chapter; content: string }> {
    if (!this.project) {
      await this.loadProject()
    }
    const chapter = this.project?.chapters.find((item) => item.id === id)
    if (!chapter) {
      throw new Error('デモ用の章が見つかりません。')
    }
    const filename = chapter.localPath.split('/').pop() || `${id}.md`
    const response = await fetch(publicDemoAssetUrl(`content/${filename}`))
    if (!response.ok) {
      throw new Error('デモ用本文を読み込めませんでした。')
    }
    return { chapter, content: await response.text() }
  }

  saveProject(_project: ProjectData): Promise<void> { return disabled() }
  updateChapterContent(_id: string, _content: string): Promise<void> { return disabled() }
  createChapter(_title: string): Promise<{ status: string; chapter: Chapter }> { return disabled() }
  deleteChapter(_id: string): Promise<void> { return disabled() }
  updateChapterMetadata(_id: string, _updates: Partial<Chapter>): Promise<void> { return disabled() }
  updateChaptersOrder(_chapterIds: string[], _chapterOrder?: string[]): Promise<void> { return disabled() }
  createImageGroup(_title: string): Promise<{ status: string; chapter: Chapter }> { return disabled() }
  createFullpageImageChapter(_title: string): Promise<{ status: string; chapter: Chapter }> { return disabled() }
  updateChapterImages(_chapterId: string, _images: FullpageImageConfig[]): Promise<void> { return disabled() }
  uploadChapterImage(_chapterId: string, _file: File): Promise<FullpageImageConfig> { return disabled() }
  updateMetadata(_metadata: ProjectMetadata): Promise<void> { return disabled() }
  updateStyle(_style: unknown): Promise<void> { return disabled() }
}

