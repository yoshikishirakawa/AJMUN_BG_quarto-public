/**
 * @deprecated Use `editorSyntaxZeroLatency` instead.
 *
 * This was an optimized implementation with performance modes, but has been
 * superseded by `editorSyntaxZeroLatency` which provides:
 * - True zero-latency typing by suspending ALL decorations during input
 * - Simpler architecture with no mode switching overhead
 * - Better responsiveness for typing-heavy workflows
 * - Same viewport-only optimization
 *
 * Migration guide:
 * ```diff
 * - import { optimizedSyntaxHighlighting } from './plugins/editorSyntaxOptimized';
 * + import { zeroLatencySyntaxHighlighting } from './plugins/editorSyntaxZeroLatency';
 *
 * - optimizedSyntaxHighlighting()
 * + zeroLatencySyntaxHighlighting()
 * ```
 *
 * @see editorSyntaxZeroLatency
 */

/**
 * OPTIMIZED Syntax Highlighting for Large Documents (200,000+ characters)
 *
 * This module replaces the MatchDecorator-based approach with a more efficient
 * viewport-only decoration system that can handle massive documents.
 */

import { Decoration, DecorationSet, ViewPlugin, ViewUpdate, EditorView } from '@codemirror/view';
import { Extension } from '@codemirror/state';
import { performanceMonitor } from '../utils/performanceMonitor';

// Performance modes
export type PerformanceMode = 'fast' | 'balanced' | 'rich';

// Singleton decorations (shared across all instances)
const footnoteDeco = Decoration.mark({ class: 'cm-syntax-footnote' });
const indexDeco = Decoration.mark({ class: 'cm-syntax-index' });
const lawquoteDeco = Decoration.mark({ class: 'cm-syntax-lawquote' });

// Current performance mode (can be changed at runtime)
let currentPerformanceMode: PerformanceMode = 'balanced';

// Character count thresholds for mode switching
const THRESHOLDS = {
    small: 10000,   // < 10k chars: rich mode
    medium: 50000,  // 10k-50k chars: balanced mode
    large: 200000,  // 50k+ chars: fast mode
};

/**
 * Set the performance mode
 */
export function setPerformanceMode(mode: PerformanceMode): void {
    currentPerformanceMode = mode;
}

/**
 * Get the current performance mode
 */
export function getPerformanceMode(): PerformanceMode {
    return currentPerformanceMode;
}

/**
 * Get recommended performance mode based on document size
 */
export function getRecommendedMode(docLength: number): PerformanceMode {
    if (docLength < THRESHOLDS.small) return 'rich';
    if (docLength < THRESHOLDS.medium) return 'balanced';
    return 'fast';
}

/**
 * Optimized decorator that only scans the viewport
 */
class ViewportDecorator {
    private decorations: DecorationSet = Decoration.none;
    private updateTimer: ReturnType<typeof setTimeout> | null = null;
    private lastContent: string = '';
    private lastViewport: { from: number; to: number } | null = null;

    constructor(view: EditorView) {
        this.lastContent = view.state.doc.toString();
        this.lastViewport = { from: 0, to: view.state.doc.length };
        this.decorations = this.buildDecorations(view);
    }

    update(update: ViewUpdate): void {
        const currentContent = update.state.doc.toString();
        const contentChanged = currentContent !== this.lastContent;

        // Get current viewport
        const currentViewport = {
            from: update.view.viewport.from,
            to: update.view.viewport.to
        };

        // Check if viewport changed significantly (>500 characters)
        const viewportChanged = !this.lastViewport ||
            Math.abs(currentViewport.from - this.lastViewport.from) > 500 ||
            Math.abs(currentViewport.to - this.lastViewport.to) > 500;

        // Skip if nothing important changed
        if (!contentChanged && !viewportChanged) {
            return;
        }

        this.lastContent = currentContent;
        this.lastViewport = currentViewport;

        // Clear existing timer
        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
        }

        // Fast mode: no decorations at all
        if (currentPerformanceMode === 'fast') {
            this.decorations = Decoration.none;
            return;
        }

        // Calculate debounce time
        const docLength = currentContent.length;
        let debounceTime: number;

