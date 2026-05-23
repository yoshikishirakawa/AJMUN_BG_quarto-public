import { visit } from 'unist-util-visit';
import { Plugin } from 'unified';

const toText = (node: any): string => {
    if (node.value) return node.value;
    if (node.children) return node.children.map(toText).join('');
    return '';
};

export const remarkFootnotesCustom: Plugin = () => {
    return (tree: any) => {
        const definitions: Record<string, any> = {};

        // 1. Collect Definitions
        visit(tree, 'footnoteDefinition', (node: any) => {
            definitions[node.identifier] = node;
        });

        // 2. Transform References
        let counter = 1;
        visit(tree, 'footnoteReference', (node: any) => {
            const def = definitions[node.identifier];
            let content = "";
            if (def) {
                // Extract text content from definition
                content = toText(def).replace(/"/g, '&quot;');
            }

            // Replace node with html span
            // We use 'html' type which requires rehype-raw
            node.type = 'html';
            node.value = `<span class="footnote-ref" data-number="${counter}" data-content="${content}">[${counter}]</span>`;
            counter++;
        });

        // Optional: Remove definitions if we don't want them at the bottom
        // For now, let's keep them (Gfm will render them) or maybe remove them?
        // User didn't strictly say remove bottom footnotes, just "if possible margin note or popup".
        // Use CSS to hide .footnotes if needed.
    };
};
