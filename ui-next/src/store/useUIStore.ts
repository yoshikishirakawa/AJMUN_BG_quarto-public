import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UIState {
  sidebarOpen: boolean
  language: 'en' | 'ja'
  sidebarTab: 'files' | 'outline' // Active sidebar tab
  editorScrollSignal: { line: number; timestamp: number } | null
  currentEditorLine: number
  editorFontSize: number // Base font size for editor and preview (in pixels)
  toggleSidebar: () => void
  setLanguage: (lang: 'en' | 'ja') => void
  setSidebarTab: (tab: 'files' | 'outline') => void
  scrollToLine: (line: number) => void
  setCurrentEditorLine: (line: number) => void
  setEditorFontSize: (size: number) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      language: 'ja',
      sidebarTab: 'files', // Default sidebar tab
      editorScrollSignal: null,
      currentEditorLine: 0,
      editorFontSize: 14, // Default font size for editor and preview
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setLanguage: (lang) => set({ language: lang }),
      setSidebarTab: (tab) => set({ sidebarTab: tab }),
      scrollToLine: (line) => set({ editorScrollSignal: { line, timestamp: Date.now() } }),
      setCurrentEditorLine: (line) => set({ currentEditorLine: line }),
      setEditorFontSize: (size) => set({ editorFontSize: size }),
    }),
    {
      name: 'ajmun-ui-storage',
      partialize: (state) => ({
        language: state.language,
        sidebarOpen: state.sidebarOpen,
        sidebarTab: state.sidebarTab,
        editorFontSize: state.editorFontSize
      }),
    }
  )
)
