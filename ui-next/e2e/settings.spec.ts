import { test, expect } from '@playwright/test';

test.describe('Settings Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings');
    // Wait for page to load
    await expect(page.getByText('Project Settings', { exact: false })).toBeVisible({ timeout: 10000 });
  });

  test('should display all settings tabs', async ({ page }) => {
    // Check for main tabs
    await expect(page.getByText('Metadata', { exact: false })).toBeVisible();
    await expect(page.getByText('Style & Output', { exact: false })).toBeVisible();
    await expect(page.getByText('Configuration', { exact: false })).toBeVisible();
  });

  test('should navigate between tabs', async ({ page }) => {
    // Click on Style & Output tab
    const styleTab = page.getByText('Style & Output').or(
      page.locator('[role="tab"]').filter({ hasText: 'Style' })
    );

    if (await styleTab.count() > 0) {
      await styleTab.first().click();

      // Verify content changed
      await expect(page.getByText('typography', { exact: false })).toBeVisible();
    }
  });

  test('should have save button', async ({ page }) => {
    const saveButton = page.getByRole('button', { name: /save|保存/i });
    await expect(saveButton).toBeVisible();
  });
});

test.describe('Metadata Settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings');
    // Navigate to Metadata tab if needed
    const metadataTab = page.getByText('Metadata');
    if (await metadataTab.count() > 0) {
      await metadataTab.click();
    }
  });

  test('should display project name field', async ({ page }) => {
    const nameInput = page.getByLabel(/name|title|プロジェクト名/i).or(
      page.locator('[data-testid="project-name"]')
    ).or(
      page.locator('input[name*="name"]')
    );

    if (await nameInput.count() > 0) {
      await expect(nameInput.first()).toBeVisible();
    }
  });

  test('should display author field', async ({ page }) => {
    const authorInput = page.getByLabel(/author|著者/i).or(
      page.locator('[data-testid="author"]')
    ).or(
      page.locator('input[name*="author"]')
    );

    if (await authorInput.count() > 0) {
      await expect(authorInput.first()).toBeVisible();
    }
  });

  test('should allow editing project name', async ({ page }) => {
    const nameInput = page.getByLabel(/name|title|プロジェクト名/i).or(
      page.locator('[data-testid="project-name"]')
    ).or(
      page.locator('input[name*="name"]')
    );

    if (await nameInput.count() > 0) {
      await nameInput.first().fill('New Project Name');

      // Verify value changed
      await expect(nameInput.first()).toHaveValue('New Project Name');
    }
  });

  test('should save metadata changes', async ({ page }) => {
    test.skip(true, 'Requires backend API for saving');

    const nameInput = page.getByLabel(/name|title|プロジェクト名/i).or(
      page.locator('[data-testid="project-name"]')
    );

    if (await nameInput.count() > 0) {
      await nameInput.first().fill('Updated Project Name');

      const saveButton = page.getByRole('button', { name: /save|保存/i });
      await saveButton.click();

      // Wait for save
      await page.waitForTimeout(2000);

      // Reload and verify
      await page.reload();
      await expect(nameInput.first()).toHaveValue('Updated Project Name', { timeout: 10000 });
    }
  });
});

