import { useEffect, useState, useCallback, useRef } from 'react';

/**
 * Enhanced PDF page mapping data structure
 * Contains paragraph-to-page mapping and fine-grained boundary data
 */
export interface BoundaryChunk {
  paragraphId: string;
  id: string;
  charOffset: number;
  page: number;
  yPositionSp: number;
  yPosition: number; // Normalized 0-1 (0=bottom, 1=top)
}

export interface PageBoundary {
  pageNumber: number;
  beforeParagraph: string;
  afterParagraph: string;
  chunks: BoundaryChunk[];
  breakYPosition: number;
}

export interface FloatInfo {
  id: string;
  type: 'figure' | 'table';
  actualPage: number;
  yPositionSp: number;
}

export interface EnhancedPageMapping {
  version: string;
  totalPages: number;
  paragraphs: Record<string, number>;
  sections: Record<string, number>;
  boundaries: PageBoundary[];
  floats: FloatInfo[];
  htmlAnchors: Record<string, { paragraphId: string; offset: number; page: number }>;
}

interface UsePageMappingResult {
  mapping: EnhancedPageMapping | null;
  loading: boolean;
  error: string | null;
  getCurrentPage: (scrollY: number, viewportHeight: number, element?: HTMLElement | null) => number | null;
  getPageY: (page: number, element?: HTMLElement | null) => number | null;
  scrollToPage: (page: number, position?: 'top' | 'bottom' | 'middle', element?: HTMLElement | null) => boolean;
  refresh: () => void;
}

/**
 * Hook to load and use enhanced PDF page mapping data
 * Provides functions to convert between scroll position and PDF page numbers
 */
export function usePageMapping(_chapterId: string | null = null): UsePageMappingResult {
  const [mapping, setMapping] = useState<EnhancedPageMapping | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadAttemptedRef = useRef(false);

  const loadMapping = useCallback(async () => {
    if (loadAttemptedRef.current) return;
    loadAttemptedRef.current = true;

    setLoading(true);
    setError(null);

    try {
      // Try enhanced mapping first, fall back to basic mapping
      const enhancedPath = '/assets/pdf-page-map-enhanced.json';
      const basicPath = '/assets/pdf-page-map.json';

      let data: EnhancedPageMapping | null = null;

      try {
        const response = await fetch(enhancedPath);
        if (response.ok) {
          data = await response.json();
        }
      } catch {
        // Enhanced not available, try basic
      }

      if (!data) {
        const response = await fetch(basicPath);
        if (response.ok) {
          const basicData = await response.json();
          // Convert basic to enhanced format
          data = {
            version: '1.0',
            totalPages: basicData.totalPages || 0,
            paragraphs: basicData.paragraphs || {},
            sections: basicData.sections || {},
            boundaries: [],
            floats: [],
            htmlAnchors: {}
          };
        }
      }

      if (data) {
        setMapping(data);
      } else {
        setError('Page mapping data not available');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load page mapping');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMapping();
  }, [loadMapping]);

  /**
   * Get current PDF page number from scroll position
   */
  const getCurrentPage = useCallback((
    scrollY: number,
    _viewportHeight: number,
    _element: HTMLElement | null = null
  ): number | null => {
    if (!mapping) return null;

    // If we have fine-grained boundary data, use it
    if (mapping.boundaries && mapping.boundaries.length > 0) {
      // Fine-grained boundary data is not yet used in the simplified page estimator.
    }

    // Fallback: Use basic paragraph mapping
    // This is a simplified version - real implementation would scan for paragraph markers
    const pages = Object.values(mapping.paragraphs);
    if (pages.length === 0) return null;

    // Estimate page based on scroll percentage (rough approximation)
    const maxPage = mapping.totalPages || Math.max(...pages);
    return Math.min(maxPage, Math.max(1, Math.floor((scrollY / 20000) * maxPage) + 1));
  }, [mapping]);

  /**
   * Get scroll Y position for a given page number
   */
  const getPageY = useCallback((
    page: number,
    element: HTMLElement | null = null
  ): number | null => {
    if (!mapping) return null;

    // Find the first paragraph on this page
    for (const [paraId, paraPage] of Object.entries(mapping.paragraphs)) {
      if (paraPage === page) {
        // Find the element with this paragraph ID
        const paraElement = (element || document).querySelector(`#${paraId}`);
        if (paraElement) {
          return paraElement.getBoundingClientRect().top + window.scrollY;
        }
      }
    }

    // Fallback: estimate based on page number
    return (page - 1) * 1000; // Rough estimate
  }, [mapping]);

  /**
   * Scroll to a specific page
   */
  const scrollToPage = useCallback((
    page: number,
    position: 'top' | 'bottom' | 'middle' = 'top',
    element: HTMLElement | null = null
  ): boolean => {
    const y = getPageY(page, element);
    if (y === null) return false;

    const scrollElement = element || document.documentElement;
    let targetY = y;

    if (position === 'bottom') {
      targetY = y + 800; // Approximate page height
    } else if (position === 'middle') {
      targetY = y + 400;
    }

    scrollElement.scrollTo({
      top: targetY,
      behavior: 'smooth'
    });

    return true;
  }, [getPageY]);

  return {
    mapping,
    loading,
    error,
    getCurrentPage,
    getPageY,
    scrollToPage,
    refresh: loadMapping
  };
}

/**
 * Parse page input like "57", "xii", "57 bottom", "A-3"
 */
export function parsePageInput(input: string, totalPages: number): number | null {
  const trimmed = input.trim().toLowerCase();

  // Handle "bottom" modifier
  const wantBottom = trimmed.endsWith(' bottom');
  const baseInput = wantBottom ? trimmed.replace(' bottom', '').trim() : trimmed;

  // Parse numeric page
  const numericMatch = baseInput.match(/^(\d+)$/);
  if (numericMatch) {
    const page = parseInt(numericMatch[1], 10);
    return page >= 1 && page <= totalPages ? page : null;
  }

  // TODO: Handle roman numerals (i, ii, iii, xii, etc.)
  // TODO: Handle prefixed pages (A-1, B-2, etc.)

  return null;
}
