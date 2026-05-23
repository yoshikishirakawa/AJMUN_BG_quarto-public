/**
 * @deprecated Use `useMarkdownScrollSyncOptimized` instead.
 *
 * This was a simplified implementation focusing on single-direction sync,
 * but has been superseded by `useMarkdownScrollSyncOptimized` which provides:
 * - Bidirectional sync (editor ↔ preview)
 * - Better performance with binary search (O(log n))
 * - Center-position alignment for better UX
 * - Proper viewport management
 * - Native smooth scrolling behavior
 *
 * Migration guide:
 * ```diff
 * - import { useMarkdownScrollSyncSimple } from './useMarkdownScrollSyncSimple';
 * + import { useMarkdownScrollSyncOptimized } from './useMarkdownScrollSyncOptimized';
 *
 * - useMarkdownScrollSyncSimple(editorViewRef, previewRef, enabled, options)
 * + useMarkdownScrollSyncOptimized(editorViewRef, previewRef, enabled)
 * ```
 *
 * @see useMarkdownScrollSyncOptimized
 */

/**
 * Simple Scroll Synchronization for Markdown Editor
 *
 * Design principles:
 * - Single anchor point (editor top line → preview element)
 * - One-way sync by default (editor → preview)
 * - MutationObserver for DOM change detection
 * - Debounced sync for smooth user experience
 * - No complex physics/inertia - rely on CSS smooth scrolling
 */

import { useEffect, useCallback, useRef } from 'react';
import { EditorView } from '@codemirror/view';

// Debug flag - disabled in production
const __DEBUG__ = process.env.NODE_ENV !== 'production';

function debugLog(...args: unknown[]): void {
    if (__DEBUG__) {
        console.log('[ScrollSync]', ...args);
    }
}

// Cache entry for scroll elements
interface ScrollElement {
    element: HTMLElement;
    line: number;
    offsetTop: number;
    height: number;
}



/**
 * Binary search to find surrounding elements for interpolation
 */
function findSurroundingElements(
    elements: ScrollElement[],
    targetLine: number
): { before: ScrollElement | null; after: ScrollElement | null } {
    if (elements.length === 0) return { before: null, after: null };

    let left = 0;
    let right = elements.length - 1;
    let before: ScrollElement | null = null;
    let after: ScrollElement | null = null;

    while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        const element = elements[mid];

        if (element.line === targetLine) {
            return { before: element, after: element };
        }

        if (element.line < targetLine) {
            before = element;
            left = mid + 1;
        } else {
            after = element;
            right = mid - 1;
        }
    }

    return { before, after };
}

export interface ScrollSyncOptions {
    /** Enable two-way sync (default: false - one-way from editor to preview) */
    bidirectional?: boolean;
    /** Debounce delay in ms (default: 50) */
    debounceMs?: number;
    /** Padding from top in pixels (default: 0) */
    topPadding?: number;
    /** Enable CSS smooth scroll behavior (default: true) */
    smoothScroll?: boolean;
}

