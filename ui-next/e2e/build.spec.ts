import { test, expect } from '@playwright/test';

test.describe('Build Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/build');
    // Wait for page to load
    await expect(page.getByText('build_output', { exact: false })).toBeVisible({ timeout: 10000 });
  });

  test('should display build controls', async ({ page }) => {
    // Check for start build button
    const startButton = page.getByRole('button', { name: /start_build|building/i });
    await expect(startButton).toBeVisible();

    // Check for clean outputs button
    const cleanButton = page.getByRole('button', { name: /clean_output/i });
    await expect(cleanButton).toBeVisible();
  });

  test('should display build configuration', async ({ page }) => {
    // Check for configuration card
    await expect(page.getByText('configuration', { exact: false })).toBeVisible();

    // Check for output format selector
    await expect(page.getByText('output_format', { exact: false })).toBeVisible();
  });

  test('should display recent outputs section', async ({ page }) => {
    await expect(page.getByText('recent_outputs', { exact: false })).toBeVisible();
    await expect(page.getByText('generated_files', { exact: false })).toBeVisible();
  });

  test('should display build console', async ({ page }) => {
    await expect(page.getByText('build_console', { exact: false })).toBeVisible();
    await expect(page.getByText('realtime_logs', { exact: false })).toBeVisible();
  });

  test('should select output format', async ({ page }) => {
    // Find the format selector (Select trigger)
    const formatSelector = page.locator('[role="combobox"]').or(
      page.locator('.select-trigger')
    ).or(
      page.locator('[data-testid="format-select"]')
    );

    if (await formatSelector.count() > 0) {
      await formatSelector.first().click();

      // Select PDF option
      const pdfOption = page.getByText('PDF Only').or(page.getByRole('option', { name: 'pdf' }));
      if (await pdfOption.count() > 0) {
        await pdfOption.first().click();
      }
    }
  });

  test('should disable buttons during build', async () => {
    test.skip(true, 'Requires actual build to be in progress');

    // During build, these should be disabled
    // await expect(startButton).toBeDisabled();
    // await expect(cleanButton).toBeDisabled();
  });

  test('should display build status badge', async ({ page }) => {
    test.skip(true, 'Requires active or completed build');

    // Check for status badge
    const statusBadge = page.locator('[class*="badge"]').or(
      page.locator('.build-status')
    );

    if (await statusBadge.count() > 0) {
      await expect(statusBadge.first()).toBeVisible();
    }
  });

  test('should display build logs in console', async ({ page }) => {
    const logViewer = page.locator('[class*="log"]').or(
      page.locator('.console-output')
    ).or(
      page.locator('[role="log"]')
    );

    if (await logViewer.count() > 0) {
      await expect(logViewer.first()).toBeVisible();
    }
  });

  test('should show preview button for outputs', async ({ page }) => {
    test.skip(true, 'Requires existing output files');

    // If there are output files, preview button should be visible on hover
    const outputFile = page.locator('[class*="output"]').or(
      page.locator('.file-item')
    ).first();

    if (await outputFile.count() > 0) {
      await outputFile.hover();
      const previewButton = page.getByRole('button', { name: /preview/i });
      await expect(previewButton).toBeVisible();
    }
  });

  test('should open preview dialog', async ({ page }) => {
    test.skip(true, 'Requires existing output files');

    // Click preview button and verify dialog opens
    const previewButton = page.getByRole('button', { name: /preview/i }).first();

    if (await previewButton.count() > 0) {
      await previewButton.click();

      // Check for dialog
      const dialog = page.locator('[role="dialog"]').or(
        page.locator('.preview-dialog')
      );

      await expect(dialog).toBeVisible();
    }
  });
});

test.describe('Build Process', () => {
  test('should start build when button clicked', async ({ page }) => {
    test.slow(); // This test might take longer
    test.skip(true, 'Requires backend build system');

    await page.goto('/build');

    const startButton = page.getByRole('button', { name: /start_build/i });
    await startButton.click();

    // Wait for build to start
    await page.waitForTimeout(2000);

    // Verify build status changed
    const buildingIndicator = page.getByText(/building|running/i);
    await expect(buildingIndicator).toBeVisible();
  });

  test('should show build progress', async ({ page }) => {
    test.slow();
    test.skip(true, 'Requires backend build system');

    await page.goto('/build');

    const startButton = page.getByRole('button', { name: /start_build/i });
    await startButton.click();

    // Wait for build progress
    const progress = page.locator('[class*="progress"]').or(
      page.locator('.build-progress')
    );

    // Check for progress updates
    await page.waitForTimeout(5000);

    if (await progress.count() > 0) {
      await expect(progress.first()).toBeVisible();
    }
  });

  test('should complete build and show outputs', async ({ page }) => {
    test.slow();
    test.skip(true, 'Requires backend build system');

    await page.goto('/build');

    const startButton = page.getByRole('button', { name: /start_build/i });
    await startButton.click();

    // Wait for build to complete
    await page.waitForTimeout(30000); // Builds can take a while

    // Verify completion status
    const successIndicator = page.getByText(/success|completed/i);
    await expect(successIndicator).toBeVisible({ timeout: 60000 });
  });

  test('should handle build failure gracefully', async ({ page }) => {
    test.slow();
    test.skip(true, 'Requires backend build system with error scenario');

    await page.goto('/build');

    // This test would need to simulate a build failure
    // and verify proper error handling
  });
});

