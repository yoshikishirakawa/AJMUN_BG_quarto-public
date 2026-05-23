/**
 * @deprecated Use `useMarkdownScrollSyncOptimized` instead.
 *
 * This is the original scroll synchronization implementation.
 * It has been superseded by `useMarkdownScrollSyncOptimized` which provides:
 * - Better performance with binary search (O(log n) vs O(n))
 * - Passive event listeners to prevent blocking
 * - Center-position alignment for better UX
 * - Deadband compensation to prevent oscillation
 *
 * Migration guide:
 * ```diff
 * - import { useMarkdownScrollSync } from './useMarkdownScrollSync';
 * + import { useMarkdownScrollSyncOptimized } from './useMarkdownScrollSyncOptimized';
 *
 * - useMarkdownScrollSync(editorViewRef, previewRef, activePane, enabled)
 * + useMarkdownScrollSyncOptimized(editorViewRef, previewRef, enabled)
 * ```
 *
 * @see useMarkdownScrollSyncOptimized
 */

import { useEffect, useCallback, useRef } from 'react';
import { EditorView } from '@codemirror/view';

// キャッシュ用インターフェース
interface ScrollElement {
    element: HTMLElement;
    line: number;
    top: number;
    height: number;
}

// 二分探索でスクロール位置に対応する要素を見つける
function findElementByScrollPosition(
    elements: ScrollElement[],
    scrollTop: number
): ScrollElement | null {
    let left = 0;
    let right = elements.length - 1;

    while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        const element = elements[mid];

        // 要素がscrollTopの範囲内にあるかチェック
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


// ライン番号の前後の要素を見つける
function findSurroundingElements(
    elements: ScrollElement[],
    lineNumber: number
): { before: ScrollElement | null; after: ScrollElement | null } {
    let before: ScrollElement | null = null;
    let after: ScrollElement | null = null;

    for (const element of elements) {
        if (element.line <= lineNumber) {
            before = element;
        } else {
            after = element;
            break;
        }
    }

    return { before, after };
}

export const useMarkdownScrollSync = (
    editorViewRef: React.MutableRefObject<EditorView | null>,
    previewRef: React.RefObject<HTMLElement | null>,
    activePane: 'editor' | 'preview' = 'editor',
    enabled: boolean = true
) => {
    // Throttling frames
    const requestRef = useRef<number | undefined>(undefined);

    // 要素位置キャッシュ
    const scrollCacheRef = useRef<Map<number, ScrollElement>>(new Map());
    const sortedElementsRef = useRef<ScrollElement[]>([]);
    const cacheVersionRef = useRef<number>(0);
    const observerRef = useRef<IntersectionObserver | null>(null);
    const visibleLinesRef = useRef<Set<number>>(new Set());

    // キャッシュを構築する関数（最適化版）
    const buildCache = useCallback((preview: HTMLElement, incremental = false) => {
        const elements = Array.from(preview.querySelectorAll<HTMLElement>('[data-source-line]'));
        if (elements.length === 0) return;

        // 増分更新の場合、既存のキャッシュを維持
        if (!incremental) {
            // キャッシュをクリア
            scrollCacheRef.current.clear();
            sortedElementsRef.current = [];
        }

        // 要素をキャッシュに追加
        const scrollElements: ScrollElement[] = [];
        const newElements: ScrollElement[] = [];

        for (const element of elements) {
            const line = parseInt(element.dataset.sourceLine || '0', 10);

            // 既にキャッシュされている場合はスキップ（増分更新時）
            if (incremental && scrollCacheRef.current.has(line)) {
                continue;
            }

            const rect = element.getBoundingClientRect();
            const top = element.offsetTop;
            const height = rect.height;

            const scrollElement: ScrollElement = {
                element,
                line,
                top,
                height,
            };

            scrollCacheRef.current.set(line, scrollElement);
            scrollElements.push(scrollElement);
            newElements.push(scrollElement);
        }

        // ライン番号でソート（新規要素のみ）
        if (newElements.length > 0) {
            newElements.sort((a, b) => a.line - b.line);

            // 既存のソート済み配列にマージ
            sortedElementsRef.current = [
                ...sortedElementsRef.current,
                ...newElements
            ].sort((a, b) => a.line - b.line);

            cacheVersionRef.current++;
        }

        // Intersection Observerを設定（初回のみ、または要素数が大幅に変わった場合）
        if (!observerRef.current || !incremental) {
            if (observerRef.current) {
                observerRef.current.disconnect();
            }

            // ビューポート付近の要素のみ監視（最適化）
            const viewportMargin = 500; // ビューポート外500pxまで
            observerRef.current = new IntersectionObserver(
                (entries) => {
                    visibleLinesRef.current.clear();
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            const element = entry.target as HTMLElement;
                            const line = parseInt(element.dataset.sourceLine || '0', 10);
                            if (line > 0) {
                                visibleLinesRef.current.add(line);
                            }
                        }
                    });
                },
                {
                    root: preview,
                    rootMargin: `${viewportMargin}px 0px`, // 上下にマージンを追加
                    threshold: [0, 0.1], // 段階的な監視
                }
            );

            // すべての要素を監視（またはビューポート付近のみ）
            const elementsToObserve = incremental
                ? newElements.map(e => e.element)
                : elements;

            elementsToObserve.forEach(element => {
                observerRef.current?.observe(element);
            });
        }
    }, []);

    // キャッシュが有効かチェック
    const isCacheValid = useCallback(() => {
        return sortedElementsRef.current.length > 0;
    }, []);

    // Editor -> Preview Sync
    const syncPreview = useCallback(() => {
        const view = editorViewRef.current;
        const preview = previewRef.current;
        if (!view || !preview) return;

        // キャッシュが無効な場合は構築
        if (!isCacheValid()) {
            buildCache(preview);
        }

        // 1. Get Editor 'Visual' Center or Top
        const scrollDOM = view.scrollDOM;
        const scrollTop = scrollDOM.scrollTop;

        // Calculate the central line being read (e.g. 1/3 down the screen)
        const lineBlock = view.lineBlockAtHeight(scrollTop);
        const topLineNumber = view.state.doc.lineAt(lineBlock.from).number;

        // Calculate progress within the top line
        const ratio = (scrollTop - lineBlock.top) / lineBlock.height;
        const currentLine = topLineNumber + ratio;

        // 2. Find closest anchors in Preview using cache and binary search
        const sortedElements = sortedElementsRef.current;
        if (sortedElements.length === 0) return;

        // 二分探索で前後の要素を見つける
        const { before, after } = findSurroundingElements(sortedElements, currentLine);

        // 3. Interpolate Target Scroll Top
        let targetScrollTop = 0;

        if (!before && after) {
            // Before content start
            targetScrollTop = 0;
        } else if (before && !after) {
            // After content end (or last element)
            targetScrollTop = before.top;
        } else if (before && after) {
            const beforeLine = before.line;
            const afterLine = after.line;
            const beforeTop = before.top;
            const afterTop = after.top;

            // Interpolation factor
            const t = (currentLine - beforeLine) / (afterLine - beforeLine);

            // Map to pixels
            targetScrollTop = beforeTop + (afterTop - beforeTop) * t;
        }

        // Apply
        preview.scrollTop = targetScrollTop;

    }, [editorViewRef, previewRef, isCacheValid, buildCache]);

    // Preview -> Editor Sync
    const syncEditor = useCallback(() => {
        const view = editorViewRef.current;
        const preview = previewRef.current;
        if (!view || !preview) return;

        // キャッシュが無効な場合は構築
        if (!isCacheValid()) {
            buildCache(preview);
        }

        const scrollTop = preview.scrollTop;

        // 二分探索でスクロール位置に対応する要素を見つける
        const sortedElements = sortedElementsRef.current;
        if (sortedElements.length === 0) return;

        const element = findElementByScrollPosition(sortedElements, scrollTop);

        let targetLine = 1;

        if (element) {
            targetLine = element.line;
        } else {
            // 要素が見つからない場合、最も近い要素を探す
            let before: ScrollElement | null = null;
            let after: ScrollElement | null = null;

            for (const el of sortedElements) {
                if (el.top <= scrollTop) {
                    before = el;
                } else {
                    after = el;
                    break;
                }
            }

            if (before && after) {
                const beforeTop = before.top;
                const afterTop = after.top;
                const beforeLine = before.line;
                const afterLine = after.line;

                const t = (scrollTop - beforeTop) / (afterTop - beforeTop);
                targetLine = beforeLine + (afterLine - beforeLine) * t;
            } else if (before) {
                targetLine = before.line;
            }
        }

        // Apply smooth scrolling to CodeMirror
        try {
            const lineInt = Math.floor(targetLine);
            const lineFraction = targetLine - lineInt;

            // Get Block Info for the integer line
            const lineInfo = view.state.doc.line(lineInt);
            const block = view.lineBlockAt(lineInfo.from);

            // Calculate exact pixel position
            const targetPixelTop = block.top + (block.height * lineFraction);

            // Set scrollTop directly for smooth continuous sync
            view.scrollDOM.scrollTo({ top: targetPixelTop, behavior: 'auto' });

        } catch { /* ignore OOB */ }

    }, [editorViewRef, previewRef, isCacheValid, buildCache]);


    // Handlers（スロットル強化版）
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

    // Attach Listeners
    useEffect(() => {
        let attachedView: EditorView | null = null;
        let attachedPreview: HTMLElement | null = null;
        const scrollCache = scrollCacheRef.current;
        const visibleLines = visibleLinesRef.current;

        const checkRefs = () => {
            const view = editorViewRef.current;
            const preview = previewRef.current;
            if (view && preview) {
                const scrollDOM = view.scrollDOM;
                attachedView = view;
                attachedPreview = preview;
                scrollDOM.addEventListener('scroll', onEditorScroll);
                preview.addEventListener('scroll', onPreviewScroll);

                // キャッシュを初期化
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
            if (requestRef.current) cancelAnimationFrame(requestRef.current);

            // Intersection Observerをクリーンアップ
            if (observerRef.current) {
                observerRef.current.disconnect();
                observerRef.current = null;
            }

            // キャッシュをクリア
            scrollCache.clear();
            sortedElementsRef.current = [];
            visibleLines.clear();
        };
    }, [onEditorScroll, onPreviewScroll, editorViewRef, previewRef, buildCache, enabled]);
};
