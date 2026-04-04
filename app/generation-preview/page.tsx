'use client';

import { useEffect, useState, Suspense, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, Sparkles, AlertCircle, AlertTriangle, ArrowLeft, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useStageStore } from '@/lib/store/stage';
import { useSettingsStore } from '@/lib/store/settings';
import { useAgentRegistry } from '@/lib/orchestration/registry/store';
import { getAvailableProvidersWithVoices } from '@/lib/audio/voice-resolver';
import { useI18n } from '@/lib/hooks/use-i18n';
import { generateAndStoreTTS } from '@/lib/hooks/use-scene-generator';
import {
  loadImageMapping,
  loadPdfBlob,
  cleanupOldImages,
  storeImages,
} from '@/lib/utils/image-storage';
import { getCurrentModelConfig } from '@/lib/utils/model-config';
import { MAX_PDF_CONTENT_CHARS, MAX_VISION_IMAGES } from '@/lib/constants/generation';
import { nanoid } from 'nanoid';
import type { Stage } from '@/lib/types/stage';
import type { SceneOutline, PdfImage, ImageMapping } from '@/lib/types/generation';
import { AgentRevealModal } from '@/components/agent/agent-reveal-modal';
import { createLogger } from '@/lib/logger';
import {
  buildK12LessonPackTitle,
  buildK12TextbookResourceReferenceText,
  mergeK12TextbookResourcesIntoReferenceText,
  resolveK12LessonPackMetadata,
} from '@/lib/module-host/k12';
import { getModuleById } from '@/lib/module-host/runtime';
import {
  type K12ModulePresets,
  type K12TextbookResource,
  type SupportedLocale,
} from '@/lib/module-host/types';
import { type GenerationSessionState, ALL_STEPS, getActiveSteps } from './types';
import { StepVisualizer } from './components/visualizers';
import type { ClassroomGenerationJobSnapshot } from '@/lib/types/classroom-job';

const log = createLogger('GenerationPreview');