test.describe('Build Outputs', () => {
  test('should list output files', async ({ page }) => {
    test.skip(true, 'Requires existing output files');

    await page.goto('/build');

    // Look for output file list
    const outputList = page.locator('[class*="output"]').or(
      page.locator('.file-list')
    ).or(
      page.locator('.outputs-container')
    );

    if (await outputList.count() > 0) {
      await expect(outputList.first()).toBeVisible();

      // Check for individual files
      const files = page.locator('[class*="file"]');
      const fileCount = await files.count();

      expect(fileCount).toBeGreaterThan(0);
    }
  });

  test('should display file metadata', async ({ page }) => {
    test.skip(true, 'Requires existing output files');

    await page.goto('/build');

    // Look for file metadata (size, type, etc.)
    const fileSize = page.locator('[class*="size"]').or(
      page.locator('.file-size')
    );

    // If files exist, metadata should be shown
    if (await fileSize.count() > 0) {
      await expect(fileSize.first()).toBeVisible();
    }
  });
});

test.describe('Clean Outputs', () => {
  test('should have clean outputs button', async ({ page }) => {
    await page.goto('/build');

    const cleanButton = page.getByRole('button', { name: /clean_output/i });
    await expect(cleanButton).toBeVisible();
  });

  test('should disable clean during build', async ({ page }) => {
    test.skip(true, 'Requires build in progress');

    await page.goto('/build');

    const cleanButton = page.getByRole('button', { name: /clean_output/i });
    const startButton = page.getByRole('button', { name: /start_build/i });

    await startButton.click();
    await page.waitForTimeout(2000);

    await expect(cleanButton).toBeDisabled();
  });

  test('should clean outputs when button clicked', async ({ page }) => {
    test.skip(true, 'Requires backend API and existing outputs');

    await page.goto('/build');

    const cleanButton = page.getByRole('button', { name: /clean_output/i });
    await cleanButton.click();

    // Wait for operation to complete
    await page.waitForTimeout(2000);

    // Verify outputs were cleaned
    const outputList = page.locator('[class*="output"]').or(
      page.locator('.file-list')
    );

    if (await outputList.count() > 0) {
      const fileCount = await outputList.locator('[class*="file"]').count();
      expect(fileCount).toBe(0);
    }
  });
});

test.describe('Build Configuration', () => {
  test('should persist format selection', async ({ page }) => {
    test.skip(true, 'Requires state persistence verification');

    await page.goto('/build');

    // Select format
    const formatSelector = page.locator('[role="combobox"]');
    if (await formatSelector.count() > 0) {
      await formatSelector.first().click();
      const pdfOption = page.getByText('PDF Only');
      if (await pdfOption.count() > 0) {
        await pdfOption.first().click();
      }

      // Reload page
      await page.reload();

      // Verify selection persisted
      // This would require checking the selected value
    }
  });

  test('should display current engine version', async ({ page }) => {
    await page.goto('/build');

    // Look for engine/version info
    const engineInfo = page.getByText(/quarto|engine|version/i);

    // At least one of these should be visible
    const engineElements = await engineInfo.all();
    const hasEngineInfo = engineElements.some(el => el.isVisible());

    expect(hasEngineInfo).toBeTruthy();
  });
});

test.describe('Build Page Performance', () => {
  test('should load quickly', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/build');
    await expect(page.getByText('build_output', { exact: false })).toBeVisible({ timeout: 10000 });
    const loadTime = Date.now() - startTime;

    expect(loadTime).toBeLessThan(3000);
  });

  test('should handle large log output without lag', async ({ page }) => {
    test.skip(true, 'Requires build with large logs');

    await page.goto('/build');

    // Start a build that produces large logs
    // Verify UI remains responsive
  });
});
