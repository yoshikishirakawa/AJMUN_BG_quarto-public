import { visit } from 'unist-util-visit';
import { Plugin } from 'unified';
import { PhrasingContent } from 'mdast';

export const remarkHighlight: Plugin = () => {
    return (tree) => {
        visit(tree, 'text', (node: any, index, parent) => {
            if (!node.value) return;

            const regex = /\[(.*?)\]\{\.hl-(.*?)\}/g;
            if (!regex.test(node.value)) return;

            const children: PhrasingContent[] = [];
            let lastIndex = 0;
            let match;

            // Reset regex
            regex.lastIndex = 0;

            while ((match = regex.exec(node.value)) !== null) {
                const [, text, color] = match;
                const startIndex = match.index;

                // Push preceding text
                if (startIndex > lastIndex) {
                    children.push({
                        type: 'text',
                        value: node.value.slice(lastIndex, startIndex),
                    });
                }

                // Push highlight span as HTML
                // Note: using 'html' type requires rehype-raw later
                children.push({
                    type: 'html',
                    value: `<span class="hl-${color}">${text}</span>`,
                });

                lastIndex = regex.lastIndex;
            }

            // Push remaining text
            if (lastIndex < node.value.length) {
                children.push({
                    type: 'text',
                    value: node.value.slice(lastIndex),
                });
            }

            // Replace the text node with the new children
            // Since we are visiting, replacing the node in the parent is cleaner
            // but 'visit' allows index manipulation.
            // Simplified: create a 'paragraph' or 'span'? No, we are inside a paragraph usually.
            // We need to splice the parent's children.

            if (parent && index !== null && typeof index === 'number') {
                parent.children.splice(index, 1, ...children);
                // Adjust index so we don't visit the new nodes (optional but good practice)
                return index + children.length;
            }
        });
    };
};
