import DOMPurify from 'dompurify';

const ALLOWED_ATTRIBUTES = [
    'target',
    'data-number',
    'data-content',
    'data-identifier',
    'data-idx',
    'class',
    'data-source-line',
    'data-link-type',
    'aria-label',
];

export function sanitizePreviewHtml(html: string): string {
    return DOMPurify.sanitize(html, {
        ADD_ATTR: ALLOWED_ATTRIBUTES,
        FORBID_ATTR: ['style'],
        FORBID_TAGS: ['script', 'iframe', 'object', 'embed'],
    });
}

export function createFootnoteTooltipConfig() {
    return {
        content: (reference: Element) => reference.getAttribute('data-content') || '',
        allowHTML: false,
        interactive: true,
        appendTo: document.body,
        theme: 'light-border',
    };
}
