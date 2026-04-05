export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return;
  }

  const { createLogger } = await import('@/lib/logger');
  const log = createLogger('Instrumentation');

  try {
    const { ensureClassroomJobStartupMaintenance } =
      await import('@/lib/server/classroom-job-startup-maintenance');
    await ensureClassroomJobStartupMaintenance();
  } catch (error) {
    log.error('课堂生成 Job 启动恢复失败:', error);
  }
}
