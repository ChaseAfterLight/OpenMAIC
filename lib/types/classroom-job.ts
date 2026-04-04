import type { LessonPackMetadata } from '@/lib/types/stage';

export type ClassroomGenerationJobStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'expired';

export type ClassroomGenerationJobStep =
  | 'queued'
  | 'initializing'
  | 'researching'
  | 'generating_outlines'
  | 'generating_scenes'
  | 'generating_media'
  | 'generating_tts'
  | 'persisting'
  | 'completed'
  | 'failed'
  | 'expired';

export interface ClassroomGenerationResultSummary {
  classroomId: string;
  url: string;
  scenesCount: number;
  stageName?: string;
}

export interface ClassroomGenerationArtifacts {
  requirement?: {
    requirementPreview: string;
    language: string;
    hasPdf: boolean;
    lessonPackTitle?: string;
    lessonPackMetadata?: LessonPackMetadata;
  };
  outlines?: Array<{
    id: string;
    title: string;
    type: string;
    order: number;
  }>;
  content?: Array<{
    id: string;
    title: string;
    type: string;
    order: number;
    actionCount?: number;
  }>;
  final?: ClassroomGenerationResultSummary;
}

export interface ClassroomGenerationJobSnapshot {
  jobId: string;
  stageId?: string;
  status: ClassroomGenerationJobStatus;
  step: ClassroomGenerationJobStep;
  progress: number;
  message: string;
  pollUrl: string;
  pollIntervalMs: number;
  scenesGenerated: number;
  totalScenes?: number;
  result?: ClassroomGenerationResultSummary;
  error?: string;
  artifacts?: ClassroomGenerationArtifacts;
  inputSummary?: {
    requirementPreview: string;
    language: string;
    hasPdf: boolean;
    pdfTextLength: number;
    pdfImageCount: number;
    enableWebSearch: boolean;
    agentMode: 'default' | 'generate';
  };
  done: boolean;
}
