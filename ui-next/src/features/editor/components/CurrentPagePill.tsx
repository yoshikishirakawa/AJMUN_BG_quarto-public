import React, { useState, useEffect } from 'react';
import { usePageMapping } from '../hooks/usePageMapping';

interface CurrentPagePillProps {
  scrollY: number;
  viewportHeight: number;
  containerElement?: HTMLElement | null;
  onGotoClick?: () => void;
}

/**
 * Floating pill showing current PDF page number
 * Displays in top-right corner of the preview
 */
export const CurrentPagePill: React.FC<CurrentPagePillProps> = ({
  scrollY,
  viewportHeight,
  containerElement,
  onGotoClick
}) => {
  const { getCurrentPage, mapping, loading } = usePageMapping(null);
  const [currentPage, setCurrentPage] = useState<number | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  // Update current page on scroll
  useEffect(() => {
    if (loading || !mapping) return;

    const page = getCurrentPage(scrollY, viewportHeight, containerElement);
    if (page !== null && page !== currentPage) {
      setCurrentPage(page);
      // Show pill after first successful page detection
      setIsVisible(true);
    }
  }, [scrollY, viewportHeight, containerElement, getCurrentPage, currentPage, loading, mapping]);

  // Don't render if no mapping available or page not detected
  if (loading || !mapping || currentPage === null || !isVisible) {
    return null;
  }

  const totalPages = mapping.totalPages;

  return (
    <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
      <div className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-1.5 rounded-full shadow-lg border border-gray-200 dark:border-gray-700">
        <span className="text-sm font-medium">
          p.{currentPage} / {totalPages}
        </span>
      </div>
      {onGotoClick && (
        <button
          onClick={onGotoClick}
          className="bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 px-2 py-1.5 rounded-full shadow-lg border border-gray-200 dark:border-gray-700 transition-colors"
          title="Go to page..."
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>
      )}
    </div>
  );
};

interface CompactPageIndicatorProps {
  scrollY: number;
  viewportHeight: number;
  containerElement?: HTMLElement | null;
}

/**
 * Compact version - just the page number, minimal styling
 * For use in smaller spaces or when UI needs to be less obtrusive
 */
export const CompactPageIndicator: React.FC<CompactPageIndicatorProps> = ({
  scrollY,
  viewportHeight,
  containerElement
}) => {
  const { getCurrentPage, mapping, loading } = usePageMapping(null);
  const [currentPage, setCurrentPage] = useState<number | null>(null);

  useEffect(() => {
    if (loading || !mapping) return;
    const page = getCurrentPage(scrollY, viewportHeight, containerElement);
    if (page !== null) {
      setCurrentPage(page);
    }
  }, [scrollY, viewportHeight, containerElement, getCurrentPage, loading, mapping]);

  if (loading || !mapping || currentPage === null) {
    return null;
  }

  return (
    <span className="text-xs text-gray-500 dark:text-gray-400">
      {currentPage} / {mapping.totalPages}
    </span>
  );
};
