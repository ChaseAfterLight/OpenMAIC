/**
 * Playback Storage - Persist playback engine state to IndexedDB
 *
 * Stores minimal state needed to resume playback from a breakpoint:
 * position (sceneIndex + actionIndex) and consumed discussions.
 */

import { getStorageAdapter } from '@/lib/storage';

export interface PlaybackSnapshot {
  sceneIndex: number;
  actionIndex: number;
  consumedDiscussions: string[];
  sceneId?: string; // Scene this snapshot belongs to; discard on mismatch
}

/**
 * Save playback state for a stage.
 * Each stage has at most one playback state record.
 */
export async function savePlaybackState(
  stageId: string,
  snapshot: PlaybackSnapshot,
): Promise<void> {
  const storage = getStorageAdapter();
  await storage.savePlaybackStateRecord({
    stageId,
    sceneIndex: snapshot.sceneIndex,
    actionIndex: snapshot.actionIndex,
    consumedDiscussions: snapshot.consumedDiscussions,
    sceneId: snapshot.sceneId,
    updatedAt: Date.now(),
  });
}

/**
 * Load playback state for a stage.
 * Returns null if no saved state exists.
 */
export async function loadPlaybackState(stageId: string): Promise<PlaybackSnapshot | null> {
  const storage = getStorageAdapter();
  const record = await storage.getPlaybackStateRecord(stageId);
  if (!record) return null;

  return {
    sceneIndex: record.sceneIndex,
    actionIndex: record.actionIndex,
    consumedDiscussions: record.consumedDiscussions,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sceneId: (record as any).sceneId as string | undefined,
  };
}

/**
 * Clear playback state for a stage (e.g. on playback complete or stop).
 */
export async function clearPlaybackState(stageId: string): Promise<void> {
  const storage = getStorageAdapter();
  await storage.deletePlaybackStateRecord(stageId);
}
