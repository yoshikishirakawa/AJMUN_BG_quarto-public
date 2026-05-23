import React, { useEffect, useRef, useState, useCallback } from 'react';
import tippy from 'tippy.js';
import 'tippy.js/dist/tippy.css';

import { useProjectStore } from '@/store/useProjectStore';
import { useUIStore } from '@/store/useUIStore';
import { previewCache, generateCacheKey, detectChanges } from './utils/previewCache';
import { performanceMonitor } from './utils/performanceMonitor';
import { createFootnoteTooltipConfig, sanitizePreviewHtml } from './utils/previewSanitizer';
import type { WorkerMessage, WorkerResponse } from './workers/types';
import { remarkLinkTypes } from './plugins/remarkLinkTypes';

// Page boundary synchronization components
import { CurrentPagePill } from './components/CurrentPagePill';
import { GotoPageButton } from './components/GotoPageDialog';
import { PageBoundaryIndicator, BoundaryToggle } from './components/PageBoundaryIndicator';
import { usePageMapping } from './hooks/usePageMapping';

interface PreviewProps {
    content: string;
    className?: string;
    scrollerRef?: React.RefObject<HTMLDivElement | null>;
    isTrusted?: boolean; // Deprecated: cache key only, rendering is always sanitized
    useWorker?: boolean; // Use Web Worker for processing (default: true)
    enablePageSync?: boolean; // Enable PDF page synchronization (default: true)
}

