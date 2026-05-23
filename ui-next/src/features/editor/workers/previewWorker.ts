/**
 * Preview Worker
 * unifiedパイプラインをWeb Workerで実行し、メインスレッドを解放する
 */

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkDirective from 'remark-directive';
import remarkRehype from 'remark-rehype';
// rehype-raw disabled: causes "document is not defined" error in Web Worker
// The worker will return HTML with raw nodes; main thread handles sanitization
import rehypeStringify from 'rehype-stringify';

// カスタムプラグインのインポート
import { remarkHighlight } from '../plugins/remarkHighlight';
import { remarkFootnotesCustom } from '../plugins/remarkFootnotesCustom';
import { remarkLawQuote } from '../plugins/remarkLawQuote';
import { remarkIndexRuby } from '../plugins/remarkIndexRuby';
import { remarkTableExtended } from '../plugins/remarkTableExtended';
import { remarkColmin } from '../plugins/remarkColmin';
import { remarkSourceLine } from '../plugins/remarkSourceLine';
import { remarkLinkTypes } from '../plugins/remarkLinkTypes';

// 型定義のインポート
import type { WorkerMessage, WorkerResponse, WorkerCacheEntry, WorkerStats } from './types';

// Worker側のキャッシュ
const workerCache = new Map<string, WorkerCacheEntry>();
const MAX_CACHE_SIZE = 100;
const MAX_CACHE_AGE = 5 * 60 * 1000; // 5分

// 統計情報
let stats: WorkerStats = {
    cacheSize: 0,
    cacheHits: 0,
    cacheMisses: 0,
    totalProcessed: 0
};

/**
 * ハッシュ関数（キャッシュキー生成用）
 */
function hashContent(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
        const char = content.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash.toString(36);
}

/**
 * キャッシュキーを生成
 */
function generateCacheKey(content: string, style?: Record<string, any>, isTrusted?: boolean): string {
    const contentHash = hashContent(content);
    const styleHash = style ? hashContent(JSON.stringify(style)) : '';
    const trustedFlag = isTrusted ? 'trusted' : 'untrusted';
    return `${contentHash}-${styleHash}-${trustedFlag}`;
}

/**
 * 古いキャッシュエントリを削除
 */
function cleanupCache(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of workerCache.entries()) {
        if (now - entry.timestamp > MAX_CACHE_AGE) {
            keysToDelete.push(key);
        }
    }

    keysToDelete.forEach(key => workerCache.delete(key));

    // キャッシュサイズが最大を超える場合、最も古いエントリを削除
    if (workerCache.size > MAX_CACHE_SIZE) {
        const sortedEntries = Array.from(workerCache.entries())
            .sort((a, b) => a[1].timestamp - b[1].timestamp);

        const entriesToDelete = sortedEntries.slice(0, workerCache.size - MAX_CACHE_SIZE);
        entriesToDelete.forEach(([key]) => workerCache.delete(key));
    }

    stats.cacheSize = workerCache.size;
}

/**
 * YAML Frontmatterを解析
 */
function parseFrontmatter(content: string): { content: string; frontmatter: Record<string, string> | null } {
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) {
        return { content, frontmatter: null };
    }

    const fmString = fmMatch[1];
    const processedContent = content.slice(fmMatch[0].length);
    const frontmatter: Record<string, string> = {};

    const titleMatch = fmString.match(/title:\s*"?([^"\n]+(?:\n\s+[^"\n]+)*)"?/);
    if (titleMatch) frontmatter.title = titleMatch[1].trim();

    const authorMatch = fmString.match(/author:\s*"?([^"\n]+)"?/);
    if (authorMatch) frontmatter.author = authorMatch[1].trim();

    const dateMatch = fmString.match(/date:\s*"?([^"\n]+)"?/);
    if (dateMatch) frontmatter.date = dateMatch[1].trim();

    return { content: processedContent, frontmatter };
}

/**
 * コンテンツの前処理
 */
function preprocessContent(content: string): string {
    let processedContent = content;

    // Normalize ::: {.lawquote title="..."} to :::lawquote{title="..."}
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

        // Normalize ::: {.colmin ...} to :::colmin{...}
        const colminMatch = line.match(/^:::\s*\{\.colmin(.*)\}\s*$/);
        if (colminMatch) {
            const rawAttrs = colminMatch[1];
            processedLines.push(`:::colmin{${rawAttrs.trim()}}`);
            continue;
        }

        processedLines.push(line);
    }
    processedContent = processedLines.join('\n');

    // Inline Replacements
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

    return processedContent;
}

/**
 * MarkdownをHTMLに変換
 */
async function processMarkdown(
    content: string,
    _style?: Record<string, any>,
    _isTrusted: boolean = false
): Promise<{ html: string; frontmatter: Record<string, string> | null }> {
    // Frontmatterの解析
    const { content: contentWithoutFrontmatter, frontmatter } = parseFrontmatter(content);

    // 前処理
    const processedContent = preprocessContent(contentWithoutFrontmatter);

    // Unifiedパイプラインの構築
    // Note: rehype-raw is disabled due to Worker compatibility issues
    // HTML nodes will be escaped; use main thread processing for full HTML support
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
        .use(rehypeStringify);

    // 処理実行
    const vfile = await processor.process(processedContent);
    const html = String(vfile);

    return { html, frontmatter };
}

/**
 * Workerメッセージハンドラー
 */
self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
    const { type, content, style, isTrusted, useCache } = event.data;

    console.log('[PreviewWorker] Received message:', { type, useCache, contentLength: content?.length });

    if (type === 'process') {
        const cacheKey = generateCacheKey(content, style, isTrusted);

        try {
            // キャッシュチェック
            if (useCache !== false) {
                const cachedEntry = workerCache.get(cacheKey);
                if (cachedEntry) {
                    stats.cacheHits++;
                    console.log('[PreviewWorker] Cache hit:', cacheKey);
                    const response: WorkerResponse = {
                        type: 'cached',
                        html: cachedEntry.html,
                        frontmatter: cachedEntry.frontmatter,
                        cacheKey
                    };
                    self.postMessage(response);
                    return;
                }
                stats.cacheMisses++;
                console.log('[PreviewWorker] Cache miss:', cacheKey);
            }

            // Markdown処理
            stats.totalProcessed++;
            console.log('[PreviewWorker] Processing markdown...');
            const { html, frontmatter } = await processMarkdown(content, style, isTrusted);

            // キャッシュに保存
            if (useCache !== false) {
                workerCache.set(cacheKey, {
                    html,
                    frontmatter,
                    timestamp: Date.now()
                });
                cleanupCache();
            }

            // 結果を返信
            const response: WorkerResponse = {
                type: 'result',
                html,
                frontmatter,
                cacheKey
            };
            console.log('[PreviewWorker] Processing complete:', { type: response.type, cacheKey, htmlLength: html.length });
            self.postMessage(response);

        } catch (error) {
            const response: WorkerResponse = {
                type: 'error',
                error: error instanceof Error ? error.message : String(error)
            };
            console.error('[PreviewWorker] Error:', error);
            self.postMessage(response);
        }
    }
};

/**
 * 統計情報の取得（デバッグ用）
 */
export function getWorkerStats(): WorkerStats {
    return { ...stats };
}

/**
 * キャッシュのクリア（デバッグ用）
 */
export function clearWorkerCache(): void {
    workerCache.clear();
    stats.cacheSize = 0;
}
