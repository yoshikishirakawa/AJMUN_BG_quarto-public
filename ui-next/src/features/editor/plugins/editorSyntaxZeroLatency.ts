/**
 * EXTREME Performance Mode for Zero-Latency Typing
 *
 * This module provides decorations only when the user is NOT typing.
 * During typing, all decorations are suspended to ensure instant response.
 */

import { Decoration, DecorationSet, ViewPlugin, ViewUpdate, EditorView } from '@codemirror/view';
import { Extension, Range } from '@codemirror/state';

// Singleton decorations
const footnoteDeco = Decoration.mark({ class: 'cm-syntax-footnote' });
const indexDeco = Decoration.mark({ class: 'cm-syntax-index' });

/**
 * Typing detection with debouncing
 */
class TypingDetector {
    private lastTypingTime = 0;
    private isTyping = false;
    private typingTimer: ReturnType<typeof setTimeout> | null = null;
    private readonly TYPING_TIMEOUT = 500; // ms after typing stops

    /**
     * Call this when user types
     */
    recordTyping(): void {
        this.lastTypingTime = Date.now();
        this.isTyping = true;

        // Clear existing timer
        if (this.typingTimer) {
            clearTimeout(this.typingTimer);
        }

        // Set timer to detect typing stop
        this.typingTimer = setTimeout(() => {
            this.isTyping = false;
            this.typingTimer = null;
        }, this.TYPING_TIMEOUT);
    }

    /**
     * Check if user is currently typing
     */
    isCurrentlyTyping(): boolean {
        // If we're in the typing window, consider user is typing
        if (this.isTyping) {
            const timeSinceLastType = Date.now() - this.lastTypingTime;
            return timeSinceLastType < this.TYPING_TIMEOUT;
        }
        return false;
    }

    /**
     * Force stop typing state
     */
    forceStop(): void {
        this.isTyping = false;
        if (this.typingTimer) {
            clearTimeout(this.typingTimer);
            this.typingTimer = null;
        }
    }
}

/**
 * Zero-latency decorator that only works when user is NOT typing
 */
class ZeroLatencyDecorator {
    private decorations: DecorationSet = Decoration.none;
    private updateTimer: ReturnType<typeof setTimeout> | null = null;
    private typingDetector = new TypingDetector();
    private updateScheduled = false;
    private lastDecoratedContent = '';

    constructor(view: EditorView) {
        this.decorations = Decoration.none;
        this.lastDecoratedContent = view.state.doc.toString();
        // Start with decorations disabled for instant typing
    }

    update(update: ViewUpdate): void {
        // Detect typing activity
        if (update.docChanged) {
            this.typingDetector.recordTyping();

            // IMMEDIATELY clear decorations when typing starts
            if (this.typingDetector.isCurrentlyTyping()) {
                this.decorations = Decoration.none;
                this.lastDecoratedContent = '';
                this.cancelScheduledUpdate();
                return;
            }
        }

        // Only update if user has stopped typing AND content actually changed
        const currentContent = update.state.doc.toString();
        if (!this.typingDetector.isCurrentlyTyping() &&
            !this.updateScheduled &&
            currentContent !== this.lastDecoratedContent) {
            // Schedule update for when typing stops
            this.scheduleUpdate(update.view);
        }
    }

    private scheduleUpdate(view: EditorView): void {
        if (this.updateScheduled) return;
        this.updateScheduled = true;

        // Wait a bit after typing stops before updating decorations
        this.updateTimer = setTimeout(() => {
            this.updateDecorations(view);
            this.updateTimer = null;
            this.updateScheduled = false;
        }, 800); // Wait 800ms after typing stops (increased for better performance)
    }

    private cancelScheduledUpdate(): void {
        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
            this.updateTimer = null;
        }
        this.updateScheduled = false;
    }

    private updateDecorations(view: EditorView): void {
        // Only scan viewport
        const { from, to } = view.viewport;
        const text = view.state.doc.sliceString(from, to);
        const decorations: Range<Decoration>[] = [];

        // Only add essential decorations (footnotes and indices)
        this.addFootnoteDecorations(text, from, decorations);
        this.addIndexDecorations(text, from, decorations);

        this.decorations = Decoration.set(decorations);
        this.lastDecoratedContent = view.state.doc.toString();
    }

    private addFootnoteDecorations(text: string, offset: number, decorations: Decoration[]): void {
        const regex = /\[\^[^\]]+\]/g;
        let match;

        while ((match = regex.exec(text)) !== null) {
            decorations.push(
                footnoteDeco.range(offset + match.index, offset + match.index + match[0].length)
            );
        }
    }

    private addIndexDecorations(text: string, offset: number, decorations: Decoration[]): void {
        const regex = /\{[^\|\}]+\|idx\|[^\|\}]+\}/g;
        let match;

        while ((match = regex.exec(text)) !== null) {
            decorations.push(
                indexDeco.range(offset + match.index, offset + match.index + match[0].length)
            );
        }
    }

    destroy(): void {
        this.cancelScheduledUpdate();
        this.typingDetector.forceStop();
    }
}

/**
 * Zero-latency syntax highlighting extension
 */
export const zeroLatencySyntaxHighlighting = (): Extension => {
    const plugin = ViewPlugin.fromClass(ZeroLatencyDecorator, {
        decorations: (v) => v.decorations
    });

    return [plugin];
};
