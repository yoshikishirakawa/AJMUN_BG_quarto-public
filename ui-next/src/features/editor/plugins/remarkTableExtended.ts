import { visit } from 'unist-util-visit';
import { Plugin } from 'unified';

export const remarkTableExtended: Plugin = () => {
    return (tree) => {
        visit(tree, 'table', (node: any) => {
            // Check the first row (header)
            const headerRow = node.children[0];
            if (!headerRow || headerRow.type !== 'tableRow') return;

            headerRow.children.forEach((cell: any) => {
                // Look for {width=...} in the cell's text content
                // We need to traverse cell children to find the text
                const textNodes: any[] = [];
                visit(cell, 'text', (t: any) => textNodes.push(t));

                for (const textNode of textNodes) {
                    const regex = /\{width=(.*?)\}/; // Simple non-global match
                    const match = textNode.value.match(regex);

                    if (match) {
                        const width = match[1];

                        // Remove the syntax from text
                        textNode.value = textNode.value.replace(regex, '').trim();

                        // Apply style to the cell (th)
                        // In remark-rehype, 'data.hProperties' is used.
                        const data = cell.data || (cell.data = {});
                        const hProperties = data.hProperties || (data.hProperties = {});

                        hProperties.style = (hProperties.style || '') + `width: ${width};`;

                        // We only support one width spec per cell
                        break;
                    }
                }
            });
        });
    };
};
