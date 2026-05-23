import { create } from 'zustand'
import { ProjectData, ProjectMetadata, FullpageImageConfig } from '@/types'

interface ProjectState {
  project: ProjectData | null
  currentChapterId: string | null
  currentChapterContent: string | null
  currentChapterError: string | null
  isLoaded: boolean
  isLoading: boolean
  error: string | null

  // Actions
  fetchProject: () => Promise<void>
  selectChapter: (id: string) => Promise<void>
  updateChapterContent: (id: string, content: string) => Promise<void>
  updateMetadata: (metadata: Partial<ProjectMetadata>) => Promise<void>
  updateStyle: (style: any) => Promise<void>

  // Chapter Management
  addChapter: (title: string) => Promise<void>
  deleteChapter: (id: string) => Promise<void>
  renameChapter: (id: string, title: string) => Promise<void>
  reorderChapters: (orderedIds: string[]) => Promise<void>

  // Special Chapter Types
  addImageGroupChapter: (title: string) => Promise<void>
  addFullpageImageChapter: (title: string) => Promise<void>

  // Image Management
  updateChapterImages: (chapterId: string, images: FullpageImageConfig[]) => Promise<void>
  uploadChapterImage: (chapterId: string, file: File, options?: { width?: string; fit?: string; position?: string }) => Promise<FullpageImageConfig | null>
}

import { WebProjectService } from "@/lib/services/web-project-service";

const projectService = new WebProjectService();

