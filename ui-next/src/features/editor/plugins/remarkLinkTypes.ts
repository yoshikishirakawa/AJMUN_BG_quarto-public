import { visit } from 'unist-util-visit';
import { Plugin } from 'unified';

const INTERNAL_LINK_PATTERN = /\.toc$/;

const isInternalLink = (url: string): boolean => {
    return INTERNAL_LINK_PATTERN.test(url);
};

export const remarkLinkTypes: Plugin = () => {
    return (tree) => {
        visit(tree, 'link', (node: any) => {
            if (!node.url) return;

            const isInternal = isInternalLink(node.url);
            node.data = node.data || {};
            node.data.hProperties = node.data.hProperties || {};

            if (isInternal) {
                node.data.hProperties['data-link-type'] = 'internal';
                node.data.hProperties.className = 'internal-link';
            } else {
                node.data.hProperties['data-link-type'] = 'external';
                node.data.hProperties.className = 'external-link';
                node.data.hProperties.target = '_blank';
                node.data.hProperties.rel = 'noopener noreferrer';
            }
        });
    };
};

export { isInternalLink };
