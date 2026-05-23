/**
 * Optimized Scroll Synchronization for Large Documents
 *
 * Features:
 * - Passive event listeners to prevent blocking
 * - Binary search for O(log n) performance
 * - offsetTop caching to avoid reflows
 * - Linear interpolation for accurate alignment
 * - Direct scrolling (no inertia) to prevent oscillation
 * - Deadband compensation to prevent oscillation
 * - Pre-calculated line index from unified
 */

import { useEffect, useCallback, useRef } from 'react';
import { EditorView } from '@codemirror/view';
import { getGlobalSourceLineIndex, SourceLineIndexEntry } from './plugins/remarkSourceLine';

// Base scroll element interface
interface ScrollElement {
    element: HTMLElement;
    line: number;
    top: number;
    height: number;
}

// Phase B: Line height models for different element types
interface LineHeightModel {
    element: 'paragraph' | 'heading' | 'list' | 'code' | 'quote' | 'table';
    baseLineHeight: number;
    multiplier: number;
    headingLevel?: number; // Heading level (1-6) for heading elements
}

// Predefined line height models based on CSS and actual measurements
// Heading levels have different multipliers to reflect their visual hierarchy
const LINE_HEIGHT_MODELS: Record<string, LineHeightModel> = {
    paragraph: { element: 'paragraph', baseLineHeight: 24, multiplier: 1.0 },
    // Heading levels: h1 (largest) to h6 (smallest)
    h1: { element: 'heading', baseLineHeight: 24, multiplier: 2.0, headingLevel: 1 },
    h2: { element: 'heading', baseLineHeight: 24, multiplier: 1.8, headingLevel: 2 },
    h3: { element: 'heading', baseLineHeight: 24, multiplier: 1.6, headingLevel: 3 },
    h4: { element: 'heading', baseLineHeight: 24, multiplier: 1.4, headingLevel: 4 },
    h5: { element: 'heading', baseLineHeight: 24, multiplier: 1.3, headingLevel: 5 },
    h6: { element: 'heading', baseLineHeight: 24, multiplier: 1.2, headingLevel: 6 },
    // Fallback for heading without level information
    heading: { element: 'heading', baseLineHeight: 24, multiplier: 1.5 },
    list: { element: 'list', baseLineHeight: 24, multiplier: 1.2 },
    code: { element: 'code', baseLineHeight: 20, multiplier: 1.1 },
    quote: { element: 'quote', baseLineHeight: 24, multiplier: 1.3 },
    table: { element: 'table', baseLineHeight: 24, multiplier: 1.1 }
};

/**
 * Get line height model for an element type and optional heading level
 * Returns the appropriate model based on element type and heading level
 */
function getLineHeightModel(
    elementType: string,
    headingLevel?: number
): LineHeightModel {
    // For heading elements with level information, use level-specific model
    if (elementType === 'heading' && headingLevel && headingLevel >= 1 && headingLevel <= 6) {
        const levelKey = `h${headingLevel}` as keyof typeof LINE_HEIGHT_MODELS;
        return LINE_HEIGHT_MODELS[levelKey] || LINE_HEIGHT_MODELS.heading;
    }

    // For other element types, use the corresponding model
    const model = LINE_HEIGHT_MODELS[elementType];
    return model || LINE_HEIGHT_MODELS.paragraph;
}

// Enhanced cache with position data and element type
interface CachedScrollElement extends ScrollElement {
    offsetTop: number; // Cached to avoid reflows
    elementType?: 'paragraph' | 'heading' | 'list' | 'code' | 'quote' | 'table'; // Element type for context-aware line height
    headingLevel?: number; // Heading level (1-6) for heading elements
}

// Binary search to find element by scroll position
function findElementByScrollPosition(
    elements: CachedScrollElement[],
    scrollTop: number
): CachedScrollElement | null {
    if (elements.length === 0) return null;

    let left = 0;
    let right = elements.length - 1;

    while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        const element = elements[mid];

        if (element.top <= scrollTop && scrollTop < element.top + element.height) {
            return element;
        }

        if (element.top < scrollTop) {
            left = mid + 1;
        } else {
            right = mid - 1;
        }
    }

    return null;
}

