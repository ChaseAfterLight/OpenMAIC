import { mkdtemp, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let storageRoot = '';

async function loadTestContext() {
  vi.resetModules();

  const { NextRequest } = await import('next/server');
  const auth = await import('@/lib/server/auth');
  const adminRoute = await import('@/app/api/admin/textbooks/route');
  const teacherRoute = await import('@/app/api/k12/textbooks/route');

  const adminUser = await auth.registerUser({
    email: 'admin@example.com',
    password: 'password123',
    role: 'admin',
    displayName: 'Admin',
  });
  const teacherUser = await auth.registerUser({
    email: 'teacher@example.com',
    password: 'password123',
    role: 'teacher',
    displayName: 'Teacher',
  });
  const studentUser = await auth.registerUser({
    email: 'student@example.com',
    password: 'password123',
    role: 'student',
    displayName: 'Student',
  });

  const adminSession = await auth.loginUser({
    email: 'admin@example.com',
    password: 'password123',
  });
  const teacherSession = await auth.loginUser({
    email: 'teacher@example.com',
    password: 'password123',
  });
  const studentSession = await auth.loginUser({
    email: 'student@example.com',
    password: 'password123',
  });

  const cookieName = auth.getAuthCookieName();

  function makeRequest(url: string, sessionId: string, init?: RequestInit) {
    return new NextRequest(url, {
      method: init?.method,
      body: init?.body,
      headers: new Headers({
        'content-type': 'application/json',
        cookie: `${cookieName}=${sessionId}`,
        ...(init?.headers instanceof Headers
          ? Object.fromEntries(init.headers.entries())
          : ((init?.headers as Record<string, string> | undefined) ?? {})),
      }),
    });
  }

  return {
    adminRoute,
    teacherRoute,
    adminUser,
    teacherUser,
    studentUser,
    adminSession,
    teacherSession,
    studentSession,
    makeRequest,
  };
}

describe('k12 textbook catalog routes', () => {
  beforeEach(async () => {
    storageRoot = await mkdtemp(path.join(os.tmpdir(), 'openmaic-k12-catalog-'));
    process.env.SERVER_STORAGE_BACKEND = 'file';
    process.env.SERVER_STORAGE_ROOT = storageRoot;
  });

  afterEach(async () => {
    delete process.env.SERVER_STORAGE_BACKEND;
    delete process.env.SERVER_STORAGE_ROOT;
    vi.resetModules();
    if (storageRoot) {
      await rm(storageRoot, { recursive: true, force: true });
      storageRoot = '';
    }
  });

  it('blocks non-admin users from admin catalog route', async () => {
    const { adminRoute, studentSession, makeRequest } = await loadTestContext();
    const response = await adminRoute.GET(
      makeRequest('http://localhost/api/admin/textbooks', studentSession.sessionId),
    );

    expect(response.status).toBe(403);
  });

  it('keeps teacher reads on published catalog until admin publishes draft changes', async () => {
    const { adminRoute, teacherRoute, adminSession, teacherSession, makeRequest } =
      await loadTestContext();

    const initialTeacherRes = await teacherRoute.GET(
      makeRequest('http://localhost/api/k12/textbooks', teacherSession.sessionId),
    );
    const initialTeacherJson = (await initialTeacherRes.json()) as {
      editions: Array<{ volumes: Array<{ units: Array<{ chapters: Array<{ title: string }> }> }> }>;
    };
    const originalTitle = initialTeacherJson.editions[0].volumes[0].units[0].chapters[0].title;

    const adminGetRes = await adminRoute.GET(
      makeRequest('http://localhost/api/admin/textbooks', adminSession.sessionId),
    );
    const adminGetJson = (await adminGetRes.json()) as {
      draft: {
        editions: Array<{ volumes: Array<{ units: Array<{ chapters: Array<{ title: string }> }> }> }>;
      };
    };
    adminGetJson.draft.editions[0].volumes[0].units[0].chapters[0].title = 'Draft Only Chapter';

    const saveRes = await adminRoute.PUT(
      makeRequest('http://localhost/api/admin/textbooks', adminSession.sessionId, {
        method: 'PUT',
        body: JSON.stringify({ editions: adminGetJson.draft.editions }),
      }),
    );
    expect(saveRes.status).toBe(200);

    const teacherAfterDraftRes = await teacherRoute.GET(
      makeRequest('http://localhost/api/k12/textbooks', teacherSession.sessionId),
    );
    const teacherAfterDraftJson = (await teacherAfterDraftRes.json()) as {
      editions: Array<{ volumes: Array<{ units: Array<{ chapters: Array<{ title: string }> }> }> }>;
    };
    expect(teacherAfterDraftJson.editions[0].volumes[0].units[0].chapters[0].title).toBe(
      originalTitle,
    );

    const publishRes = await adminRoute.POST(
      makeRequest('http://localhost/api/admin/textbooks', adminSession.sessionId, {
        method: 'POST',
        body: JSON.stringify({ action: 'publish' }),
      }),
    );
    expect(publishRes.status).toBe(200);

    const teacherAfterPublishRes = await teacherRoute.GET(
      makeRequest('http://localhost/api/k12/textbooks', teacherSession.sessionId),
    );
    const teacherAfterPublishJson = (await teacherAfterPublishRes.json()) as {
      editions: Array<{ volumes: Array<{ units: Array<{ chapters: Array<{ title: string }> }> }> }>;
    };
    expect(teacherAfterPublishJson.editions[0].volumes[0].units[0].chapters[0].title).toBe(
      'Draft Only Chapter',
    );
  });
});