export const Preview: React.FC<PreviewProps> = ({
    content,
    className,
    scrollerRef,
    isTrusted = false,
    useWorker = false,
    enablePageSync = true
}) => {
    const { project } = useProjectStore();
    const { editorFontSize } = useUIStore();
    const style = project?.style;
    const ty = style?.typography;
    const para = style?.paragraph;
    const vis = style?.visuals;
    const primaryColor = style?.primaryColor || '#2563eb';

    // Page synchronization state
    const [scrollY, setScrollY] = useState(0);
    const [viewportHeight, setViewportHeight] = useState(600);
    const [boundariesEnabled, setBoundariesEnabled] = useState(false);
    const internalContainerRef = useRef<HTMLDivElement>(null);

    // Use the mapping hook for page data
    const { mapping, scrollToPage } = usePageMapping(null);

    // State for async rendering
    const [html, setHtml] = useState<string>('');
    const [frontmatter, setFrontmatter] = useState<Record<string, string> | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Track previous content for change detection
    const prevContentRef = useRef<string>('');

    // Track previous footnote count for Tippy optimization
    const prevFootnoteCountRef = useRef<number>(0);

    // Worker instance
    const workerRef = useRef<Worker | null>(null);

    // Pending request tracking (for deduplication)
    const pendingRequestRef = useRef<string | null>(null);

    // Initialize Tippy with change detection
    useEffect(() => {
        // Count footnotes in current HTML
        const currentFootnoteCount = (html.match(/class="footnote-ref"/g) || []).length;

        // Only reinitialize if footnote count changed
        if (currentFootnoteCount !== prevFootnoteCountRef.current) {
            prevFootnoteCountRef.current = currentFootnoteCount;

            const timeout = setTimeout(() => {
                tippy('.footnote-ref', createFootnoteTooltipConfig());
            }, 100);
            return () => clearTimeout(timeout);
        }
    }, [html]);

    // Initialize Worker
    useEffect(() => {
        // Worker is only supported in browser environments
        if (typeof Worker === 'undefined' || useWorker === false) {
            console.log('[Preview] Worker disabled:', { useWorker, workerAvailable: typeof Worker !== 'undefined' });
            return;
        }

        const worker = new Worker(
            new URL('./workers/previewWorker.ts', import.meta.url),
            { type: 'module', name: 'PreviewWorker' }
        );

        workerRef.current = worker;
        console.log('[Preview] Worker initialized:', { useWorker });

        worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
            const { type, html, frontmatter, error, cacheKey } = event.data;
            console.log('[Preview] Received response from worker:', { type, cacheKey, htmlLength: html?.length });

            if (type === 'result' || type === 'cached') {
                const safeHtml = html ? sanitizePreviewHtml(html) : '';

                // Cache the result
                if (cacheKey && safeHtml) {
                    previewCache.set(cacheKey, safeHtml, frontmatter || null);
                }

                // Update state
                if (safeHtml) {
                    setHtml(safeHtml);
                }
                if (frontmatter !== undefined) {
                    setFrontmatter(frontmatter);
                }
                setIsLoading(false);
                pendingRequestRef.current = null;
            } else if (type === 'error') {
                console.error("Worker Error:", error);
                setError(error || 'Unknown error');
                setIsLoading(false);
                pendingRequestRef.current = null;
            }
        };

        worker.onerror = (error) => {
            console.error('[Preview] Worker error:', error);
            setError('Worker initialization failed');
            setIsLoading(false);
        };

        return () => {
            console.log('[Preview] Worker terminated');
            worker.terminate();
            workerRef.current = null;
        };
    }, [useWorker]);

    // Async rendering effect
    useEffect(() => {
        const processContent = async () => {
            const currentContent = content || '';
            const prevContent = prevContentRef.current;

            // Detect changes
            const { hasChanges } = detectChanges(prevContent, currentContent);
            prevContentRef.current = currentContent;

            // Generate cache key (include isTrusted flag)
            const cacheKey = generateCacheKey(currentContent, style) + `|trusted:${isTrusted}`;

            // Check cache first
            const cachedEntry = previewCache.get(cacheKey);
            if (cachedEntry && !hasChanges) {
                console.log('[Preview] Cache hit:', cacheKey);
                performanceMonitor.recordCacheHit();
                setHtml(cachedEntry.html);
                setFrontmatter(cachedEntry.frontmatter);
                return;
            }

            performanceMonitor.recordCacheMiss();
            setIsLoading(true);
            setError(null);

            // Use Worker if available and enabled
            if (workerRef.current && useWorker !== false) {
                // Deduplicate requests
                if (pendingRequestRef.current === cacheKey) {
                    console.log('[Preview] Request deduplicated (already pending):', cacheKey);
                    return;
                }
                pendingRequestRef.current = cacheKey;

                const message: WorkerMessage = {
                    type: 'process',
                    content: currentContent,
                    style,
                    isTrusted,
                    useCache: true,
                    cacheKey
                };

                console.log('[Preview] Sending message to worker:', { cacheKey, contentLength: currentContent.length });
                workerRef.current.postMessage(message);
                return;
            }

            // Fallback: Process on main thread (for environments without Worker support)
            console.log('[Preview] Using main thread fallback (Worker not available)');
            const endRender = performanceMonitor.startRender();
            try {
                // Import unified and plugins dynamically for fallback
                const { unified } = await import('unified');
                const remarkParse = (await import('remark-parse')).default;
                const remarkGfm = (await import('remark-gfm')).default;
                const remarkDirective = (await import('remark-directive')).default;
                const remarkRehype = (await import('remark-rehype')).default;
                const rehypeRaw = (await import('rehype-raw')).default;
                const rehypeStringify = (await import('rehype-stringify')).default;
                const { remarkHighlight } = await import('./plugins/remarkHighlight');
                const { remarkFootnotesCustom } = await import('./plugins/remarkFootnotesCustom');
                const { remarkLawQuote } = await import('./plugins/remarkLawQuote');
                const { remarkIndexRuby } = await import('./plugins/remarkIndexRuby');
                const { remarkTableExtended } = await import('./plugins/remarkTableExtended');
                const { remarkColmin } = await import('./plugins/remarkColmin');
                const { remarkSourceLine } = await import('./plugins/remarkSourceLine');

                // Pre-processing (same as in Worker)
                let processedContent = currentContent;
                let extractedFrontmatter: Record<string, string> | null = null;

                const fmMatch = processedContent.match(/^---\n([\s\S]*?)\n---/);
                if (fmMatch) {
                    const fmString = fmMatch[1];
                    processedContent = processedContent.slice(fmMatch[0].length);
                    const fm: Record<string, string> = {};
                    const titleMatch = fmString.match(/title:\s*"?([^"\n]+(?:\n\s+[^"\n]+)*)"?/);
                    if (titleMatch) fm.title = titleMatch[1].trim();
                    const authorMatch = fmString.match(/author:\s*"?([^"\n]+)"?/);
                    if (authorMatch) fm.author = authorMatch[1].trim();
                    const dateMatch = fmString.match(/date:\s*"?([^"\n]+)"?/);
                    if (dateMatch) fm.date = dateMatch[1].trim();
                    extractedFrontmatter = fm;
                }

                const lines = processedContent.split('\n');
                const processedLines: string[] = [];
                let insideLawQuote = false;

                for (const line of lines) {
                    const lawQuoteMatch = line.match(/^:::\s*\{\.lawquote(.*)\}\s*$/);
                    if (lawQuoteMatch) {
                        const attrs = lawQuoteMatch[1];
                        const titleMatch = attrs.match(/title="([^"]+)"/);
                        const title = titleMatch ? `title="${titleMatch[1]}"` : '';
                        processedLines.push(`:::lawquote{${title}}`);
                        insideLawQuote = true;
                        continue;
                    }
                    if (insideLawQuote && line.match(/^:::\s*$/)) {
                        processedLines.push(':::');
                        insideLawQuote = false;
                        continue;
                    }

                    const colminMatch = line.match(/^:::\s*\{\.colmin(.*)\}\s*$/);
                    if (colminMatch) {
                        const rawAttrs = colminMatch[1];
                        processedLines.push(`:::colmin{${rawAttrs.trim()}}`);
                        continue;
                    }

                    processedLines.push(line);
                }
                processedContent = processedLines.join('\n');

                processedContent = processedContent.replace(
                    /\\image\{([^}]+)\}\{(?:width=)?(\d+%?)\}/g,
                    (_, path, width) => {
                        const src = path.startsWith('/') ? path : `/${path}`;
                        return `<img src="${src}" style="width: ${width}; max-width: 100%; display: block; margin: 1rem auto;" />`;
                    }
                );

                processedContent = processedContent.replace(
                    /\\index\{([^}]+)\}/g,
                    (_, term) => {
                        const parts = term.split('!');
                        let display = parts.length > 1
                            ? `<ruby>${parts[1]}<rt>${parts[0]}</rt></ruby>`
                            : `<span class="term">${term}</span>`;
                        return `<span class="index-marker" title="Output Hidden"><span class="meta-label">INDEX</span>${display}</span>`;
                    }
                );

                // Unified Pipeline
                const processor = unified()
                    .use(remarkParse)
                    .use(remarkDirective)
                    .use(remarkGfm)
                    .use(remarkColmin)
                    .use(remarkHighlight)
                    .use(remarkIndexRuby)
                    .use(remarkFootnotesCustom)
                    .use(remarkLawQuote)
                    .use(remarkTableExtended)
                    .use(remarkSourceLine)
                    .use(remarkLinkTypes)
                    .use(remarkRehype, { allowDangerousHtml: true })
                    .use(rehypeRaw)
                    .use(rehypeStringify);

                const vfile = await processor.process(processedContent);
                const sanitizedHtml = sanitizePreviewHtml(String(vfile));

                // Cache the result
                previewCache.set(cacheKey, sanitizedHtml, extractedFrontmatter);

                setHtml(sanitizedHtml);
                setFrontmatter(extractedFrontmatter);
            } catch (e) {
                console.error("Preview Render Error:", e);
                setError(e instanceof Error ? e.message : String(e));
                setHtml(`<p style="color:red">Error rendering preview: ${e}</p>`);
            } finally {
                endRender();
                setIsLoading(false);
            }
        };

        processContent();
    }, [content, style, isTrusted, useWorker]);

    // Scroll tracking for page synchronization
    useEffect(() => {
        if (!enablePageSync) return;

        const container = scrollerRef?.current || internalContainerRef.current;
        if (!container) return;

        const handleScroll = () => {
            setScrollY(container.scrollTop);
        };

        const handleResize = () => {
            setViewportHeight(container.clientHeight);
        };

        // Initial values
        handleResize();

        container.addEventListener('scroll', handleScroll, { passive: true });
        window.addEventListener('resize', handleResize);

        return () => {
            container.removeEventListener('scroll', handleScroll);
            window.removeEventListener('resize', handleResize);
        };
    }, [enablePageSync, scrollerRef]);

    // Handler for goto page action
    const handleGotoPage = useCallback((page: number, position?: 'top' | 'bottom' | 'middle') => {
        const container = scrollerRef?.current || internalContainerRef.current;
        if (!container) return;

        // Find the target paragraph for this page
        if (mapping) {
            for (const [paraId, paraPage] of Object.entries(mapping.paragraphs)) {
                if (paraPage === page) {
                    const paraElement = container.querySelector(`#${paraId}`);
                    if (paraElement) {
                        let targetY = paraElement.getBoundingClientRect().top + container.scrollTop;

                        if (position === 'bottom') {
                            targetY += 400; // Approximate half page
                        } else if (position === 'middle') {
                            targetY += 200;
                        }

                        container.scrollTo({
                            top: targetY,
                            behavior: 'smooth'
                        });
                        return;
                    }
                }
            }
        }

        // Fallback to hook method
        scrollToPage(page, position, container);
    }, [mapping, scrollToPage, scrollerRef]);

    // Handler for boundary click
    const handleBoundaryClick = useCallback((pageNumber: number) => {
        handleGotoPage(pageNumber, 'top');
    }, [handleGotoPage]);

    const containerRef = scrollerRef || internalContainerRef;

    return (
        <>
            <style>{`
                .preview-container {
                    /* Performance Optimization: CSS Containment */
                    contain: content;
                    content-visibility: auto;

                    /* Typography */
                    /* Use UI setting for base font size, but preserve document relative ratios */
                    --base-fs: ${editorFontSize}px;
                    --lh: ${ty?.lineHeight || 1.6};
                    --ls: ${ty?.letterSpacing || 0.05}em;
                    --h-scale: ${ty?.headingScale || 1.2};
                    --font-mincho: '${ty?.fontFamilyMincho || 'serif'}', serif;
                    --font-gothic: '${ty?.fontFamilyGothic || 'sans-serif'}', sans-serif;

                    /* Paragraph */
                    --p-indent: ${para?.indent ? (para?.indentSize || 1) + 'em' : '0'};
                    --p-spacing: ${para?.spacing || 0.8}rem;
                    --text-align: ${para?.justify ? 'justify' : 'left'};

                    /* Visuals */
                    --link-color: ${vis?.linkColor || primaryColor};
                    --blockquote-border: ${vis?.blockquoteStyle === 'none' ? 'none' : '4px solid var(--primary)'};
                    --blockquote-bg: ${vis?.blockquoteStyle === 'framed' ? 'var(--secondary)' : 'transparent'};
                    --blockquote-pad: ${vis?.blockquoteStyle === 'framed' ? '1rem' : '0 0 0 1rem'};

                    /* Apply Variables */
                    font-size: var(--base-fs);
                    line-height: var(--lh);
                    letter-spacing: var(--ls);
                    font-family: var(--font-mincho);
                    color: var(--foreground);
                }
                
                .preview-container p {
                    text-indent: var(--p-indent);
                    margin-bottom: var(--p-spacing);
                    margin-top: 0;
                    text-align: var(--text-align);
                }
                
                /* Headings */
                .preview-container h1, .preview-container h2, .preview-container h3, 
                .preview-container h4, .preview-container h5, .preview-container h6 {
                    font-family: var(--font-gothic);
                    font-weight: 700;
                    margin-top: 1.5em;
                    margin-bottom: 0.5em;
                    line-height: 1.3;
                }

                .preview-container h1 { font-size: calc(var(--base-fs) * var(--h-scale) * var(--h-scale) * var(--h-scale)); border-bottom: 2px solid var(--primary); padding-bottom: 0.2em; }
                .preview-container h2 { font-size: calc(var(--base-fs) * var(--h-scale) * var(--h-scale)); border-bottom: 1px solid var(--border); padding-bottom: 0.2em;}
                .preview-container h3 { font-size: calc(var(--base-fs) * var(--h-scale)); border-left: 4px solid var(--primary); padding-left: 0.5em; }
                
                /* Links */
                .preview-container a {
                    color: var(--link-color);
                    text-decoration: underline;
                    text-underline-offset: 2px;
                }

                /* Blockquotes */
                .preview-container blockquote {
                    border-left: var(--blockquote-border);
                    background: var(--blockquote-bg);
                    padding: var(--blockquote-pad);
                    margin: 1.5em 0;
                    font-style: italic;
                    color: var(--muted-foreground);
                }

                /* Images */
                .preview-container img {
                    max-width: 100%;
                    height: auto;
                    border-radius: 4px;
                }

                /* Tables */
                .preview-container table {
                    width: 100%;
                    border-collapse: collapse;
                    margin: 1rem 0;
                }
                .preview-container th, .preview-container td {
                    border: 1px solid var(--border);
                    padding: 0.5rem;
                }
                .preview-container th {
                    background: var(--secondary);
                    font-weight: bold;
                    font-family: var(--font-gothic);
                }
                
                /* Colmin Custom Styles */
                /* Header Column (Bold) */
                .preview-container td.header-col {
                    font-weight: bold;
                }

                /* Ensure variables are available */
                :root {
                    --primary: ${primaryColor};
                }

                /* Highlight Classes */
                .hl-yellow { background-color: var(--hl-yellow); color: inherit; }
                .hl-red    { background-color: var(--hl-red); color: inherit; }
                .hl-green  { background-color: var(--hl-green); color: inherit; }
                .hl-blue   { background-color: var(--hl-blue); color: inherit; }
                .hl-purple { background-color: var(--hl-purple); color: inherit; }

                /* Highlight Colors (Muted & Dark Mode) */
                :root {
                    --hl-yellow: rgba(255, 214, 10, 0.3);
                    --hl-red: rgba(255, 59, 48, 0.15);
                    --hl-green: rgba(52, 199, 89, 0.2);
                    --hl-blue: rgba(0, 122, 255, 0.15);
                    --hl-purple: rgba(88, 86, 214, 0.15);
                }
                .dark {
                    --hl-yellow: rgba(255, 213, 10, 0.25);
                    --hl-red: rgba(255, 69, 58, 0.25);
                    --hl-green: rgba(48, 209, 88, 0.25);
                    --hl-blue: rgba(10, 132, 255, 0.25);
                    --hl-purple: rgba(94, 92, 230, 0.25);
                }

                /* Footnotes */
                .footnote-ref {
                    cursor: pointer;
                    color: var(--primary);
                    font-size: 0.75em;
                    vertical-align: super;
                    margin-left: 1px;
                    text-decoration: none !important;
                    opacity: 0.8;
                }
                .footnote-ref:hover {
                    opacity: 1;
                    text-decoration: underline !important;
                }

                /* Law Quote */
                .lawquote {
                    position: relative;
                    margin: 2rem 0;
                    padding: 1rem 1.5rem;
                    background-color: var(--muted);
                    border-left: 4px solid var(--primary);
                    border-radius: 2px;
                }
                .lawquote-label {
                    display: inline-block;
                    font-size: 0.8em;
                    font-weight: bold;
                    color: var(--primary);
                    margin-bottom: 0.25rem;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    opacity: 0.9;
                }
                .lawquote-title {
                    font-family: var(--font-gothic);
                    font-weight: 700;
                    font-size: 1.1em;
                    margin-bottom: 0.75rem;
                    border-bottom: 1px solid var(--border);
                    padding-bottom: 0.5rem;
                    display: block;
                }

                /* Index Ruby */
                .index-marker {
                    background-color: var(--index-highlight-bg);
                    padding: 0.1em 0.3em;
                    border-radius: 2px;
                    display: inline-block;
                }
                .index-marker .meta-label {
                    display: inline-block;
                    font-size: 0.65em;
                    font-weight: bold;
                    color: var(--index-label-color);
                    margin-right: 0.2em;
                    opacity: 0.6;
                    letter-spacing: 0.05em;
                }
                .index-term {
                    position: relative;
                    border-bottom: 1px dashed var(--muted-foreground);
                    padding-bottom: 1px;
                }
                .index-term::after {
                    content: 'IDX';
                    position: absolute;
                    top: -0.5em;
                    right: -0.8em;
                    font-size: 0.5em;
                    font-weight: bold;
                    color: var(--muted-foreground);
                    opacity: 0.5;
                    pointer-events: none;
                }
                .index-term ruby, .index-marker ruby {
                    ruby-position: over;
                    ruby-align: center;
                    color: var(--muted-foreground); /* Dimmer color as requested */
                    opacity: 0.8;
                }
                /* Hover effect to show full brightness */
                .index-term ruby:hover, .index-marker ruby:hover {
                    color: var(--foreground);
                    opacity: 1;
                }
                .index-term rt, .index-marker rt {
                    font-size: 0.6em;
                    color: var(--muted-foreground);
                    font-weight: normal;
                    user-select: none;
                }

                /* Index Highlight Colors (Light Mode: Gray, Dark Mode: Appropriate Color) */
                :root {
                    --index-highlight-bg: rgba(128, 128, 128, 0.15);
                    --index-label-color: #666;
                }
                .dark {
                    --index-highlight-bg: rgba(100, 149, 237, 0.2);
                    --index-label-color: #a0c4ff;
                }

                /* Internal/External Link Styles */
                :root {
                    --external-link-color: hsl(217.2 91.2% 59.8%);
                    --external-link-hover-color: hsl(217.2 91.2% 45%);
                    --external-link-hover-bg: hsl(217.2 91.2% 96%);
                    --external-link-active-bg: hsl(217.2 91.2% 90%);
                    --internal-link-color: hsl(142.1 76.2% 36.3%);
                    --internal-link-hover-color: hsl(142.1 76.2% 28%);
                    --internal-link-hover-bg: hsl(142.1 76.2% 96%);
                    --internal-link-active-bg: hsl(142.1 76.2% 90%);
                }

                .dark {
                    --external-link-color: hsl(217.2 91.2% 70%);
                    --external-link-hover-color: hsl(217.2 91.2% 80%);
                    --external-link-hover-bg: hsl(217.2 91.2% 15%);
                    --external-link-active-bg: hsl(217.2 91.2% 20%);
                    --internal-link-color: hsl(142.1 76.2% 60%);
                    --internal-link-hover-color: hsl(142.1 76.2% 70%);
                    --internal-link-hover-bg: hsl(142.1 76.2% 15%);
                    --internal-link-active-bg: hsl(142.1 76.2% 20%);
                }

                .preview-container a.external-link {
                    display: inline-flex;
                    align-items: center;
                    padding: 2px 4px;
                    border-radius: 4px;
                    color: var(--external-link-color);
                    text-decoration: underline;
                    text-underline-offset: 2px;
                    text-decoration-style: solid;
                    text-decoration-thickness: 1px;
                    transition: all 150ms ease-in-out;
                }

                .preview-container a.external-link:hover {
                    color: var(--external-link-hover-color);
                    background-color: var(--external-link-hover-bg);
                }

                .preview-container a.external-link:focus {
                    outline: 2px solid var(--ring);
                    outline-offset: 2px;
                    background-color: var(--external-link-hover-bg);
                }

                .preview-container a.external-link:active {
                    background-color: var(--external-link-active-bg);
                    text-decoration: none;
                }

                .preview-container a.external-link svg {
                    width: 16px;
                    height: 16px;
                    margin-left: 4px;
                    transition: transform 150ms ease-in-out;
                }

                .preview-container a.external-link:hover svg {
                    transform: rotate(-45deg);
                }

                .preview-container a.internal-link {
                    display: inline-flex;
                    align-items: center;
                    padding: 2px 4px;
                    border-radius: 4px;
                    color: var(--internal-link-color);
                    text-decoration: underline;
                    text-underline-offset: 2px;
                    text-decoration-style: dotted;
                    text-decoration-thickness: 1px;
                    transition: all 150ms ease-in-out;
                }

                .preview-container a.internal-link:hover {
                    color: var(--internal-link-hover-color);
                    background-color: var(--internal-link-hover-bg);
                    text-decoration-style: solid;
                }

                .preview-container a.internal-link:focus {
                    outline: 2px solid var(--ring);
                    outline-offset: 2px;
                    background-color: var(--internal-link-hover-bg);
                    text-decoration-style: solid;
                }

                .preview-container a.internal-link:active {
                    background-color: var(--internal-link-active-bg);
                    text-decoration: none;
                }

                .preview-container a.internal-link svg {
                    width: 16px;
                    height: 16px;
                    margin-right: 4px;
                    transition: transform 150ms ease-in-out;
                }

                .preview-container a.internal-link:hover svg {
                    transform: scale(1.1);
                }
            `}</style>

            {isLoading && (
                <div className="preview-loading flex items-center justify-center h-full">
                    <div className="text-muted-foreground">プレビューをレンダリング中...</div>
                </div>
            )}
            {error && (
                <div className="preview-error bg-destructive/10 text-destructive p-4 m-4 rounded">
                    <strong>エラー:</strong> {error}
                </div>
            )}

            {/* Page synchronization UI overlay */}
            {enablePageSync && (
                <>
                    <CurrentPagePill
                        scrollY={scrollY}
                        viewportHeight={viewportHeight}
                        containerElement={containerRef.current || null}
                        onGotoClick={() => {/* Could open goto dialog */}}
                    />
                    <PageBoundaryIndicator
                        enabled={boundariesEnabled}
                        containerElement={containerRef.current || null}
                        onBoundaryClick={handleBoundaryClick}
                    />
                </>
            )}

            {/* Preview container */}
            <div
                ref={scrollerRef || internalContainerRef}
                className={`preview-container prose dark:prose-invert max-w-none p-8 overflow-auto h-full bg-background relative ${className} ${isLoading ? 'opacity-50' : ''}`}
            >
                {frontmatter && (
                    <div className="cover-header">
                        <span className="html-only-badge">HTML Cover Page (Not included in PDF)</span>
                        {frontmatter.title && <h1 className="cover-title">{frontmatter.title}</h1>}
                        <div className="cover-meta">
                            {frontmatter.author && <span>{frontmatter.author}</span>}
                            {frontmatter.author && frontmatter.date && <span> • </span>}
                            {frontmatter.date && <span>{frontmatter.date}</span>}
                        </div>
                    </div>
                )}
                <div dangerouslySetInnerHTML={{ __html: html }} />
            </div>

            {/* Page sync toolbar (floating at bottom) */}
            {enablePageSync && mapping && (
                <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-white dark:bg-gray-800 rounded-full shadow-lg border border-gray-200 dark:border-gray-700 px-4 py-2 flex items-center gap-3 z-40">
                    <GotoPageButton
                        onGoto={handleGotoPage}
                        containerElement={containerRef.current || null}
                    />
                    <div className="w-px h-4 bg-gray-300 dark:bg-gray-600" />
                    <BoundaryToggle
                        enabled={boundariesEnabled}
                        onToggle={setBoundariesEnabled}
                        hasMapping={!!mapping}
                    />
                </div>
            )}
        </>
    );
};
