import React, { useEffect, useRef, useState } from 'react';
import { usePageMapping } from '../hooks/usePageMapping';
import type { PageBoundary } from '../hooks/usePageMapping';

interface PageBoundaryIndicatorProps {
  containerElement?: HTMLElement | null;
  enabled?: boolean;
  onBoundaryClick?: (pageNumber: number) => void;
}

/**
 * Visual page boundary indicator
 * When enabled, shows page boundary markers in the gutter
 * Does not draw lines in the content (preserves reading experience)
 */
export const PageBoundaryIndicator: React.FC<PageBoundaryIndicatorProps> = ({
  containerElement,
  enabled = true,
  onBoundaryClick
}) => {
  const { mapping, loading } = usePageMapping(null);
  const [boundaries, setBoundaries] = useState<PageBoundary[]>([]);
  const markersRef = useRef<HTMLDivElement>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // Update boundaries when mapping changes
  useEffect(() => {
    if (mapping && mapping.boundaries) {
      setBoundaries(mapping.boundaries);
    }
  }, [mapping]);

  // Set up ResizeObserver to update marker positions
  useEffect(() => {
    if (!enabled || !containerElement || loading || !boundaries.length) {
      return;
    }

    // Find paragraph positions and update marker locations
    const updateMarkerPositions = () => {
      if (!containerElement || !markersRef.current) return;

      const containerRect = containerElement.getBoundingClientRect();
      const markersContainer = markersRef.current;
      markersContainer.innerHTML = '';

      boundaries.forEach((boundary) => {
        // Find the "after" paragraph element
        const afterPara = containerElement.querySelector(`#${boundary.afterParagraph}`);
        if (!afterPara) return;

        const paraRect = afterPara.getBoundingClientRect();
        const relativeTop = paraRect.top - containerRect.top + containerElement.scrollTop;

        // Create marker
        const marker = document.createElement('div');
        marker.className = 'boundary-marker';
        marker.style.cssText = `
          position: absolute;
          top: ${relativeTop}px;
          left: 0;
          right: 0;
          height: 1px;
          cursor: pointer;
          z-index: 10;
        `;

        // Inner line (visible on hover)
        const line = document.createElement('div');
        line.className = 'boundary-line';
        line.style.cssText = `
          position: absolute;
          left: 0;
          width: 60px;
          height: 2px;
          background: rgba(59, 130, 246, 0.3);
          transition: background 0.2s, width 0.2s;
        `;

        // Page number label (visible on hover)
        const label = document.createElement('div');
        label.className = 'boundary-label';
        label.textContent = `p.${boundary.pageNumber}`;
        label.style.cssText = `
          position: absolute;
          left: 65px;
          top: -10px;
          font-size: 10px;
          color: #3b82f6;
          opacity: 0;
          transition: opacity 0.2s;
          pointer-events: none;
          white-space: nowrap;
        `;

        // Hover effects
        marker.addEventListener('mouseenter', () => {
          line.style.background = 'rgba(59, 130, 246, 0.8)';
          line.style.width = '100px';
          label.style.opacity = '1';
        });

        marker.addEventListener('mouseleave', () => {
          line.style.background = 'rgba(59, 130, 246, 0.3)';
          line.style.width = '60px';
          label.style.opacity = '0';
        });

        marker.addEventListener('click', () => {
          onBoundaryClick?.(boundary.pageNumber);
        });

        marker.appendChild(line);
        marker.appendChild(label);
        markersContainer.appendChild(marker);
      });
    };

    // Initial update
    // Need to wait for content to be rendered
    const timeoutId = setTimeout(updateMarkerPositions, 100);

    // Set up ResizeObserver
    resizeObserverRef.current = new ResizeObserver(() => {
      updateMarkerPositions();
    });
    resizeObserverRef.current.observe(containerElement);

    return () => {
      clearTimeout(timeoutId);
      resizeObserverRef.current?.disconnect();
    };
  }, [enabled, containerElement, loading, boundaries, onBoundaryClick]);

  if (!enabled || loading || !boundaries.length) {
    return null;
  }

  return (
    <div
      ref={markersRef}
      className="boundary-markers-container"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: 'none',
        overflow: 'hidden'
      }}
    >
      {/* Markers will be injected here */}
    </div>
  );
};

interface BoundaryToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  hasMapping?: boolean;
}

/**
 * Toggle button for boundary visualization mode
 */
export const BoundaryToggle: React.FC<BoundaryToggleProps> = ({
  enabled,
  onToggle,
  hasMapping = true
}) => {
  return (
    <button
      onClick={() => onToggle(!enabled)}
      disabled={!hasMapping}
      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
        enabled
          ? 'bg-blue-500 text-white'
          : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
      } ${!hasMapping ? 'opacity-50 cursor-not-allowed' : ''}`}
      title={enabled ? 'Hide page boundaries' : 'Show page boundaries'}
    >
      {enabled ? '📄 Boundaries ON' : '📄 Boundaries'}
    </button>
  );
};

interface BoundaryLegendProps {
  totalPages?: number;
  boundaryCount?: number;
}

/**
 * Legend explaining the boundary visualization
 */
export const BoundaryLegend: React.FC<BoundaryLegendProps> = ({
  totalPages = 0,
  boundaryCount = 0
}) => {
  return (
    <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
      <p>Page boundaries marked with blue lines</p>
      <p>Hover to see page numbers, click to jump</p>
      {totalPages > 0 && (
        <p>Total: {totalPages} pages, {boundaryCount} boundaries</p>
      )}
    </div>
  );
};