// Optimized binary search to find surrounding elements (O(log n))
function findSurroundingElementsOptimized(
    elements: CachedScrollElement[],
    targetLine: number
): { before: CachedScrollElement | null; after: CachedScrollElement | null } {
    if (elements.length === 0) return { before: null, after: null };

    let left = 0;
    let right = elements.length - 1;
    let before: CachedScrollElement | null = null;
    let after: CachedScrollElement | null = null;

    while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        const element = elements[mid];

        if (element.line === targetLine) {
            return { before: element, after: element };
        }

        if (element.line < targetLine) {
            before = element; // Keep as candidate
            left = mid + 1;
        } else {
            after = element; // Keep as candidate
            right = mid - 1;
        }
    }

    return { before, after };
}

// Phase B: Calculate synthetic element position using context-aware line height models
function calculateSyntheticTop(
    before: CachedScrollElement,
    after: CachedScrollElement,
    targetLine: number,
    lineIndexMap: Map<number, SourceLineIndexEntry>
): number {
    const lineGap = after.line - before.line;
    const topGap = after.top - before.top;

    // If gap is small, use simple interpolation
    if (lineGap <= 2) {
        const t = (targetLine - before.line) / lineGap;
        return before.top + topGap * t;
    }

    // Phase B: Use line height models for better accuracy
    let accumulatedTop = before.top;
    let accumulatedLines = before.line;

    for (let line = accumulatedLines + 1; line <= targetLine; line++) {
        // Get element type and heading level from global index
        const indexEntry = lineIndexMap.get(line);
        const elementType = indexEntry?.elementType || 'paragraph';
        const headingLevel = indexEntry?.headingLevel;

        // Get appropriate line height model based on element type and heading level
        const model = getLineHeightModel(elementType, headingLevel);

        // Calculate line height based on element type and heading level
        const lineHeight = model.baseLineHeight * model.multiplier;
        accumulatedTop += lineHeight;
    }

    return accumulatedTop;
}


