'use client';

import { Stage } from '@/components/stage';
import { ThemeProvider } from '@/lib/hooks/use-theme';
import { useStageStore } from '@/lib/store';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useMediaGenerationStore } from '@/lib/store/media-generation';
import { useWhiteboardHistoryStore } from '@/lib/store/whiteboard-history';
import { createLogger } from '@/lib/logger';
import { MediaStageProvider } from '@/lib/contexts/media-stage-context';
import { useI18n } from '@/lib/hooks/use-i18n';
import {
  startClassroomJobStream,
  type ClassroomJobStreamState,
} from '@/lib/client/classroom-job-stream';
import {
  getLiveClassroomJobId,
  clearLiveClassroomJobId,
  setLiveClassroomJobId,
  getLiveRegeneratingSceneId,
  setLiveRegeneratingSceneId,
  clearLiveRegeneratingSceneId,
} from '@/lib/client/classroom-live-job';
import { PENDING_SCENE_ID } from '@/lib/store/stage';
import type { Stage as StageType, Scene as SceneType } from '@/lib/types/stage';
import type { SceneOutline } from '@/lib/types/generation';
import { useUserProfileStore } from '@/lib/store/user-profile';
import { getCurrentModelConfig } from '@/lib/utils/model-config';
import { useSettingsStore } from '@/lib/store/settings';

const log = createLogger('Classroom');

function buildUserProfilePrompt() {
  const profile = useUserProfileStore.getState();
  if (!profile.nickname && !profile.bio) {
    return '';
  }
  return `## Student Profile\n\nStudent: ${profile.nickname || 'Unknown'}${profile.bio ? ` — ${profile.bio}` : ''}\n\nConsider this student's background when designing the course. Adapt difficulty, examples, and teaching approach accordingly.\n\n---`;
}

