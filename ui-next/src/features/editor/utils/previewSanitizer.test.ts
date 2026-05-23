import { createFootnoteTooltipConfig, sanitizePreviewHtml } from './previewSanitizer';

describe('previewSanitizer', () => {
    it('removes executable HTML while preserving allowed preview attributes', () => {
        const sanitized = sanitizePreviewHtml(`
            <div data-source-line="12">
                <img src="/assets/uploads/example.png" onerror="alert(1)">
                <script>alert(1)</script>
                <iframe src="https://example.com"></iframe>
                <a href="javascript:alert(2)" target="_blank" style="position:fixed">link</a>
            </div>
        `);

        expect(sanitized).toContain('data-source-line="12"');
        expect(sanitized).toContain('target="_blank"');
        expect(sanitized).not.toContain('script');
        expect(sanitized).not.toContain('iframe');
        expect(sanitized).not.toContain('onerror');
        expect(sanitized).not.toContain('javascript:');
        expect(sanitized).not.toContain('style=');
    });

    it('disables HTML rendering for footnote tooltips', () => {
        const tooltipConfig = createFootnoteTooltipConfig();

        expect(tooltipConfig.allowHTML).toBe(false);
        expect(tooltipConfig.interactive).toBe(true);
        expect(tooltipConfig.theme).toBe('light-border');
    });
});
