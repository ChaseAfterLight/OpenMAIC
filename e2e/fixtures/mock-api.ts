import type { Page } from '@playwright/test';
import { mockOutlines } from './test-data/scene-outlines';
import { mockSceneContentResponse } from './test-data/scene-content';
import { createMockSceneActionsResponse } from './test-data/scene-actions';

/**
 * Wraps Playwright's page.route() to mock OpenMAIC API endpoints.
 * Supports both JSON and SSE (text/event-stream) responses.
 */
export class MockApi {
  constructor(private page: Page) {}

  async mockAuthSession() {
    await this.page.route('**/api/auth/me', (route) => {
      route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          authenticated: true,
          adminExists: true,
          user: {
            id: 'teacher-e2e',
            email: 'teacher@example.com',
            role: 'teacher',
          },
        }),
      });
    });
  }

  /** Mock the SSE outline streaming endpoint */
  async mockSceneOutlinesStream(outlines = mockOutlines) {
    await this.page.route('**/api/generate/scene-outlines-stream', (route) => {
      const events = outlines
        .map(
          (outline, i) =>
            `data: ${JSON.stringify({ type: 'outline', data: outline, index: i })}\n\n`,
        )
        .join('');
      const done = `data: ${JSON.stringify({ type: 'done', outlines })}\n\n`;

      route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
        body: events + done,
      });
    });
  }

  /** Mock the scene content generation endpoint */
  async mockSceneContent(response = mockSceneContentResponse) {
    await this.page.route('**/api/generate/scene-content', (route) => {
      route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(response),
      });
    });
  }

  /** Mock the scene actions generation endpoint */
  async mockSceneActions(stageId = 'test-stage') {
    await this.page.route('**/api/generate/scene-actions', (route) => {
      route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createMockSceneActionsResponse(stageId)),
      });
    });
  }

  /** Mock the server providers endpoint (returns empty — client-side config only) */
  async mockServerProviders() {
    await this.page.route('**/api/server-providers', (route) => {
      route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providers: {} }),
      });
    });
  }

  /** Set up API mocks for the generation flow. Note: server-providers is already mocked by the base fixture. */
  async setupGenerationMocks(stageId = 'test-stage') {
    await this.mockSceneOutlinesStream();
    await this.mockSceneContent();
    await this.mockSceneActions(stageId);
  }

  async mockCreateClassroomJob(jobId = 'job-123') {
    await this.page.route('**/api/generate-classroom', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.fallback();
        return;
      }

      await route.fulfill({
        status: 202,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          jobId,
          status: 'queued',
          step: 'queued',
          progress: 0,
          message: 'queued',
          previewUrl: `/generation-preview?jobId=${jobId}`,
          pollUrl: `/api/generate-classroom/${jobId}`,
          pollIntervalMs: 100,
          artifacts: {
            requirement: {
              requirementPreview: '讲解光合作用',
              language: 'zh-CN',
              hasPdf: false,
            },
          },
          inputSummary: {
            requirementPreview: '讲解光合作用',
            language: 'zh-CN',
            hasPdf: false,
            pdfTextLength: 0,
            pdfImageCount: 0,
            enableWebSearch: false,
            agentMode: 'default',
          },
        }),
      });
    });
  }

  async mockClassroomJobLifecycle(jobId = 'job-123', stageId = 'stage-job-1') {
    let pollCount = 0;

    await this.page.route(`**/api/generate-classroom/${jobId}`, async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 202,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            success: true,
            jobId,
            status: 'queued',
            step: 'queued',
            progress: 0,
            message: 'retry queued',
            pollUrl: `/api/generate-classroom/${jobId}`,
            pollIntervalMs: 100,
            scenesGenerated: 0,
            done: false,
          }),
        });
        return;
      }

      pollCount += 1;
      const succeeded = pollCount >= 3;
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          jobId,
          status: succeeded ? 'succeeded' : 'running',
          step: succeeded ? 'completed' : pollCount === 1 ? 'generating_outlines' : 'generating_scenes',
          progress: succeeded ? 100 : pollCount === 1 ? 30 : 75,
          message: succeeded ? 'completed' : 'running',
          pollUrl: `/api/generate-classroom/${jobId}`,
          pollIntervalMs: 100,
          scenesGenerated: succeeded ? 4 : 2,
          totalScenes: 4,
          artifacts: {
            requirement: {
              requirementPreview: '讲解光合作用',
              language: 'zh-CN',
              hasPdf: false,
            },
            outlines: [
              {
                id: 'outline-1',
                title: '导入',
                type: 'slide',
                order: 0,
              },
            ],
            content: succeeded
              ? [
                  {
                    id: 'scene-1',
                    title: '导入',
                    type: 'slide',
                    order: 0,
                    actionCount: 1,
                  },
                ]
              : undefined,
            final: succeeded
              ? {
                  classroomId: stageId,
                  url: `/classroom/${stageId}`,
                  scenesCount: 4,
                  stageName: '光合作用',
                }
              : undefined,
          },
          result: succeeded
            ? {
                classroomId: stageId,
                url: `/classroom/${stageId}`,
                scenesCount: 4,
                stageName: '光合作用',
              }
            : undefined,
          done: succeeded,
        }),
      });
    });
  }

  async mockClassroomResult(stageId = 'stage-job-1') {
    await this.page.route('**/api/classroom**', async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('id') !== stageId) {
        await route.fallback();
        return;
      }

      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          classroom: {
            id: stageId,
            createdAt: new Date().toISOString(),
            stage: {
              id: stageId,
              name: '光合作用',
              createdAt: Date.now(),
              updatedAt: Date.now(),
              lessonPack: {
                status: 'ready',
                exportStatus: 'not_exported',
              },
            },
            scenes: [
              {
                id: 'scene-1',
                stageId,
                type: 'slide',
                title: '导入',
                order: 0,
                content: {
                  type: 'slide',
                  canvas: {
                    id: 'canvas-1',
                    viewportSize: { width: 1000, height: 562 },
                    viewportRatio: 0.5625,
                    theme: { id: 'theme-1' },
                    elements: [],
                  },
                },
                actions: [],
              },
            ],
          },
        }),
      });
    });
  }
}