        if (docLength < 10000) {
            debounceTime = 150;
        } else if (docLength < 50000) {
            debounceTime = 200;
        } else {
            debounceTime = 300;
        }

        // Schedule update
        this.updateTimer = setTimeout(() => {
            const endMeasure = performanceMonitor.startDecorationUpdate();
            this.decorations = this.buildDecorations(update.view);
            endMeasure();
            this.updateTimer = null;
        }, debounceTime);
    }

    /**
     * Build decorations for the current viewport
     * This is the key optimization: we only scan what's visible
     */
    private buildDecorations(view: EditorView): DecorationSet {
        const { from, to } = view.viewport;
        const doc = view.state.doc;
        const decorations: Decoration[] = [];

        // Only scan viewport
        const text = doc.sliceString(from, to);

        // Fast mode: skip all decorations
        if (currentPerformanceMode === 'fast') {
            return Decoration.none;
        }

        // Rich mode: scan entire viewport with all patterns
        if (currentPerformanceMode === 'rich') {
            this.addFootnoteDecorations(text, from, decorations);
            this.addIndexDecorations(text, from, decorations);
            this.addHighlightDecorations(text, from, decorations);
            this.addLawQuoteDecorations(text, from, decorations);
        } else {
            // Balanced mode: only essential patterns
            this.addFootnoteDecorations(text, from, decorations);
            this.addIndexDecorations(text, from, decorations);
        }

        return Decoration.set(decorations);
    }

    /**
     * Add footnote decorations: \[^...]
     */
    private addFootnoteDecorations(text: string, offset: number, decorations: Decoration[]): void {
        const regex = /\[\^[^\]]+\]/g;
        let match;

        while ((match = regex.exec(text)) !== null) {
            decorations.push(
                footnoteDeco.range(offset + match.index, offset + match.index + match[0].length)
            );
        }
    }

    /**
     * Add index decorations: {...|idx|...}
     */
    private addIndexDecorations(text: string, offset: number, decorations: Decoration[]): void {
        const regex = /\{[^\|\}]+\|idx\|[^\|\}]+\}/g;
        let match;

        while ((match = regex.exec(text)) !== null) {
            decorations.push(
                indexDeco.range(offset + match.index, offset + match.index + match[0].length)
            );
        }
    }

    /**
     * Add highlight decorations: [...]{.hl-...}
     */
    private addHighlightDecorations(text: string, offset: number, decorations: Decoration[]): void {
        const regex = /\[[^\]]+\]\{\.hl-([a-zA-Z]+)\}/g;
        let match;

        while ((match = regex.exec(text)) !== null) {
            const color = match[1];
            const deco = Decoration.mark({
                class: `cm-syntax-highlight cm-syntax-hl-${color}`,
                attributes: { style: `background-color: var(--hl-${color}-bg, rgba(255, 255, 0, 0.2));` }
            });
            decorations.push(
                deco.range(offset + match.index, offset + match.index + match[0].length)
            );
        }
    }

    /**
     * Add lawquote decorations: ^:::\s*{?\.?lawquote...
     */
    private addLawQuoteDecorations(text: string, offset: number, decorations: Decoration[]): void {
        const regex = /^:::\s*\{?\.?lawquote.*\}?/gm;
        let match;

        while ((match = regex.exec(text)) !== null) {
            decorations.push(
                lawquoteDeco.range(offset + match.index, offset + match.index + match[0].length)
            );
        }
    }

    destroy(): void {
        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
        }
    }
}

/**
 * Create the optimized syntax highlighting extension
 */
export const optimizedSyntaxHighlighting = (): Extension => {
    const plugin = ViewPlugin.fromClass(ViewportDecorator, {
        decorations: (v) => v.decorations
    });

    return [plugin];
};

/**
 * Extension to automatically switch performance mode based on document size
 */
export const autoPerformanceMode = ViewPlugin.fromClass(class {
    constructor(view: EditorView) {
        this.update(view);
    }

    update(update: ViewUpdate): void {
        if (update.docChanged) {
            const docLength = update.state.doc.length;
            const recommended = getRecommendedMode(docLength);
            if (recommended !== currentPerformanceMode) {
                setPerformanceMode(recommended);
                console.log(`[Performance] Auto-switched to ${recommended} mode (${docLength} chars)`);
            }
        }
    }
});
