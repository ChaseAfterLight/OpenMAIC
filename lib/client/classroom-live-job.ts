const LIVE_JOB_PREFIX = 'classroom-live-job:';

function getStorageKey(classroomId: string) {
  return `${LIVE_JOB_PREFIX}${classroomId}`;
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
