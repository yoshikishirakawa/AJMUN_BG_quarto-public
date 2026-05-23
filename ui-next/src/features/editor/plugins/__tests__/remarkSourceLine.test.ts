import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import { remarkSourceLine } from '../remarkSourceLine';

describe('remarkSourceLine', () => {
    it('should add data-source-line attribute to block elements', async () => {
        const processor = unified()
            .use(remarkParse)
            .use(remarkSourceLine)
            .use(remarkRehype, { allowDangerousHtml: true })
            .use(rehypeStringify);

        const markdown = `# Heading 1

This is a paragraph.

## Heading 2

- List item 1
- List item 2
`;

        const vfile = await processor.process(markdown);
        const html = String(vfile);

        // Check for data-source-line attributes
        expect(html).toContain('data-source-line');
    });

    it('should add data-source-line to paragraphs', async () => {
        const processor = unified()
            .use(remarkParse)
            .use(remarkSourceLine)
            .use(remarkRehype, { allowDangerousHtml: true })
            .use(rehypeStringify);

        const markdown = `This is a paragraph.`;

        const vfile = await processor.process(markdown);
        const html = String(vfile);

        expect(html).toContain('data-source-line');
    });

    it('should add data-source-line to headings', async () => {
        const processor = unified()
            .use(remarkParse)
            .use(remarkSourceLine)
            .use(remarkRehype, { allowDangerousHtml: true })
            .use(rehypeStringify);

        const markdown = `# Heading 1
## Heading 2`;

        const vfile = await processor.process(markdown);
        const html = String(vfile);

        expect(html).toContain('data-source-line');
    });

    it('should add data-source-line to lists', async () => {
        const processor = unified()
            .use(remarkParse)
            .use(remarkSourceLine)
            .use(remarkRehype, { allowDangerousHtml: true })
            .use(rehypeStringify);

        const markdown = `- Item 1
- Item 2`;

        const vfile = await processor.process(markdown);
        const html = String(vfile);

        expect(html).toContain('data-source-line');
    });

    it('should add data-source-line to blockquotes', async () => {
        const processor = unified()
            .use(remarkParse)
            .use(remarkSourceLine)
            .use(remarkRehype, { allowDangerousHtml: true })
            .use(rehypeStringify);

        const markdown = `> This is a blockquote`;

        const vfile = await processor.process(markdown);
        const html = String(vfile);

        expect(html).toContain('data-source-line');
    });

    it('should add data-source-line to code blocks', async () => {
        const processor = unified()
            .use(remarkParse)
            .use(remarkSourceLine)
            .use(remarkRehype, { allowDangerousHtml: true })
            .use(rehypeStringify);

        const markdown = `\`\`\`javascript
const x = 1;
\`\`\``;

        const vfile = await processor.process(markdown);
        const html = String(vfile);

        expect(html).toContain('data-source-line');
    });
});
