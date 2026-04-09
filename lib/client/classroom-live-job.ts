const LIVE_JOB_PREFIX = 'classroom-live-job:';
const LIVE_REGENERATING_SCENE_PREFIX = 'classroom-live-regenerating-scene:';
const LIVE_LOCALLY_EDITED_SCENES_PREFIX = 'classroom-live-locally-edited-scenes:';

function getStorageKey(classroomId: string) {
  return `${LIVE_JOB_PREFIX}${classroomId}`;
}

function getRegeneratingSceneStorageKey(classroomId: string) {
  return `${LIVE_REGENERATING_SCENE_PREFIX}${classroomId}`;
}

function getLocallyEditedScenesStorageKey(classroomId: string) {
  return `${LIVE_LOCALLY_EDITED_SCENES_PREFIX}${classroomId}`;
}

export function getLiveClassroomJobId(classroomId: string): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.sessionStorage.getItem(getStorageKey(classroomId));
}

export function setLiveClassroomJobId(classroomId: string, jobId: string) {
  if (typeof window === 'undefined') {
    return;
  }
  window.sessionStorage.setItem(getStorageKey(classroomId), jobId);
}

export function clearLiveClassroomJobId(classroomId: string) {
  if (typeof window === 'undefined') {
    return;
  }
  window.sessionStorage.removeItem(getStorageKey(classroomId));
}

export function getLiveRegeneratingSceneId(classroomId: string): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.sessionStorage.getItem(getRegeneratingSceneStorageKey(classroomId));
}

export function setLiveRegeneratingSceneId(classroomId: string, sceneId: string) {
  if (typeof window === 'undefined') {
    return;
  }
  window.sessionStorage.setItem(getRegeneratingSceneStorageKey(classroomId), sceneId);
}

export function clearLiveRegeneratingSceneId(classroomId: string) {
  if (typeof window === 'undefined') {
    return;
  }
  window.sessionStorage.removeItem(getRegeneratingSceneStorageKey(classroomId));
}

type LocallyEditedScenesRecord = Record<string, number>;

function readLocallyEditedScenesRecord(classroomId: string): LocallyEditedScenesRecord {
  if (typeof window === 'undefined') {
    return {};
  }

  const raw = window.sessionStorage.getItem(getLocallyEditedScenesStorageKey(classroomId));
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as LocallyEditedScenesRecord;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeLocallyEditedScenesRecord(classroomId: string, record: LocallyEditedScenesRecord) {
  if (typeof window === 'undefined') {
    return;
  }

  const nextEntries = Object.entries(record).filter(
    ([sceneId, timestamp]) =>
      sceneId.trim().length > 0 && Number.isFinite(timestamp) && timestamp > 0,
  );

  if (nextEntries.length === 0) {
    window.sessionStorage.removeItem(getLocallyEditedScenesStorageKey(classroomId));
    return;
  }

  window.sessionStorage.setItem(
    getLocallyEditedScenesStorageKey(classroomId),
    JSON.stringify(Object.fromEntries(nextEntries)),
  );
}

export function markLiveLocallyEditedScene(
  classroomId: string,
  sceneId: string,
  timestamp = Date.now(),
) {
  if (typeof window === 'undefined' || !sceneId.trim()) {
    return;
  }

  const record = readLocallyEditedScenesRecord(classroomId);
  record[sceneId] = timestamp;
  writeLocallyEditedScenesRecord(classroomId, record);
}

export function getLiveLocallyEditedSceneIds(
  classroomId: string,
  maxAgeMs = 10 * 60 * 1000,
): string[] {
  const cutoff = Date.now() - Math.max(0, maxAgeMs);
  const record = readLocallyEditedScenesRecord(classroomId);
  const freshEntries = Object.entries(record).filter(([, timestamp]) => timestamp >= cutoff);

  if (freshEntries.length !== Object.keys(record).length) {
    writeLocallyEditedScenesRecord(classroomId, Object.fromEntries(freshEntries));
  }

  return freshEntries.map(([sceneId]) => sceneId);
}

export function clearLiveLocallyEditedScenes(classroomId: string) {
  if (typeof window === 'undefined') {
    return;
  }
  window.sessionStorage.removeItem(getLocallyEditedScenesStorageKey(classroomId));
}
