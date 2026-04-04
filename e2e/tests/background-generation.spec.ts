import { test, expect } from '../fixtures/base';

test.describe('Background Lesson Pack Generation', () => {
  test('restores the same job after refresh and can open the generated classroom', async ({
    page,
    mockApi,
  }) => {
    await mockApi.mockClassroomJobLifecycle('job-restore', 'stage-restore-1');
    await mockApi.mockClassroomResult('stage-restore-1');

    await page.goto('/generation-preview?jobId=job-restore');
    await expect(page.getByRole('heading', { name: /后台生成中 |Generation In Progress/i })).toBeVisible();

    await page.reload();
    await expect(
      page.getByRole('heading', { name: /Lesson Pack Ready|备课包已生成完成/i }),
    ).toBeVisible();

    await page.goto('/generation-preview?jobId=job-restore');
    await expect(page.getByRole('button', { name: /进入编辑器 |Open Editor/i })).toBeVisible({
      timeout: 10_000,
    });

    await page.getByRole('button', { name: /进入编辑器 |Open Editor/i }).click();
    await page.waitForURL(/\/classroom\/stage-restore-1/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/classroom\/stage-restore-1/);
  });
});