export const useMarkdownScrollSyncOptimized = (
    editorViewRef: React.MutableRefObject<EditorView | null>,
    previewRef: React.RefObject<HTMLElement | null>,
    enabled: boolean = true
) => {
    // Enhanced throttling with fixed 16ms (60fps)
    const rafRef = useRef<number | undefined>(undefined);

    // Position cache with offsetTop to avoid reflows
    const scrollCacheRef = useRef<Map<number, CachedScrollElement>>(new Map());
    const sortedElementsRef = useRef<CachedScrollElement[]>([]);
    const cacheVersionRef = useRef<number>(0);
    const offsetTopCacheRef = useRef<Map<number, number>>(new Map()); // Cached offsetTop values

    // Deadband compensation to prevent oscillation (increased for better stability)
    const lastSyncTargetRef = useRef<'editor' | 'preview' | null>(null);
    const lastSyncTimeRef = useRef<number>(0);
    const DEADBAND_TIME = 150; // ms - Increased to prevent oscillation

    // Flag to prevent interference from programmatic scrolling
    const isProgrammaticScrollRef = useRef<boolean>(false);
    const programmaticScrollEndTimeRef = useRef<number>(0);

    /**
     * Build cache with optimized offsetTop calculation (avoids reflows)
     * Uses pre-calculated line index from unified to avoid DOM queries
     *
     * PRECISION IMPROVEMENT: Generates synthetic elements for all lines within blocks
     * to ensure continuous line coverage for accurate interpolation.
     */
    const buildCache = useCallback((preview: HTMLElement, incremental = false) => {
        const elements = Array.from(preview.querySelectorAll<HTMLElement>('[data-source-line]'));
        if (elements.length === 0) {
            return;
        }

        if (!incremental) {
            scrollCacheRef.current.clear();
            sortedElementsRef.current = [];
            offsetTopCacheRef.current.clear();
        }

        // Get pre-calculated line index from unified
        const globalLineIndex = getGlobalSourceLineIndex();

        // Build a map from line number to index entry for O(1) lookup
        const lineIndexMap = new Map<number, SourceLineIndexEntry>();
        for (const entry of globalLineIndex) {
            lineIndexMap.set(entry.line, entry);
        }

        const scrollElements: CachedScrollElement[] = [];
        const newElements: CachedScrollElement[] = [];

        for (const element of elements) {
            const line = parseInt(element.dataset.sourceLine || '0', 10);

            if (line <= 0) continue;

            // Skip if already cached (incremental update)
            if (incremental && scrollCacheRef.current.has(line)) {
                continue;
            }

            // ALWAYS use actual DOM position (not estimated values)
            // The estimatedTop from unified is inaccurate because:
            // - Headings have larger font sizes
            // - Code blocks have different heights
            // - Images, tables, blockquotes have varying sizes
            // - Margins between elements are not accounted for
            const offsetTop = offsetTopCacheRef.current.get(line) ?? getCachedOffsetTop(element, preview, offsetTopCacheRef.current);
            const height = element.offsetHeight || 20;

            // Get element type from DOM attribute
            const elementTypeAttr = element.getAttribute('data-element-type');
            const elementType = (elementTypeAttr === 'paragraph' ||
                elementTypeAttr === 'heading' ||
                elementTypeAttr === 'list' ||
                elementTypeAttr === 'code' ||
                elementTypeAttr === 'quote' ||
                elementTypeAttr === 'table')
                ? elementTypeAttr as 'paragraph' | 'heading' | 'list' | 'code' | 'quote' | 'table'
                : undefined;

            // Get heading level from DOM attribute for heading elements
            let headingLevel: number | undefined;
            if (elementType === 'heading') {
                const headingLevelAttr = element.getAttribute('data-heading-level');
                if (headingLevelAttr) {
                    const level = parseInt(headingLevelAttr, 10);
                    if (level >= 1 && level <= 6) {
                        headingLevel = level;
                    }
                }
            }

            const scrollElement: CachedScrollElement = {
                element,
                line,
                top: offsetTop,
                height,
                offsetTop,
                elementType,
                headingLevel
            };

            scrollCacheRef.current.set(line, scrollElement);
            scrollElements.push(scrollElement);
            newElements.push(scrollElement);
        }

        // Generate synthetic elements to fill gaps for continuous line coverage
        // Use context-aware line height models for better accuracy
        const LINE_HEIGHT = 24; // Average line height in pixels

        for (let i = 0; i < scrollElements.length; i++) {
            const current = scrollElements[i];

            // If there's a next element and there's a gap between line numbers
            if (i < scrollElements.length - 1) {
                const next = scrollElements[i + 1];
                const lineGap = next.line - current.line;

                // If gap > 1, generate synthetic elements to fill it
                if (lineGap > 1) {
                    for (let j = 1; j < lineGap; j++) {
                        const syntheticLine = current.line + j;

                        // Use context-aware line height calculation
                        const syntheticTop = calculateSyntheticTop(current, next, syntheticLine, lineIndexMap);

                        // Only add if not already cached
                        if (!scrollCacheRef.current.has(syntheticLine)) {
                            const syntheticElement: CachedScrollElement = {
                                element: current.element, // Reference the actual element
                                line: syntheticLine,
                                top: syntheticTop,
                                height: LINE_HEIGHT,
                                offsetTop: syntheticTop,
                                elementType: current.elementType,
                                headingLevel: current.headingLevel
                            };

                            scrollCacheRef.current.set(syntheticLine, syntheticElement);
                            newElements.push(syntheticElement);
                        }
                    }
                }
            }
        }

        // Sort and merge
        if (newElements.length > 0) {
            newElements.sort((a, b) => a.line - b.line);

            sortedElementsRef.current = [
                ...sortedElementsRef.current,
                ...newElements
            ].sort((a, b) => a.line - b.line);

            cacheVersionRef.current++;
        }
    }, []);

    /**
     * Calculate offsetTop efficiently with caching
     */
    function getCachedOffsetTop(
        element: HTMLElement,
        container: HTMLElement,
        cache: Map<number, number>
    ): number {
        const line = parseInt(element.dataset.sourceLine || '0', 10);

        // Check cache first
        if (cache.has(line)) {
            return cache.get(line)!;
        }

        // Calculate offsetTop (this still causes reflow, but only once per element)
        let top = 0;
        let current: HTMLElement | null = element;

        while (current && current !== container) {
            top += current.offsetTop;
            current = current.offsetParent as HTMLElement;
        }

        // Cache the result
        cache.set(line, top);
        return top;
    }

    /**
     * Apply smooth scrolling with native browser smooth scroll
     * Uses behavior: 'smooth' for better UX while preventing oscillation
     */
    const applySmoothScrollNative = useCallback((element: HTMLElement, target: number) => {
        // Set flag to prevent scroll event interference
        isProgrammaticScrollRef.current = true;
        programmaticScrollEndTimeRef.current = performance.now() + DEADBAND_TIME + 100;

        // Use native smooth scroll for better UX
        element.scrollTo({
            top: target,
            behavior: 'smooth'
        });
    }, [DEADBAND_TIME]);

    // Editor -> Preview Sync
    const syncPreview = useCallback(() => {
        const view = editorViewRef.current;
        const preview = previewRef.current;
        if (!view || !preview || !enabled) {
            return;
        }

        let sortedElements = sortedElementsRef.current;
        if (sortedElements.length === 0) {
            buildCache(preview);
            sortedElements = sortedElementsRef.current;
            if (sortedElements.length === 0) {
                return;
            }
        }

        try {
            // Get the center position from editor viewport
            const scrollDOM = view.scrollDOM;
            const scrollTop = scrollDOM.scrollTop;
            const viewportHeight = scrollDOM.clientHeight;

            // Focus on CENTER position for better accuracy
            const centerScrollTop = scrollTop + viewportHeight * 0.5;
            const centerLineBlock = view.lineBlockAtHeight(centerScrollTop);
            const centerLineNumber = view.state.doc.lineAt(centerLineBlock.from).number;
            const centerRatio = (centerScrollTop - centerLineBlock.top) / centerLineBlock.height;
            const centerLine = centerLineNumber + centerRatio;

            // Find the preview position for the center line
            const { before, after } = findSurroundingElementsOptimized(sortedElements, centerLine);

            let targetScrollTop = 0;

            if (!before && after) {
                // Before content start
                targetScrollTop = 0;
            } else if (before && !after) {
                // After content end
                targetScrollTop = before.top;
            } else if (before && after) {
                // Linear interpolation
                const t = (centerLine - before.line) / (after.line - before.line);
                targetScrollTop = before.top + (after.top - before.top) * t;
            }

            // Adjust for viewport: the element should be at the center of preview viewport
            const previewViewportHeight = preview.clientHeight;
            targetScrollTop -= previewViewportHeight * 0.5;

            // Clamp to valid range
            targetScrollTop = Math.max(0, Math.min(targetScrollTop, preview.scrollHeight - previewViewportHeight));

            // Apply with smooth scrolling
            applySmoothScrollNative(preview, targetScrollTop);

        } catch {
            // Ignore errors (out of bounds, etc.)
        }
    }, [editorViewRef, previewRef, enabled, applySmoothScrollNative, buildCache]);

    // Preview -> Editor Sync
    const syncEditor = useCallback(() => {
        const view = editorViewRef.current;
        const preview = previewRef.current;
        if (!view || !preview || !enabled) {
            return;
        }

        let sortedElements = sortedElementsRef.current;
        if (sortedElements.length === 0) {
            buildCache(preview);
            sortedElements = sortedElementsRef.current;
            if (sortedElements.length === 0) {
                return;
            }
        }

        try {
            // Get the center position from preview viewport
            const scrollTop = preview.scrollTop;
            const viewportHeight = preview.clientHeight;

            // Focus on CENTER position
            const centerScrollTop = scrollTop + viewportHeight * 0.5;

            // Find element at center position
            const centerElement = findElementByScrollPosition(sortedElements, centerScrollTop);
            const targetLine = centerElement?.line || 1;

            // Apply with smooth scrolling
            const lineInt = Math.floor(targetLine);
            const lineFraction = targetLine - lineInt;

            const lineInfo = view.state.doc.line(lineInt);
            const block = view.lineBlockAt(lineInfo.from);

            // Calculate pixel position
            const targetPixelTop = block.top + (block.height * lineFraction);

            // Adjust for viewport: the element should be at the center of editor viewport
            const editorViewportHeight = view.scrollDOM.clientHeight;
            const adjustedScrollTop = targetPixelTop - editorViewportHeight * 0.5;

            // Clamp to valid range
            const maxScrollTop = view.scrollDOM.scrollHeight - editorViewportHeight;
            const clampedScrollTop = Math.max(0, Math.min(adjustedScrollTop, maxScrollTop));

            // Use smooth scrolling
            applySmoothScrollNative(view.scrollDOM, clampedScrollTop);

        } catch {
            // Ignore OOB errors
        }
    }, [editorViewRef, previewRef, enabled, applySmoothScrollNative, buildCache]);

    // Throttled RAF handlers - Disabled for better accuracy
    const scheduleRAF = useCallback((callback: () => void) => {
        // Direct RAF scheduling without throttling for better accuracy
        if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
        }
        rafRef.current = requestAnimationFrame(() => {
            callback();
            rafRef.current = undefined;
        });
    }, []);

    // Handlers with passive listeners and deadband compensation
    const onEditorScroll = useCallback(() => {
        if (!enabled) return;

        // Ignore if this is from programmatic scrolling (to prevent interference loops)
        const now = performance.now();
        if (isProgrammaticScrollRef.current && now < programmaticScrollEndTimeRef.current) {
            return;
        } else if (isProgrammaticScrollRef.current && now >= programmaticScrollEndTimeRef.current) {
            isProgrammaticScrollRef.current = false;
        }

        // Deadband check - prevent oscillation
        if (lastSyncTargetRef.current === 'preview' && now - lastSyncTimeRef.current < DEADBAND_TIME) {
            return;
        }

        // Update sync target and time
        if (lastSyncTargetRef.current !== 'editor') {
            lastSyncTargetRef.current = 'editor';
            lastSyncTimeRef.current = now;
        }

        scheduleRAF(syncPreview);
    }, [enabled, syncPreview, scheduleRAF, DEADBAND_TIME]);

    const onPreviewScroll = useCallback(() => {
        if (!enabled) return;

        // Ignore if this is from programmatic scrolling (to prevent interference loops)
        const now = performance.now();
        if (isProgrammaticScrollRef.current && now < programmaticScrollEndTimeRef.current) {
            return;
        } else if (isProgrammaticScrollRef.current && now >= programmaticScrollEndTimeRef.current) {
            isProgrammaticScrollRef.current = false;
        }

        // Deadband check - prevent oscillation
        if (lastSyncTargetRef.current === 'editor' && now - lastSyncTimeRef.current < DEADBAND_TIME) {
            return;
        }

        // Update sync target and time
        if (lastSyncTargetRef.current !== 'preview') {
            lastSyncTargetRef.current = 'preview';
            lastSyncTimeRef.current = now;
        }

        scheduleRAF(syncEditor);
    }, [enabled, syncEditor, scheduleRAF, DEADBAND_TIME]);

    // Function to clear cache (for chapter navigation)
    const clearCache = useCallback(() => {
        scrollCacheRef.current.clear();
        sortedElementsRef.current = [];
        offsetTopCacheRef.current.clear();
        cacheVersionRef.current = 0;

        // Rebuild cache immediately if refs are available
        const view = editorViewRef.current;
        const preview = previewRef.current;
        if (view && preview) {
            buildCache(preview);
        }
    }, [buildCache, editorViewRef, previewRef]);

    // Attach listeners
    useEffect(() => {
        let attachedView: EditorView | null = null;
        let attachedPreview: HTMLElement | null = null;
        const scrollCache = scrollCacheRef.current;
        const offsetTopCache = offsetTopCacheRef.current;

        const checkRefs = () => {
            const view = editorViewRef.current;
            const preview = previewRef.current;

            if (view && preview) {
                const scrollDOM = view.scrollDOM;
                attachedView = view;
                attachedPreview = preview;

                // Use passive listeners to prevent blocking
                scrollDOM.addEventListener('scroll', onEditorScroll, { passive: true });
                preview.addEventListener('scroll', onPreviewScroll, { passive: true });

                // Build initial cache
                buildCache(preview);

                return true;
            }
            return false;
        };

        const timer = setInterval(() => {
            if (checkRefs()) clearInterval(timer);
        }, 100);

        // Initial check
        checkRefs();

        return () => {
            clearInterval(timer);
            if (attachedView && attachedPreview) {
                attachedView.scrollDOM.removeEventListener('scroll', onEditorScroll);
                attachedPreview.removeEventListener('scroll', onPreviewScroll);
            }
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
            }

            // Cleanup caches
            scrollCache.clear();
            sortedElementsRef.current = [];
            offsetTopCache.clear();
        };
    }, [onEditorScroll, onPreviewScroll, editorViewRef, previewRef, buildCache, enabled]);

    // Return clearCache function for external use
    return { clearCache };
};
