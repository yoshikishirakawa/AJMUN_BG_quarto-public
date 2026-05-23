import { useEffect, useState } from 'react';

/**
 * Dynamic debounce hook that adjusts delay based on content length
 * - Small documents (< 10k chars): 200ms
 * - Medium documents (< 50k chars): 400ms
 * - Large documents (>= 50k chars): 600ms
 *
 * @param value - Value to debounce
 * @param context - Optional context for different debounce strategies
 */
export function useDynamicDebounce<T>(
    value: T,
    context: 'editor' | 'preview' = 'preview'
): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value);

    useEffect(() => {
        // Calculate debounce time based on content length and context
        const contentLength = typeof value === 'string' ? value.length : 0;
        const delay = getDebounceTime(contentLength, context);

        const timer = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);

        return () => {
            clearTimeout(timer);
        };
    }, [value, context]);

    return debouncedValue;
}

/**
 * Get debounce time based on content length and context
 * @param contentLength - Length of the content
 * @param context - 'editor' for faster typing response, 'preview' for rendering performance
 */
export function getDebounceTime(
    contentLength: number,
    context: 'editor' | 'preview' = 'preview'
): number {
    if (context === 'editor') {
        // エディタ: 即時応答（デバウンスなし）
        return 0;
    } else {
        // プレビュー: 大規模ドキュメントでは数秒まで許容
        if (contentLength < 10000) return 500;    // 0.5秒
        if (contentLength < 50000) return 1500;   // 1.5秒
        if (contentLength < 100000) return 3000;  // 3秒
        if (contentLength < 200000) return 5000;  // 5秒
        return 8000;                             // 8秒（20万字クラス）
    }
}
