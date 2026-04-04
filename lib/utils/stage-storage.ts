/**
 * Stage Storage Manager
 *
 * Manages multiple stage data in IndexedDB
 * Each stage has its own storage key based on stageId
 */

import { Stage, Scene } from '../types/stage';
import { ChatSession } from '../types/chat';
import type { SceneOutline } from '@/lib/types/generation';
import { saveChatSessions, loadChatSessions, deleteChatSessions } from './chat-storage';
import { clearPlaybackState } from './playback-storage';
import { createLogger } from '@/lib/logger';
import { getActiveStorageDriver, getStorageAdapter } from '@/lib/storage';
import type { HybridSyncRecord } from '@/lib/storage/hybrid-sync';
import { getHybridSyncState } from '@/lib/storage/hybrid-sync';
import { buildLessonPackVersionRecord, ensureStageLessonPack } from '@/lib/utils/lesson-pack';
import type { LessonPackVersionSource } from '@/lib/types/stage';
import { mediaFileKey, type LessonPackVersionRecord } from '@/lib/utils/database';
import { nanoid } from 'nanoid';

const log = createLogger('StageStorage');

export interface StageStoreData {
  stage: Stage;
  scenes: Scene[];
  currentSceneId: string | null;
  chats: ChatSession[];
}

export interface StageListItem {
  id: string;
  name: string;
  description?: string;
  sceneCount: number;
  createdAt: number;
  updatedAt: number;
  lessonPack: NonNullable<Stage['lessonPack']>;
  sync?: HybridSyncRecord;
}

/**
 * Save stage data to IndexedDB
 */
export async function saveStageData(stageId: string, data: StageStoreData): Promise<void> {
  try {
    const storage = getStorageAdapter();
    const now = Date.now();
    const stage = ensureStageLessonPack({
      ...data.stage,
      createdAt: data.stage.createdAt || now,
      updatedAt: now,
    });

    // Save to stages table
    await storage.saveStageRecord({
      id: stageId,
      ownerUserId: stage.ownerUserId,
      name: stage.name || 'Untitled Stage',
      description: stage.description,
      createdAt: stage.createdAt || now,
      updatedAt: now,
      lessonPack: stage.lessonPack,
      language: stage.language,
      style: stage.style,
      currentSceneId: data.currentSceneId || undefined,
      agentIds: stage.agentIds,
    });

    // Save new scenes
    const sceneRecords = (data.scenes || []).map((scene, index) => ({
      ...scene,
      stageId,
      order: scene.order ?? index,
      createdAt: scene.createdAt || now,
      updatedAt: scene.updatedAt || now,
    }));
    await storage.replaceScenesByStageId(stageId, sceneRecords);

    // Save chat sessions to independent table
    if (data.chats) {
      await saveChatSessions(stageId, data.chats);
    }

    log.info(`Saved stage: ${stageId}`);
  } catch (error) {
    log.error('Failed to save stage:', error);
    throw error;
  }
}

/**
 * Load stage data from IndexedDB
 */
export async function loadStageData(stageId: string): Promise<StageStoreData | null> {
  try {
    const storage = getStorageAdapter();

    // Load stage
    const storedStage = await storage.getStageRecord(stageId);
    if (!storedStage) {
      log.info(`Stage not found: ${stageId}`);
      return null;
    }
    const stage = ensureStageLessonPack(storedStage);

    // Load scenes
    const scenes = await storage.listScenesByStageId(stageId);

    // Load chat sessions from independent table
    const chats = await loadChatSessions(stageId);

    log.info(`Loaded stage: ${stageId}, scenes: ${scenes.length}, chats: ${chats.length}`);

    return {
      stage,
      scenes,
      currentSceneId: stage.currentSceneId || scenes[0]?.id || null,
      chats,
    };
  } catch (error) {
    log.error('Failed to load stage:', error);
    return null;
  }
}

/**
 * Delete stage and all related data
 */
export async function deleteStageData(stageId: string): Promise<void> {
  try {
    const storage = getStorageAdapter();

    // Delete scenes
    await storage.deleteScenesByStageId(stageId);

    // Delete chat sessions and playback state
    await deleteChatSessions(stageId);
    await clearPlaybackState(stageId);
    await storage.deleteStageOutlinesRecord(stageId);
    await storage.deleteLessonPackVersionsByStageId(stageId);
    await storage.deleteMediaFilesByStageId(stageId);

    // Delete the stage row last so server-side access checks still pass
    // for the related cleanup calls above.
    await storage.deleteStageRecord(stageId);

    log.info(`Deleted stage: ${stageId}`);
  } catch (error) {
    log.error('Failed to delete stage:', error);
    throw error;
  }
}

/**
 * List all stages
 */
