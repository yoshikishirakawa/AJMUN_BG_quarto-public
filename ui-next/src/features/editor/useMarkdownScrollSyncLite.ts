/**
 * @deprecated Use `useMarkdownScrollSyncOptimized` instead.
 *
 * This was a lightweight version designed for large documents, but has been
 * superseded by `useMarkdownScrollSyncOptimized` which provides:
 * - Better accuracy with proper line height models
 * - Center-position alignment for better UX
 * - Synthetic element generation for continuous coverage
 * - Proper handling of headings, code blocks, and other element types
 *
 * Migration guide:
 * ```diff
 * - import { useMarkdownScrollSyncLite } from './useMarkdownScrollSyncLite';
 * + import { useMarkdownScrollSyncOptimized } from './useMarkdownScrollSyncOptimized';
 *
 * - useMarkdownScrollSyncLite(editorViewRef, previewRef, activePane, enabled)
 * + useMarkdownScrollSyncOptimized(editorViewRef, previewRef, enabled)
 * ```
 *
 * @see useMarkdownScrollSyncOptimized
 */

import { useEffect, useCallback, useRef } from 'react';
import { EditorView } from '@codemirror/view';

// Simple cache for line positions
interface LinePosition {
    line: number;
    offset: number; // Character offset in document
}

export const useMarkdownScrollSyncLite = (
    editorViewRef: React.MutableRefObject<EditorView | null>,
    previewRef: React.RefObject<HTMLElement | null>,
    activePane: 'editor' | 'preview' = 'editor',
    enabled: boolean = true
) => {
    const requestRef = useRef<number | undefined>(undefined);
    const lineCacheRef = useRef<LinePosition[]>([]);
    const lastSyncTime = useRef<number>(0);

    // Build lightweight line cache (only on initial load or preview updates)
    const buildLineCache = useCallback((preview: HTMLElement) => {
        const elements = preview.querySelectorAll<HTMLElement>('[data-source-line]');
        const lines: LinePosition[] = [];

        // Only cache every 10th line to reduce memory
        for (let i = 0; i < elements.length; i += 10) {
            const element = elements[i];
            const line = parseInt(element.dataset.sourceLine || '0', 10);
            if (line > 0) {
                lines.push({ line, offset: i });
            }
        }

        lineCacheRef.current = lines;
    }, []);

    // Editor -> Preview sync (simplified)
    const syncPreview = useCallback(() => {
        if (!enabled || !editorViewRef.current || !previewRef.current) return;

        const view = editorViewRef.current;
        const preview = previewRef.current;

        // Throttle: only sync every 100ms
        const now = performance.now();
        if (now - lastSyncTime.current < 100) return;
        lastSyncTime.current = now;

        try {
            // Get current line in editor
            const scrollPos = view.scrollDOM.scrollTop;
            const lineBlock = view.lineBlockAtHeight(scrollPos);
            const currentLine = view.state.doc.lineAt(lineBlock.from).number;

            // Find corresponding element in preview (using binary search)
            const cache = lineCacheRef.current;
            if (cache.length === 0) return;

            let closest = cache[0];
            let minDiff = Math.abs(closest.line - currentLine);

            for (let i = 1; i < cache.length; i++) {
                const diff = Math.abs(cache[i].line - currentLine);
                if (diff < minDiff) {
                    minDiff = diff;
                    closest = cache[i];
                }
            }

            // Calculate scroll position (simplified)
            const progress = (scrollPos - lineBlock.top) / lineBlock.height;
            const targetLine = closest.line + progress;

            // Scroll preview (simplified: just jump to approximate position)
            const scrollRatio = targetLine / view.state.doc.lines;
            preview.scrollTop = scrollRatio * preview.scrollHeight;
        } catch {
            // Ignore errors
        }
    }, [editorViewRef, previewRef, enabled]);

    // Preview -> Editor sync (simplified)
    const syncEditor = useCallback(() => {
        if (!enabled || !editorViewRef.current || !previewRef.current) return;

        const view = editorViewRef.current;
        const preview = previewRef.current;

        // Throttle
        const now = performance.now();
        if (now - lastSyncTime.current < 100) return;
        lastSyncTime.current = now;

        try {
            const scrollRatio = preview.scrollTop / preview.scrollHeight;
            const targetLine = scrollRatio * view.state.doc.lines;

            const lineInfo = view.state.doc.line(Math.floor(targetLine));
            const block = view.lineBlockAt(lineInfo.from);

            view.scrollDOM.scrollTo({ top: block.top, behavior: 'auto' });
        } catch {
            // Ignore errors
        }
    }, [editorViewRef, previewRef, enabled]);

    // Handlers with RAF throttling
    const onEditorScroll = useCallback(() => {
        if (activePane !== 'editor' || !enabled) return;
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
        requestRef.current = requestAnimationFrame(syncPreview);
    }, [activePane, syncPreview, enabled]);

    const onPreviewScroll = useCallback(() => {
        if (activePane !== 'preview' || !enabled) return;
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
        requestRef.current = requestAnimationFrame(syncEditor);
    }, [activePane, syncEditor, enabled]);

    // Attach listeners
    useEffect(() => {
        if (!enabled) return;
        let attachedView: EditorView | null = null;
        let attachedPreview: HTMLElement | null = null;

        const checkRefs = () => {
            const view = editorViewRef.current;
            const preview = previewRef.current;
            if (view && preview) {
                const scrollDOM = view.scrollDOM;
                attachedView = view;
                attachedPreview = preview;
                scrollDOM.addEventListener('scroll', onEditorScroll, { passive: true });
                preview.addEventListener('scroll', onPreviewScroll, { passive: true });

                buildLineCache(preview);

                return true;
            }
            return false;
        };

        const timer = setInterval(() => {
            if (checkRefs()) clearInterval(timer);
        }, 100);

        checkRefs();

        return () => {
            clearInterval(timer);
            if (attachedView && attachedPreview) {
                attachedView.scrollDOM.removeEventListener('scroll', onEditorScroll);
                attachedPreview.removeEventListener('scroll', onPreviewScroll);
            }
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
            lineCacheRef.current = [];
        };
    }, [onEditorScroll, onPreviewScroll, editorViewRef, previewRef, buildLineCache, enabled]);
};
