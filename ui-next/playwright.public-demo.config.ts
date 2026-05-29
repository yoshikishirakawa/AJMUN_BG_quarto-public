import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './e2e-public-demo',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: 1,
    reporter: 'list',
    use: {
        baseURL: 'http://127.0.0.1:4173/editor/',
        trace: 'on-first-retry',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    webServer: {
        command: 'python3 -m http.server 4173 --bind 127.0.0.1 --directory ../sample-outputs',
        url: 'http://127.0.0.1:4173/editor/index.html',
        reuseExistingServer: true,
    },
});