export const useProjectStore = create<ProjectState>((set, get) => ({
  project: null,
  currentChapterId: null,
  currentChapterContent: null,
  currentChapterError: null,
  isLoaded: false,
  isLoading: false,
  error: null,

  fetchProject: async () => {
    const showInitialLoader = !get().isLoaded;
    set({ isLoading: showInitialLoader, error: null })
    try {
      const data = await projectService.loadProject();
      set({ project: data, isLoaded: true })
    } catch (error) {
      console.error('Fetch project error:', error);
      if (error instanceof Error) {
        set({ error: error.message })
      }
    } finally {
      if (showInitialLoader) {
        set({ isLoading: false })
      }
    }
  },

  selectChapter: async (id: string) => {
    console.log('[useProjectStore] selectChapter called:', id, 'currentChapterId:', get().currentChapterId);
    // Reset content while loading new chapter
    set({ currentChapterId: id, currentChapterContent: null, currentChapterError: null })

    // Fetch new content asynchronously
    try {
      const data = await projectService.getChapter(id);
      console.log('[useProjectStore] Chapter data received for:', id, 'has content:', !!data?.content);
      if (get().currentChapterId !== id) {
        console.log('[useProjectStore] Ignoring stale chapter response for:', id);
        return;
      }
      if (data) {
        set(state => ({
          currentChapterContent: data.content || "",
          currentChapterError: null,
          // Optionally update chapter metadata if returned
          project: state.project ? {
            ...state.project,
            chapters: state.project.chapters.map(c =>
              c.id === id ? { ...c, ...data.chapter } : c
            )
          } : null
        }))
      }
    } catch (e) {
      console.error("Failed to load chapter content", e)
      if (get().currentChapterId === id) {
        set({
          currentChapterContent: "",
          currentChapterError: "Failed to load chapter content",
        })
      }
    }
  },

  updateChapterContent: async (id: string, content: string) => {
    set({ currentChapterContent: content })

    // Optimistic update? No, we just set current content state.
    // The persistence happens here.
    try {
      await projectService.updateChapterContent(id, content);
    } catch (error) {
      console.error('Save content error:', error);
      if (error instanceof Error) {
        set({ error: error.message })
      }
    }
  },

  addChapter: async (title: string) => {
    try {
      const result = await projectService.createChapter(title);
      if (result.status === 'success' && result.chapter) {
        set(state => ({
          project: state.project ? {
            ...state.project,
            chapters: [...state.project.chapters, result.chapter]
          } : null
        }));
      }
    } catch (error) {
      console.error("Failed to create chapter", error);
    }
  },

  deleteChapter: async (id: string) => {
    // Optimistic delete
    const state = get();
    if (!state.project) return;

    const previousChapters = state.project.chapters;
    set(state => ({
      project: state.project ? {
        ...state.project,
        chapters: state.project.chapters.filter(c => c.id !== id)
      } : null
    }));

    try {
      await projectService.deleteChapter(id);
    } catch (error) {
      console.error("Failed to delete chapter", error);
      // Revert
      set(state => ({
        project: state.project ? { ...state.project, chapters: previousChapters } : null
      }));
    }
  },

  renameChapter: async (id: string, title: string) => {
    // Optimistic
    set(state => ({
      project: state.project ? {
        ...state.project,
        chapters: state.project.chapters.map(c => c.id === id ? { ...c, title } : c)
      } : null
    }));

    try {
      await projectService.updateChapterMetadata(id, { title });
    } catch (error) {
      console.error("Failed to rename chapter", error);
    }
  },

  reorderChapters: async (orderedIds: string[]) => {
    const state = get();
    if (!state.project) return;

    const chapterMap = new Map(state.project.chapters.map(ch => [ch.id, ch]));
    const realOrderedIds = orderedIds.filter(id => chapterMap.has(id));
    const completeOrderedIds = [
      ...realOrderedIds,
      ...state.project.chapters.map(ch => ch.id).filter(id => !realOrderedIds.includes(id)),
    ];
    const reordered = completeOrderedIds.map((id, index) => ({
      ...chapterMap.get(id)!,
      order: index,
    }));

    const hasVirtual = orderedIds.some(id => id === "__toc__");
    const existingIds = new Set(state.project.chapters.map(ch => ch.id));
    const nextChapterOrder = hasVirtual
      ? [
          ...orderedIds.filter(id => id === "__toc__" || existingIds.has(id)),
          ...state.project.chapters.map(ch => ch.id).filter(id => !orderedIds.includes(id)),
        ]
      : state.project.chapterOrder;
    const nextProject = {
      ...state.project,
      chapters: reordered,
      chapterOrder: nextChapterOrder,
    };

    // Optimistic
    set({ project: nextProject });

    try {
      await projectService.updateChaptersOrder(realOrderedIds, nextChapterOrder);
      await get().fetchProject();
    } catch (error) {
      console.error("Failed to reorder", error);
      try {
        await projectService.saveProject(nextProject);
        await get().fetchProject();
      } catch (fallbackError) {
        console.error("Failed to reorder (fallback saveProject)", fallbackError);
      }
    }
  },

  updateMetadata: async (metadataUpdates: Partial<ProjectMetadata>) => {
    const state = get();
    if (!state.project) return;

    const updatedMetadata = { ...state.project.metadata, ...metadataUpdates };
    set(state => ({
      project: state.project ? {
        ...state.project,
        metadata: updatedMetadata
      } : null
    }));

    try {
      await projectService.updateMetadata(updatedMetadata as ProjectMetadata);
    } catch (error) {
      console.error('Save metadata error:', error);
      if (error instanceof Error) {
        set({ error: error.message });
      }
    }
  },

  updateStyle: async (styleUpdates: any) => {
    const state = get();
    if (!state.project) return;

    // Deep merge style (simplified)
    const updatedStyle = { ...state.project.style, ...styleUpdates };

    set(state => ({
      project: state.project ? {
        ...state.project,
        style: updatedStyle
      } : null
    }));

    try {
      await projectService.updateStyle(updatedStyle);
    } catch (error) {
      console.error("Failed to update style", error);
      if (error instanceof Error) {
        set({ error: error.message });
      }
    }
  },

  // Special Chapter Types
  addImageGroupChapter: async (title: string) => {
    try {
      const result = await projectService.createImageGroup(title);
      if (result.status === 'success' && result.chapter) {
        set(state => ({
          project: state.project ? {
            ...state.project,
            chapters: [...state.project.chapters, result.chapter]
          } : null
        }));
      }
    } catch (error) {
      console.error("Failed to create image group chapter", error);
    }
  },

  addFullpageImageChapter: async (title: string) => {
    try {
      const result = await projectService.createFullpageImageChapter(title);
      if (result.status === 'success' && result.chapter) {
        set(state => ({
          project: state.project ? {
            ...state.project,
            chapters: [...state.project.chapters, result.chapter]
          } : null
        }));
      }
    } catch (error) {
      console.error("Failed to create fullpage image chapter", error);
    }
  },

  // Image Management
  updateChapterImages: async (chapterId: string, images: FullpageImageConfig[]) => {
    try {
      await projectService.updateChapterImages(chapterId, images);
      // Refresh project to get updated state
      await get().fetchProject();
    } catch (error) {
      console.error("Failed to update chapter images", error);
    }
  },

  uploadChapterImage: async (
    chapterId: string,
    file: File,
    options?: { width?: string; fit?: string; position?: string }
  ) => {
    try {
      const result = await projectService.uploadChapterImage(chapterId, file, options);
      // Refresh project to get updated state
      await get().fetchProject();
      return result;
    } catch (error) {
      console.error("Failed to upload chapter image", error);
      return null;
    }
  }
}))
