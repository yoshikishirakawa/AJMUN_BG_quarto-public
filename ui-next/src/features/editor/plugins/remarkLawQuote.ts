import { visit } from 'unist-util-visit';
import { Plugin } from 'unified';

export const remarkLawQuote: Plugin = () => {
    return (tree) => {
        visit(tree, 'containerDirective', (node: any) => {
            if (node.name !== 'lawquote') return;

            const data = node.data || (node.data = {});
            const attributes = node.attributes || {};
            const title = attributes.title ? attributes.title : '';
            
            // Get the container's start line for scroll sync
            const containerLine = node.position?.start?.line;

            // Convert directive to HTML
            // Structure: 
            // <div class="lawquote">
            //   <span class="lawquote-label">条文</span>
            //   <div class="lawquote-title">Title</div>
            //   <div class="lawquote-content">...children...</div>
            // </div>

            // We want to preserve the children as Markdown so they get processed by following plugins (highlight, etc.)
            // So we change the node type to a custom one or just wrap the children?
            // remark-directive usually works with rehype by defining hName, hProperties.

            data.hName = 'div';
            data.hProperties = { 
                className: ['lawquote'],
                // Add data-source-line to the container itself
                ...(containerLine ? { 'data-source-line': containerLine } : {})
            };
            
            // Propagate source line to children for better scroll sync accuracy
            // Each child paragraph inside lawquote should have its own line number
            if (node.children && Array.isArray(node.children)) {
                node.children.forEach((child: any) => {
                    if (child.position?.start?.line) {
                        const childData = child.data || (child.data = {});
                        const childHProperties = childData.hProperties || (childData.hProperties = {});
                        childHProperties['data-source-line'] = child.position.start.line;
                    }
                });
            }

            // We need to inject the label and title BEFORE the content.
            // But 'children' contains the paragraphs of the quote.
            // We can't easily inject complex HTML structure using just hProperties.
            // A better approach: Transform this node into a generic 'div' (hName)
            // but effectively we might need to rely on the rehype phase or insert HTML nodes here.

            // Let's try inserting HTML nodes at the beginning of children.
            // Note: Mixing AST nodes (HTML) with Markdown nodes is fine if we use rehype-raw.

            // Simple Markdown Link Parser for Title: [Text](Url) -> <a href="Url">Text</a>
            const linkedTitle = title.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

            const headerHtml = `
                <span class="lawquote-label">条文</span>
                ${linkedTitle ? `<div class="lawquote-title">${linkedTitle}</div>` : ''}
            `;

            node.children.unshift({
                type: 'html',
                value: headerHtml
            });
        });
    };
};
