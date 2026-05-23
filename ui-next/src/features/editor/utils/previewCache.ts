/**
 * Preview Cache Utility
 * Provides caching mechanism for unified pipeline results
 */

export interface CacheEntry {
    contentHash: string;
    html: string;
    frontmatter: Record<string, string> | null;
    timestamp: number;
}

export interface ChangedLines {
    changed: Set<number>;
    hasChanges: boolean;
}

/**
 * Simple hash function for content
 */
export function hashContent(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
        const char = content.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
}

/**
 * Generate cache key from content and plugin settings
 */
export function generateCacheKey(content: string, pluginSettings?: Record<string, any>): string {
    const contentHash = hashContent(content);
    if (!pluginSettings) {
        return contentHash;
    }
    const settingsHash = hashContent(JSON.stringify(pluginSettings));
    return `${contentHash}-${settingsHash}`;
}

/**
 * Detect changes between old and new content
 * Returns set of changed line indices
 */
export function detectChanges(oldContent: string, newContent: string): ChangedLines {
    if (oldContent === newContent) {
        return { changed: new Set<number>(), hasChanges: false };
    }

    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    const changed = new Set<number>();

    const maxLines = Math.max(oldLines.length, newLines.length);

    for (let i = 0; i < maxLines; i++) {
        const oldLine = oldLines[i] || '';
        const newLine = newLines[i] || '';
        if (oldLine !== newLine) {
            changed.add(i);
        }
    }

    return { changed, hasChanges: changed.size > 0 };
}

/**
 * Preview Cache class
 */
export class PreviewCache {
    private cache: Map<string, CacheEntry>;
    private maxEntries: number;
    private maxAge: number; // milliseconds

    constructor(maxEntries: number = 100, maxAge: number = 5 * 60 * 1000) {
        this.cache = new Map();
        this.maxEntries = maxEntries;
        this.maxAge = maxAge;
    }

    /**
     * Get cached entry
     */
    get(key: string): CacheEntry | null {
        const entry = this.cache.get(key);
        if (!entry) {
            console.log('[PreviewCache] Cache miss (key not found):', key);
            return null;
        }

        // Check if entry is expired
        const now = Date.now();
        if (now - entry.timestamp > this.maxAge) {
            console.log('[PreviewCache] Cache miss (entry expired):', key);
            this.cache.delete(key);
            return null;
        }

        console.log('[PreviewCache] Cache hit:', key);
        return entry;
    }

    /**
     * Set cached entry
     */
    set(key: string, html: string, frontmatter: Record<string, string> | null): void {
        const entry: CacheEntry = {
            contentHash: key,
            html,
            frontmatter,
            timestamp: Date.now()
        };

        // Evict oldest entry if cache is full
        if (this.cache.size >= this.maxEntries) {
            const oldestKey = this.findOldestEntry();
            if (oldestKey) {
                console.log('[PreviewCache] Evicting oldest entry:', oldestKey);
                this.cache.delete(oldestKey);
            }
        }

        this.cache.set(key, entry);
        console.log('[PreviewCache] Cache saved:', key, '(size:', this.cache.size, ')');
    }

    /**
     * Invalidate cache for a specific key
     */
    invalidate(key: string): void {
        console.log('[PreviewCache] Cache invalidated:', key);
        this.cache.delete(key);
    }

    /**
     * Clear all cache
     */
    clear(): void {
        console.log('[PreviewCache] Cache cleared (size:', this.cache.size, ')');
        this.cache.clear();
    }

    /**
     * Get cache statistics
     */
    getStats(): { size: number; hitRate: number } {
        return {
            size: this.cache.size,
            hitRate: 0 // Would need to track hits/misses
        };
    }

    /**
     * Find oldest entry for eviction
     */
    private findOldestEntry(): string | null {
        let oldestKey: string | null = null;
        let oldestTimestamp = Infinity;

        for (const [key, entry] of this.cache.entries()) {
            if (entry.timestamp < oldestTimestamp) {
                oldestTimestamp = entry.timestamp;
                oldestKey = key;
            }
        }

        return oldestKey;
    }
}

// Global cache instance
export const previewCache = new PreviewCache();