export default function ClassroomDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const classroomId = params?.id as string;
  const targetSceneId = searchParams.get('scene');
  const queryLiveJobId = searchParams.get('jobId');

  // 记录来源：如果是从详情页跳转，存储 packId
  useEffect(() => {
    const fromPack = searchParams.get('fromPack');
    if (fromPack) {
      sessionStorage.setItem(`classroom-${classroomId}-fromPack`, fromPack);
    }
  }, [classroomId, searchParams]);

  useEffect(() => {
    if (!classroomId) {
      setResolvedLiveJobId(null);
      setRegeneratingSceneId(null);
      setLiveJobReady(true);
      return;
    }

    const jobId = queryLiveJobId || getLiveClassroomJobId(classroomId);
    const rememberedRegeneratingSceneId = getLiveRegeneratingSceneId(classroomId);
    if (queryLiveJobId) {
      setLiveClassroomJobId(classroomId, queryLiveJobId);
    }
    if (!jobId) {
      clearLiveRegeneratingSceneId(classroomId);
    }
    setResolvedLiveJobId(jobId);
    setRegeneratingSceneId(jobId ? rememberedRegeneratingSceneId : null);
    setLiveJobReady(true);
  }, [classroomId, queryLiveJobId]);

  const { loadFromStorage, setCurrentSceneId } = useStageStore();
  const { t } = useI18n();
  const [authReady, setAuthReady] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolvedLiveJobId, setResolvedLiveJobId] = useState<string | null>(null);
  const [liveJobReady, setLiveJobReady] = useState(false);
  const [regeneratingSceneId, setRegeneratingSceneId] = useState<string | null>(null);

  const generationStartedRef = useRef(false);
  const liveJobStreamCloseRef = useRef<(() => void) | null>(null);
  const lastLiveRefreshKeyRef = useRef<string>('');
  const hydratedAgentStageRef = useRef<string | null>(null);

  const hydrateGeneratedAgents = useCallback(async () => {
    const stage = useStageStore.getState().stage;
    if (!stage?.generatedAgentConfigs?.length) {
      return;
    }
    if (hydratedAgentStageRef.current === stage.id) {
      return;
    }

    const { saveGeneratedAgents } = await import('@/lib/orchestration/registry/store');
    const { useSettingsStore } = await import('@/lib/store/settings');
    const agentIds = await saveGeneratedAgents(stage.id, stage.generatedAgentConfigs);
    useSettingsStore.getState().setSelectedAgentIds(agentIds);
    hydratedAgentStageRef.current = stage.id;
    log.info('Hydrated server-generated agents:', agentIds);
  }, []);

  const applyServerClassroomSnapshot = useCallback(
    async (classroom: {
      stage: StageType & { currentSceneId?: string };
      scenes: SceneType[];
      outlines?: SceneOutline[];
    }) => {
      const state = useStageStore.getState();
      const currentSceneId = state.currentSceneId;
      const currentScene = currentSceneId
        ? state.scenes.find((scene) => scene.id === currentSceneId) ?? null
        : null;
      const remoteSceneIds = new Set(classroom.scenes.map((scene) => scene.id));
      const remoteSceneOrders = new Set(classroom.scenes.map((scene) => scene.order));
      const mergedScenes = classroom.scenes.map((scene) =>
        currentSceneId && scene.id === currentSceneId
          ? (state.scenes.find((existing) => existing.id === scene.id) ?? scene)
          : scene,
      );

      for (const existing of state.scenes) {
        if (!remoteSceneIds.has(existing.id) && !remoteSceneOrders.has(existing.order)) {
          mergedScenes.push(existing);
        }
      }

      mergedScenes.sort((a, b) => a.order - b.order);

      const outlines = classroom.outlines ?? [];
      const generatingOutlines = outlines.filter(
        (outline) => !mergedScenes.some((scene) => scene.order === outline.order),
      );
      const nextCurrentSceneId =
        currentSceneId === PENDING_SCENE_ID && generatingOutlines.length > 0
          ? PENDING_SCENE_ID
          : currentSceneId && mergedScenes.some((scene) => scene.id === currentSceneId)
            ? currentSceneId
            : currentScene &&
                mergedScenes.some((scene) => scene.order === currentScene.order)
              ? (mergedScenes.find((scene) => scene.order === currentScene.order)?.id ?? null)
            : mergedScenes[0]?.id ?? (generatingOutlines.length > 0 ? PENDING_SCENE_ID : null);

      useStageStore.setState({
        stage: classroom.stage,
        scenes: mergedScenes,
        currentSceneId: nextCurrentSceneId,
        outlines,
        generatingOutlines,
      });

      await hydrateGeneratedAgents();
    },
    [hydrateGeneratedAgents],
  );

  const fetchServerClassroom = useCallback(async () => {
    const res = await fetch(`/api/classroom?id=${encodeURIComponent(classroomId)}`, {
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch classroom: HTTP ${res.status}`);
    }

    const json = await res.json();
    if (!json.success || !json.classroom) {
      throw new Error(json.error || 'Failed to load classroom');
    }

    await applyServerClassroomSnapshot(json.classroom);
    return json.classroom as {
      stage: StageType & { currentSceneId?: string };
      scenes: SceneType[];
      outlines?: SceneOutline[];
    };
  }, [applyServerClassroomSnapshot, classroomId]);

  const startClassroomGenerationJob = useCallback(
    async (payload?: { sceneId?: string; outlineId?: string }) => {
      const modelConfig = getCurrentModelConfig();
      const settings = useSettingsStore.getState();
      const response = await fetch(`/api/classroom/${encodeURIComponent(classroomId)}/generation-job`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...(payload?.sceneId ? { sceneId: payload.sceneId } : {}),
          ...(payload?.outlineId ? { outlineId: payload.outlineId } : {}),
          userProfile: buildUserProfilePrompt() || undefined,
          modelString: modelConfig.modelString,
          apiKey: modelConfig.apiKey || undefined,
          baseUrl: modelConfig.baseUrl || undefined,
          providerType: modelConfig.providerType || undefined,
          requiresApiKey: modelConfig.requiresApiKey,
          enableImageGeneration: Boolean(settings.imageGenerationEnabled),
          enableVideoGeneration: Boolean(settings.videoGenerationEnabled),
          enableTTS: Boolean(settings.ttsEnabled),
        }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        jobId?: string;
      };
      if (!response.ok || !data.success || !data.jobId) {
        throw new Error(data.error || 'Failed to start classroom generation job');
      }

      setLiveClassroomJobId(classroomId, data.jobId);
      setResolvedLiveJobId(data.jobId);
      return data.jobId;
    },
    [classroomId],
  );

  const retryOutlineViaJob = useCallback(
    async (outlineId: string) => {
      generationStartedRef.current = true;
      await startClassroomGenerationJob({ outlineId });
    },
    [startClassroomGenerationJob],
  );

  const regenerateSceneViaJob = useCallback(
    async (sceneId: string) => {
      generationStartedRef.current = true;
      setRegeneratingSceneId(sceneId);
      setLiveRegeneratingSceneId(classroomId, sceneId);
      try {
        await startClassroomGenerationJob({ sceneId });
      } catch (error) {
        setRegeneratingSceneId(null);
        clearLiveRegeneratingSceneId(classroomId);
        throw error;
      }
    },
    [classroomId, startClassroomGenerationJob],
  );

  useEffect(() => {
    let cancelled = false;
    async function checkAuth() {
      try {
        const res = await fetch('/api/auth/me', { cache: 'no-store' });
        const data = await res.json();
        if (cancelled) return;
        if (!data.authenticated) {
          window.location.href = data.adminExists ? '/auth/login' : '/setup/admin';
          return;
        }
        if (data.user?.role !== 'admin' && data.user?.role !== 'teacher') {
          window.location.href = '/forbidden';
          return;
        }
        setAuthReady(true);
      } catch {
        if (!cancelled) {
          window.location.href = '/auth/login';
        }
      }
    }
    void checkAuth();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadClassroom = useCallback(async () => {
    try {
      await loadFromStorage(classroomId);

      // If IndexedDB had no data, try server-side storage (API-generated classrooms)
      if (!useStageStore.getState().stage) {
        log.info('No IndexedDB data, trying server-side storage for:', classroomId);
        try {
          await fetchServerClassroom();
          log.info('Loaded from server-side storage:', classroomId);
        } catch (fetchErr) {
          log.warn('Server-side storage fetch failed:', fetchErr);
        }
      }

      // Restore completed media generation tasks from IndexedDB
      await useMediaGenerationStore.getState().restoreFromDB(classroomId);
      // Restore agents for this stage
      const { loadGeneratedAgentsForStage, useAgentRegistry } =
        await import('@/lib/orchestration/registry/store');
      const generatedAgentIds = await loadGeneratedAgentsForStage(classroomId);
      const { useSettingsStore } = await import('@/lib/store/settings');
      if (generatedAgentIds.length > 0) {
        // Auto mode — use generated agents from IndexedDB
        useSettingsStore.getState().setAgentMode('auto');
        useSettingsStore.getState().setSelectedAgentIds(generatedAgentIds);
      } else {
        // Preset mode — restore agent IDs saved in the stage at creation time.
        // Filter out any stale generated IDs that may have been persisted before
        // the bleed-fix, so they don't resolve against a leftover registry entry.
        const stage = useStageStore.getState().stage;
        const stageAgentIds = stage?.agentIds;
        const registry = useAgentRegistry.getState();
        const cleanIds = stageAgentIds?.filter((id) => {
          const a = registry.getAgent(id);
          return a && !a.isGenerated;
        });
        useSettingsStore.getState().setAgentMode('preset');
        useSettingsStore
          .getState()
          .setSelectedAgentIds(
            cleanIds && cleanIds.length > 0 ? cleanIds : ['default-1', 'default-2', 'default-3'],
          );
      }

      // 如果 URL 指定了场景 ID，跳转到对应场景
      if (targetSceneId) {
        const state = useStageStore.getState();
        const sceneExists = state.scenes.some((s) => s.id === targetSceneId);
        if (sceneExists) {
          setCurrentSceneId(targetSceneId);
        }
      }

      // 如果没有 fromPack 参数，但存在 sessionStorage 中的记录，说明是从详情页返回
      const storedFromPack = sessionStorage.getItem(`classroom-${classroomId}-fromPack`);
      if (storedFromPack && !targetSceneId) {
        // 已经在详情页上下文中，不需要额外操作
      }
    } catch (error) {
      log.error('Failed to load classroom:', error);
      setError(error instanceof Error ? error.message : 'Failed to load classroom');
    } finally {
      setLoading(false);
    }
  }, [classroomId, fetchServerClassroom, loadFromStorage, setCurrentSceneId, targetSceneId]);

  useEffect(() => {
    if (!authReady) return;
    if (!liveJobReady) return;
    // Reset loading state on course switch to unmount Stage during transition,
    // preventing stale data from syncing back to the new course
    setLoading(true);
    setError(null);
    generationStartedRef.current = false;
    lastLiveRefreshKeyRef.current = '';
    hydratedAgentStageRef.current = null;

    // Clear previous classroom's media tasks to prevent cross-classroom contamination.
    // Placeholder IDs (gen_img_1, gen_vid_1) are NOT globally unique across stages,
    // so stale tasks from a previous classroom would shadow the new one's.
    const mediaStore = useMediaGenerationStore.getState();
    mediaStore.revokeObjectUrls();
    useMediaGenerationStore.setState({ tasks: {} });

    // Clear whiteboard history to prevent snapshots from a previous course leaking in.
    useWhiteboardHistoryStore.getState().clearHistory();

    loadClassroom();

    // Cancel ongoing generation when classroomId changes or component unmounts
    return () => {
      liveJobStreamCloseRef.current?.();
      liveJobStreamCloseRef.current = null;
    };
  }, [authReady, classroomId, liveJobReady, loadClassroom]);

  // Auto-resume generation for pending outlines
  useEffect(() => {
    if (!authReady) return;
    if (!liveJobReady) return;
    if (resolvedLiveJobId) return;
    if (loading || error || generationStartedRef.current) return;

    const state = useStageStore.getState();
    const { outlines, scenes, stage } = state;

    // Check if there are pending outlines
    const completedOrders = new Set(scenes.map((s) => s.order));
    const hasPending = outlines.some((o) => !completedOrders.has(o.order));
    const shouldResumeJob = hasPending || stage?.lessonPack?.status === 'in_progress';

    if (!stage || !shouldResumeJob) return;

    generationStartedRef.current = true;
    void startClassroomGenerationJob().catch((jobError) => {
      generationStartedRef.current = false;
      log.warn('[Classroom] Failed to start resume job:', jobError);
    });
  }, [authReady, error, liveJobReady, loading, resolvedLiveJobId, startClassroomGenerationJob]);

  useEffect(() => {
    if (!authReady || !liveJobReady || loading || error || !resolvedLiveJobId) {
      return;
    }

    let cancelled = false;

    const refreshFromServer = async () => {
      try {
        await fetchServerClassroom();
      } catch (syncError) {
        log.warn('[Classroom] Live classroom refresh failed:', syncError);
      }
    };

    const syncProgressState = (job: ClassroomJobStreamState) => {
      if (cancelled) {
        return;
      }

      if (job.status === 'failed') {
        useStageStore.getState().setGenerationStatus('paused');
        setRegeneratingSceneId(null);
        clearLiveRegeneratingSceneId(classroomId);
      } else if (job.done) {
        useStageStore.getState().setGenerationStatus('completed');
        setRegeneratingSceneId(null);
        clearLiveRegeneratingSceneId(classroomId);
      } else {
        useStageStore.getState().setGenerationStatus('generating');
      }
    };

    const maybeRefreshForJob = (job: ClassroomJobStreamState) => {
      const refreshKey = `${job.scenesGenerated}:${job.step}:${job.status}`;
      const shouldRefresh =
        job.scenesGenerated > 0 &&
        (job.scenesGenerated !== useStageStore.getState().scenes.length ||
          ['generating_media', 'generating_tts', 'persisting', 'completed'].includes(job.step) ||
          job.status === 'failed');

      syncProgressState(job);

      if (shouldRefresh && refreshKey !== lastLiveRefreshKeyRef.current) {
        lastLiveRefreshKeyRef.current = refreshKey;
        void refreshFromServer();
      }

      if (job.done && job.status === 'succeeded') {
        clearLiveClassroomJobId(classroomId);
        clearLiveRegeneratingSceneId(classroomId);
        setResolvedLiveJobId(null);
        const nextParams = new URLSearchParams(searchParams.toString());
        if (nextParams.has('jobId')) {
          nextParams.delete('jobId');
          const nextQuery = nextParams.toString();
          router.replace(
            nextQuery ? `/classroom/${classroomId}?${nextQuery}` : `/classroom/${classroomId}`,
          );
        }
      } else if (job.done && job.result?.classroomId) {
        clearLiveClassroomJobId(job.result.classroomId);
        clearLiveRegeneratingSceneId(job.result.classroomId);
        setResolvedLiveJobId(null);
      } else if (job.done) {
        clearLiveClassroomJobId(classroomId);
        clearLiveRegeneratingSceneId(classroomId);
        setResolvedLiveJobId(null);
      }
    };

    const startLiveSync = async () => {
      try {
        const res = await fetch(`/api/generate-classroom/${resolvedLiveJobId}`, {
          cache: 'no-store',
        });
        if (!res.ok) {
          throw new Error(`Failed to load live job: HTTP ${res.status}`);
        }

        const data = await res.json();
        if (!data.success) {
          throw new Error(data.error || 'Failed to load live job');
        }

        const job = (data.job ?? data) as ClassroomJobStreamState;
        maybeRefreshForJob(job);

        if (job.done) {
          return;
        }

        const stream = startClassroomJobStream({
          job,
          onUpdate: (nextJob) => {
            maybeRefreshForJob(nextJob);
          },
          onTerminal: (nextJob) => {
            maybeRefreshForJob(nextJob);
          },
          onError: (message) => {
            log.warn('[Classroom] Live job stream issue:', message);
          },
        });
        liveJobStreamCloseRef.current = stream.close;
      } catch (streamError) {
        log.warn('[Classroom] Failed to start live classroom sync:', streamError);
      }
    };

    void startLiveSync();

    return () => {
      cancelled = true;
      liveJobStreamCloseRef.current?.();
      liveJobStreamCloseRef.current = null;
    };
  }, [
    authReady,
    classroomId,
    error,
    fetchServerClassroom,
    liveJobReady,
    loading,
    resolvedLiveJobId,
    router,
    searchParams,
  ]);

  return (
    <ThemeProvider>
      <MediaStageProvider value={classroomId}>
        <div className="h-screen flex flex-col overflow-hidden">
          {!authReady ? (
            <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
              <div className="text-center text-muted-foreground">
                <p>{t('auth.checkingSession')}</p>
              </div>
            </div>
          ) : loading ? (
            <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
              <div className="text-center text-muted-foreground">
                <p>{t('common.loading')}</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
              <div className="text-center">
                <p className="text-destructive mb-4">Error: {error}</p>
                <button
                  onClick={() => {
                    setError(null);
                    setLoading(true);
                    loadClassroom();
                  }}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                >
                  Retry
                </button>
              </div>
            </div>
          ) : (
            <Stage
              onRetryOutline={retryOutlineViaJob}
              onRegenerateScene={regenerateSceneViaJob}
              regeneratingSceneId={regeneratingSceneId}
            />
          )}
        </div>
      </MediaStageProvider>
    </ThemeProvider>
  );
}
