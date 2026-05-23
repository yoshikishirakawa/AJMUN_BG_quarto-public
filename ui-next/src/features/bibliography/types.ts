export type BibliographyType =
    | 'book'
    | 'article'
    | 'techreport'
    | 'inproceedings'
    | 'misc'
    | 'manual'
    | 'thesis';

export interface BibliographyEntry {
    id: string;
    type: BibliographyType;
    title?: string;
    author?: string; // "Smith, John"
    year?: string | number;

    // Book / InProceedings
    publisher?: string;
    booktitle?: string;
    editor?: string;
    edition?: string;

    // Article
    journal?: string;
    volume?: string;
    number?: string;
    pages?: string;

    // TechReport / Thesis
    institution?: string;

    // Common / Misc
    url?: string;
    doi?: string;
    note?: string;
    howpublished?: string;

    // Internal
    accessed?: string;
}

export interface BibliographySection {
    references: BibliographyEntry[];
}

export interface BibliographyFile {
    sections: BibliographySection[];
    chapter_name?: string;
}

export const BIBLIOGRAPHY_TYPES: { value: BibliographyType; label: string }[] = [
    { value: 'book', label: '書籍 (Book)' },
    { value: 'article', label: '論文 (Article)' },
    { value: 'techreport', label: 'レポート (TechReport)' },
    { value: 'inproceedings', label: '会議録 (InProceedings)' },
    { value: 'misc', label: 'その他 (Misc/Web)' },
];

export const FIELDS_BY_TYPE: Record<BibliographyType, (keyof BibliographyEntry)[]> = {
    book: ['title', 'author', 'year', 'publisher', 'edition', 'editor', 'url', 'note'],
    article: ['title', 'author', 'year', 'journal', 'volume', 'number', 'pages', 'url', 'doi', 'note'],
    techreport: ['title', 'author', 'year', 'institution', 'number', 'url', 'note'],
    inproceedings: ['title', 'author', 'year', 'booktitle', 'publisher', 'pages', 'url', 'note'],
    misc: ['title', 'author', 'year', 'howpublished', 'url', 'accessed', 'note'],
    manual: ['title', 'author', 'year', 'organization', 'url', 'note'] as any,
    thesis: ['title', 'author', 'year', 'school', 'url', 'note'] as any,
};