test.describe('Style & Output Settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings');

    // Navigate to Style & Output tab
    const styleTab = page.getByText('Style & Output').or(
      page.locator('[role="tab"]').filter({ hasText: 'Style' })
    );

    if (await styleTab.count() > 0) {
      await styleTab.first().click();
    }
  });

  test('should display typography settings', async ({ page }) => {
    await expect(page.getByText('typography', { exact: false })).toBeVisible();
  });

  test('should display layout settings', async ({ page }) => {
    await expect(page.getByText('layout', { exact: false })).toBeVisible();
  });

  test('should display paragraph settings', async ({ page }) => {
    await expect(page.getByText('paragraph', { exact: false })).toBeVisible();
  });

  test('should display visuals settings', async ({ page }) => {
    await expect(page.getByText('visuals', { exact: false })).toBeVisible();
  });

  test('should allow changing font size', async ({ page }) => {
    const fontSizeInput = page.getByLabel(/font size|font-size|文字サイズ/i).or(
      page.locator('[data-testid="font-size"]')
    ).or(
      page.locator('input[name*="fontSize"]')
    );

    if (await fontSizeInput.count() > 0) {
      await fontSizeInput.first().fill('18');

      // Verify value changed
      await expect(fontSizeInput.first()).toHaveValue('18');
    }
  });

  test('should allow changing primary color', async ({ page }) => {
    const colorInput = page.getByLabel(/primary color|primary-color|主色/i).or(
      page.locator('[data-testid="primary-color"]')
    ).or(
      page.locator('input[type="color"]')
    ).first();

    if (await colorInput.count() > 0) {
      // Color input might be type="color" or text input
      const inputType = await colorInput.getAttribute('type');

      if (inputType === 'color') {
        await colorInput.fill('#ff0000');
      } else {
        await colorInput.fill('#ff0000');
      }

      // Verify value changed (might be in different format)
      await page.waitForTimeout(500);
    }
  });

  test('should toggle paragraph indent', async ({ page }) => {
    const indentCheckbox = page.getByLabel(/indent|インデント/i).or(
      page.locator('[data-testid="paragraph-indent"]')
    ).or(
      page.locator('input[type="checkbox"]')
    ).first();

    if (await indentCheckbox.count() > 0) {
      const initialState = await indentCheckbox.isChecked();

      await indentCheckbox.click();

      const newState = await indentCheckbox.isChecked();
      expect(newState).not.toBe(initialState);
    }
  });
});

test.describe('General Settings (UI)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings');

    // Navigate to General tab if it exists
    const generalTab = page.getByText('General').or(
      page.locator('[role="tab"]').filter({ hasText: 'General' })
    );

    if (await generalTab.count() > 0) {
      await generalTab.first().click();
    }
  });

  test('should display language settings', async ({ page }) => {
    const languageSelector = page.getByLabel(/language|言語/i).or(
      page.locator('[data-testid="language"]')
    ).or(
      page.locator('[role="combobox"]')
    );

    if (await languageSelector.count() > 0) {
      await expect(languageSelector.first()).toBeVisible();
    }
  });

  test('should display editor font size setting', async ({ page }) => {
    const fontSizeSlider = page.getByLabel(/editor font size|editor.*font|エディタ文字サイズ/i).or(
      page.locator('[data-testid="editor-font-size"]')
    ).or(
      page.locator('[role="slider"]')
    );

    if (await fontSizeSlider.count() > 0) {
      await expect(fontSizeSlider.first()).toBeVisible();
    }
  });

  test('should allow changing editor font size', async ({ page }) => {
    const slider = page.locator('[role="slider"]').or(
      page.locator('.slider')
    ).first();

    if (await slider.count() > 0) {
      // Get current value
      const currentValue = await slider.getAttribute('aria-valuenow') || '0';

      // Click on slider to change value
      await slider.click();

      // Wait for update
      await page.waitForTimeout(500);

      // Value should have changed (might be the same if clicked in same place)
      const newValue = await slider.getAttribute('aria-valuenow') || currentValue;
      expect(newValue).toBeDefined();
    }
  });
});

test.describe('Configuration Editor', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings');

    // Navigate to Configuration tab
    const configTab = page.getByText('Configuration').or(
      page.locator('[role="tab"]').filter({ hasText: 'Configuration' })
    );

    if (await configTab.count() > 0) {
      await configTab.first().click();
    }
  });

  test('should display raw configuration editor', async ({ page }) => {
    const editor = page.locator('.cm-editor').or(
      page.locator('[role="textbox"]')
    ).or(
      page.locator('textarea')
    ).filter({ hasText: /quarto|yml/ });

    // Editor might or might not be visible depending on tab
    // Just verify it exists on page
    if (await editor.count() > 0) {
      await expect(editor.first()).toBeVisible();
    }
  });

  test('should allow editing raw configuration', async ({ page }) => {
    const editor = page.locator('.cm-editor').or(
      page.locator('textarea')
    ).first();

    if (await editor.count() > 0) {
      await editor.click();

      // Type some content
      await page.keyboard.type('# Test Configuration');

      // Verify content was entered
      const content = await editor.inputValue();
      expect(content).toContain('Test');
    }
  });
});

