import { visit } from 'unist-util-visit';
import { Plugin } from 'unified';

export const remarkColmin: Plugin = () => {
    return (tree) => {
        // Visit 'div' nodes (created by our pre-parser or generic remark-divs)
        visit(tree, 'div' as any, (node: any) => {
            node.data || (node.data = {});

            // Check if it's a colmin div
            // Our pre-parser in Preview.tsx creates <div class="colmin" style="...">
            // But remark-rehype might see it as text if it's raw HTML? 
            // Wait, Preview.tsx does manual string manipulation BEFORE remark.
            // If Preview.tsx outputs `<div class="colmin"...>`, rehypeRaw handles it.
            // But we want to process the *inner table* to add classes to cells.

            // If Preview.tsx already converts to HTML div, remark might traverse it as 'html' node if we use rehype-raw?
            // Actually, if we use `remark-parse`, it parses Markdown.
            // If Preview.tsx replaces `::: {.colmin}` with `<div ...>`, then remark sees HTML block.
            // Remark generally ignores content inside HTML blocks or treats it as HTML.
            // Use with `rehype-raw` allows HTML to pass through.

            // However, we need to modify the TABLE inside.
            // If the table is inside an HTML block, remark might not parse it as a 'table' node?
            // Standard CommonMark: block-level HTML terminates markdown parsing inside?
            // Yes, "Markdown syntax is not processed within block-level HTML tags".
            // So `<div class="colmin"> | table | ... </div>` -> The table renders as plain text!
            // This is a problem with the current `Preview.tsx` line-based pre-processing.

            // BETTER APPROACH:
            // Don't transform `::: {.colmin}` to HTML in pre-processing.
            // Leave it as `::: {.colmin}` or convert to `:::colmin` for remark-directive.
            // If we assume `remark-directive` is used, we should use `containerDirective`.

            if (node.type === 'containerDirective' && node.name === 'colmin') {
                // Compatible with :::colmin{cols="1,3"}
                processColminNode(node);
            }
        });

        // Also support Generic Divs if using remark-fenced-divs?
        // Or handle the manual "attributes" if we use a different parser.
        // Let's rely on standard remark-directive if possible.
        // But `Preview.tsx` manual parser currently handles `::: {.colmin}`.
        // We should disable `Preview.tsx` manual handling for colmin and let this plugin handle it?
        // Or make `Preview.tsx` convert `::: {.colmin ...}` to `:::colmin{...}` which is standard directive.
    };
};

function processColminNode(node: any) {
    const data = node.data || (node.data = {});
    const hProperties = data.hProperties || (data.hProperties = {});
    const attributes = node.attributes || {};

    // 1. Columns & Widths
    const colsStr = attributes.cols || '';
    if (colsStr) {
        // Calculate widths (simplified for CSS Grid or Table Layout)
        // Actually, CSS `grid-template-columns` works on DIVs, not Tables directly easily.
        // But we can set variables or classes.
        // Let's set a custom property/style on the node.
        const frs = colsStr.split(',').map((c: string) => `${c.trim()}fr`).join(' ');
        hProperties.style = (hProperties.style || '') + `grid-template-columns: ${frs};`;
    }

    // 2. Attributes for Table Processing
    const headerCols = parseInt(attributes['header-cols'] || '0', 10);
    const vlines = attributes.vlines !== 'false';
    const hlines = attributes.hlines !== 'false';

    // Add classes to the wrapper div
    const classes = hProperties.className || (hProperties.className = []);
    classes.push('colmin');
    if (vlines) classes.push('colmin-vlines');
    if (hlines) classes.push('colmin-hlines');

    // 3. Process Inner Table
    // We need to find the table node inside this container
    // And modify its cells based on attributes
    visit(node, 'table', (tableNode: any) => {
        // Apply Header Cols
        if (headerCols > 0) {
            processHeaderCols(tableNode, headerCols);
        }

        // Apply Column Widths (if provided) to the first row cells
        if (colsStr) {
            const parts = colsStr.split(',').map((s: string) => parseFloat(s.trim()));
            const total = parts.reduce((a: number, b: number) => a + b, 0);
            if (total > 0) {
                const colWidths = parts.map((p: number) => `${(p / total) * 100}%`);
                processColWidths(tableNode, colWidths);
            }
        }

        // Pass Class info to Table node for border styling
        const tData = tableNode.data || (tableNode.data = {});
        const tProps = tData.hProperties || (tData.hProperties = {});
        const tClasses = tProps.className || (tProps.className = []);
        if (vlines) tClasses.push('colmin-vlines');
        else tClasses.push('colmin-no-vlines');
        if (hlines) tClasses.push('colmin-hlines');
    });
}

function processColWidths(tableNode: any, widths: string[]) {
    // We need to apply this to the first row's cells.
    // Check table head first.
    let targetRow = null;

    // tableNode.children usually contains tableHead, tableBody etc in standard mdast,
    // but remark-gfm might produce table -> tableRow structure directly?
    // Let's allow for both.

    if (tableNode.children.length > 0) {
        targetRow = tableNode.children[0];
        // If first child is tableHead, use its first row
        if (targetRow.type === 'tableHead' && targetRow.children.length > 0) {
            targetRow = targetRow.children[0];
        } else if (targetRow.type !== 'tableRow') {
            // Fallback or skip
        }
    }

    if (targetRow && targetRow.type === 'tableRow') {
        targetRow.children.forEach((cell: any, index: number) => {
            if (index < widths.length) {
                const data = cell.data || (cell.data = {});
                const hProperties = data.hProperties || (data.hProperties = {});
                hProperties.style = (hProperties.style || '') + `width: ${widths[index]};`;
            }
        });
    }
}

function processHeaderCols(tableNode: any, headerCols: number) {
    // Visit all rows
    visit(tableNode, 'tableRow', (row: any) => {
        row.children.forEach((cell: any, index: number) => {
            if (index < headerCols) {
                const data = cell.data || (cell.data = {});
                const hProperties = data.hProperties || (data.hProperties = {});
                const classes = hProperties.className || (hProperties.className = []);
                classes.push('header-col');
            }
        });
    });
}
