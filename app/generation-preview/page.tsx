'use client';

import { useEffect, useState, Suspense, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, Sparkles, AlertCircle, AlertTriangle, ArrowLeft, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { OutlinesEditor } from '@/components/generation/outlines-editor';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/lib/store/settings';
import { useAgentRegistry } from '@/lib/orchestration/registry/store';
import { getAvailableProvidersWithVoices } from '@/lib/audio/voice-resolver';
import { useI18n } from '@/lib/hooks/use-i18n';
import {
  loadImageMapping,
  loadPdfBlob,
  cleanupOldImages,
  storeImages,
  ensureServerStoredPdfImages,
} from '@/lib/utils/image-storage';
import { getCurrentModelConfig } from '@/lib/utils/model-config';
import { MAX_PDF_CONTENT_CHARS, MAX_VISION_IMAGES } from '@/lib/constants/generation';
import { nanoid } from 'nanoid';
import type { Stage } from '@/lib/types/stage';
import type { SceneOutline, PdfImage, ImageMapping } from '@/lib/types/generation';
import { AgentRevealModal } from '@/components/agent/agent-reveal-modal';
import { createLogger } from '@/lib/logger';
import { getStorageAdapter } from '@/lib/storage';
import {
  buildEducationLessonPackTitle,
  buildEducationResourceReferenceText,
  getEducationModulePresets,
  isEducationWorkbenchModuleId,
  mergeEducationResourcesIntoReferenceText,
  resolveEducationLessonPackMetadata,
} from '@/lib/module-host/education';
import {
  type K12ModulePresets,
  type K12TextbookResource,
  type SupportedLocale,
} from '@/lib/module-host/types';
import {
  startClassroomJobStream,
  type ClassroomJobStreamState,
} from '@/lib/client/classroom-job-stream';
import { setLiveClassroomJobId, clearLiveClassroomJobId } from '@/lib/client/classroom-live-job';
import { type GenerationSessionState, ALL_STEPS, getActiveSteps } from './types';
import { StepVisualizer } from './components/visualizers';
import type { OutlineReviewDraft } from '@/lib/types/generation';
import { loadStageData, loadStageOutlinesRecord, saveStageOutlinesRecord } from '@/lib/utils/stage-storage';

const log = createLogger('GenerationPreview');

function mergeSelectedTextbookResourcesIntoPdfText(
  session: GenerationSessionState,
): GenerationSessionState {
  const resources = session.selectedTextbookResources ?? [];
  if (resources.length === 0) {
    return session;
  }

  const locale = session.requirements.language === 'zh-CN' ? 'zh-CN' : 'en-US';
  const resourceReference = buildEducationResourceReferenceText({
    resources,
    locale,
  });
  if (!resourceReference) {
    return session;
  }

  const currentPdfText = session.pdfText ?? '';
  const nextPdfText = mergeEducationResourcesIntoReferenceText({
    baseText: currentPdfText,
    resources,
    locale,
  });
  if (nextPdfText === currentPdfText) {
    return session;
  }

  return {
    ...session,
    pdfText: nextPdfText,
  };
}

type ParsedPdfAsset = {
  text: string;
  images: PdfImage[];
};

function getSelectedTextbookPdfResources(
  session: GenerationSessionState,
): Array<K12TextbookResource & { url: string }> {
  return (session.selectedTextbookResources ?? []).filter(
    (resource): resource is K12TextbookResource & { url: string } =>
      resource.type === 'pdf' && typeof resource.url === 'string' && resource.url.trim().length > 0,
  );
}

function inferTextbookResourceFilename(resource: K12TextbookResource, index: number) {
  const baseName = resource.title?.trim() || `textbook-resource-${index + 1}`;
  return baseName.toLowerCase().endsWith('.pdf') ? baseName : `${baseName}.pdf`;
}

function appendPdfSectionText(args: {
  baseText: string;
  sectionTitle: string;
  sectionText: string;
  locale: SupportedLocale;
}) {
  const { baseText, sectionTitle, sectionText, locale } = args;
  const normalizedText = sectionText.trim();
  if (!normalizedText) {
    return baseText;
  }

  const heading =
    locale === 'zh-CN'
      ? `教材章节 PDF《${sectionTitle}》解析内容：`
      : `Parsed textbook chapter PDF "${sectionTitle}":`;

  return [baseText, `${heading}\n${normalizedText}`].filter(Boolean).join('\n\n');
}

async function parsePdfFileToAsset(args: {
  file: File;
  providerId?: string;
  providerConfig?: { apiKey?: string; baseUrl?: string };
  signal: AbortSignal;
}): Promise<ParsedPdfAsset> {
  const { file, providerId, providerConfig, signal } = args;
  const parseFormData = new FormData();
  parseFormData.append('pdf', file);

  if (providerId) {
    parseFormData.append('providerId', providerId);
  }
  if (providerConfig?.apiKey?.trim()) {
    parseFormData.append('apiKey', providerConfig.apiKey);
  }
  if (providerConfig?.baseUrl?.trim()) {
    parseFormData.append('baseUrl', providerConfig.baseUrl);
  }

  const parseResponse = await fetch('/api/parse-pdf', {
    method: 'POST',
    body: parseFormData,
    signal,
  });

  if (!parseResponse.ok) {
    const errorData = await parseResponse.json().catch(() => ({}));
    throw new Error(String(errorData.error || 'PDF parse failed'));
  }

  const parseResult = await parseResponse.json();
  if (!parseResult.success || !parseResult.data) {
    throw new Error('PDF parse failed');
  }

  const images = parseResult.data.metadata?.pdfImages
    ? parseResult.data.metadata.pdfImages.map(
        (img: {
          id: string;
          src?: string;
          pageNumber?: number;
          description?: string;
          width?: number;
          height?: number;
        }) => ({
          id: img.id,
          src: img.src || '',
          pageNumber: img.pageNumber || 1,
          description: img.description,
          width: img.width,
          height: img.height,
        }),
      )
    : (parseResult.data.images as string[]).map((src: string, i: number) => ({
        id: `img_${i + 1}`,
        src,
        pageNumber: 1,
      }));

  return {
    text: String(parseResult.data.text || ''),
    images,
  };
}

function buildLessonPackMetadata(session: GenerationSessionState, locale: SupportedLocale) {
  if (
    !isEducationWorkbenchModuleId(session.requirements.moduleId) ||
    !session.requirements.k12
  ) {
    return undefined;
  }

  const presets = getEducationModulePresets(session.requirements.moduleId) as
    | K12ModulePresets
    | undefined;
  if (!presets) {
    return {
      durationMinutes: session.requirements.k12.durationMinutes,
      status: 'draft' as const,
      exportStatus: 'not_exported' as const,
    };
  }
  const resolved = resolveEducationLessonPackMetadata({
    input: session.requirements.k12,
    presets,
    locale,
  });

  return {
    ...resolved,
    status: 'draft' as const,
    exportStatus: 'not_exported' as const,
  };
}

type PreviewAgent = {
  id: string;
  name: string;
  role: string;
  persona?: string;
};

function buildPreviewStage(session: GenerationSessionState): Stage {
  const locale = (session.requirements.language === 'zh-CN' ? 'zh-CN' : 'en-US') as SupportedLocale;
  const educationPresets = getEducationModulePresets(session.requirements.moduleId) as
    | K12ModulePresets
    | undefined;
  const requirement = session.requirements.requirement.trim();
  const isEducationModule = isEducationWorkbenchModuleId(session.requirements.moduleId);

  return {
    id: nanoid(10),
    name:
      isEducationModule
        ? buildEducationLessonPackTitle({
            input: session.requirements.k12,
            presets: educationPresets,
            locale,
            requirement: session.requirements.requirement,
            supplementaryPdfName: session.pdfFileName,
          })
        : requirement || 'Untitled Classroom',
    description: '',
    language: session.requirements.language || 'zh-CN',
    style: 'professional',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lessonPack: buildLessonPackMetadata(session, locale),
  };
}

function buildOutlineReviewDraft(session: GenerationSessionState): OutlineReviewDraft {
  return {
    requirements: session.requirements,
    pdfText: session.pdfText,
    pdfImages: session.pdfImages,
    imageStorageIds: session.imageStorageIds,
    imageMapping: session.imageMapping,
    pdfStorageKey: session.pdfStorageKey,
    pdfFileName: session.pdfFileName,
    documentType: session.documentType,
    pdfProviderId: session.pdfProviderId,
    pdfProviderConfig: session.pdfProviderConfig,
    selectedTextbookResources: session.selectedTextbookResources,
    selectedTextbookResourcesParsed: session.selectedTextbookResourcesParsed,
    researchContext: session.researchContext,
    researchSources: session.researchSources,
  };
}

async function persistOutlineReviewDraft(args: {
  stage: Stage;
  session: GenerationSessionState;
  outlines: SceneOutline[];
}): Promise<Stage> {
  const storage = getStorageAdapter();
  const now = Date.now();
  const nextStage: Stage = {
    ...args.stage,
    createdAt: args.stage.createdAt || now,
    updatedAt: now,
  };

  await storage.saveStageRecord({
    id: nextStage.id,
    ownerUserId: nextStage.ownerUserId,
    name: nextStage.name,
    description: nextStage.description,
    createdAt: nextStage.createdAt,
    updatedAt: nextStage.updatedAt,
    lessonPack: nextStage.lessonPack,
    language: nextStage.language,
    style: nextStage.style,
    agentIds: nextStage.agentIds,
  });
  await saveStageOutlinesRecord(nextStage.id, {
    outlines: args.outlines,
    reviewDraft: buildOutlineReviewDraft(args.session),
  });

  return nextStage;
}

function resolvePreviewAgents(previewStage?: Stage): PreviewAgent[] {
  const registry = useAgentRegistry.getState();
  const candidateIds =
    previewStage?.agentIds && previewStage.agentIds.length > 0
      ? previewStage.agentIds
      : useSettingsStore.getState().selectedAgentIds;

  return candidateIds
    .map((id) => registry.getAgent(id))
    .filter(Boolean)
    .map((agent) => ({
      id: agent!.id,
      name: agent!.name,
      role: agent!.role,
      persona: agent!.persona,
    }));
}

function GenerationPreviewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const hasStartedRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const serverJobStreamCloseRef = useRef<(() => void) | null>(null);
  const serverRedirectedRef = useRef(false);
  const [authReady, setAuthReady] = useState(false);

  const [session, setSession] = useState<GenerationSessionState | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [streamingOutlines, setStreamingOutlines] = useState<SceneOutline[] | null>(null);
  const [truncationWarnings, setTruncationWarnings] = useState<string[]>([]);
  const [isConfirmingOutlines, setIsConfirmingOutlines] = useState(false);
  const [imagePreviewMap, setImagePreviewMap] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    async function checkAuth() {
      try {
        const res = await fetch('/api/auth/me', { cache: 'no-store' });
        const data = await res.json();
        if (cancelled) return;
        if (!data.authenticated) {
          router.replace(data.adminExists ? '/auth/login' : '/setup/admin');
          return;
        }
        if (data.user?.role !== 'admin' && data.user?.role !== 'teacher') {
          router.replace('/forbidden');
          return;
        }
        setAuthReady(true);
      } catch {
        if (!cancelled) {
          router.replace('/auth/login');
        }
      }
    }
    void checkAuth();
    return () => {
      cancelled = true;
    };
  }, [router]);
  const [webSearchSources, setWebSearchSources] = useState<Array<{ title: string; url: string }>>(
    [],
  );
  const [showAgentReveal, setShowAgentReveal] = useState(false);
  const [generatedAgents, setGeneratedAgents] = useState<
    Array<{
      id: string;
      name: string;
      role: string;
      persona: string;
      avatar: string;
      color: string;
      priority: number;
    }>
  >([]);
  const agentRevealResolveRef = useRef<(() => void) | null>(null);
  const resumeStageId = searchParams.get('stageId');

  // Compute active steps based on session state
  const activeSteps = getActiveSteps(session);
  const isReviewingOutlines = session?.previewPhase === 'review';
  const getOutlinePreviewPhase = (): GenerationSessionState['previewPhase'] =>
    useSettingsStore.getState().reviewOutlineEnabled ? 'review' : 'generating-content';
  const persistSession = (nextSession: GenerationSessionState) => {
    setSession(nextSession);
    sessionStorage.setItem('generationSession', JSON.stringify(nextSession));
  };

  // Load session from sessionStorage or resume a persisted outline review draft
  useEffect(() => {
    if (!authReady) return;

    let cancelled = false;

    const loadSession = async () => {
      cleanupOldImages(24).catch((e) => log.error(e));

      if (resumeStageId) {
        try {
          const [stageData, outlinesRecord] = await Promise.all([
            loadStageData(resumeStageId),
            loadStageOutlinesRecord(resumeStageId),
          ]);

          if (
            stageData?.stage &&
            outlinesRecord?.outlines?.length &&
            outlinesRecord.reviewDraft
          ) {
            const restoredSession: GenerationSessionState = {
              sessionId: `resume_${resumeStageId}`,
              requirements: outlinesRecord.reviewDraft.requirements,
              pdfText: outlinesRecord.reviewDraft.pdfText,
              pdfImages: outlinesRecord.reviewDraft.pdfImages,
              imageStorageIds: outlinesRecord.reviewDraft.imageStorageIds,
              imageMapping: outlinesRecord.reviewDraft.imageMapping,
              sceneOutlines: outlinesRecord.outlines,
              currentStep: 'generating',
              previewPhase: 'review',
              previewStage: stageData.stage,
              pdfStorageKey: outlinesRecord.reviewDraft.pdfStorageKey,
              pdfFileName: outlinesRecord.reviewDraft.pdfFileName,
              documentType: outlinesRecord.reviewDraft.documentType,
              pdfProviderId: outlinesRecord.reviewDraft.pdfProviderId,
              pdfProviderConfig: outlinesRecord.reviewDraft.pdfProviderConfig,
              selectedTextbookResources: outlinesRecord.reviewDraft.selectedTextbookResources,
              selectedTextbookResourcesParsed:
                outlinesRecord.reviewDraft.selectedTextbookResourcesParsed,
              researchContext: outlinesRecord.reviewDraft.researchContext,
              researchSources: outlinesRecord.reviewDraft.researchSources,
            };
            if (!cancelled) {
              setSession(restoredSession);
              sessionStorage.setItem('generationSession', JSON.stringify(restoredSession));
            }
          }
        } catch (error) {
          log.error('Failed to restore outline review draft:', error);
        } finally {
          if (!cancelled) {
            setSessionLoaded(true);
          }
        }
        return;
      }

      const saved = sessionStorage.getItem('generationSession');
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as GenerationSessionState;
          if (!parsed.previewPhase) {
            parsed.previewPhase = parsed.sceneOutlines?.length
              ? getOutlinePreviewPhase()
              : 'preparing';
          }
          if (!cancelled) {
            setSession(parsed);
          }
        } catch (e) {
          log.error('Failed to parse generation session:', e);
        }
      }

      if (!cancelled) {
        setSessionLoaded(true);
      }
    };

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, [authReady, resumeStageId]);

  // Abort all in-flight requests on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      serverJobStreamCloseRef.current?.();
    };
  }, []);

  useEffect(() => {
    const storageIds = (session?.pdfImages || [])
      .map((image) => image.storageId)
      .filter((value): value is string => Boolean(value));

    if (storageIds.length === 0) {
      setImagePreviewMap({});
      return;
    }

    let cancelled = false;
    loadImageMapping(storageIds)
      .then((mapping) => {
        if (!cancelled) {
          setImagePreviewMap(mapping);
        }
      })
      .catch((error) => {
        log.warn('Failed to load review image previews:', error);
        if (!cancelled) {
          setImagePreviewMap({});
        }
      });

    return () => {
      cancelled = true;
    };
  }, [session?.pdfImages]);

  // Get API credentials from localStorage
  const getApiHeaders = () => {
    const modelConfig = getCurrentModelConfig();
    const settings = useSettingsStore.getState();
    const imageProviderConfig = settings.imageProvidersConfig?.[settings.imageProviderId];
    const videoProviderConfig = settings.videoProvidersConfig?.[settings.videoProviderId];
    return {
      'Content-Type': 'application/json',
      'x-model': modelConfig.modelString,
      'x-api-key': modelConfig.apiKey,
      'x-base-url': modelConfig.baseUrl,
      'x-provider-type': modelConfig.providerType || '',
      // Image generation provider
      'x-image-provider': settings.imageProviderId || '',
      'x-image-model': settings.imageModelId || '',
      'x-image-api-key': imageProviderConfig?.apiKey || '',
      'x-image-base-url': imageProviderConfig?.baseUrl || '',
      // Video generation provider
      'x-video-provider': settings.videoProviderId || '',
      'x-video-model': settings.videoModelId || '',
      'x-video-api-key': videoProviderConfig?.apiKey || '',
      'x-video-base-url': videoProviderConfig?.baseUrl || '',
      // Media generation toggles
      'x-image-generation-enabled': String(settings.imageGenerationEnabled ?? false),
      'x-video-generation-enabled': String(settings.videoGenerationEnabled ?? false),
    };
  };

  const runServerGeneration = async (
    sessionSnapshot: GenerationSessionState,
    sessionActiveSteps: ReturnType<typeof getActiveSteps>,
    generationSignal: AbortSignal,
  ) => {
    const modelConfig = getCurrentModelConfig();
    const settings = useSettingsStore.getState();
    const localImageIds = (sessionSnapshot.pdfImages || [])
      .map((img) => img.storageId || img.id)
      .filter(Boolean);
    const localImageMapping = localImageIds.length > 0 ? await loadImageMapping(localImageIds) : {};
    const serverPdfImages =
      sessionSnapshot.pdfImages && sessionSnapshot.pdfImages.length > 0
        ? await ensureServerStoredPdfImages(sessionSnapshot.pdfImages, localImageMapping)
        : [];
    const serverImageIds = serverPdfImages
      .map((img) => img.serverStorageId)
      .filter((value): value is string => Boolean(value));
    const hasPdfContent = Boolean(sessionSnapshot.pdfText || serverImageIds.length > 0);

    if (
      serverPdfImages.length > 0 &&
      serverPdfImages.some(
        (image, index) => image.serverStorageId !== sessionSnapshot.pdfImages?.[index]?.serverStorageId,
      )
    ) {
      sessionSnapshot = {
        ...sessionSnapshot,
        pdfImages: serverPdfImages,
      };
      setSession(sessionSnapshot);
      sessionStorage.setItem('generationSession', JSON.stringify(sessionSnapshot));
    }

    const serverPayload = {
      moduleId: sessionSnapshot.requirements.moduleId,
      k12: sessionSnapshot.requirements.k12,
      requirement: sessionSnapshot.requirements.requirement,
      pdfFileName: sessionSnapshot.pdfFileName,
      pdfContent: hasPdfContent
        ? {
            text: sessionSnapshot.pdfText || '',
            images: serverImageIds,
          }
        : undefined,
      ...(serverPdfImages.length > 0 ? { pdfImages: serverPdfImages } : {}),
      ...(sessionSnapshot.sceneOutlines?.length
        ? {
            sceneOutlines: sessionSnapshot.sceneOutlines,
            stageSeed: sessionSnapshot.previewStage
              ? {
                  id: sessionSnapshot.previewStage.id,
                  name: sessionSnapshot.previewStage.name,
                  description: sessionSnapshot.previewStage.description,
                  language: sessionSnapshot.previewStage.language,
                  style: sessionSnapshot.previewStage.style,
                  lessonPack: sessionSnapshot.previewStage.lessonPack,
                }
              : undefined,
            agentProfiles: resolvePreviewAgents(sessionSnapshot.previewStage),
          }
        : {}),
      language: sessionSnapshot.requirements.language,
      modelString: modelConfig.modelString,
      apiKey: modelConfig.apiKey,
      baseUrl: modelConfig.baseUrl,
      providerType: modelConfig.providerType,
      requiresApiKey: modelConfig.requiresApiKey,
      enableWebSearch: Boolean(sessionSnapshot.requirements.webSearch),
      webSearchProviderId: settings.webSearchProviderId,
      webSearchApiKey:
        settings.webSearchProvidersConfig?.[settings.webSearchProviderId]?.apiKey || undefined,
      baiduSubSources:
        settings.webSearchProviderId === 'baidu' ? settings.baiduSubSources : undefined,
      enableImageGeneration: Boolean(settings.imageGenerationEnabled),
      enableVideoGeneration: Boolean(settings.videoGenerationEnabled),
      enableTTS: Boolean(settings.ttsEnabled),
      agentMode: settings.agentMode === 'auto' ? ('generate' as const) : ('default' as const),
    };

    const mapServerStepToIndex = (step: ClassroomJobStreamState['step']) => {
      const indices = {
        pdf: sessionActiveSteps.findIndex((s) => s.id === 'pdf-analysis'),
        web: sessionActiveSteps.findIndex((s) => s.id === 'web-search'),
        agent: sessionActiveSteps.findIndex((s) => s.id === 'agent-generation'),
        outline: sessionActiveSteps.findIndex((s) => s.id === 'outline'),
        content: sessionActiveSteps.findIndex((s) => s.id === 'slide-content'),
        actions: sessionActiveSteps.findIndex((s) => s.id === 'actions'),
      };

      switch (step) {
        case 'initializing':
          return indices.pdf >= 0 ? indices.pdf : 0;
        case 'researching':
          return indices.web >= 0 ? indices.web : indices.agent >= 0 ? indices.agent : 0;
        case 'generating_outlines':
          return indices.outline >= 0 ? indices.outline : 0;
        case 'generating_scenes':
          return indices.content >= 0 ? indices.content : 0;
        case 'generating_media':
        case 'generating_tts':
        case 'persisting':
          return indices.actions >= 0 ? indices.actions : sessionActiveSteps.length - 1;
        case 'completed':
          return sessionActiveSteps.length - 1;
        default:
          return 0;
      }
    };

    const redirectToLiveClassroom = (job: ClassroomJobStreamState) => {
      if (serverRedirectedRef.current) {
        return true;
      }
      if (!job.result?.url || job.scenesGenerated < 1) {
        return false;
      }

      serverRedirectedRef.current = true;
      sessionStorage.removeItem('generationSession');
      const classroomUrl = new URL(job.result.url, window.location.origin);
      setLiveClassroomJobId(job.result.classroomId, job.jobId);
      classroomUrl.searchParams.set('jobId', job.jobId);
      router.push(`${classroomUrl.pathname}${classroomUrl.search}`);
      return true;
    };

    const persistServerSession = (job: ClassroomJobStreamState) => {
      const updatedServerSession = {
        ...sessionSnapshot,
        serverJob: {
          jobId: job.jobId,
          pollUrl: job.pollUrl,
          eventsUrl: job.eventsUrl,
        },
        currentStep: 'generating' as const,
      };
      setSession(updatedServerSession);
      sessionStorage.setItem('generationSession', JSON.stringify(updatedServerSession));
      setStatusMessage(job.message);
      setCurrentStepIndex(mapServerStepToIndex(job.step));
    };

    const finalizeServerJob = (job: ClassroomJobStreamState) => {
      if (redirectToLiveClassroom(job)) {
        return;
      }

      if (job.status === 'succeeded') {
        setIsComplete(true);
        setStatusMessage(job.message);
        sessionStorage.removeItem('generationSession');
        const targetUrl =
          job.result?.url || (job.result?.classroomId ? `/classroom/${job.result.classroomId}` : '');
        if (targetUrl) {
          router.push(targetUrl);
          return;
        }
        router.push('/');
        return;
      }

      const message = job.error || job.message || t('generation.generationFailed');
      if (job.result?.classroomId) {
        clearLiveClassroomJobId(job.result.classroomId);
      }
      setError(message);
      sessionStorage.removeItem('generationSession');
    };

    const monitorServerJob = (job: ClassroomJobStreamState) => {
      serverJobStreamCloseRef.current?.();
      persistServerSession(job);
      const stream = startClassroomJobStream({
        job,
        signal: generationSignal,
        onUpdate: (nextJob) => {
          persistServerSession(nextJob);
          redirectToLiveClassroom(nextJob);
        },
        onTerminal: (nextJob) => {
          persistServerSession(nextJob);
          finalizeServerJob(nextJob);
        },
        onError: (message) => {
          log.warn('[GenerationPreview] Server job stream issue:', message);
        },
      });
      serverJobStreamCloseRef.current = stream.close;
    };

    const initialJob = sessionSnapshot.serverJob
      ? await fetch(sessionSnapshot.serverJob.pollUrl, { cache: 'no-store' }).then(async (res) => {
          if (!res.ok) {
            const data = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(data.error || t('generation.generationFailed'));
          }
          const data = (await res.json()) as { success?: boolean; error?: string };
          if (!data.success) {
            throw new Error(data.error || t('generation.generationFailed'));
          }
          return data as unknown as ClassroomJobStreamState;
        })
      : await fetch('/api/generate-classroom', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(serverPayload),
          signal: generationSignal,
        }).then(async (res) => {
          const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
          if (!res.ok || !data.success) {
            throw new Error(data.error || t('generation.generationFailed'));
          }
          const job = data as unknown as ClassroomJobStreamState;
          const updatedServerSession = {
            ...sessionSnapshot,
            serverJob: {
              jobId: job.jobId,
              pollUrl: job.pollUrl,
              eventsUrl: job.eventsUrl,
            },
            currentStep: 'generating' as const,
          };
          setSession(updatedServerSession);
          sessionStorage.setItem('generationSession', JSON.stringify(updatedServerSession));
          return job;
        });

    if (redirectToLiveClassroom(initialJob)) {
      return;
    }
    monitorServerJob(initialJob);
  };

  // Auto-start generation when session is loaded
  useEffect(() => {
    if (!session || hasStartedRef.current) {
      return;
    }
    if (session.previewPhase === 'review') {
      return;
    }
    hasStartedRef.current = true;
    if (session.previewPhase === 'generating-content' && session.sceneOutlines?.length) {
      void continueGeneration(session.sceneOutlines);
      return;
    }
    if (session.previewPhase === 'preparing' || !session.previewPhase) {
      void startGeneration();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const continueGeneration = async (confirmedOutlines: SceneOutline[]) => {
    if (!session || confirmedOutlines.length === 0) {
      setError(t('generation.outlineEmptyResponse'));
      return;
    }

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const signal = controller.signal;

    setError(null);
    setStatusMessage('');
    setIsConfirmingOutlines(true);

    const previewStage = session.previewStage ?? buildPreviewStage(session);
    const stage: Stage = {
      ...previewStage,
      updatedAt: Date.now(),
    };
    const agents = resolvePreviewAgents(stage);
    if (agents.length > 0) {
      stage.agentIds = agents.map((agent) => agent.id);
    }

    const contentSession: GenerationSessionState = {
      ...session,
      sceneOutlines: confirmedOutlines,
      previewPhase: 'generating-content',
      previewStage: stage,
    };
    persistSession(contentSession);
    setStreamingOutlines(confirmedOutlines);

    try {
      const activeSteps = getActiveSteps(contentSession);
      const contentStepIdx = activeSteps.findIndex((s) => s.id === 'slide-content');
      setCurrentStepIndex(contentStepIdx >= 0 ? contentStepIdx : 0);
      await runServerGeneration(contentSession, activeSteps, signal);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        log.info('[GenerationPreview] Generation aborted');
        return;
      }

      const reviewSession: GenerationSessionState = {
        ...contentSession,
        previewPhase: 'review',
      };
      persistSession(reviewSession);
      if (reviewSession.previewStage) {
        void persistOutlineReviewDraft({
          stage: reviewSession.previewStage,
          session: reviewSession,
          outlines: confirmedOutlines,
        }).catch((persistError) => {
          log.error('Failed to re-persist outline review draft:', persistError);
        });
      }
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsConfirmingOutlines(false);
    }
  };

  // Main generation flow
  const startGeneration = async () => {
    if (!session) return;

    // Create AbortController for this generation run
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const signal = controller.signal;
    const settings = useSettingsStore.getState();
    const shouldUseServerGeneration = !settings.reviewOutlineEnabled;

    // Use a local mutable copy so we can update it after PDF parsing
    let currentSession = mergeSelectedTextbookResourcesIntoPdfText(session);
    if (currentSession !== session) {
      persistSession(currentSession);
    }

    setError(null);
    setIsComplete(false);
    setCurrentStepIndex(0);

    try {
      // Compute active steps for this session (recomputed after session mutations)
      let activeSteps = getActiveSteps(currentSession);
      const selectedTextbookPdfResources = getSelectedTextbookPdfResources(currentSession);

      // Determine if we need the document analysis step
      const hasDeferredUploadToAnalyze = Boolean(currentSession.pdfStorageKey);
      const hasSelectedTextbookPdfToAnalyze =
        selectedTextbookPdfResources.length > 0 && !currentSession.selectedTextbookResourcesParsed;
      const hasDocumentToAnalyze =
        hasDeferredUploadToAnalyze || hasSelectedTextbookPdfToAnalyze;
      // If no stored document to analyze, skip to the next available step
      if (!hasDocumentToAnalyze) {
        const firstNonPdfIdx = activeSteps.findIndex((s) => s.id !== 'pdf-analysis');
        setCurrentStepIndex(Math.max(0, firstNonPdfIdx));
      }

      // Step 0: Parse deferred document if needed
      if (hasDocumentToAnalyze) {
        const warnings: string[] = [];
        let mergedPdfText = currentSession.pdfText ?? '';
        const collectedImages: PdfImage[] = [];

        if (hasDeferredUploadToAnalyze) {
          const pdfBlob = await loadPdfBlob(currentSession.pdfStorageKey!);
          if (!pdfBlob) {
            throw new Error(t('generation.pdfLoadFailed'));
          }

          if (!(pdfBlob instanceof Blob) || pdfBlob.size === 0) {
            log.error('Invalid PDF blob:', {
              type: typeof pdfBlob,
              size: pdfBlob instanceof Blob ? pdfBlob.size : 'N/A',
            });
            throw new Error(t('generation.pdfLoadFailed'));
          }

          if (currentSession.documentType === 'text') {
            log.debug('=== Generation Preview: Reading text document ===');
            const rawText = await pdfBlob.text();
            mergedPdfText = [mergedPdfText, rawText].filter(Boolean).join('\n\n');

            if (rawText.length > MAX_PDF_CONTENT_CHARS) {
              warnings.push(
                t('generation.textTruncated').replace('{n}', String(MAX_PDF_CONTENT_CHARS)),
              );
            }
          } else {
            log.debug('=== Generation Preview: Parsing uploaded PDF ===');
            const pdfFile = new File([pdfBlob], currentSession.pdfFileName || 'document.pdf', {
              type: 'application/pdf',
            });

            const parsedUploadedPdf = await parsePdfFileToAsset({
              file: pdfFile,
              providerId: currentSession.pdfProviderId,
              providerConfig: currentSession.pdfProviderConfig,
              signal,
            });

            mergedPdfText = [mergedPdfText, parsedUploadedPdf.text].filter(Boolean).join('\n\n');
            collectedImages.push(...parsedUploadedPdf.images);
          }
        }

        if (hasSelectedTextbookPdfToAnalyze) {
          log.debug('=== Generation Preview: Parsing textbook resource PDFs ===');

          for (const [resourceIndex, resource] of selectedTextbookPdfResources.entries()) {
            try {
              const resourceResponse = await fetch(resource.url, {
                cache: 'no-store',
                signal,
              });

              if (!resourceResponse.ok) {
                throw new Error(`HTTP ${resourceResponse.status}`);
              }

              const resourceBlob = await resourceResponse.blob();
              if (!(resourceBlob instanceof Blob) || resourceBlob.size === 0) {
                throw new Error('Empty resource blob');
              }

              const resourceFile = new File(
                [resourceBlob],
                inferTextbookResourceFilename(resource, resourceIndex),
                { type: resourceBlob.type || 'application/pdf' },
              );

              const parsedResourcePdf = await parsePdfFileToAsset({
                file: resourceFile,
                providerId: currentSession.pdfProviderId,
                providerConfig: currentSession.pdfProviderConfig,
                signal,
              });

              mergedPdfText = appendPdfSectionText({
                baseText: mergedPdfText,
                sectionTitle: resource.title,
                sectionText: parsedResourcePdf.text,
                locale: currentSession.requirements.language === 'en-US' ? 'en-US' : 'zh-CN',
              });

              collectedImages.push(
                ...parsedResourcePdf.images.map((image) => ({
                  ...image,
                  id: `${resource.id}-${image.id}`,
                })),
              );
            } catch (resourceError) {
              log.warn(`Failed to parse textbook resource PDF: ${resource.title}`, resourceError);
              warnings.push(
                currentSession.requirements.language === 'en-US'
                  ? `Skipped textbook PDF "${resource.title}" because it could not be parsed.`
                  : `教材 PDF《${resource.title}》解析失败，已跳过。`,
              );
            }
          }
        }

        const pdfText = mergedPdfText.substring(0, MAX_PDF_CONTENT_CHARS);
        if (mergedPdfText.length > MAX_PDF_CONTENT_CHARS) {
          warnings.push(
            t('generation.textTruncated').replace('{n}', String(MAX_PDF_CONTENT_CHARS)),
          );
        }

        const boundedImages = collectedImages.slice(0, MAX_VISION_IMAGES);
        if (collectedImages.length > MAX_VISION_IMAGES) {
          warnings.push(
            t('generation.imageTruncated')
              .replace('{total}', String(collectedImages.length))
              .replace('{max}', String(MAX_VISION_IMAGES)),
          );
        }

        const imageStorageIds =
          boundedImages.length > 0 ? await storeImages(boundedImages) : [];

        const pdfImages = boundedImages.map((img, i) => ({
          id: img.id,
          src: '',
          pageNumber: img.pageNumber,
          description: img.description,
          width: img.width,
          height: img.height,
          storageId: imageStorageIds[i],
        }));

        const updatedSession = mergeSelectedTextbookResourcesIntoPdfText({
          ...currentSession,
          pdfText,
          pdfImages,
          imageStorageIds,
          pdfStorageKey: undefined, // Clear so we don't re-parse
          selectedTextbookResourcesParsed: true,
        });
        persistSession(updatedSession);
        if (warnings.length > 0) {
          setTruncationWarnings(warnings);
        } else {
          setTruncationWarnings([]);
        }

        // Reassign local reference for subsequent steps
        currentSession = updatedSession;
        activeSteps = getActiveSteps(currentSession);

        if (shouldUseServerGeneration) {
          await runServerGeneration(currentSession, activeSteps, signal);
          return;
        }
      }

      if (shouldUseServerGeneration) {
        await runServerGeneration(currentSession, activeSteps, signal);
        return;
      }

      // Step: Web Search (if enabled)
      const webSearchStepIdx = activeSteps.findIndex((s) => s.id === 'web-search');
      if (currentSession.requirements.webSearch && webSearchStepIdx >= 0) {
        setCurrentStepIndex(webSearchStepIdx);
        setWebSearchSources([]);

        const wsSettings = settings;
        const wsApiKey =
          wsSettings.webSearchProvidersConfig?.[wsSettings.webSearchProviderId]?.apiKey;
        const res = await fetch('/api/web-search', {
          method: 'POST',
          headers: getApiHeaders(),
          body: JSON.stringify({
            query: currentSession.requirements.requirement,
            pdfText: currentSession.pdfText || undefined,
            apiKey: wsApiKey || undefined,
            provider: wsSettings.webSearchProviderId,
            baiduSubSources:
              wsSettings.webSearchProviderId === 'baidu' ? wsSettings.baiduSubSources : undefined,
          }),
          signal,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: 'Web search failed' }));
          throw new Error(data.error || t('generation.webSearchFailed'));
        }

        const searchData = await res.json();
        const sources = (searchData.sources || []).map((s: { title: string; url: string }) => ({
          title: s.title,
          url: s.url,
        }));
        setWebSearchSources(sources);

        const updatedSessionWithSearch = {
          ...currentSession,
          researchContext: searchData.context || '',
          researchSources: sources,
        };
        persistSession(updatedSessionWithSearch);
        currentSession = updatedSessionWithSearch;
        activeSteps = getActiveSteps(currentSession);
      }

      // Load imageMapping early (needed for both outline and scene generation)
      let imageMapping: ImageMapping = {};
      const currentImageStorageIds = currentSession.imageStorageIds ?? [];
      if (currentImageStorageIds.length > 0) {
        log.debug('Loading images from IndexedDB');
        imageMapping = await loadImageMapping(currentImageStorageIds);
      } else {
        const currentImageMapping = currentSession.imageMapping ?? {};
        if (Object.keys(currentImageMapping).length > 0) {
          log.debug('Using imageMapping from session (old format)');
          imageMapping = currentImageMapping;
        }
      }

      // ── Agent generation (before outlines so persona can influence structure) ──
      let agents: Array<{
        id: string;
        name: string;
        role: string;
        persona?: string;
      }> = [];

      // Create stage client-side (needed for agent generation stageId)
      const stage = currentSession.previewStage ?? buildPreviewStage(currentSession);

      if (settings.agentMode === 'auto') {
        const agentStepIdx = activeSteps.findIndex((s) => s.id === 'agent-generation');
        if (agentStepIdx >= 0) setCurrentStepIndex(agentStepIdx);

        try {
          const allAvatars = [
            {
              path: '/avatars/teacher.png',
              desc: 'Male teacher with glasses, holding a book, green background',
            },
            {
              path: '/avatars/teacher-2.png',
              desc: 'Female teacher with long dark hair, blue traditional outfit, gentle expression',
            },
            {
              path: '/avatars/assist.png',
              desc: 'Young female assistant with glasses, pink background, friendly smile',
            },
            {
              path: '/avatars/assist-2.png',
              desc: 'Young female in orange top and purple overalls, cheerful and approachable',
            },
            {
              path: '/avatars/clown.png',
              desc: 'Energetic girl with glasses pointing up, green shirt, lively and fun',
            },
            {
              path: '/avatars/clown-2.png',
              desc: 'Playful girl with curly hair doing rock gesture, blue shirt, humorous vibe',
            },
            {
              path: '/avatars/curious.png',
              desc: 'Surprised boy with glasses, hand on cheek, curious expression',
            },
            {
              path: '/avatars/curious-2.png',
              desc: 'Boy with backpack holding a book and question mark bubble, inquisitive',
            },
            {
              path: '/avatars/note-taker.png',
              desc: 'Studious boy with glasses, blue shirt, calm and organized',
            },
            {
              path: '/avatars/note-taker-2.png',
              desc: 'Active boy with yellow backpack waving, blue outfit, enthusiastic learner',
            },
            {
              path: '/avatars/thinker.png',
              desc: 'Thoughtful girl with hand on chin, purple background, contemplative',
            },
            {
              path: '/avatars/thinker-2.png',
              desc: 'Girl reading a book intently, long dark hair, intellectual and focused',
            },
          ];

          const getAvailableVoicesForGeneration = () => {
            const providers = getAvailableProvidersWithVoices(settings.ttsProvidersConfig);
            return providers.flatMap((p) =>
              p.voices.map((v) => ({
                providerId: p.providerId,
                voiceId: v.id,
                voiceName: v.name,
              })),
            );
          };

          // No outlines yet — agent generation uses only stage name + description
          const agentResp = await fetch('/api/generate/agent-profiles', {
            method: 'POST',
            headers: getApiHeaders(),
            body: JSON.stringify({
              stageInfo: { name: stage.name, description: stage.description },
              language: currentSession.requirements.language || 'zh-CN',
              availableAvatars: allAvatars.map((a) => a.path),
              avatarDescriptions: allAvatars.map((a) => ({ path: a.path, desc: a.desc })),
              availableVoices: getAvailableVoicesForGeneration(),
            }),
            signal,
          });

          if (!agentResp.ok) throw new Error('Agent generation failed');
          const agentData = await agentResp.json();
          if (!agentData.success) throw new Error(agentData.error || 'Agent generation failed');

          // Save to IndexedDB and registry
          const { saveGeneratedAgents } = await import('@/lib/orchestration/registry/store');
          const savedIds = await saveGeneratedAgents(stage.id, agentData.agents);
          settings.setSelectedAgentIds(savedIds);
          stage.agentIds = savedIds;

          // Show card-reveal modal, continue generation once all cards are revealed
          setGeneratedAgents(agentData.agents);
          setShowAgentReveal(true);
          await new Promise<void>((resolve) => {
            agentRevealResolveRef.current = resolve;
          });

          agents = savedIds
            .map((id) => useAgentRegistry.getState().getAgent(id))
            .filter(Boolean)
            .map((a) => ({
              id: a!.id,
              name: a!.name,
              role: a!.role,
              persona: a!.persona,
            }));
        } catch (err: unknown) {
          log.warn('[Generation] Agent generation failed, falling back to presets:', err);
          const registry = useAgentRegistry.getState();
          const fallbackIds = settings.selectedAgentIds.filter((id) => {
            const a = registry.getAgent(id);
            return a && !a.isGenerated;
          });
          agents = fallbackIds
            .map((id) => registry.getAgent(id))
            .filter(Boolean)
            .map((a) => ({
              id: a!.id,
              name: a!.name,
              role: a!.role,
              persona: a!.persona,
            }));
          stage.agentIds = fallbackIds;
        }
      } else {
        // Preset mode — use selected agents (include persona)
        // Filter out stale generated agent IDs that may linger in settings
        const registry = useAgentRegistry.getState();
        const presetAgentIds = settings.selectedAgentIds.filter((id) => {
          const a = registry.getAgent(id);
          return a && !a.isGenerated;
        });
        agents = presetAgentIds
          .map((id) => registry.getAgent(id))
          .filter(Boolean)
          .map((a) => ({
            id: a!.id,
            name: a!.name,
            role: a!.role,
            persona: a!.persona,
        }));
        stage.agentIds = presetAgentIds;
      }

      currentSession = {
        ...currentSession,
        previewStage: {
          ...stage,
          updatedAt: Date.now(),
        },
      };
      persistSession(currentSession);

      // ── Generate outlines (with agent personas for teacher context) ──
      let outlines: SceneOutline[] = currentSession.sceneOutlines ?? [];

      const outlineStepIdx = activeSteps.findIndex((s) => s.id === 'outline');
      setCurrentStepIndex(outlineStepIdx >= 0 ? outlineStepIdx : 0);
      if (outlines.length === 0) {
        log.debug('=== Generating outlines (SSE) ===');
        setStreamingOutlines([]);

        outlines = await new Promise<SceneOutline[]>((resolve, reject) => {
          const collected: SceneOutline[] = [];

          fetch('/api/generate/scene-outlines-stream', {
            method: 'POST',
            headers: getApiHeaders(),
            body: JSON.stringify({
              requirements: currentSession.requirements,
              pdfText: currentSession.pdfText,
              pdfImages: currentSession.pdfImages,
              imageMapping,
              researchContext: currentSession.researchContext,
              agents,
            }),
            signal,
          })
            .then((res) => {
              if (!res.ok) {
                return res.json().then((d) => {
                  reject(new Error(d.error || t('generation.outlineGenerateFailed')));
                });
              }

              const reader = res.body?.getReader();
              if (!reader) {
                reject(new Error(t('generation.streamNotReadable')));
                return;
              }

              const decoder = new TextDecoder();
              let sseBuffer = '';

              const pump = (): Promise<void> =>
                reader.read().then(({ done, value }) => {
                  if (value) {
                    sseBuffer += decoder.decode(value, { stream: !done });
                    const lines = sseBuffer.split('\n');
                    sseBuffer = lines.pop() || '';

                    for (const line of lines) {
                      if (!line.startsWith('data: ')) continue;
                      try {
                        const evt = JSON.parse(line.slice(6));
                        if (evt.type === 'outline') {
                          collected.push(evt.data);
                          setStreamingOutlines([...collected]);
                        } else if (evt.type === 'retry') {
                          collected.length = 0;
                          setStreamingOutlines([]);
                          setStatusMessage(t('generation.outlineRetrying'));
                        } else if (evt.type === 'done') {
                          resolve(evt.outlines || collected);
                          return;
                        } else if (evt.type === 'error') {
                          reject(new Error(evt.error));
                          return;
                        }
                      } catch (e) {
                        log.error('Failed to parse outline SSE:', line, e);
                      }
                    }
                  }
                  if (done) {
                    if (collected.length > 0) {
                      resolve(collected);
                    } else {
                      reject(new Error(t('generation.outlineEmptyResponse')));
                    }
                    return;
                  }
                  return pump();
                });

              pump().catch(reject);
            })
            .catch(reject);
        });

        const draftStage = currentSession.previewStage ?? buildPreviewStage(currentSession);
        const updatedSession: GenerationSessionState = {
          ...currentSession,
          sceneOutlines: outlines,
          previewPhase: getOutlinePreviewPhase(),
          previewStage: draftStage,
        };
        persistSession(updatedSession);
        currentSession = updatedSession;
        if (updatedSession.previewPhase === 'review') {
          const persistedStage = await persistOutlineReviewDraft({
            stage: draftStage,
            session: updatedSession,
            outlines,
          });
          currentSession = {
            ...updatedSession,
            previewStage: persistedStage,
          };
          persistSession(currentSession);
        }
        setStreamingOutlines(outlines);

        // Outline generation succeeded — clear homepage draft cache
        try {
          localStorage.removeItem('requirementDraft');
        } catch {
          /* ignore */
        }

        // Brief pause to let user see the final outline state
        await new Promise((resolve) => setTimeout(resolve, 800));
      }

      // Move to scene generation step
      setStatusMessage('');
      if (!currentSession.sceneOutlines || currentSession.sceneOutlines.length === 0) {
        throw new Error(t('generation.outlineEmptyResponse'));
      }
      setStreamingOutlines(currentSession.sceneOutlines);
      if (currentSession.previewPhase === 'review') {
        return;
      }

      await continueGeneration(currentSession.sceneOutlines);
    } catch (err) {
      // AbortError is expected when navigating away — don't show as error
      if (err instanceof DOMException && err.name === 'AbortError') {
        log.info('[GenerationPreview] Generation aborted');
        return;
      }
      sessionStorage.removeItem('generationSession');
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const goBackToHome = () => {
    abortControllerRef.current?.abort();
    serverJobStreamCloseRef.current?.();
    sessionStorage.removeItem('generationSession');
    router.push('/');
  };

  // Still loading session from sessionStorage
  if (!sessionLoaded) {
    return (
      <div className="min-h-[100dvh] w-full bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center p-4">
        <div className="text-center text-muted-foreground">
          <div className="size-8 border-2 border-current border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  // No session found
  if (!session) {
    return (
      <div className="min-h-[100dvh] w-full bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center p-4">
        <Card className="p-8 max-w-md w-full">
          <div className="text-center space-y-4">
            <AlertCircle className="size-12 text-muted-foreground mx-auto" />
            <h2 className="text-xl font-semibold">{t('generation.sessionNotFound')}</h2>
            <p className="text-sm text-muted-foreground">{t('generation.sessionNotFoundDesc')}</p>
            <Button onClick={() => router.push('/')} className="w-full">
              <ArrowLeft className="size-4 mr-2" />
              {t('generation.backToHome')}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const activeStep =
    activeSteps.length > 0
      ? activeSteps[Math.min(currentStepIndex, activeSteps.length - 1)]
      : ALL_STEPS[0];

  if (!authReady) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center">
        <p className="text-sm text-muted-foreground">{t('auth.checkingSession')}</p>
      </div>
    );
  }

  if (isReviewingOutlines && session.sceneOutlines) {
    const outlineStepIndex = Math.max(
      0,
      activeSteps.findIndex((step) => step.id === 'outline'),
    );

    return (
      <div className="h-[100dvh] w-full bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex flex-col items-center p-4 relative overflow-hidden">
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
          <div
            className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse"
            style={{ animationDuration: '4s' }}
          />
          <div
            className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse"
            style={{ animationDuration: '6s' }}
          />
        </div>

        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute top-4 left-4 z-20"
        >
          <Button variant="ghost" size="sm" onClick={goBackToHome} disabled={isConfirmingOutlines}>
            <ArrowLeft className="size-4 mr-2" />
            {t('generation.backToHome')}
          </Button>
        </motion.div>

        <div className="z-10 flex min-h-0 w-full max-w-5xl flex-1 pt-16 pb-4">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex min-h-0 w-full flex-1">
            <Card className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden border-muted/40 bg-white/85 p-6 shadow-2xl backdrop-blur-xl dark:bg-slate-900/85 md:p-8">
              <div className="absolute top-6 left-0 right-0 flex justify-center gap-2">
                {activeSteps.map((step, idx) => (
                  <div
                    key={step.id}
                    className={cn(
                      'h-1.5 rounded-full transition-all duration-500',
                      idx < outlineStepIndex
                        ? 'w-1.5 bg-blue-500/30'
                        : idx === outlineStepIndex
                          ? 'w-8 bg-blue-500'
                          : 'w-1.5 bg-muted/50',
                    )}
                  />
                ))}
              </div>

              <div className="flex min-h-0 flex-1 flex-col space-y-6 pt-6">
                <div className="mx-auto max-w-2xl shrink-0 space-y-2 text-center">
                  <h2 className="text-2xl font-bold tracking-tight">
                    {t('generation.reviewOutlineTitle')}
                  </h2>
                  <p className="text-muted-foreground text-sm md:text-base">
                    {t('generation.reviewOutlineDesc')}
                  </p>
                </div>

                {error && (
                  <div className="mx-auto max-w-2xl shrink-0 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-300">
                    {error}
                  </div>
                )}

                <div className="min-h-0 flex-1">
                  <OutlinesEditor
                    outlines={session.sceneOutlines}
                    onChange={(outlines) => {
                      setError(null);
                      setStreamingOutlines(outlines);
                      const reviewStage = session.previewStage
                        ? { ...session.previewStage, updatedAt: Date.now() }
                        : buildPreviewStage(session);
                      const nextSession: GenerationSessionState = {
                        ...session,
                        sceneOutlines: outlines,
                        previewPhase: 'review',
                        previewStage: reviewStage,
                      };
                      persistSession(nextSession);
                      void persistOutlineReviewDraft({
                        stage: reviewStage,
                        session: nextSession,
                        outlines,
                      }).catch((persistError) => {
                        log.error('Failed to persist reviewed outlines:', persistError);
                      });
                    }}
                    onConfirm={(outlines) => void continueGeneration(outlines)}
                    onBack={goBackToHome}
                    availableImages={session.pdfImages || []}
                    imagePreviewMap={imagePreviewMap}
                    isLoading={isConfirmingOutlines}
                  />
                </div>
              </div>
            </Card>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] w-full bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex flex-col items-center justify-center p-4 relative overflow-hidden text-center">
      {/* Background Decor */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div
          className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse"
          style={{ animationDuration: '4s' }}
        />
        <div
          className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse"
          style={{ animationDuration: '6s' }}
        />
      </div>

      {/* Back button */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="absolute top-4 left-4 z-20"
      >
        <Button variant="ghost" size="sm" onClick={goBackToHome}>
          <ArrowLeft className="size-4 mr-2" />
          {t('generation.backToHome')}
        </Button>
      </motion.div>

      <div className="z-10 w-full max-w-lg space-y-8 flex flex-col items-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full"
        >
          <Card className="relative overflow-hidden border-muted/40 shadow-2xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl min-h-[400px] flex flex-col items-center justify-center p-8 md:p-12">
            {/* Progress Dots */}
            <div className="absolute top-6 left-0 right-0 flex justify-center gap-2">
              {activeSteps.map((step, idx) => (
                <div
                  key={step.id}
                  className={cn(
                    'h-1.5 rounded-full transition-all duration-500',
                    idx < currentStepIndex
                      ? 'w-1.5 bg-blue-500/30'
                      : idx === currentStepIndex
                        ? 'w-8 bg-blue-500'
                        : 'w-1.5 bg-muted/50',
                  )}
                />
              ))}
            </div>

            {/* Central Content */}
            <div className="flex-1 flex flex-col items-center justify-center w-full space-y-8 mt-4">
              {/* Icon / Visualizer Container */}
              <div className="relative size-48 flex items-center justify-center">
                <AnimatePresence mode="popLayout">
                  {error ? (
                    <motion.div
                      key="error"
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="size-32 rounded-full bg-red-500/10 flex items-center justify-center border-2 border-red-500/20"
                    >
                      <AlertCircle className="size-16 text-red-500" />
                    </motion.div>
                  ) : isComplete ? (
                    <motion.div
                      key="complete"
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="size-32 rounded-full bg-green-500/10 flex items-center justify-center border-2 border-green-500/20"
                    >
                      <CheckCircle2 className="size-16 text-green-500" />
                    </motion.div>
                  ) : (
                    <motion.div
                      key={activeStep.id}
                      initial={{ scale: 0.8, opacity: 0, filter: 'blur(10px)' }}
                      animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }}
                      exit={{ scale: 1.2, opacity: 0, filter: 'blur(10px)' }}
                      transition={{ duration: 0.4 }}
                      className="absolute inset-0 flex items-center justify-center"
                    >
                      <StepVisualizer
                        stepId={activeStep.id}
                        outlines={streamingOutlines}
                        webSearchSources={webSearchSources}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Text Content */}
              <div className="space-y-3 max-w-sm mx-auto">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={error ? 'error' : isComplete ? 'done' : activeStep.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-2"
                  >
                    <h2 className="text-2xl font-bold tracking-tight">
                      {error
                        ? t('generation.generationFailed')
                        : isComplete
                          ? t('generation.generationComplete')
                          : t(activeStep.title)}
                    </h2>
                    <p className="text-muted-foreground text-base">
                      {error
                        ? error
                        : isComplete
                          ? t('generation.classroomReady')
                          : statusMessage || t(activeStep.description)}
                    </p>
                  </motion.div>
                </AnimatePresence>

                {/* Truncation warning indicator */}
                <AnimatePresence>
                  {truncationWarnings.length > 0 && !error && !isComplete && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0 }}
                      transition={{
                        type: 'spring',
                        stiffness: 500,
                        damping: 30,
                      }}
                      className="flex justify-center"
                    >
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <motion.button
                            type="button"
                            animate={{
                              boxShadow: [
                                '0 0 0 0 rgba(251, 191, 36, 0), 0 0 0 0 rgba(251, 191, 36, 0)',
                                '0 0 16px 4px rgba(251, 191, 36, 0.12), 0 0 4px 1px rgba(251, 191, 36, 0.08)',
                                '0 0 0 0 rgba(251, 191, 36, 0), 0 0 0 0 rgba(251, 191, 36, 0)',
                              ],
                            }}
                            transition={{
                              duration: 3,
                              repeat: Infinity,
                              ease: 'easeInOut',
                            }}
                            className="relative size-7 rounded-full flex items-center justify-center cursor-default
                                       bg-gradient-to-br from-amber-400/15 to-orange-400/10
                                       border border-amber-400/25 hover:border-amber-400/40
                                       hover:from-amber-400/20 hover:to-orange-400/15
                                       transition-colors duration-300
                                       focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30"
                          >
                            <AlertTriangle
                              className="size-3.5 text-amber-500 dark:text-amber-400"
                              strokeWidth={2.5}
                            />
                          </motion.button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" sideOffset={6}>
                          <div className="space-y-1 py-0.5">
                            {truncationWarnings.map((w, i) => (
                              <p key={i} className="text-xs leading-relaxed">
                                {w}
                              </p>
                            ))}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Footer Action */}
        <div className="h-16 flex items-center justify-center w-full">
          <AnimatePresence>
            {error ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-xs"
              >
                <Button size="lg" variant="outline" className="w-full h-12" onClick={goBackToHome}>
                  {t('generation.goBackAndRetry')}
                </Button>
              </motion.div>
            ) : !isComplete ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-3 text-sm text-muted-foreground/50 font-medium uppercase tracking-widest"
              >
                <Sparkles className="size-3 animate-pulse" />
                {t('generation.aiWorking')}
                {generatedAgents.length > 0 && !showAgentReveal && (
                  <button
                    onClick={() => setShowAgentReveal(true)}
                    className="ml-2 flex items-center gap-1.5 rounded-full border border-purple-300/30 bg-purple-500/10 px-3 py-1 text-xs font-medium normal-case tracking-normal text-purple-400 transition-colors hover:bg-purple-500/20 hover:text-purple-300"
                  >
                    <Bot className="size-3" />
                    {t('generation.viewAgents')}
                  </button>
                )}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      {/* Agent Reveal Modal */}
      <AgentRevealModal
        agents={generatedAgents}
        open={showAgentReveal}
        onClose={() => setShowAgentReveal(false)}
        onAllRevealed={() => {
          agentRevealResolveRef.current?.();
          agentRevealResolveRef.current = null;
        }}
      />
    </div>
  );
}

export default function GenerationPreviewPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[100dvh] w-full bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center">
          <div className="animate-pulse space-y-4 text-center">
            <div className="h-8 w-48 bg-muted rounded mx-auto" />
            <div className="h-4 w-64 bg-muted rounded mx-auto" />
          </div>
        </div>
      }
    >
      <GenerationPreviewContent />
    </Suspense>
  );
}
