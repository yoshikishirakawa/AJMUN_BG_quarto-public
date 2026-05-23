import { test, expect } from '@playwright/test';

test('has title', async ({ page }) => {
    await page.goto('/');

    // Expect a title "to contain" a substring.
    // Note: The app title might update dynamically, but "AJMUN" or "Editor" should be there
    // Based on specific page content:
    await expect(page).toHaveTitle(/AJMUN|Vite/);
});

test('navigation to editor', async ({ page }) => {
    await page.goto('/');

    // Wait for loading to finish (if any)
    // We look for the dashboard or sidebar
    await expect(page.getByText('Dashboard')).toBeVisible({ timeout: 10000 });

    // Click the Editor link
    await page.getByRole('link', { name: 'Editor' }).click();

    // Expects page to have a heading with the name of Editor or the editor component
    await expect(page.getByRole('link', { name: 'Editor' })).toHaveClass(/bg-secondary/); // Active state
});

test('settings page loads', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByText('Project Settings')).toBeVisible();
    await expect(page.getByText('Metadata')).toBeVisible();
    await expect(page.getByText('Style & Output')).toBeVisible();
});
