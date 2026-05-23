import axios from 'axios';

// In development with Vite proxy, we use relative path.
// For now, assuming standard HTTP communication with the local FastAPI server.
const API_BASE_URL = ''; // Relative path for Vite proxy

export const api = axios.create({
    baseURL: API_BASE_URL,
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json',
    },
});

export const apiClient = api; // Alias for backward compatibility


export interface AppSessionStatus {
    authenticated: boolean;
    role?: 'admin' | 'invited_editor' | null;
    invite_id?: string | null;
    label?: string | null;
    auth_bypass?: boolean;
}

export interface GoogleAuthStatus {
    enabled: boolean;
    authenticated: boolean;
    configured: boolean;
    email?: string | null;
    name?: string | null;
    picture?: string | null;
}

export interface InviteInfo {
    id: string;
    label?: string | null;
    role: 'invited_editor';
    createdAt: string;
    updatedAt?: string | null;
    revokedAt?: string | null;
    lastUsedAt?: string | null;
    expiresAt?: string | null;
    active: boolean;
}

export interface BuildOutputFile {
    type: 'html' | 'pdf';
    path: string;
    name: string;
    size: number;
    modified: string;
    label?: string;
    pdfType?: 'root' | 'print' | 'pc' | 'raksul';
    htmlType?: 'landing' | 'chapter' | 'other';
}

// App Auth API
export const appAuth = {
    getSession: () => api.get<AppSessionStatus>('/api/v1/auth/session'),
    adminLogin: (secret: string) => api.post<AppSessionStatus>('/api/v1/auth/admin/login', { secret }),
    inviteLogin: (token: string) => api.post<AppSessionStatus>('/api/v1/auth/invite-login', { token }),
    logout: () => api.post('/api/v1/auth/logout'),
    listInvites: () => api.get<InviteInfo[]>('/api/v1/auth/invites'),
    createInvite: (label?: string) => api.post('/api/v1/auth/invites', { label }),
    revokeInvite: (inviteId: string) => api.post(`/api/v1/auth/invites/${inviteId}/revoke`),
    revokeAllInvites: () => api.post('/api/v1/auth/invites/revoke-all'),
};

