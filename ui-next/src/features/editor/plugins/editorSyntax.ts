/**
 * @deprecated Use `editorSyntaxZeroLatency` instead.
 *
 * This is the original syntax highlighting implementation using MatchDecorator.
 * It has been superseded by `editorSyntaxZeroLatency` which provides:
 * - Zero-latency typing by suspending decorations during input
 * - Better performance for large documents (200,000+ characters)
 * - Viewport-only scanning to reduce overhead
 * - Essential decorations only (footnotes, indices)
 *
 * Migration guide:
 * ```diff
 * - import { editorSyntaxHighlighting } from './plugins/editorSyntax';
 * + import { zeroLatencySyntaxHighlighting } from './plugins/editorSyntaxZeroLatency';
 *
 * - editorSyntaxHighlighting()
 * + zeroLatencySyntaxHighlighting()
 * ```
 *
 * @see editorSyntaxZeroLatency
 */

import { Decoration, DecorationSet, MatchDecorator, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { Extension } from '@codemirror/state';
import { getDebounceTime } from '@/hooks/useDynamicDebounce';

// Define decorations
const footnoteDeco = Decoration.mark({ class: 'cm-syntax-footnote' });
const indexDeco = Decoration.mark({ class: 'cm-syntax-index' });
const lawquoteDeco = Decoration.mark({ class: 'cm-syntax-lawquote' });
const highlightDeco = (color: string) => Decoration.mark({
    class: `cm-syntax-highlight cm-syntax-hl-${color}`,
    attributes: { style: `background-color: var(--hl-${color}-bg, rgba(255, 255, 0, 0.2));` }
});

// Cache for decorations to avoid recreating them
const decorationCache = new Map<string, Decoration>();

// Unified decorator that matches all syntax patterns
const unifiedSyntaxDecorator = new MatchDecorator({
    // Combined regex pattern matching all syntax types:
    // 1. Footnotes: \[^...]
    // 2. Index: {...|idx|...}
    // 3. Lawquote: ^:::\s*{?\.?lawquote...
    // 4. Highlight: [...]{.hl-...}
    regexp: /(\[\^[^\]]+\])|(\{[^\|\}]+\|idx\|[^\|\}]+\})|(^:::\s*\{?\.?lawquote.*\}?)|(\[[^\]]+\]\{\.hl-([a-zA-Z]+)\})/gm,
    decoration: (match, _view, from) => {
        // Determine which pattern matched
        const fullMatch = match[0];
        const footnoteMatch = match[1];
        const indexMatch = match[2];
        const lawquoteMatch = match[3];
        const highlightMatch = match[4];
        const highlightColor = match[5];

        // Create cache key
        const cacheKey = `${fullMatch}:${from}`;

        // Check cache
        if (decorationCache.has(cacheKey)) {
            return decorationCache.get(cacheKey)!;
        }

        let decoration: Decoration;

        if (footnoteMatch) {
            decoration = footnoteDeco;
        } else if (indexMatch) {
            decoration = indexDeco;
        } else if (lawquoteMatch) {
            decoration = lawquoteDeco;
        } else if (highlightMatch && highlightColor) {
            decoration = highlightDeco(highlightColor);
        } else {
            // Fallback - should not happen
            decoration = Decoration.mark({ class: 'cm-syntax-unknown' });
        }

        // Cache the decoration
        decorationCache.set(cacheKey, decoration);

        return decoration;
    },
    boundary: /[\s\[\]{}|]/g
});


// Unified plugin with lazy execution and viewport optimization
const unifiedSyntaxPlugin = ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    updateTimer: ReturnType<typeof setTimeout> | null = null;
    lastContent: string = '';
    lastViewport: { from: number; to: number } | null = null;

    constructor(view: any) {
        // Initial decorations for full document
        this.decorations = unifiedSyntaxDecorator.createDeco(view);
        this.lastContent = view.state.doc.toString();
        this.lastViewport = { from: 0, to: view.state.doc.length };
    }

    update(update: ViewUpdate) {
        const currentContent = update.state.doc.toString();
        const currentViewport = {
            from: update.view.viewport.from,
            to: update.view.viewport.to
        };

        // Skip if content hasn't changed AND viewport hasn't changed significantly
        const contentChanged = currentContent !== this.lastContent;
        const viewportChanged = !this.lastViewport ||
            Math.abs(currentViewport.from - this.lastViewport.from) > 1000 ||
            Math.abs(currentViewport.to - this.lastViewport.to) > 1000;

        if (!contentChanged && !viewportChanged) {
            return;
        }

        this.lastContent = currentContent;
        this.lastViewport = currentViewport;

        // Clear existing timer
        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
        }

        // Calculate debounce time based on content length
        // For typing: shorter delay, for scroll: longer delay
        const debounceTime = contentChanged
            ? Math.min(getDebounceTime(currentContent.length, 'editor'), 150) // Cap at 150ms for typing
            : 300; // Longer delay for viewport changes

        // Schedule delayed update
        this.updateTimer = setTimeout(() => {
            // For large documents (>5000 lines), only update visible viewport
            const docLines = update.state.doc.lines;
            const shouldLimitViewport = docLines > 5000;

            if (shouldLimitViewport && !contentChanged) {
                // Viewport-only update for scroll events on large docs
                this.decorations = this.updateViewportOnly(update);
            } else {
                // Full update for content changes or small docs
                this.decorations = unifiedSyntaxDecorator.updateDeco(update, this.decorations);
            }

            this.updateTimer = null;
        }, debounceTime);
    }

    /**
     * Update decorations only for the visible viewport
     * This significantly improves performance for large documents
     */
    updateViewportOnly(update: ViewUpdate): DecorationSet {
        const viewport = update.view.viewport;
        const { from, to } = viewport;

        // Create decorations only for viewport range
        const viewportDeco = unifiedSyntaxDecorator.createDeco(update.view);

        // Merge with existing decorations for non-viewport areas
        // This is a simplified version - could be optimized further
        return Decoration.set([
            ...this.decorations.iter().filter((deco: any) => {
                const decoFrom = deco.from;
                const decoTo = deco.to;
                // Keep decorations outside viewport
                return decoTo < from || decoFrom > to;
            }),
            ...viewportDeco.iter()
        ]);
    }

    destroy() {
        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
        }
    }
}, { decorations: v => v.decorations });

export const editorSyntaxHighlighting = (): Extension => {
    return [unifiedSyntaxPlugin];
};
