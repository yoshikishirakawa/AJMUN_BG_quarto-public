import { ProjectData, Chapter, ProjectMetadata, FullpageImageConfig } from "@/types";

export interface IProjectService {
    loadProject(): Promise<ProjectData>;
    saveProject(project: ProjectData): Promise<void>;

    // Chapter Operations
    getChapter(id: string): Promise<{ chapter: Chapter; content: string }>;
    updateChapterContent(id: string, content: string): Promise<void>;
    createChapter(title: string): Promise<{ status: string; chapter: Chapter }>;
    deleteChapter(id: string): Promise<void>;
    updateChapterMetadata(id: string, updates: Partial<Chapter>): Promise<void>;
    updateChaptersOrder(chapterIds: string[], chapterOrder?: string[]): Promise<void>;

    // Special Chapter Types
    createImageGroup(title: string): Promise<{ status: string; chapter: Chapter }>;
    createFullpageImageChapter(title: string): Promise<{ status: string; chapter: Chapter }>;

    // Image Management
    updateChapterImages(chapterId: string, images: FullpageImageConfig[]): Promise<void>;
    uploadChapterImage(
        chapterId: string,
        file: File,
        options?: { width?: string; fit?: string; position?: string }
    ): Promise<FullpageImageConfig>;

    // Metadata Operations (often done via saveProject, but explicit method is good)
    updateMetadata(metadata: ProjectMetadata): Promise<void>;

    // Style Operations
    updateStyle(style: any): Promise<void>;
}
