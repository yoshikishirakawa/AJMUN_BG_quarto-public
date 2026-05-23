/**
 * Vitest setup file for testing
 * Provides mock implementations and test utilities
 */

import { vi, afterEach } from 'vitest';

// Mock window.electronAPI for web testing
globalThis.window = globalThis.window || {};

// Define electronAPI mock interface
interface ElectronAPIMock {
    invoke: (channel: string, ...args: any[]) => Promise<any>;
}

const mockElectronAPI: ElectronAPIMock = {
    invoke: vi.fn((channel: string, ...args: any[]) => {
        // Return mock data based on the channel
        switch (channel) {
            case 'project:load':
                return Promise.resolve({
                    version: '1.0',
                    metadata: { name: 'Test Project', author: 'Test Author' },
                    chapters: [],
                    style: {},
                    buildOptions: {},
                    lastBuildStatus: null,
                    lastBuildTime: null,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                });

            case 'project:save':
                return Promise.resolve({ status: 'success' });

            case 'chapter:get':
                return Promise.resolve({
                    chapter: {
                        id: args[0],
                        title: 'Test Chapter',
                        googleDocId: null,
                        localPath: 'content/test.qmd',
                        order: 0,
                        lastSync: null,
                        enabled: true,
                        type: 'document',
                        images: [],
                    },
                    content: '# Test Chapter\n\nThis is test content.',
                });

            case 'chapter:update':
                return Promise.resolve({ status: 'success' });

            case 'chapter:create':
                return Promise.resolve({
                    status: 'success',
                    chapter: {
                        id: 'ch_new',
                        title: args[0]?.title || 'New Chapter',
                        googleDocId: null,
                        localPath: 'content/new.qmd',
                        order: 0,
                        lastSync: null,
                        enabled: true,
                        type: 'document',
                        images: [],
                    },
                });

            case 'chapter:delete':
                return Promise.resolve({ status: 'success' });

            case 'chapter:update-metadata':
                return Promise.resolve({ status: 'success' });

            case 'chapter:sync':
                return Promise.resolve({ status: 'success', content: 'Synced content' });

            case 'chapter:commit-sync':
                return Promise.resolve({ status: 'success' });

            case 'docs:syncAll':
                return Promise.resolve({ status: 'success' });

            case 'openPath':
                // In web mode, opening files is a no-op
                return Promise.resolve({ status: 'success' });

            default:
                console.warn(`[Mock electronAPI] Unknown channel: ${channel}`, args);
                return Promise.resolve({ status: 'ok' });
        }
    }),
};

// Set window.electronAPI to use the mock
Object.defineProperty(window, 'electronAPI', {
    value: mockElectronAPI,
    writable: true,
    configurable: true,
});

// Mock matchMedia for responsive components
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    })),
});

// Setup cleanup after each test
afterEach(() => {
    vi.clearAllMocks();
});
