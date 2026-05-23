/**
 * Performance monitoring utilities for Phase 1 optimization
 */

export interface PerformanceMetrics {
    renderTime: number; // milliseconds
    cacheHitRate: number; // percentage (0-100)
    cacheHits: number;
    cacheMisses: number;
    totalRenders: number;
    // Editor-specific metrics
    editorInputLatency: number; // milliseconds (typing to display)
    decorationUpdateTime: number; // milliseconds
    viewportUpdateTime: number; // milliseconds
}

export class PerformanceMonitor {
    private metrics: PerformanceMetrics = {
        renderTime: 0,
        cacheHitRate: 0,
        cacheHits: 0,
        cacheMisses: 0,
        totalRenders: 0,
        editorInputLatency: 0,
        decorationUpdateTime: 0,
        viewportUpdateTime: 0
    };

    private renderTimes: number[] = [];
    private inputLatencies: number[] = [];
    private decorationUpdateTimes: number[] = [];

    /**
     * Start a render timing measurement
     */
    startRender(): () => void {
        const startTime = performance.now();
        return () => {
            const endTime = performance.now();
            const duration = endTime - startTime;
            this.recordRender(duration);
        };
    }

    /**
     * Record a render completion
     */
    private recordRender(duration: number): void {
        this.metrics.totalRenders++;
        this.renderTimes.push(duration);

        // Keep only last 100 render times
        if (this.renderTimes.length > 100) {
            this.renderTimes.shift();
        }

        // Calculate average render time
        const avgRenderTime = this.renderTimes.reduce((a, b) => a + b, 0) / this.renderTimes.length;
        this.metrics.renderTime = avgRenderTime;
    }

    /**
     * Start an input latency measurement
     */
    startInputLatency(): () => void {
        const startTime = performance.now();
        return () => {
            const endTime = performance.now();
            const duration = endTime - startTime;
            this.recordInputLatency(duration);
        };
    }

    /**
     * Record input latency
     */
    private recordInputLatency(duration: number): void {
        this.inputLatencies.push(duration);

        // Keep only last 50 measurements
        if (this.inputLatencies.length > 50) {
            this.inputLatencies.shift();
        }

        // Calculate average
        const avg = this.inputLatencies.reduce((a, b) => a + b, 0) / this.inputLatencies.length;
        this.metrics.editorInputLatency = avg;
    }

    /**
     * Start a decoration update timing measurement
     */
    startDecorationUpdate(): () => void {
        const startTime = performance.now();
        return () => {
            const endTime = performance.now();
            const duration = endTime - startTime;
            this.recordDecorationUpdate(duration);
        };
    }

    /**
     * Record decoration update time
     */
    private recordDecorationUpdate(duration: number): void {
        this.decorationUpdateTimes.push(duration);

        // Keep only last 50 measurements
        if (this.decorationUpdateTimes.length > 50) {
            this.decorationUpdateTimes.shift();
        }

        // Calculate average
        const avg = this.decorationUpdateTimes.reduce((a, b) => a + b, 0) / this.decorationUpdateTimes.length;
        this.metrics.decorationUpdateTime = avg;
    }

    /**
     * Record viewport update time
     */
    recordViewportUpdate(duration: number): void {
        this.metrics.viewportUpdateTime = duration;
    }

    /**
     * Record a cache hit
     */
    recordCacheHit(): void {
        this.metrics.cacheHits++;
        this.updateCacheHitRate();
    }

    /**
     * Record a cache miss
     */
    recordCacheMiss(): void {
        this.metrics.cacheMisses++;
        this.updateCacheHitRate();
    }

    /**
     * Update cache hit rate
     */
    private updateCacheHitRate(): void {
        const total = this.metrics.cacheHits + this.metrics.cacheMisses;
        if (total === 0) {
            this.metrics.cacheHitRate = 0;
        } else {
            this.metrics.cacheHitRate = (this.metrics.cacheHits / total) * 100;
        }
    }

    /**
     * Get current metrics
     */
    getMetrics(): PerformanceMetrics {
        return { ...this.metrics };
    }

    /**
     * Reset metrics
     */
    reset(): void {
        this.metrics = {
            renderTime: 0,
            cacheHitRate: 0,
            cacheHits: 0,
            cacheMisses: 0,
            totalRenders: 0,
            editorInputLatency: 0,
            decorationUpdateTime: 0,
            viewportUpdateTime: 0
        };
        this.renderTimes = [];
        this.inputLatencies = [];
        this.decorationUpdateTimes = [];
    }

    /**
     * Check if performance targets are met
     */
    checkTargets(): { met: boolean; details: string } {
        const { renderTime, cacheHitRate, editorInputLatency } = this.metrics;
        const details: string[] = [];

        // Target: 30% improvement in render time
        // Baseline: assume ~500ms before optimization
        const targetRenderTime = 350; // 30% improvement from 500ms
        const renderTimeMet = renderTime <= targetRenderTime;
        details.push(
            `Render time: ${renderTime.toFixed(2)}ms (target: ${targetRenderTime}ms) - ${renderTimeMet ? '✓' : '✗'}`
        );

        // Target: 70% cache hit rate
        const cacheHitRateMet = cacheHitRate >= 70;
        details.push(
            `Cache hit rate: ${cacheHitRate.toFixed(1)}% (target: 70%) - ${cacheHitRateMet ? '✓' : '✗'}`
        );

        // Target: <100ms input latency
        const inputLatencyMet = editorInputLatency < 100;
        details.push(
            `Editor input latency: ${editorInputLatency.toFixed(2)}ms (target: <100ms) - ${inputLatencyMet ? '✓' : '✗'}`
        );

        const met = renderTimeMet && cacheHitRateMet && inputLatencyMet;
        return {
            met,
            details: details.join('\n')
        };
    }
}

// Global performance monitor instance
export const performanceMonitor = new PerformanceMonitor();