export async function listStages(): Promise<StageListItem[]> {
  try {
    const storage = getStorageAdapter();
    const stages = await storage.listStageRecordsByUpdatedAtDesc();

    const stageList: StageListItem[] = await Promise.all(
      stages.map(async (stage) => {
        const normalizedStage = ensureStageLessonPack(stage);
        const sceneCount = await storage.countScenesByStageId(stage.id);

        return {
          id: stage.id,
          name: stage.name,
          description: stage.description,
          sceneCount,
          createdAt: stage.createdAt,
          updatedAt: stage.updatedAt,
          lessonPack: normalizedStage.lessonPack!,
          sync: getActiveStorageDriver() === 'hybrid' ? getHybridSyncState(stage.id) : undefined,
        };
      }),
    );

    return stageList;
  } catch (error) {
    log.error('Failed to list stages:', error);
    return [];
  }
}

/**
 * Get first slide scene's canvas data for each stage (for thumbnail preview).
 * Also resolves gen_img_* placeholders from mediaFiles so thumbnails show real images.
 * Returns a map of stageId -> Slide (canvas data with resolved images)
 */
export async function getFirstSlideByStages(
  stageIds: string[],
): Promise<Record<string, import('../types/slides').Slide>> {
  const storage = getStorageAdapter();
  const result: Record<string, import('../types/slides').Slide> = {};
  try {
    await Promise.all(
      stageIds.map(async (stageId) => {
        const scenes = await storage.listScenesByStageId(stageId);
        const firstSlide = scenes.find((s) => s.content?.type === 'slide');
        if (firstSlide && firstSlide.content.type === 'slide') {
          const slide = structuredClone(firstSlide.content.canvas);

          // Resolve gen_img_* placeholders from mediaFiles
          const placeholderEls = slide.elements.filter(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (el: any) => el.type === 'image' && /^gen_(img|vid)_[\w-]+$/i.test(el.src as string),
          );
          if (placeholderEls.length > 0) {
            const mediaRecords = await storage.listMediaFilesByStageId(stageId);
            const mediaMap = new Map(
              mediaRecords.map((r) => {
                // Key format: stageId:elementId → extract elementId
                const elementId = r.id.includes(':') ? r.id.split(':').slice(1).join(':') : r.id;
                return [elementId, r.blob] as const;
              }),
            );
            for (const el of placeholderEls as Array<{ src: string }>) {
              const blob = mediaMap.get(el.src);
              if (blob) {
                el.src = URL.createObjectURL(blob);
              } else {
                // Clear unresolved placeholder so BaseImageElement won't subscribe
                // to the global media store (which may have stale data from another course)
                el.src = '';
              }
            }
          }

          result[stageId] = slide;
        }
      }),
    );
  } catch (error) {
    log.error('Failed to load thumbnails:', error);
  }
  return result;
}

/**
 * Check if stage exists
 */
export async function stageExists(stageId: string): Promise<boolean> {
  try {
    const storage = getStorageAdapter();
    const stage = await storage.getStageRecord(stageId);
    return !!stage;
  } catch (error) {
    log.error('Failed to check stage existence:', error);
    return false;
  }
}

/**
 * Persist outlines for resume-on-refresh.
 */