function mergeSelectedTextbookResourcesIntoPdfText(
  session: GenerationSessionState,
): GenerationSessionState {
  const resources = session.selectedTextbookResources ?? [];
  if (resources.length === 0) {
    return session;
  }

  const locale = session.requirements.language === 'zh-CN' ? 'zh-CN' : 'en-US';
  const resourceReference = buildK12TextbookResourceReferenceText({
    resources,
    locale,
  });
  if (!resourceReference) {
    return session;
  }

  const currentPdfText = session.pdfText ?? '';
  const nextPdfText = mergeK12TextbookResourcesIntoReferenceText({
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
  if (session.requirements.moduleId !== 'k12' || !session.requirements.k12) {
    return undefined;
  }

  const presets = getModuleById('k12').presets as K12ModulePresets | undefined;
  if (!presets) {
    return {
      durationMinutes: session.requirements.k12.durationMinutes,
      status: 'draft' as const,
      exportStatus: 'not_exported' as const,
    };
  }
  const resolved = resolveK12LessonPackMetadata({
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

function mapJobStepToPreviewStep(step: ClassroomGenerationJobSnapshot['step']) {
  switch (step) {
    case 'queued':
    case 'initializing':
      return 'agent-generation';
    case 'researching':
      return 'web-search';
    case 'generating_outlines':
      return 'outline';
    case 'generating_scenes':
      return 'slide-content';
    case 'generating_media':
    case 'generating_tts':
    case 'persisting':
    case 'completed':
    case 'failed':
    case 'expired':
    default:
      return 'actions';
  }
}

function GenerationPreviewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const hasStartedRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [session, setSession] = useState<GenerationSessionState | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isComplete] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [streamingOutlines, setStreamingOutlines] = useState<SceneOutline[] | null>(null);
  const [truncationWarnings, setTruncationWarnings] = useState<string[]>([]);

  // Background job polling state
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<ClassroomGenerationJobSnapshot | null>(null);
  const [jobLoading, setJobLoading] = useState(false);

  useEffect(() => {
    // Extract jobId from URL query params
    const jobIdParam = searchParams?.get('jobId');
    if (jobIdParam) {
      setJobId(jobIdParam);
    }
  }, [searchParams]);

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

  // Compute active steps based on session state
  const activeSteps = getActiveSteps(session);
  const isJobMode = Boolean(jobId);
  const jobPreviewStepId = job ? mapJobStepToPreviewStep(job.step) : null;
  const jobPreviewStep = ALL_STEPS.find((step) => step.id === jobPreviewStepId) ?? ALL_STEPS[0];
  const jobPreviewOutlines: SceneOutline[] | null = job?.artifacts?.outlines
    ? job.artifacts.outlines.map((outline) => ({
        id: outline.id,
        title: outline.title,
        type: outline.type as SceneOutline['type'],
        description: outline.title,
        keyPoints: [],
        order: outline.order,
      }))
    : null;
  const activeStep =
    activeSteps.length > 0
      ? activeSteps[Math.min(currentStepIndex, activeSteps.length - 1)]
      : ALL_STEPS[0];

  // Load session from sessionStorage OR poll background job
  useEffect(() => {
    if (!authReady) return;

    let cancelled = false;

    // If jobId is provided, poll the background job API
    if (jobId) {
      setJobLoading(true);
      setSessionLoaded(true); // Mark as loaded so we don't show "session not found"
      let timer: ReturnType<typeof setTimeout> | undefined;

      const pollJob = async () => {
        try {
          const response = await fetch(`/api/generate-classroom/${encodeURIComponent(jobId)}`, {
            cache: 'no-store',
          });
          const body = (await response.json()) as
            | ({ success: true } & ClassroomGenerationJobSnapshot)
            | { success: false; error?: string };

          if (cancelled) return;

          if (!response.ok || !body.success) {
            throw new Error(body.success ? 'Request failed' : body.error || 'Request failed');
          }

          const snapshot: ClassroomGenerationJobSnapshot = {
            jobId: body.jobId,
            status: body.status,
            step: body.step,
            progress: body.progress,
            message: body.message,
            pollUrl: body.pollUrl,
            pollIntervalMs: body.pollIntervalMs,
            scenesGenerated: body.scenesGenerated,
            totalScenes: body.totalScenes,
            result: body.result,
            error: body.error,
            artifacts: body.artifacts,
            inputSummary: body.inputSummary,
            done: body.done,
          };

          setJob(snapshot);
          setError(null);
          setJobLoading(false);

          // If job succeeded, navigate to the result
          if (snapshot.status === 'succeeded') {
            if (snapshot.result?.url) {
              router.push(snapshot.result.url);
            }
            return;
          }

          // Continue polling if not done
          if (!snapshot.done) {
            timer = setTimeout(pollJob, snapshot.pollIntervalMs || 5000);
          }
        } catch (pollError) {
          if (cancelled) return;
          setJobLoading(false);
          setError(pollError instanceof Error ? pollError.message : String(pollError));
        }
      };

      void pollJob();
      return () => {
        cancelled = true;
        if (timer) clearTimeout(timer);
      };
    }

    // Otherwise, load from sessionStorage for foreground generation
    cleanupOldImages(24).catch((e) => log.error(e));

    const saved = sessionStorage.getItem('generationSession');
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as GenerationSessionState;
        setSession(parsed);
      } catch (e) {
        log.error('Failed to parse generation session:', e);
      }
    }
    setSessionLoaded(true);
    return () => {
      cancelled = true;
    };
  }, [authReady, jobId, router]);

  // Abort all in-flight requests on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

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
      'x-requires-api-key': modelConfig.requiresApiKey ? 'true' : 'false',
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

  // Auto-start generation when session is loaded
  useEffect(() => {
    if (session && !hasStartedRef.current) {
      hasStartedRef.current = true;
      startGeneration();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // Main generation flow
  const startGeneration = async () => {
    if (!session) return;

    // Create AbortController for this generation run
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const signal = controller.signal;

    // Use a local mutable copy so we can update it after PDF parsing
    let currentSession = mergeSelectedTextbookResourcesIntoPdfText(session);
    if (currentSession !== session) {
      setSession(currentSession);
      sessionStorage.setItem('generationSession', JSON.stringify(currentSession));
    }

    setError(null);
    setCurrentStepIndex(0);

    try {
      // Compute active steps for this session (recomputed after session mutations)
      let activeSteps = getActiveSteps(currentSession);
      const selectedTextbookPdfResources = getSelectedTextbookPdfResources(currentSession);

      // Determine if we need the document analysis step
      const hasDeferredUploadToAnalyze = Boolean(currentSession.pdfStorageKey);
      const hasSelectedTextbookPdfToAnalyze =
        selectedTextbookPdfResources.length > 0 && !currentSession.selectedTextbookResourcesParsed;
      const hasDocumentToAnalyze = hasDeferredUploadToAnalyze || hasSelectedTextbookPdfToAnalyze;
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

        const imageStorageIds = boundedImages.length > 0 ? await storeImages(boundedImages) : [];

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
        setSession(updatedSession);
        sessionStorage.setItem('generationSession', JSON.stringify(updatedSession));
        if (warnings.length > 0) {
          setTruncationWarnings(warnings);
        } else {
          setTruncationWarnings([]);
        }

        // Reassign local reference for subsequent steps
        currentSession = updatedSession;
        activeSteps = getActiveSteps(currentSession);
      }

      // Step: Web Search (if enabled)
      const webSearchStepIdx = activeSteps.findIndex((s) => s.id === 'web-search');
      if (currentSession.requirements.webSearch && webSearchStepIdx >= 0) {
        setCurrentStepIndex(webSearchStepIdx);
        setWebSearchSources([]);

        const wsSettings = useSettingsStore.getState();
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
        setSession(updatedSessionWithSearch);
        sessionStorage.setItem('generationSession', JSON.stringify(updatedSessionWithSearch));
        currentSession = updatedSessionWithSearch;
        activeSteps = getActiveSteps(currentSession);
      }

      // Load imageMapping early (needed for both outline and scene generation)
      let imageMapping: ImageMapping = {};
      if (currentSession.imageStorageIds && currentSession.imageStorageIds.length > 0) {
        log.debug('Loading images from IndexedDB');
        imageMapping = await loadImageMapping(currentSession.imageStorageIds);
      } else if (
        currentSession.imageMapping &&
        Object.keys(currentSession.imageMapping).length > 0
      ) {
        log.debug('Using imageMapping from session (old format)');
        imageMapping = currentSession.imageMapping;
      }

      // ── Agent generation (before outlines so persona can influence structure) ──
      const settings = useSettingsStore.getState();
      let agents: Array<{
        id: string;
        name: string;
        role: string;
        persona?: string;
      }> = [];

      // Create stage client-side (needed for agent generation stageId)
      const stageId = nanoid(10);
      const k12Module = getModuleById('k12');
      const k12Presets = k12Module.presets as K12ModulePresets | undefined;
      const lessonPack = buildLessonPackMetadata(
        currentSession,
        (currentSession.requirements.language === 'zh-CN' ? 'zh-CN' : 'en-US') as SupportedLocale,
      );
      const stage: Stage = {
        id: stageId,
        name: buildK12LessonPackTitle({
          input: currentSession.requirements.k12,
          presets: k12Presets,
          locale: (currentSession.requirements.language === 'zh-CN'
            ? 'zh-CN'
            : 'en-US') as SupportedLocale,
          requirement: currentSession.requirements.requirement,
        }),
        description: '',
        language: currentSession.requirements.language || 'zh-CN',
        style: 'professional',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lessonPack,
      };

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

      // ── Generate outlines (with agent personas for teacher context) ──
      let outlines = currentSession.sceneOutlines;

      const outlineStepIdx = activeSteps.findIndex((s) => s.id === 'outline');
      setCurrentStepIndex(outlineStepIdx >= 0 ? outlineStepIdx : 0);
      if (!outlines || outlines.length === 0) {
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

        const updatedSession = { ...currentSession, sceneOutlines: outlines };
        setSession(updatedSession);
        sessionStorage.setItem('generationSession', JSON.stringify(updatedSession));

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
      if (!outlines || outlines.length === 0) {
        throw new Error(t('generation.outlineEmptyResponse'));
      }

      // Store stage and outlines
      const store = useStageStore.getState();
      store.setStage(stage);
      store.setOutlines(outlines);

      // Advance to slide-content step
      const contentStepIdx = activeSteps.findIndex((s) => s.id === 'slide-content');
      if (contentStepIdx >= 0) setCurrentStepIndex(contentStepIdx);

      // Build stageInfo and userProfile for API call
      const stageInfo = {
        name: stage.name,
        description: stage.description,
        language: stage.language,
        style: stage.style,
      };

      const userProfile =
        currentSession.requirements.userNickname || currentSession.requirements.userBio
          ? `Student: ${currentSession.requirements.userNickname || 'Unknown'}${currentSession.requirements.userBio ? ` — ${currentSession.requirements.userBio}` : ''}`
          : undefined;

      // Generate ONLY the first scene
      store.setGeneratingOutlines(outlines);

      const firstOutline = outlines[0];

      // Step 2: Generate content (currentStepIndex is already 2)
      const contentResp = await fetch('/api/generate/scene-content', {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify({
          outline: firstOutline,
          allOutlines: outlines,
          pdfImages: currentSession.pdfImages,
          imageMapping,
          stageInfo,
          stageId: stage.id,
          agents,
        }),
        signal,
      });

      if (!contentResp.ok) {
        const errorData = await contentResp.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(errorData.error || t('generation.sceneGenerateFailed'));
      }

      const contentData = await contentResp.json();
      if (!contentData.success || !contentData.content) {
        throw new Error(contentData.error || t('generation.sceneGenerateFailed'));
      }

      // Generate actions (activate actions step indicator)
      const actionsStepIdx = activeSteps.findIndex((s) => s.id === 'actions');
      setCurrentStepIndex(actionsStepIdx >= 0 ? actionsStepIdx : currentStepIndex + 1);

      const actionsResp = await fetch('/api/generate/scene-actions', {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify({
          outline: contentData.effectiveOutline || firstOutline,
          allOutlines: outlines,
          content: contentData.content,
          stageId: stage.id,
          agents,
          previousSpeeches: [],
          userProfile,
        }),
        signal,
      });

      if (!actionsResp.ok) {
        const errorData = await actionsResp.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(errorData.error || t('generation.sceneGenerateFailed'));
      }

      const data = await actionsResp.json();
      if (!data.success || !data.scene) {
        throw new Error(data.error || t('generation.sceneGenerateFailed'));
      }

      // Generate TTS for first scene (part of actions step — blocking)
      if (settings.ttsEnabled && settings.ttsProviderId !== 'browser-native-tts') {
        const speechActions = (data.scene.actions || []).filter(
          (a: { type: string; text?: string }) => a.type === 'speech' && a.text,
        );

        let ttsFailCount = 0;
        for (const action of speechActions) {
          const audioId = `tts_${action.id}`;
          try {
            const result = await generateAndStoreTTS(audioId, action.text || '', stage.id, signal);
            action.audioId = result.audioId;
            if (result.audioUrl) {
              action.audioUrl = result.audioUrl;
            }
          } catch (err) {
            log.warn(`[TTS] Failed for ${audioId}:`, err);
            ttsFailCount++;
          }
        }

        if (ttsFailCount > 0 && speechActions.length > 0) {
          throw new Error(t('generation.speechFailed'));
        }
      }

      // Add scene to store and navigate
      store.addScene(data.scene);
      store.setCurrentSceneId(data.scene.id);

      // Set remaining outlines as skeleton placeholders
      const remaining = outlines.filter((o) => o.order !== data.scene.order);
      store.setGeneratingOutlines(remaining);

      // Store generation params for classroom to continue generation
      sessionStorage.setItem(
        'generationParams',
        JSON.stringify({
          pdfImages: currentSession.pdfImages,
          agents,
          userProfile,
        }),
      );

      sessionStorage.removeItem('generationSession');
      await store.saveToStorage();
      router.push(`/classroom/${stage.id}`);
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
    sessionStorage.removeItem('generationSession');
    router.push('/');
  };

  if (!authReady) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center">
        <p className="text-sm text-muted-foreground">{t('auth.checkingSession')}</p>
      </div>
    );
  }

  if (isJobMode && jobLoading && !job) {
    return (
      <div className="min-h-[100dvh] w-full bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center p-4">
        <div className="text-center text-muted-foreground">
          <div className="size-8 border-2 border-current border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-4 text-sm">{t('generation.loadingJob')}</p>
        </div>
      </div>
    );
  }

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

  // No session found (foreground generation mode only)
  if (!session && !isJobMode) {
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

  const previewSteps = isJobMode ? ALL_STEPS : activeSteps;
  const previewStep = isJobMode ? jobPreviewStep : activeStep;
  const previewCurrentStepIndex = Math.max(
    0,
    previewSteps.findIndex((step) => step.id === previewStep.id),
  );
  const previewOutlines = isJobMode ? jobPreviewOutlines : streamingOutlines;
  const previewError = isJobMode ? job?.error || error : error;
  const previewComplete = isJobMode ? job?.status === 'succeeded' : isComplete;
  const previewStatusMessage = isJobMode
    ? job?.message || t('generation.loadingJob')
    : statusMessage || t(previewStep.description);

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
              {previewSteps.map((step, idx) => (
                <div
                  key={step.id}
                  className={cn(
                    'h-1.5 rounded-full transition-all duration-500',
                    idx < previewCurrentStepIndex
                      ? 'w-1.5 bg-blue-500/30'
                      : idx === previewCurrentStepIndex
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
                  {previewError ? (
                    <motion.div
                      key="error"
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="size-32 rounded-full bg-red-500/10 flex items-center justify-center border-2 border-red-500/20"
                    >
                      <AlertCircle className="size-16 text-red-500" />
                    </motion.div>
                  ) : previewComplete ? (
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
                      key={previewStep.id}
                      initial={{ scale: 0.8, opacity: 0, filter: 'blur(10px)' }}
                      animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }}
                      exit={{ scale: 1.2, opacity: 0, filter: 'blur(10px)' }}
                      transition={{ duration: 0.4 }}
                      className="absolute inset-0 flex items-center justify-center"
                    >
                      <StepVisualizer
                        stepId={previewStep.id}
                        outlines={previewOutlines}
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
                    key={previewError ? 'error' : previewComplete ? 'done' : previewStep.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-2"
                  >
                    <h2 className="text-2xl font-bold tracking-tight">
                      {previewError
                        ? t('generation.generationFailed')
                        : previewComplete
                          ? t('generation.generationComplete')
                          : t(previewStep.title)}
                    </h2>
                    <p className="text-muted-foreground text-base">
                      {previewError
                        ? previewError
                        : previewComplete
                          ? t('generation.classroomReady')
                          : previewStatusMessage}
                    </p>
                  </motion.div>
                </AnimatePresence>

                {/* Truncation warning indicator */}
                <AnimatePresence>
                  {truncationWarnings.length > 0 &&
                    !previewError &&
                    !previewComplete &&
                    !isJobMode && (
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
            {previewError ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-xs"
              >
                <Button size="lg" variant="outline" className="w-full h-12" onClick={goBackToHome}>
                  {t('generation.goBackAndRetry')}
                </Button>
              </motion.div>
            ) : !previewComplete ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-3 text-sm text-muted-foreground/50 font-medium uppercase tracking-widest"
              >
                <Sparkles className="size-3 animate-pulse" />
                {t('generation.aiWorking')}
                {!isJobMode && generatedAgents.length > 0 && !showAgentReveal && (
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
      {!isJobMode ? (
        <AgentRevealModal
          agents={generatedAgents}
          open={showAgentReveal}
          onClose={() => setShowAgentReveal(false)}
          onAllRevealed={() => {
            agentRevealResolveRef.current?.();
            agentRevealResolveRef.current = null;
          }}
        />
      ) : null}
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
