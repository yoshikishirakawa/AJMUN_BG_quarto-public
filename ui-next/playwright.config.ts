import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: 'list',
    use: {
        baseURL: 'http://localhost:5173',
        trace: 'on-first-retry',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    webServer: {
        command: 'bash ../start-dev.sh',
        url: 'http://localhost:5173',
        reuseExistingServer: true,
        env: {
            ADMIN_SECRET: 'playwright-admin-secret',
            SESSION_SECRET: 'playwright-session-secret',
            AUTH_BYPASS_ENABLED: 'true',
            VITE_AUTH_BYPASS_ENABLED: 'true',
            ALLOWED_REDIRECT_URIS: 'http://localhost:5173/auth/callback',
        },
    },
});
