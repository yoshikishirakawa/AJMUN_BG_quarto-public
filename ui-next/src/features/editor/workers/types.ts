/**
 * Worker通信用型定義
 * Web Workerとのメッセージ通信で使用する型を定義
 */

// ============================================================================
// Preview Worker Types (for Markdown-to-HTML conversion)
// ============================================================================

/**
 * Workerに送信するメッセージの型
 */
export interface PreviewWorkerMessage {
    type: 'process';
    content: string;
    style?: Record<string, any>;
    isTrusted?: boolean;
    useCache?: boolean;
    cacheKey?: string;
}

/**
 * Workerから受信するメッセージの型
 */
export interface PreviewWorkerResponse {
    type: 'result' | 'error' | 'cached';
    html?: string;
    frontmatter?: Record<string, string> | null;
    error?: string;
    cacheKey?: string;
}

/**
 * Worker側のキャッシュエントリ
 */
export interface WorkerCacheEntry {
    html: string;
    frontmatter: Record<string, string> | null;
    timestamp: number;
}

/**
 * Worker側の統計情報
 */
export interface WorkerStats {
    cacheSize: number;
    cacheHits: number;
    cacheMisses: number;
    totalProcessed: number;
}

// ============================================================================
// Scroll Sync Worker Types (for scroll synchronization calculations)
// ============================================================================

/**
 * Scroll element data structure
 */
export interface ScrollElement {
    element: HTMLElement;
    line: number;
    top: number;
    height: number;
    offsetTop: number;
}

/**
 * Scroll sync worker message types
 */
export interface ScrollSyncWorkerMessage {
    type: 'syncPreview' | 'syncEditor' | 'calculateVisibleRange';
    elements: Omit<ScrollElement, 'element'>[]; // Exclude HTMLElement from worker messages
    scrollTop?: number;
    viewportHeight?: number;
    currentLine?: number;
    editorViewport?: { from: number; to: number };
}

/**
 * Scroll sync worker response types
 */
export interface ScrollSyncWorkerResponse {
    type: 'syncResult' | 'visibleRange';
    targetScrollTop?: number;
    targetLine?: number;
    visibleElements?: ScrollElement[];
    calculationTime: number;
}

// Legacy type aliases for backward compatibility
export type WorkerMessage = PreviewWorkerMessage;
export type WorkerResponse = PreviewWorkerResponse;
