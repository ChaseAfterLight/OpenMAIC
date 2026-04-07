const LIVE_JOB_PREFIX = 'classroom-live-job:';
const LIVE_REGENERATING_SCENE_PREFIX = 'classroom-live-regenerating-scene:';

function getStorageKey(classroomId: string) {
  return `${LIVE_JOB_PREFIX}${classroomId}`;
}

function getRegeneratingSceneStorageKey(classroomId: string) {
  return `${LIVE_REGENERATING_SCENE_PREFIX}${classroomId}`;
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
