import { visit } from 'unist-util-visit';
import { Plugin } from 'unified';
import { PhrasingContent } from 'mdast';

export const remarkIndexRuby: Plugin = () => {
    return (tree) => {
        visit(tree, 'text', (node: any, index, parent) => {
            if (!node.value) return;

            // Pattern: {Term|idx|Reading}
            const regex = /\{([^\|]+)\|idx\|([^\}]+)\}/g;
            if (!regex.test(node.value)) return;

            const children: PhrasingContent[] = [];
            let lastIndex = 0;
            let match;

            regex.lastIndex = 0;

            while ((match = regex.exec(node.value)) !== null) {
                const [, term, reading] = match;
                const startIndex = match.index;

                // Push preceding text
                if (startIndex > lastIndex) {
                    children.push({
                        type: 'text',
                        value: node.value.slice(lastIndex, startIndex),
                    });
                }

                // Push ruby HTML
                children.push({
                    type: 'html',
                    value: `<span class="index-term" data-idx="${reading}"><ruby>${term}<rt>${reading}</rt></ruby></span>`,
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

            if (parent && index !== null && typeof index === 'number') {
                parent.children.splice(index, 1, ...children);
                return index + children.length;
            }
        });
    };
};
