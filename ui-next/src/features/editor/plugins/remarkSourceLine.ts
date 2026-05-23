import { visit } from 'unist-util-visit';
import { Plugin } from 'unified';

// Cache for source line mappings to avoid redundant processing
const sourceLineCache = new WeakMap<any, Map<string, number>>();

// Global index for scroll sync optimization (shared across all documents)
// This allows scroll sync to access line position data without DOM queries
declare global {
    interface Window {
        __sourceLineIndex__?: SourceLineIndexEntry[];
    }
}

export interface SourceLineIndexEntry {
    line: number;
    offset: number; // Character offset in document
    estimatedTop: number; // Estimated Y position (line * average line height)
    elementType?: 'paragraph' | 'heading' | 'list' | 'code' | 'quote' | 'table'; // Element type for line height models
    headingLevel?: number; // Heading level (1-6) for heading elements
}

export const remarkSourceLine: Plugin = () => {
    return (tree) => {
        // Get or create cache for this tree
        let cache = sourceLineCache.get(tree);
        if (!cache) {
            cache = new Map<string, number>();
            sourceLineCache.set(tree, cache);
        }

        // Build global index for scroll sync
        const lineIndex: SourceLineIndexEntry[] = [];
        let currentOffset = 0;
        const averageLineHeight = 24; // pixels

        // Only add line numbers to block-level elements that are likely to be scroll targets
        const blockTypes = [
            'paragraph', 'heading', 'list', 'listItem', 'table', 'blockquote', 'code', 'thematicBreak',
            'containerDirective', 'leafDirective'
        ];
        
        visit(tree, (node: any) => {
            if (blockTypes.includes(node.type) && node.position && node.position.start) {
                const line = node.position.start.line;
                const cacheKey = `${node.type}:${line}`;

                // Skip if already cached (lazy execution)
                if (cache.has(cacheKey)) {
                    return;
                }
                
                // Skip if this line was already processed by a child element
                // (prefer child elements inside containers like lawquote)
                if (node.type === 'containerDirective' || node.type === 'leafDirective') {
                    // For directives, we still mark them but children take priority in anchor building
                }

                const data = node.data || (node.data = {});
                const hProperties = data.hProperties || (data.hProperties = {});

                // Inject data-source-line
                hProperties['data-source-line'] = line;

                // Inject data-element-type for context-aware line height calculation (Phase B)
                // Map node types to element types
                let elementType: 'paragraph' | 'heading' | 'list' | 'code' | 'quote' | 'table' = 'paragraph';
                if (node.type === 'heading') {
                    elementType = 'heading';
                    // Also inject heading level for more precise styling
                    if (node.depth) {
                        hProperties['data-heading-level'] = node.depth;
                    }
                } else if (node.type === 'list' || node.type === 'listItem') {
                    elementType = 'list';
                } else if (node.type === 'code') {
                    elementType = 'code';
                } else if (node.type === 'blockquote') {
                    elementType = 'quote';
                } else if (node.type === 'table') {
                    elementType = 'table';
                }
                hProperties['data-element-type'] = elementType as string;

                // Add to global index
                const indexEntry: SourceLineIndexEntry = {
                    line,
                    offset: currentOffset,
                    estimatedTop: (line - 1) * averageLineHeight,
                    elementType // Include element type for line height models
                };

                // Add heading level for heading elements
                if (node.type === 'heading' && node.depth) {
                    indexEntry.headingLevel = node.depth;
                }

                lineIndex.push(indexEntry);

                // Update offset for next element
                if (node.position.end) {
                    currentOffset = node.position.end.offset;
                }

                // Cache this mapping
                cache.set(cacheKey, line);
            }
        });

        // Store global index for scroll sync
        if (typeof window !== 'undefined') {
            window.__sourceLineIndex__ = lineIndex;
        }
    };
};

// Export cache for testing and integration
export const getSourceLineCache = () => sourceLineCache;

/**
 * Get global source line index
 * Used by scroll sync to access line positions without DOM queries
 */
export const getGlobalSourceLineIndex = (): SourceLineIndexEntry[] => {
    if (typeof window !== 'undefined' && window.__sourceLineIndex__) {
        return window.__sourceLineIndex__;
    }
    return [];
};

/**
 * Clear global index (call when document changes)
 */
export const clearGlobalSourceLineIndex = (): void => {
    if (typeof window !== 'undefined') {
        window.__sourceLineIndex__ = [];
    }
};
