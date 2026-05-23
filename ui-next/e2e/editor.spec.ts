import { test, expect } from '@playwright/test';

test.describe('Editor Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/editor');
    // Wait for the editor to load
    await expect(page.locator('.cm-editor')).toBeVisible({ timeout: 10000 });
  });

  test('should load editor component', async ({ page }) => {
    await expect(page.locator('.cm-editor')).toBeVisible();
  });

  test('should display content in editor', async ({ page }) => {
    const editor = page.locator('.cm-content');
    await expect(editor).toBeVisible();
    // Check that editor has some content
    const textContent = await editor.textContent();
    expect(textContent?.length).toBeGreaterThan(0);
  });

  test('should type text in editor', async ({ page }) => {
    const editor = page.locator('.cm-content');
    await editor.click();

    // Type some text
    await page.keyboard.type('# Test Heading\n\nThis is test content.');

    // Verify text was entered
    await expect(editor).toContainText('Test Heading');
    await expect(editor).toContainText('This is test content.');
  });

  test('should sync scroll between editor and preview', async ({ page }) => {
    test.skip(true, 'Scroll sync test requires actual content and proper setup');

    const editorScroller = page.locator('.cm-scroller');
    // Scroll editor
    await editorScroller.evaluate((el) => el.scrollTop = 500);

    // Wait for sync
    await page.waitForTimeout(500);

    // Verify preview scrolled (would need actual implementation)
    // This is a placeholder for future implementation
  });

  test('should display preview', async ({ page }) => {
    const preview = page.locator('.preview-container');
    await expect(preview).toBeVisible();
  });

  test('should update preview when editor content changes', async ({ page }) => {
    const editor = page.locator('.cm-content');
    const preview = page.locator('.preview-container');

    // Get initial preview content
    const initialPreviewContent = await preview.textContent();

    // Type in editor
    await editor.click();
    await page.keyboard.type('# New Heading\n\nNew content.');

    // Wait for preview to update
    await page.waitForTimeout(1000);

    // Verify preview changed
    const updatedPreviewContent = await preview.textContent();
    expect(updatedPreviewContent).not.toBe(initialPreviewContent);
  });
});

test.describe('Editor Markdown Features', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/editor');
    await expect(page.locator('.cm-editor')).toBeVisible({ timeout: 10000 });
  });

  test('should render headings in preview', async ({ page }) => {
    const editor = page.locator('.cm-content');
    await editor.click();

    await page.keyboard.type('# Heading 1');
    await page.waitForTimeout(500);

    const preview = page.locator('.preview-container');
    await expect(preview.locator('h1')).toContainText('Heading 1');
  });

  test('should render lists in preview', async ({ page }) => {
    const editor = page.locator('.cm-content');
    await editor.click();

    await page.keyboard.type('- Item 1\n- Item 2\n- Item 3');
    await page.waitForTimeout(500);

    const preview = page.locator('.preview-container');
    await expect(preview.locator('ul')).toBeVisible();
    await expect(preview.locator('li')).toHaveCount(3);
  });

  test('should render code blocks in preview', async ({ page }) => {
    const editor = page.locator('.cm-content');
    await editor.click();

    await page.keyboard.type('```javascript\nconst x = 1;\n```');
    await page.waitForTimeout(500);

    const preview = page.locator('.preview-container');
    await expect(preview.locator('pre')).toBeVisible();
    await expect(preview.locator('code')).toContainText('const x = 1;');
  });

  test('should render blockquotes in preview', async ({ page }) => {
    const editor = page.locator('.cm-content');
    await editor.click();

    await page.keyboard.type('> This is a quote');
    await page.waitForTimeout(500);

    const preview = page.locator('.preview-container');
    await expect(preview.locator('blockquote')).toBeVisible();
    await expect(preview.locator('blockquote')).toContainText('This is a quote');
  });
});

test.describe('Table Insertion', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/editor');
    await expect(page.locator('.cm-editor')).toBeVisible({ timeout: 10000 });
  });

  test('should open insert table modal', async ({ page }) => {
    const insertButton = page.getByRole('button', { name: /insert table/i });
    await expect(insertButton).toBeVisible();
    await insertButton.click();

    // Modal should appear
    await expect(page.locator('[role="dialog"]')).toBeVisible();
  });

  test('should insert table when confirmed', async ({ page }) => {
    // Open table modal
    const insertButton = page.getByRole('button', { name: /insert table/i });
    await insertButton.click();

    // Set table dimensions (adjust selectors based on actual UI)
    await page.waitForTimeout(500);

    // This test would need actual implementation of the modal interaction
    // Placeholder for future implementation
  });
});

test.describe('Split Pane Resizing', () => {
  test('should display split pane with editor and preview', async ({ page }) => {
    await page.goto('/editor');
    await expect(page.locator('.cm-editor')).toBeVisible();
    await expect(page.locator('.preview-container')).toBeVisible();
  });

  test('should have resizable split pane', async ({ page }) => {
    await page.goto('/editor');

    // Note: This test depends on the actual split pane implementation
    // Adjust selector accordingly
  });
});

test.describe('Editor Performance', () => {
  test('should load quickly', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/editor');
    await expect(page.locator('.cm-editor')).toBeVisible({ timeout: 10000 });
    const loadTime = Date.now() - startTime;

    // Should load in less than 5 seconds
    expect(loadTime).toBeLessThan(5000);
  });

  test('should handle large document without lag', async ({ page }) => {
    test.slow(); // This test might take longer

    await page.goto('/editor');
    const editor = page.locator('.cm-content');
    await editor.click();

    // Type a large amount of text
    const startTime = Date.now();
    for (let i = 0; i < 50; i++) {
      await page.keyboard.type(`Line ${i}: Some text content here.\n`);
    }
    const typingTime = Date.now() - startTime;

    // Typing should complete in reasonable time
    expect(typingTime).toBeLessThan(10000);
  });
});

test.describe('Editor Shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/editor');
    await expect(page.locator('.cm-editor')).toBeVisible({ timeout: 10000 });
  });

  test('should save content on keyboard shortcut', async ({ page }) => {
    test.skip(true, 'Save shortcut implementation pending');

    const editor = page.locator('.cm-content');
    await editor.click();
    await page.keyboard.type('Test content');

    // Trigger save shortcut (Cmd+S / Ctrl+S)
    await page.keyboard.press((process.platform === 'darwin' ? 'Meta' : 'Control') + '+s');

    // Wait for save to complete
    await page.waitForTimeout(1000);

    // Verify save occurred (would need toast notification or similar)
  });

  test('should handle undo/redo', async ({ page }) => {
    const editor = page.locator('.cm-content');
    await editor.click();

    await page.keyboard.type('Initial text');

    // Undo
    await page.keyboard.press((process.platform === 'darwin' ? 'Meta' : 'Control') + '+z');
    await page.waitForTimeout(100);

    const contentAfterUndo = await editor.textContent();
    expect(contentAfterUndo).not.toContain('Initial text');

    // Redo
    await page.keyboard.press((process.platform === 'darwin' ? 'Meta+Shift' : 'Control+Shift') + '+z');
    await page.waitForTimeout(100);

    const contentAfterRedo = await editor.textContent();
    expect(contentAfterRedo).toContain('Initial text');
  });
});