export async function saveStageOutlines(stageId: string, outlines: SceneOutline[]): Promise<void> {
  const storage = getStorageAdapter();
  const now = Date.now();
  await storage.saveStageOutlinesRecord({
    stageId,
    outlines,
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Load persisted outlines for a stage.
 */
export async function loadStageOutlines(stageId: string): Promise<SceneOutline[]> {
  const storage = getStorageAdapter();
  const record = await storage.getStageOutlinesRecord(stageId);
  return record?.outlines || [];
}

export async function saveLessonPackVersion(
  stageId: string,
  options?: {
    note?: string;
    source?: LessonPackVersionSource;
  },
): Promise<LessonPackVersionRecord> {
  const storage = getStorageAdapter();
  const [stage, scenes, chats, playback, outlines] = await Promise.all([
    storage.getStageRecord(stageId),
    storage.listScenesByStageId(stageId),
    storage.listChatSessionsByStageId(stageId),
    storage.getPlaybackStateRecord(stageId),
    storage.getStageOutlinesRecord(stageId),
  ]);

  if (!stage) {
    throw new Error(`Cannot save lesson pack version: stage ${stageId} not found`);
  }

  const createdAt = Date.now();
  const record = buildLessonPackVersionRecord({
    versionId: `lpv_${stageId}_${createdAt}`,
    stageId,
    createdAt,
    note: options?.note,
    source: options?.source ?? 'manual',
    stage: ensureStageLessonPack(stage),
    scenes,
    chats,
    playback,
    outlines,
  });

  await storage.saveLessonPackVersionRecord(record);
  return record;
}

export async function listLessonPackVersions(stageId: string): Promise<LessonPackVersionRecord[]> {
  const storage = getStorageAdapter();
  return storage.listLessonPackVersionRecordsByStageId(stageId);
}

export async function restoreLessonPackVersion(
  stageId: string,
  versionId: string,
): Promise<LessonPackVersionRecord> {
  const storage = getStorageAdapter();
  const record = await storage.getLessonPackVersionRecord(stageId, versionId);

  if (!record) {
    throw new Error(`Lesson pack version not found: ${stageId}/${versionId}`);
  }

  const now = Date.now();
  const restoredStage = ensureStageLessonPack({
    ...record.snapshot.stage,
    id: stageId,
    updatedAt: now,
    lessonPack: {
      ...record.snapshot.stage.lessonPack,
      status: 'draft',
    },
  });

  await storage.saveStageRecord(restoredStage);
  await storage.replaceScenesByStageId(stageId, record.snapshot.scenes);
  await storage.replaceChatSessionsByStageId(stageId, record.snapshot.chats);

  if (record.snapshot.playback) {
    await storage.savePlaybackStateRecord({
      ...record.snapshot.playback,
      stageId,
      updatedAt: now,
    });
  } else {
    await storage.deletePlaybackStateRecord(stageId);
  }

  if (record.snapshot.outlines) {
    await storage.saveStageOutlinesRecord({
      ...record.snapshot.outlines,
      stageId,
      updatedAt: now,
    });
  } else {
    await storage.deleteStageOutlinesRecord(stageId);
  }

  return record;
}

export async function renameStage(stageId: string, name: string): Promise<void> {
  const storage = getStorageAdapter();
  const stage = await storage.getStageRecord(stageId);

  if (!stage) {
    throw new Error(`Stage not found: ${stageId}`);
  }

  await storage.saveStageRecord(
    ensureStageLessonPack({
      ...stage,
      name: name.trim() || stage.name,
      updatedAt: Date.now(),
    }),
  );
}

export async function markLessonPackExported(stageId: string): Promise<void> {
  const storage = getStorageAdapter();
  const stage = await storage.getStageRecord(stageId);

  if (!stage) {
    throw new Error(`Stage not found: ${stageId}`);
  }

  const now = Date.now();
  await storage.saveStageRecord(
    ensureStageLessonPack({
      ...stage,
      updatedAt: now,
      lessonPack: {
        ...stage.lessonPack,
        status: stage.lessonPack?.status ?? 'draft',
        exportStatus: 'exported',
        lastExportedAt: now,
      },
    }),
  );
}

export async function duplicateStage(stageId: string): Promise<Stage> {
  const storage = getStorageAdapter();
  const [stage, scenes, chats, outlines, mediaFiles] = await Promise.all([
    storage.getStageRecord(stageId),
    storage.listScenesByStageId(stageId),
    storage.listChatSessionsByStageId(stageId),
    storage.getStageOutlinesRecord(stageId),
    storage.listMediaFilesByStageId(stageId),
  ]);

  if (!stage) {
    throw new Error(`Stage not found: ${stageId}`);
  }

  const now = Date.now();
  const newStageId = nanoid(10);
  const duplicatedStage = ensureStageLessonPack({
    ...stage,
    id: newStageId,
    name: `${stage.name} Copy`,
    currentSceneId: scenes[0]?.id,
    createdAt: now,
    updatedAt: now,
    lessonPack: {
      ...stage.lessonPack,
      status: 'draft',
      exportStatus: 'not_exported',
      lastExportedAt: undefined,
    },
  });

  const duplicatedScenes = scenes.map((scene) => ({
    ...scene,
    stageId: newStageId,
    createdAt: now,
    updatedAt: now,
  }));

  const duplicatedChats = chats.map((chat) => ({
    ...chat,
    id: nanoid(12),
    stageId: newStageId,
    createdAt: now,
    updatedAt: now,
  }));

  const duplicatedOutlines = outlines
    ? {
        ...outlines,
        stageId: newStageId,
        createdAt: now,
        updatedAt: now,
      }
    : undefined;

  const duplicatedMedia = mediaFiles.map((record) => {
    const elementId = record.id.includes(':') ? record.id.split(':').slice(1).join(':') : record.id;
    return {
      ...record,
      id: mediaFileKey(newStageId, elementId),
      stageId: newStageId,
      createdAt: now,
      ossKey: undefined,
      posterOssKey: undefined,
    };
  });

  await storage.saveStageRecord(duplicatedStage);
  await storage.replaceScenesByStageId(newStageId, duplicatedScenes);
  await storage.replaceChatSessionsByStageId(newStageId, duplicatedChats);

  if (duplicatedOutlines) {
    await storage.saveStageOutlinesRecord(duplicatedOutlines);
  }

  for (const mediaRecord of duplicatedMedia) {
    await storage.saveMediaFileRecord(mediaRecord);
  }

  return duplicatedStage;
}
