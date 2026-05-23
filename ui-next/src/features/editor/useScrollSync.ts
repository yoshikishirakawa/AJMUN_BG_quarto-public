import React, { useEffect, useCallback } from 'react';

/**
 * Hook to synchronize scrolling between two elements based on percentage.
 * @param sourceRef Ref to the source element (e.g., Editor)
 * @param targetRef Ref to the target element (e.g., Preview)
 * @param enabled Whether sync is enabled
 */
export const useScrollSync = (
    sourceRef: React.RefObject<HTMLElement | null>,
    targetRef: React.RefObject<HTMLElement | null>,
    enabled: boolean = true
) => {
    // Flag to prevent recursive scroll events
    const isScrolling = React.useRef<'source' | 'target' | null>(null);

    const handleSourceScroll = useCallback(() => {
        const source = sourceRef.current;
        const target = targetRef.current;
        if (!source || !target || !enabled) return;

        if (isScrolling.current === 'target') {
            isScrolling.current = null;
            return;
        }

        isScrolling.current = 'source';

        // Calculate percentage
        const percentage = source.scrollTop / (source.scrollHeight - source.clientHeight);

        // Apply to target
        const targetScrollTop = percentage * (target.scrollHeight - target.clientHeight);
        target.scrollTop = targetScrollTop;

        // Reset flag after a short delay (or next frame, but simple flag usually works for 1-way drive)
        // For 2-way sync, we need to be careful.
        // The scroll event on target will fire, so we need to ignore it.
    }, [sourceRef, targetRef, enabled]);

    const handleTargetScroll = useCallback(() => {
        const source = sourceRef.current;
        const target = targetRef.current;
        if (!source || !target || !enabled) return;

        if (isScrolling.current === 'source') {
            isScrolling.current = null;
            return;
        }

        isScrolling.current = 'target';

        // Calculate percentage
        const percentage = target.scrollTop / (target.scrollHeight - target.clientHeight);

        // Apply to source
        const sourceScrollTop = percentage * (source.scrollHeight - source.clientHeight);
        source.scrollTop = sourceScrollTop;
    }, [sourceRef, targetRef, enabled]);

    useEffect(() => {
        const source = sourceRef.current;
        const target = targetRef.current;
        if (!source || !target) return;

        source.addEventListener('scroll', handleSourceScroll);
        target.addEventListener('scroll', handleTargetScroll);

        return () => {
            source.removeEventListener('scroll', handleSourceScroll);
            target.removeEventListener('scroll', handleTargetScroll);
        };
    }, [handleSourceScroll, handleTargetScroll, sourceRef, targetRef]);
};
