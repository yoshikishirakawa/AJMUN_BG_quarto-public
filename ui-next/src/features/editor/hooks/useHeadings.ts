import { useEffect, useState } from 'react';
import { EditorState } from '@codemirror/state';

interface Heading {
    id: string;
    text: string;
    level: number;
    children?: Heading[];
}

export const useHeadings = (editorState: EditorState | null) => {
    const [headings, setHeadings] = useState<Heading[]>([]);
    const docText = editorState?.doc.toString();

    useEffect(() => {
        if (!docText) {
            setHeadings([]);
            return;
        }

        const headingRegex = /^(#{1,6})\s+(.+)$/gm;
        const extractedHeadings: Heading[] = [];
        const stack: Heading[] = [];

        let match;
        while ((match = headingRegex.exec(docText)) !== null) {
            const level = match[1].length;
            const text = match[2].trim();
            const id = text.toLowerCase().replace(/\s+/g, '-');

            const heading: Heading = { id, text, level };

            // 階層構造を構築
            while (stack.length > 0 && stack[stack.length - 1].level >= level) {
                stack.pop();
            }

            if (stack.length > 0) {
                const parent = stack[stack.length - 1];
                if (!parent.children) {
                    parent.children = [];
                }
                parent.children.push(heading);
            } else {
                extractedHeadings.push(heading);
            }

            stack.push(heading);
        }

        setHeadings(extractedHeadings);
    }, [docText]);

    return headings;
};
