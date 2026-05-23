/**
 * Performance Monitor Component
 * Displays real-time performance metrics for Phase 1 optimization
 */

import React, { useState, useEffect } from 'react';
import { performanceMonitor } from '../utils/performanceMonitor';

export const PerformanceMonitor: React.FC = () => {
    const [metrics, setMetrics] = useState(performanceMonitor.getMetrics());
    const [targets, setTargets] = useState(performanceMonitor.checkTargets());
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const interval = setInterval(() => {
            setMetrics(performanceMonitor.getMetrics());
            setTargets(performanceMonitor.checkTargets());
        }, 1000); // Update every second

        return () => clearInterval(interval);
    }, []);

    const handleReset = () => {
        performanceMonitor.reset();
        setMetrics(performanceMonitor.getMetrics());
        setTargets(performanceMonitor.checkTargets());
    };

    if (!isVisible) {
        return (
            <button
                onClick={() => setIsVisible(true)}
                className="fixed bottom-4 right-4 bg-primary text-white px-3 py-2 rounded-lg shadow-lg z-50"
            >
                📊 パフォーマンス
            </button>
        );
    }

    return (
        <div className="fixed bottom-4 right-4 bg-background border border-border rounded-lg shadow-xl p-4 w-80 z-50">
            <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-lg">パフォーマンス統計</h3>
                <button
                    onClick={() => setIsVisible(false)}
                    className="text-muted-foreground hover:text-foreground"
                >
                    ✕
                </button>
            </div>

            <div className="space-y-3">
                {/* Editor Input Latency (Primary Metric) */}
                <div className="bg-primary/5 p-3 rounded-lg">
                    <div className="text-sm text-muted-foreground">エディタ入力遅延</div>
                    <div className={`text-2xl font-bold ${metrics.editorInputLatency < 100 ? 'text-green-600' : 'text-red-600'}`}>
                        {metrics.editorInputLatency.toFixed(2)}ms
                    </div>
                    <div className="text-xs text-muted-foreground">
                        目標: 100ms未満
                    </div>
                </div>

                {/* Render Time */}
                <div>
                    <div className="text-sm text-muted-foreground">平均レンダリング時間</div>
                    <div className="text-2xl font-bold">
                        {metrics.renderTime.toFixed(2)}ms
                    </div>
                    <div className="text-xs text-muted-foreground">
                        目標: 350ms以下 (30%改善)
                    </div>
                </div>

                {/* Cache Hit Rate */}
                <div>
                    <div className="text-sm text-muted-foreground">キャッシュヒット率</div>
                    <div className="text-2xl font-bold">
                        {metrics.cacheHitRate.toFixed(1)}%
                    </div>
                    <div className="text-xs text-muted-foreground">
                        目標: 70%以上
                    </div>
                </div>

                {/* Detailed Metrics */}
                <div className="grid grid-cols-2 gap-2 text-sm border-t pt-2">
                    <div>
                        <div className="text-muted-foreground">デコレーション更新</div>
                        <div className="font-bold">{metrics.decorationUpdateTime.toFixed(2)}ms</div>
                    </div>
                    <div>
                        <div className="text-muted-foreground">ビューポート更新</div>
                        <div className="font-bold">{metrics.viewportUpdateTime.toFixed(2)}ms</div>
                    </div>
                    <div>
                        <div className="text-muted-foreground">キャッシュヒット</div>
                        <div className="font-bold">{metrics.cacheHits}</div>
                    </div>
                    <div>
                        <div className="text-muted-foreground">キャッシュミス</div>
                        <div className="font-bold">{metrics.cacheMisses}</div>
                    </div>
                    <div>
                        <div className="text-muted-foreground">総レンダリング回数</div>
                        <div className="font-bold">{metrics.totalRenders}</div>
                    </div>
                </div>

                <div className="border-t pt-3">
                    <div className={`font-bold ${targets.met ? 'text-green-600' : 'text-red-600'}`}>
                        {targets.met ? '✓ 目標達成' : '✗ 目標未達成'}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 whitespace-pre-line">
                        {targets.details}
                    </div>
                </div>

                <button
                    onClick={handleReset}
                    className="w-full mt-3 bg-secondary text-secondary-foreground py-2 rounded hover:bg-secondary/80"
                >
                    統計をリセット
                </button>
            </div>
        </div>
    );
};