export const useMarkdownScrollSyncSimple = (
    editorViewRef: React.MutableRefObject<EditorView | null>,
    previewRef: React.RefObject<HTMLElement | null>,
    enabled: boolean = true,
    options: ScrollSyncOptions = {}
) => {
    const {
        bidirectional = false,
        debounceMs = 50,
        topPadding = 0,
        smoothScroll = true,
    } = options;

    // Element cache
    const elementsRef = useRef<ScrollElement[]>([]);
    const cacheValidRef = useRef<boolean>(false);

    // Sync state
    const syncTimeoutRef = useRef<number | null>(null);
    const lastSyncSourceRef = useRef<'editor' | 'preview' | null>(null);
    const lastSyncTimeRef = useRef<number>(0);
    const SYNC_LOCKOUT_MS = 100; // Prevent ping-pong

    // MutationObserver ref
    const observerRef = useRef<MutationObserver | null>(null);

    /**
     * Build cache from preview DOM elements
     */
    const buildCache = useCallback((preview: HTMLElement) => {
        const elements = Array.from(
            preview.querySelectorAll<HTMLElement>('[data-source-line]')
        );

        if (elements.length === 0) {
            debugLog('buildCache: no elements found');
            elementsRef.current = [];
            cacheValidRef.current = false;
            return;
        }

        const scrollElements: ScrollElement[] = [];

        for (const element of elements) {
            const lineStr = element.dataset.sourceLine;
            if (!lineStr) continue;

            const line = parseInt(lineStr, 10);
            if (line <= 0 || isNaN(line)) continue;

            // Calculate offsetTop relative to preview container
            let offsetTop = 0;
            let current: HTMLElement | null = element;
            while (current && current !== preview) {
                offsetTop += current.offsetTop;
                current = current.offsetParent as HTMLElement | null;
            }

            scrollElements.push({
                element,
                line,
                offsetTop,
                height: element.offsetHeight || 20,
            });
        }

        // Sort by line number
        scrollElements.sort((a, b) => a.line - b.line);
        elementsRef.current = scrollElements;
        cacheValidRef.current = true;

        debugLog('buildCache:', scrollElements.length, 'elements');
    }, []);

    /**
     * Invalidate cache (called on DOM changes)
     */
    const invalidateCache = useCallback(() => {
        cacheValidRef.current = false;
    }, []);

    /**
     * Sync preview scroll position to match editor
     */
    const syncEditorToPreview = useCallback(() => {
        const view = editorViewRef.current;
        const preview = previewRef.current;

        if (!view || !preview || !enabled) return;

        // Rebuild cache if invalid
        if (!cacheValidRef.current) {
            buildCache(preview);
        }

        const elements = elementsRef.current;
        if (elements.length === 0) return;

        try {
            // Get editor's top visible line
            const scrollDOM = view.scrollDOM;
            const scrollTop = scrollDOM.scrollTop;
            const lineBlock = view.lineBlockAtHeight(scrollTop);
            const topLine = view.state.doc.lineAt(lineBlock.from).number;

            // Calculate fractional line position
            const ratio = Math.max(
                0,
                Math.min(1, (scrollTop - lineBlock.top) / Math.max(lineBlock.height, 1))
            );
            const currentLine = topLine + ratio;

            // Find surrounding elements
            const { before, after } = findSurroundingElements(elements, currentLine);

            let targetScrollTop: number;

            if (!before && after) {
                // Before first element
                targetScrollTop = 0;
            } else if (before && !after) {
                // After last element
                targetScrollTop = before.offsetTop;
            } else if (before && after) {
                // Interpolate between elements
                const lineGap = after.line - before.line;
                if (lineGap === 0) {
                    targetScrollTop = before.offsetTop;
                } else {
                    const t = (currentLine - before.line) / lineGap;
                    targetScrollTop =
                        before.offsetTop + (after.offsetTop - before.offsetTop) * t;
                }
            } else {
                return;
            }

            // Apply padding
            targetScrollTop = Math.max(0, targetScrollTop - topPadding);

            // Apply scroll
            if (smoothScroll) {
                preview.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
            } else {
                preview.scrollTop = targetScrollTop;
            }

            lastSyncSourceRef.current = 'editor';
            lastSyncTimeRef.current = performance.now();

            debugLog('syncEditorToPreview: line', currentLine.toFixed(1), '→', targetScrollTop.toFixed(0), 'px');
        } catch {
            // Ignore errors (e.g., invalid line numbers)
        }
    }, [editorViewRef, previewRef, enabled, buildCache, topPadding, smoothScroll]);

    /**
     * Sync editor scroll position to match preview (bidirectional only)
     */
    const syncPreviewToEditor = useCallback(() => {
        if (!bidirectional) return;

        const view = editorViewRef.current;
        const preview = previewRef.current;

        if (!view || !preview || !enabled) return;

        // Rebuild cache if invalid
        if (!cacheValidRef.current) {
            buildCache(preview);
        }

        const elements = elementsRef.current;
        if (elements.length === 0) return;

        try {
            const scrollTop = preview.scrollTop;

            // Find element at current scroll position
            let targetLine = 1;
            let before: ScrollElement | null = null;
            let after: ScrollElement | null = null;

            for (const el of elements) {
                if (el.offsetTop <= scrollTop) {
                    before = el;
                } else {
                    after = el;
                    break;
                }
            }

            if (before && after) {
                const topGap = after.offsetTop - before.offsetTop;
                if (topGap > 0) {
                    const t = (scrollTop - before.offsetTop) / topGap;
                    targetLine = before.line + (after.line - before.line) * t;
                } else {
                    targetLine = before.line;
                }
            } else if (before) {
                targetLine = before.line;
            }

            // Scroll editor to target line
            const lineInt = Math.max(1, Math.floor(targetLine));
            const lineFrac = targetLine - lineInt;

            const lineInfo = view.state.doc.line(lineInt);
            const block = view.lineBlockAt(lineInfo.from);
            const targetPixelTop = block.top + block.height * lineFrac;

            view.scrollDOM.scrollTo({
                top: targetPixelTop,
                behavior: smoothScroll ? 'smooth' : 'auto',
            });

            lastSyncSourceRef.current = 'preview';
            lastSyncTimeRef.current = performance.now();

            debugLog('syncPreviewToEditor: scroll', scrollTop, '→ line', targetLine.toFixed(1));
        } catch {
            // Ignore errors
        }
    }, [editorViewRef, previewRef, enabled, bidirectional, buildCache, smoothScroll]);

    /**
     * Debounced editor scroll handler
     */
    const onEditorScroll = useCallback(() => {
        if (!enabled) return;

        // Prevent ping-pong
        const now = performance.now();
        if (
            lastSyncSourceRef.current === 'preview' &&
            now - lastSyncTimeRef.current < SYNC_LOCKOUT_MS
        ) {
            return;
        }

        // Debounce
        if (syncTimeoutRef.current != null) {
            clearTimeout(syncTimeoutRef.current);
        }
        syncTimeoutRef.current = window.setTimeout(() => {
            syncEditorToPreview();
        }, debounceMs);
    }, [enabled, debounceMs, syncEditorToPreview]);

    /**
     * Debounced preview scroll handler (bidirectional only)
     */
    const onPreviewScroll = useCallback(() => {
        if (!enabled || !bidirectional) return;

        // Prevent ping-pong
        const now = performance.now();
        if (
            lastSyncSourceRef.current === 'editor' &&
            now - lastSyncTimeRef.current < SYNC_LOCKOUT_MS
        ) {
            return;
        }

        // Debounce
        if (syncTimeoutRef.current != null) {
            clearTimeout(syncTimeoutRef.current);
        }
        syncTimeoutRef.current = window.setTimeout(() => {
            syncPreviewToEditor();
        }, debounceMs);
    }, [enabled, bidirectional, debounceMs, syncPreviewToEditor]);

    /**
     * Setup event listeners and MutationObserver
     */
    useEffect(() => {
        let cleanedUp = false;
        let attachedView: EditorView | null = null;
        let attachedPreview: HTMLElement | null = null;

        const setup = () => {
            if (cleanedUp) return false;

            const view = editorViewRef.current;
            const preview = previewRef.current;

            if (!view || !preview) return false;

            const scrollDOM = view.scrollDOM;
            attachedView = view;
            attachedPreview = preview;

            // Add scroll listeners (passive for performance)
            scrollDOM.addEventListener('scroll', onEditorScroll, { passive: true });
            if (bidirectional) {
                preview.addEventListener('scroll', onPreviewScroll, { passive: true });
            }

            // Setup MutationObserver to detect DOM changes
            const observer = new MutationObserver(() => {
                // Debounce cache rebuilding
                invalidateCache();
                // Schedule a rebuild on next sync
            });

            observer.observe(preview, {
                childList: true,
                subtree: true,
            });

            observerRef.current = observer;

            // Build initial cache
            buildCache(preview);

            debugLog('Setup complete');
            return true;
        };

        // Try immediate setup, then poll if refs aren't ready
        if (!setup()) {
            const timer = setInterval(() => {
                if (setup()) {
                    clearInterval(timer);
                }
            }, 100);

            return () => {
                cleanedUp = true;
                clearInterval(timer);
            };
        }

        return () => {
            cleanedUp = true;

            if (attachedView) {
                attachedView.scrollDOM.removeEventListener('scroll', onEditorScroll);
            }
            if (attachedPreview) {
                attachedPreview.removeEventListener('scroll', onPreviewScroll);
            }
            if (observerRef.current) {
                observerRef.current.disconnect();
                observerRef.current = null;
            }
            if (syncTimeoutRef.current != null) {
                clearTimeout(syncTimeoutRef.current);
            }

            elementsRef.current = [];
            cacheValidRef.current = false;

            debugLog('Cleanup complete');
        };
    }, [
        editorViewRef,
        previewRef,
        onEditorScroll,
        onPreviewScroll,
        bidirectional,
        buildCache,
        invalidateCache,
    ]);

    // Return utility functions for external control
    return {
        /** Force rebuild of element cache */
        rebuildCache: () => {
            const preview = previewRef.current;
            if (preview) {
                buildCache(preview);
            }
        },
        /** Force sync editor to preview */
        syncNow: syncEditorToPreview,
    };
};
