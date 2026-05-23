/**
 * PDF Page Indicator
 * Shows page change markers in HTML and scroll popup during fast scrolling
 */

(function () {
    'use strict';

    // Configuration
    const CONFIG = {
        fadeOutDelay: 2000,      // ms to wait before fading out popup
        scrollThreshold: 100,    // pixels/100ms to trigger popup
        dataUrl: '/assets/pdf-page-map.json',
        pageOffset: 0            // Offset to adjust page numbers (e.g., for cover pages)
    };

    let pageMapping = null;
    let scrollPopup = null;
    let fadeOutTimer = null;
    let lastScrollY = 0;
    let lastScrollTime = Date.now();

    /**
     * Load page mapping data from inline JS or fetch JSON
     */
    async function loadPageMapping() {
        // First, check for inline data loaded via <script> tag
        if (window.pdfPageMapping) {
            pageMapping = window.pdfPageMapping;
            console.log(`[PDF Page] Loaded inline mapping: ${Object.keys(pageMapping.paragraphs || {}).length} paragraphs`);
            return true;
        }

        // Fallback to fetch for server-hosted pages
        try {
            const paths = [
                CONFIG.dataUrl,
                '../assets/pdf-page-map.json',
                '../../assets/pdf-page-map.json',
                './assets/pdf-page-map.json'
            ];

            for (const path of paths) {
                try {
                    const response = await fetch(path);
                    if (response.ok) {
                        pageMapping = await response.json();
                        console.log(`[PDF Page] Loaded mapping via fetch: ${Object.keys(pageMapping.paragraphs || {}).length} paragraphs`);
                        return true;
                    }
                } catch (e) {
                    // Try next path
                }
            }
            console.warn('[PDF Page] Could not load page mapping');
            return false;
        } catch (error) {
            console.error('[PDF Page] Error loading mapping:', error);
            return false;
        }
    }

    /**
     * Insert page change markers into the document
     */
    function insertPageMarkers() {
        if (!pageMapping || !pageMapping.paragraphs) return;

        const paragraphs = pageMapping.paragraphs;
        const sections = pageMapping.sections || {};
        let lastPage = 0;
        const processedBlocks = new Set(); // Track blocks that already have separators

        // Find all markers (both paragraph and section markers) in document order
        const allMarkers = document.querySelectorAll('[id^="p-"], [id^="sec-"]');

        // Sort by position in document (use their order in DOM)
        const sortedMarkers = Array.from(allMarkers);

        sortedMarkers.forEach((marker, index) => {
            const markerId = marker.id;
            // Get page from either paragraphs or sections mapping
            const page = markerId.startsWith('sec-')
                ? sections[markerId]
                : paragraphs[markerId];

            if (page && page !== lastPage && lastPage > 0) {
                // Page changed - find the appropriate block-level element
                // Walk up the DOM to find a suitable block element
                let blockParent = marker;
                while (blockParent && blockParent !== document.body) {
                    const tagName = blockParent.tagName?.toLowerCase();
                    // Check if it's a block-level element suitable for separator insertion
                    if (tagName === 'p' || tagName === 'div' || tagName === 'section' ||
                        tagName === 'li' || tagName === 'blockquote' || tagName === 'article' ||
                        /^h[1-6]$/.test(tagName)) {
                        break;
                    }
                    blockParent = blockParent.parentElement;
                }

                // Use the found block element, or fall back to marker's parent
                const targetBlock = blockParent || marker.parentElement;

                // Create a unique key for this block to avoid duplicates
                const blockKey = `${targetBlock.tagName}-${targetBlock.textContent?.substring(0, 50)}`;

                if (targetBlock && targetBlock.parentNode && !processedBlocks.has(blockKey)) {
                    processedBlocks.add(blockKey);

                    // Apply pageOffset to displayed page numbers
                    const displayLastPage = lastPage + CONFIG.pageOffset;
                    const displayPage = page + CONFIG.pageOffset;

                    const container = document.createElement('div');
                    container.className = 'pdf-page-separator-container';

                    const separator = document.createElement('div');
                    separator.className = 'pdf-page-separator';

                    const upper = document.createElement('div');
                    upper.className = 'pdf-page-upper';
                    upper.textContent = `p.${displayLastPage}`;

                    const line = document.createElement('div');
                    line.className = 'pdf-page-line';

                    const lower = document.createElement('div');
                    lower.className = 'pdf-page-lower';
                    lower.textContent = `p.${displayPage}`;

                    separator.appendChild(upper);
                    separator.appendChild(line);
                    separator.appendChild(lower);
                    container.appendChild(separator);

                    // Insert before the block element
                    targetBlock.parentNode.insertBefore(container, targetBlock);
                }
            }

            if (page) {
                lastPage = page;
                // Store page info on the marker for scroll detection
                marker.dataset.pdfPage = page;
            }
        });

        console.log(`[PDF Page] Inserted page markers`);
    }

    /**
     * Create scroll popup element
     */
    function createScrollPopup() {
        scrollPopup = document.createElement('div');
        scrollPopup.id = 'pdf-scroll-popup';
        scrollPopup.textContent = 'p.1';
        document.body.appendChild(scrollPopup);
    }

    /**
     * Get current PDF page based on scroll position
     */
    function getCurrentPage() {
        if (!pageMapping || !pageMapping.paragraphs) return null;

        const viewportTop = window.scrollY + 100; // 100px from top
        const markers = document.querySelectorAll('[id^="p-"][data-pdf-page]');

        let currentPage = 1;
        for (const marker of markers) {
            const rect = marker.getBoundingClientRect();
            const elementTop = window.scrollY + rect.top;

            if (elementTop <= viewportTop) {
                currentPage = parseInt(marker.dataset.pdfPage) || currentPage;
            } else {
                break;
            }
        }

        return currentPage;
    }

    /**
     * Show scroll popup
     */
    function showPopup(page) {
        if (!scrollPopup) return;

        const displayPage = page + CONFIG.pageOffset;
        scrollPopup.textContent = `p.${displayPage}`;
        scrollPopup.classList.remove('fade-out');
        scrollPopup.classList.add('visible');

        // Clear existing timer
        if (fadeOutTimer) {
            clearTimeout(fadeOutTimer);
        }

        // Set fade out timer
        fadeOutTimer = setTimeout(() => {
            scrollPopup.classList.add('fade-out');
            setTimeout(() => {
                scrollPopup.classList.remove('visible', 'fade-out');
            }, 500);
        }, CONFIG.fadeOutDelay);
    }

    /**
     * Handle scroll events
     */
    function handleScroll() {
        const now = Date.now();
        const deltaTime = now - lastScrollTime;
        const deltaY = Math.abs(window.scrollY - lastScrollY);

        // Calculate scroll speed (pixels per 100ms)
        const scrollSpeed = deltaTime > 0 ? (deltaY / deltaTime) * 100 : 0;

        lastScrollY = window.scrollY;
        lastScrollTime = now;

        // Show popup during fast scrolling
        if (scrollSpeed > CONFIG.scrollThreshold) {
            const currentPage = getCurrentPage();
            if (currentPage) {
                showPopup(currentPage);
            }
        }
    }

    /**
     * Initialize the PDF page indicator
     */
    async function init() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
            return;
        }

        // Load page mapping
        const loaded = await loadPageMapping();
        if (!loaded) {
            console.log('[PDF Page] Feature disabled - no mapping data');
            return;
        }

        // Insert page markers
        insertPageMarkers();

        // Create scroll popup
        createScrollPopup();

        // Add scroll listener with throttling
        let scrollTimeout;
        window.addEventListener('scroll', () => {
            if (scrollTimeout) return;
            scrollTimeout = setTimeout(() => {
                handleScroll();
                scrollTimeout = null;
            }, 50);
        }, { passive: true });

        console.log('[PDF Page] Initialized');
    }

    // Start initialization
    init();
})();