// Google Auth API
export const googleAuth = {
    getStatus: () => api.get<GoogleAuthStatus>('/api/v1/auth/google/status'),
    login: (redirectUri: string) => api.get('/api/v1/auth/google/login', { params: { redirect_uri: redirectUri } }),
    exchangeToken: (code: string, redirectUri: string, state: string) =>
        api.post('/api/v1/auth/google/token', { code, redirect_uri: redirectUri, state }),
    logout: () => api.post('/api/v1/auth/google/logout'),
    uploadCredentials: (file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        return api.post('/api/v1/auth/google/credentials', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
    },
};

// Project API
export const project = {
    get: () => api.get('/api/v1/project/'),
    update: (project: any) => api.put('/api/v1/project/', project),
    updateMetadata: (metadata: any) => api.put('/api/v1/project/metadata', metadata),
    updateStyle: (style: any) => api.put('/api/v1/project/style', style),
    updateChaptersOrder: (chapterIds: string[], chapterOrder?: string[]) =>
        api.put('/api/v1/project/chapters/order', { chapter_ids: chapterIds, chapterOrder }),
    // V1 API endpoints
    getChapter: (id: string) => api.get(`/api/v1/project/chapters/${id}`),
    createChapter: (chapter: any) => api.post('/api/v1/project/chapters', chapter),
    updateChapter: (id: string, content: string) => api.put(`/api/v1/project/chapters/${id}/content`, { content }),
    updateChapterMetadata: (id: string, data: any) => api.put(`/api/v1/project/chapters/${id}`, data),
    deleteChapter: (id: string) => api.delete(`/api/v1/project/chapters/${id}`),
    getChapterContent: (id: string) => api.get(`/api/v1/project/chapters/${id}/content`),
    // Special chapter types
    createImageGroup: (title: string) => api.post('/api/v1/project/chapters/image-group', { title }),
    createFullpageImageChapter: (title: string) => api.post('/api/v1/project/chapters/fullpage-image', { title }),
    // Image management
    updateChapterImages: (id: string, images: any[]) => api.put(`/api/v1/project/chapters/${id}/images`, images),
    uploadImage: (id: string, file: File, options?: { width?: string; fit?: string; position?: string }) => {
        const formData = new FormData();
        formData.append('file', file);
        if (options?.width) formData.append('width', options.width);
        if (options?.fit) formData.append('fit', options.fit);
        if (options?.position) formData.append('position', options.position);
        return api.post(`/api/v1/project/chapters/${id}/images`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
    },
    // Config API
    getRawConfig: () => api.get('/api/v1/project/config/raw'),
    updateRawConfig: (content: string) => api.put('/api/v1/project/config/raw', { content }),
};

// Build API
export const buildApi = {
    start: (format: 'html' | 'pdf' | 'all' = 'html', clean = false, chapters?: string[]) =>
        api.post('/api/v1/build/start', { format, clean, chapters }),
    getStatus: () => api.get('/api/v1/build/status'),
    getOutputs: () => api.get<{ outputs: BuildOutputFile[] }>('/api/v1/build/outputs'),
    deleteOutputs: () => api.delete('/api/v1/build/outputs'),
};

// GDoc API
export const gdocApi = {
    list: (query?: string) => api.get('/api/v1/docs/list', { params: { q: query } }),
    import: (docId: string, title?: string) => api.post('/api/v1/docs/import', { doc_id: docId, title }),
    importMarkdown: (file: File, title?: string) => {
        const formData = new FormData();
        formData.append('file', file);
        if (title) formData.append('title', title);
        return api.post('/api/v1/docs/import-markdown', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
    },
};

// System API
export const systemApi = {
    getStatus: () => api.get('/api/v1/system/status'),
    installQuarto: () => api.post('/api/v1/system/install/quarto'),
    installTex: () => api.post('/api/v1/system/install/tex'),
};

// Settings API
export const settingsApi = {
    getAll: () => api.get('/api/settings/'),
    updateAll: (settings: any) => api.put('/api/settings/', settings),
    updateProject: (project: any) => api.put('/api/settings/project', project),
    updatePdf: (pdf: any) => api.put('/api/settings/pdf', pdf),
    updateColors: (colors: any) => api.put('/api/settings/colors', colors),
    updateHtml: (html: any) => api.put('/api/settings/html', html),
    getChapters: () => api.get('/api/settings/chapters'),
    updateChapters: (chapters: any[]) => api.put('/api/settings/chapters', { chapters }),
    syncToYml: () => api.post('/api/settings/sync', {}),
    // PDF Advanced Settings
    updateTypography: (settings: TypographySettings) => api.put('/api/settings/pdf/typography', settings),
    updateLayout: (settings: LayoutSettings) => api.put('/api/settings/pdf/layout', settings),
    updateToc: (settings: TOCSettings) => api.put('/api/settings/pdf/toc', settings),
    updateRules: (settings: RuleSettings) => api.put('/api/settings/pdf/rules', settings),
    updateImages: (settings: ImageSettings) => api.put('/api/settings/pdf/images', settings),
    updateFootnotes: (settings: FootnoteSettings) => api.put('/api/settings/pdf/footnotes', settings),
    updateQuotes: (settings: QuoteSettings) => api.put('/api/settings/pdf/quotes', settings),
    updateCodeBlocks: (settings: CodeBlockSettings) => api.put('/api/settings/pdf/codeblocks', settings),
    updateHeadings: (settings: HeadingSettings) => api.put('/api/settings/pdf/headings', settings),
    // Footer text
    getFooterText: () => api.get<{ footer_text: string }>('/api/settings/pdf/footer'),
    updateFooterText: (footerText: string) => api.put('/api/settings/pdf/footer', { footer_text: footerText }),
};

// PDF Advanced Settings Types
export interface TypographySettings {
    lineSpacing?: number;
    paragraphSpacing?: number;
    indentFirstLine?: boolean;
    indentSize?: number;
    justify?: boolean;
}

export interface LayoutSettings {
    columns?: number;
    pageNumberStyle?: string;
    pageNumberPosition?: string;
    pageNumberStart?: number;
    showPageNumberFirst?: boolean;
    headerStyle?: string;
}

export interface TOCSettings {
    maxLevel?: number;
    dotLeader?: boolean;
    includeChapters?: boolean;
    includeSections?: boolean;
    includeSubsections?: boolean;
}

export interface RuleSettings {
    showPageBorder?: boolean;
    showChapterDivider?: boolean;
    chapterDividerStyle?: string;
    tableVerticalLines?: boolean;
}

export interface ImageSettings {
    defaultAlign?: string;
    captionStyle?: string;
    captionPosition?: string;
    margin?: number;
}

export interface FootnoteSettings {
    markStyle?: string;
    placement?: string;
    fontScale?: number;
}

export interface QuoteSettings {
    style?: string;
    indent?: number;
    borderStyle?: string;
    background?: boolean;
}

export interface CodeBlockSettings {
    theme?: string;
    fontFamily?: string;
    background?: boolean;
    border?: boolean;
}

// Heading Settings Types
export interface ChapterHeadingSettings {
    fontSize?: number;
    fontFamily?: 'mincho' | 'gothic';
    alignment?: 'left' | 'center' | 'right';
    color?: string;  // 'titleblue', 'black', 'gray', or hex
    bold?: boolean;
    spacingBefore?: number;
    spacingAfter?: number;
}

export interface SectionHeadingSettings {
    fontSize?: number;
    fontFamily?: 'mincho' | 'gothic';
    alignment?: 'left' | 'center' | 'right';
    color?: string;
    bold?: boolean;
    leftBorderStyle?: 'none' | 'single' | 'double' | 'thick';
    leftBorderWidth?: number;
    spacingBefore?: number;
    spacingAfter?: number;
}

export interface SubsectionHeadingSettings {
    fontSize?: number;
    fontFamily?: 'mincho' | 'gothic';
    alignment?: 'left' | 'center' | 'right';
    color?: string;
    bold?: boolean;
    leftBorderStyle?: 'none' | 'single' | 'double' | 'thick';
    leftBorderWidth?: number;
    spacingBefore?: number;
    spacingAfter?: number;
}

export interface SubsubsectionHeadingSettings {
    fontSize?: number;
    fontFamily?: 'mincho' | 'gothic';
    alignment?: 'left' | 'center' | 'right';
    color?: string;
    bold?: boolean;
    leftBorderStyle?: 'none' | 'single' | 'double' | 'thick';
    leftBorderWidth?: number;
    spacingBefore?: number;
    spacingAfter?: number;
}

export interface HeadingSettings {
    chapter?: ChapterHeadingSettings;
    section?: SectionHeadingSettings;
    subsection?: SubsectionHeadingSettings;
    subsubsection?: SubsubsectionHeadingSettings;
    baseFontSize?: number;
}

// Color Types
export interface ColorPreset {
    name: string;
    colors: {
        titleblue?: string;
        headerblue?: string;
        lawheaderbg?: string;
        lawheadertext?: string;
        lawbodybg?: string;
        lawborder?: string;
        linkblue?: string;
        blockquotebg?: string;
        railactive?: string;
        railinactive?: string;
        railcursor?: string;
        hlyellow?: string;
        hlgreen?: string;
        hlred?: string;
        hlblue?: string;
        hlpurple?: string;
    };
}

export interface ColorsSettings {
    preset: string;
    presets: Record<string, ColorPreset>;
    custom: ColorPreset['colors'];
}
