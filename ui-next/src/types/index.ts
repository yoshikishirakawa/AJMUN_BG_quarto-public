export type ChapterType = 'document' | 'image_group' | 'fullpage_image';

export interface FullpageImageConfig {
  path: string;
  caption?: string;
  width?: 'a4' | 'a3' | 'a5' | '100%' | string;
  fit?: 'stretch' | 'contain';
  position?: 'center' | 'top' | 'bottom';
}

export interface Chapter {
  id: string;
  title: string;
  order: number;
  content?: string; // Markdown content, loaded on demand
  localPath: string;
  googleDocId?: string;
  lastSync?: string;
  status?: 'synced' | 'modified' | 'conflict';
  type?: ChapterType;
  images?: FullpageImageConfig[];
}

export interface ProjectMetadata {
  title: string;
  author: string;
  date: string;
  version?: string; // Backend doesn't explicitly guarantee version in metadata block in _init_from_quarto
  description?: string;
}

export interface ProjectData {
  version: string;
  metadata: ProjectMetadata;
  chapters: Chapter[];
  chapterOrder?: string[];
  style: {
    primaryColor: string;
    typography: {
      fontSize: number;
      lineHeight: number;
      letterSpacing: number;
      headingScale: number;
      fontFamilyMincho: string;
      fontFamilyGothic: string;
    };
    layout: {
      paperSize: string;
      columns: number;
      sidebar: boolean;
      margins: { top: number; bottom: number; left: number; right: number };
    };
    paragraph: {
      indent: boolean;
      indentSize: number;
      spacing: number;
      justify: boolean;
    };
    visuals: {
      blockquoteStyle: string;
      linkColor: string;
      codeBlockTheme: string;
    };
    pdf: {
      documentclass: string;
      classoption: string[];
      geometry: string[];
      mainfont: string;
      sansfont: string;
    };
    html: {
      toc: boolean;
      numberSections: boolean;
      codeFold: boolean;
      theme: string;
    };
  };
  buildOptions: {
    cleanBuild: boolean;
    syncBeforeBuild: boolean;
    generateSingleHtml: boolean;
  };
  conversionRules: any[];
  createdAt: string;
  updatedAt: string;
}