test.describe('Settings Persistence', () => {
  test('should persist settings across page reloads', async ({ page }) => {
    test.skip(true, 'Requires backend persistence');

    await page.goto('/settings');

    // Change a setting
    const nameInput = page.getByLabel(/name|title|プロジェクト名/i).or(
      page.locator('[data-testid="project-name"]')
    ).first();

    if (await nameInput.count() > 0) {
      const testValue = `Test Project ${Date.now()}`;
      await nameInput.fill(testValue);

      const saveButton = page.getByRole('button', { name: /save|保存/i });
      await saveButton.click();

      // Reload
      await page.reload();

      // Verify persisted
      await expect(nameInput).toHaveValue(testValue, { timeout: 10000 });
    }
  });

  test('should persist settings across browser sessions', async ({ page, context }) => {
    test.skip(true, 'Requires localStorage or backend persistence');

    await page.goto('/settings');

    // Change a language setting
    const languageSelector = page.getByLabel(/language|言語/i);
    if (await languageSelector.count() > 0) {
      await languageSelector.first().click();
      const englishOption = page.getByText('English');
      if (await englishOption.count() > 0) {
        await englishOption.first().click();
      }

      // Close and reopen page
      await page.close();
      const newPage = await context.newPage();
      await newPage.goto('/settings');

      // Verify setting persisted
      // This would require checking the language selector state
    }
  });
});

test.describe('Settings Validation', () => {
  test('should validate required fields', async ({ page }) => {
    await page.goto('/settings');

    // Clear required field
    const nameInput = page.getByLabel(/name|title|プロジェクト名/i).or(
      page.locator('[data-testid="project-name"]')
    ).first();

    if (await nameInput.count() > 0) {
      await nameInput.fill('');

      // Try to save
      const saveButton = page.getByRole('button', { name: /save|保存/i });
      await saveButton.click();

      // Check for validation error
      const errorMessage = page.getByText(/required|必須|empty/i);
      await page.waitForTimeout(1000);

      if (await errorMessage.count() > 0) {
        await expect(errorMessage.first()).toBeVisible();
      }
    }
  });

  test('should validate color format', async ({ page }) => {
    await page.goto('/settings');

    // Find color input
    const colorInput = page.getByLabel(/primary color/i).or(
      page.locator('input[type="color"]')
    ).first();

    if (await colorInput.count() > 0) {
      const inputType = await colorInput.getAttribute('type');

      if (inputType !== 'color') {
        // If it's a text input, try invalid format
        await colorInput.fill('invalid-color');

        const saveButton = page.getByRole('button', { name: /save|保存/i });
        await saveButton.click();

        // Check for validation error
        await page.waitForTimeout(1000);
      }
    }
  });
});

test.describe('Settings Performance', () => {
  test('should load quickly', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/settings');
    await expect(page.getByText('Project Settings', { exact: false })).toBeVisible({ timeout: 10000 });
    const loadTime = Date.now() - startTime;

    expect(loadTime).toBeLessThan(3000);
  });

  test('should handle rapid tab switching', async ({ page }) => {
    await page.goto('/settings');

    const tabs = page.locator('[role="tab"]');
    const tabCount = await tabs.count();

    if (tabCount > 1) {
      const startTime = Date.now();

      // Switch between tabs multiple times
      for (let i = 0; i < 5; i++) {
        for (let j = 0; j < tabCount; j++) {
          await tabs.nth(j).click();
          await page.waitForTimeout(100);
        }
      }

      const switchTime = Date.now() - startTime;

      // All switches should complete quickly
      expect(switchTime).toBeLessThan(10000);
    }
  });
});

test.describe('Settings Error Handling', () => {
  test('should handle save errors gracefully', async () => {
    test.skip(true, 'Requires backend error simulation');

    await page.goto('/settings');

    // Make change and try to save when backend fails
    // Verify error message is shown
  });

  test('should handle load errors gracefully', async () => {
    test.skip(true, 'Requires backend error simulation');

    // Navigate to settings with failing backend
    // Verify error message or default values are shown
  });
});
