import { IProjectService } from '../project-service';
import { ProjectData, Chapter, ProjectMetadata, FullpageImageConfig } from '@/types';
import { project } from '@/lib/api';

/**
 * WebProjectService - API-based implementation for web browsers
 * Uses REST API to communicate with the backend server
 */
export class WebProjectService implements IProjectService {
    private mapMetadata(metadata: ProjectMetadata | any): any {
        if (!metadata) return metadata;
        if ("name" in metadata) return metadata;
        if ("title" in metadata) {
            const { title, ...rest } = metadata;
            return { ...rest, name: title };
        }
        return metadata;
    }

    private mapProject(projectData: ProjectData): any {
        return {
            ...projectData,
            metadata: this.mapMetadata(projectData.metadata),
        };
    }

    async loadProject(): Promise<ProjectData> {
        const res = await project.get();
        return res.data;
    }

    async saveProject(projectData: ProjectData): Promise<void> {
        await project.update(this.mapProject(projectData));
    }

    async getChapter(id: string): Promise<{ chapter: Chapter; content: string }> {
        const [chapterRes, contentRes] = await Promise.all([
            project.getChapter(id),
            project.getChapterContent(id),
        ]);

        return {
            chapter: chapterRes.data,
            content: contentRes.data.content,
        };
    }

    async updateChapterContent(id: string, content: string): Promise<void> {
        await project.updateChapter(id, content);
    }

    async createChapter(title: string): Promise<{ status: string; chapter: Chapter }> {
        const res = await project.createChapter({
            title,
            googleDocId: null,
            lastSync: null,
            enabled: true,
            type: 'document',
            images: [],
        });

        return { status: 'success', chapter: res.data };
    }

    async deleteChapter(id: string): Promise<void> {
        await project.deleteChapter(id);
    }

    async updateChapterMetadata(id: string, updates: Partial<Chapter>): Promise<void> {
        await project.updateChapterMetadata(id, updates);
    }

    async updateChaptersOrder(chapterIds: string[], chapterOrder?: string[]): Promise<void> {
        await project.updateChaptersOrder(chapterIds, chapterOrder);
    }

    async updateMetadata(metadata: ProjectMetadata): Promise<void> {
        await project.updateMetadata(this.mapMetadata(metadata));
    }

    async updateStyle(style: any): Promise<void> {
        await project.updateStyle(style);
    }

    async createImageGroup(title: string): Promise<{ status: string; chapter: Chapter }> {
        const res = await project.createImageGroup(title);
        return { status: 'success', chapter: res.data };
    }

    async createFullpageImageChapter(title: string): Promise<{ status: string; chapter: Chapter }> {
        const res = await project.createFullpageImageChapter(title);
        return { status: 'success', chapter: res.data };
    }

    async updateChapterImages(chapterId: string, images: FullpageImageConfig[]): Promise<void> {
        await project.updateChapterImages(chapterId, images);
    }

    async uploadChapterImage(
        chapterId: string,
        file: File,
        options?: { width?: string; fit?: string; position?: string }
    ): Promise<FullpageImageConfig> {
        const res = await project.uploadImage(chapterId, file, options);
        return res.data;
    }
}
