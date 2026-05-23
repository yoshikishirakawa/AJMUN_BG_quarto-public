/**
 * Web Worker for Scroll Synchronization
 *
 * Offloads heavy calculations from main thread:
 * - Binary search operations
 * - Visible range detection
 * - Interpolation calculations
 */

import type { ScrollSyncWorkerMessage, ScrollSyncWorkerResponse } from './types';

interface ScrollElementData {
    line: number;
    top: number;
    height: number;
}

// Binary search to find element by scroll position
function findElementByScrollPosition(
    elements: ScrollElementData[],
    scrollTop: number
): ScrollElementData | null {
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

// Binary search to find surrounding elements
function findSurroundingElements(
    elements: ScrollElementData[],
    targetLine: number
): { before: ScrollElementData | null; after: ScrollElementData | null } {
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

// Hermite interpolation
function hermiteInterpolate(
    y0: number,
    y1: number,
    t: number,
    tension: number = 0.3
): number {
    const t2 = t * t;
    const t3 = t2 * t;

    const h00 = 2*t3 - 3*t2 + 1;
    const h10 = t3 - 2*t2 + t;
    const h01 = -2*t3 + 3*t2;
    const h11 = t3 - t2;

    return h00*y0 + h10*(y1 - y0)*tension + h01*y1 + h11*(y1 - y0)*tension;
}

// Process messages from main thread
self.onmessage = (event: MessageEvent<ScrollSyncWorkerMessage>) => {
    const { type, elements, scrollTop, viewportHeight, currentLine } = event.data;
    const startTime = performance.now();

    if (type === 'syncPreview') {
        // Editor -> Preview sync
        if (scrollTop === undefined || currentLine === undefined) return;

        const { before, after } = findSurroundingElements(elements, currentLine);
        let targetScrollTop = 0;

        if (!before && after) {
            targetScrollTop = 0;
        } else if (before && !after) {
            targetScrollTop = before.top;
        } else if (before && after) {
            const t = (currentLine - before.line) / (after.line - before.line);
            targetScrollTop = hermiteInterpolate(before.top, after.top, t, 0.3);
        }

        const response: ScrollSyncWorkerResponse = {
            type: 'syncResult',
            targetScrollTop,
            calculationTime: performance.now() - startTime
        };

        self.postMessage(response);

    } else if (type === 'syncEditor') {
        // Preview -> Editor sync
        if (scrollTop === undefined) return;

        const element = findElementByScrollPosition(elements, scrollTop);
        const targetLine = element ? element.line : 1;

        const response: ScrollSyncWorkerResponse = {
            type: 'syncResult',
            targetLine,
            calculationTime: performance.now() - startTime
        };

        self.postMessage(response);

    } else if (type === 'calculateVisibleRange') {
        // Calculate visible range for virtual scroll tracking
        if (scrollTop === undefined || viewportHeight === undefined) return;

        const visibleElements = elements.filter(el => {
            const elBottom = el.top + el.height;
            return el.top < scrollTop + viewportHeight && elBottom > scrollTop;
        });

        const response: ScrollSyncWorkerResponse = {
            type: 'visibleRange',
            visibleElements: visibleElements.map(el => ({
                element: null as any, // Not used in worker
                line: el.line,
                top: el.top,
                height: el.height,
                offsetTop: el.top
            })),
            calculationTime: performance.now() - startTime
        };

        self.postMessage(response);
    }
};
