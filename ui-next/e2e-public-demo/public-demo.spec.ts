import { expect, Page, test } from '@playwright/test';

const openDemo = async (page: Page, route = '/') => {
  const mutationRequests: string[] = [];
  page.on('request', (request) => {
    if (/\/api\//.test(request.url()) && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) {
      mutationRequests.push(`${request.method()} ${request.url()}`);
    }
  });
  await page.goto(`index.html#${route}`);
  await expect(page.getByText('AJMUN BG Editor 公開デモ', { exact: true })).toBeVisible();
  return mutationRequests;
};

test('loads without authentication and disables persistent operations', async ({ page }) => {
  const mutationRequests = await openDemo(page, '/editor/introduction');

  await expect(page).not.toHaveURL(/login/);
  await expect(page.getByText('保存、ビルド、認証、Google Docs 連携、アップロードは利用できません。')).toBeVisible();
  await expect(page.getByRole('button', { name: /Save|保存/ })).toBeDisabled();

  await page.goto('index.html#/build');
  await expect(page.getByRole('button', { name: 'HTML / PDF を生成' })).toBeDisabled();
  await expect(page.getByRole('button', { name: /Google Docs/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Google Docs/ })).toHaveCount(0);
  expect(mutationRequests).toEqual([]);
});

test('image group controls remain read-only without API mutations', async ({ page }) => {
  const mutationRequests = await openDemo(page, '/editor/image-gallery-sample');

  await expect(page.getByText('公開デモでは画像の追加、削除、並べ替えは利用できません。')).toBeVisible();
  await expect(page.locator('input[type="file"]')).toBeDisabled();
  await expect(page.getByRole('button', { name: '公開デモでは画像を削除できません' }).first()).toBeDisabled();
  await expect(page.locator('img[alt="preview"]').first()).toBeVisible();
  expect(mutationRequests).toEqual([]);
});

test('full-page image controls remain read-only without API mutations', async ({ page }) => {
  const mutationRequests = await openDemo(page, '/editor/fullpage-image-sample');

  await expect(page.getByText('公開デモでは画像の追加、削除、並べ替え、設定変更は利用できません。')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add Image' })).toBeDisabled();
  await expect(page.locator('input[type="file"]')).toBeDisabled();
  await expect(page.getByRole('button', { name: '公開デモでは画像を削除できません' }).first()).toBeDisabled();
  await expect(page.locator('button[role="combobox"]').first()).toBeDisabled();
  await expect(page.locator('img[alt="Preview"]').first()).toBeVisible();
  expect(mutationRequests).toEqual([]);
});
