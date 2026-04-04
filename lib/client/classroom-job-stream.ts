export interface ClassroomJobResult {
  classroomId: string;
  url: string;
  scenesCount: number;
}

export interface ClassroomJobStreamState {
  type?: 'snapshot' | 'progress' | 'done' | 'error';
  jobId: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  step: string;
  progress: number;
  message: string;
  pollUrl: string;
  eventsUrl: string;
  pollIntervalMs: number;
  scenesGenerated: number;
  totalScenes?: number;
  result?: ClassroomJobResult;
  error?: string;
  done: boolean;
}

interface StartClassroomJobStreamArgs {
  job: ClassroomJobStreamState;
  signal?: AbortSignal;
  onUpdate: (job: ClassroomJobStreamState) => void;
  onTerminal?: (job: ClassroomJobStreamState) => void;
  onError?: (message: string) => void;
}

export function startClassroomJobStream({
  job,
  signal,
  onUpdate,
  onTerminal,
  onError,
}: StartClassroomJobStreamArgs) {
  let closed = false;
  let eventSource: EventSource | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let pollInFlight = false;

  const close = () => {
    if (closed) return;
    closed = true;
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  };

  const emit = (nextJob: ClassroomJobStreamState) => {
    if (closed) return;
    onUpdate(nextJob);
    if (nextJob.status === 'succeeded' || nextJob.status === 'failed' || nextJob.done) {
      onTerminal?.(nextJob);
      close();
    }
  };

  const pollOnce = async () => {
    if (closed || pollInFlight) return;
    pollInFlight = true;
    try {
      const res = await fetch(job.pollUrl, { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`Polling failed with status ${res.status}`);
      }
      const data = (await res.json()) as
        | { success: true; job?: ClassroomJobStreamState; [key: string]: unknown }
        | { success?: false; error?: string };

      if (!('success' in data) || !data.success) {
        throw new Error(data.error || 'Polling failed');
      }

      const nextJob = (data.job ?? data) as ClassroomJobStreamState;
      emit(nextJob);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onError?.(message);
    } finally {
      pollInFlight = false;
    }
  };

  const startPollingFallback = () => {
    if (pollTimer || closed) return;
    void pollOnce();
    pollTimer = setInterval(() => {
      void pollOnce();
    }, job.pollIntervalMs || 5000);
  };

  try {
    eventSource = new EventSource(job.eventsUrl);
    eventSource.onmessage = (event) => {
      try {
        const nextJob = JSON.parse(event.data) as ClassroomJobStreamState;
        emit(nextJob);
      } catch (error) {
        onError?.(error instanceof Error ? error.message : String(error));
      }
    };
    eventSource.onerror = () => {
      if (closed) return;
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      startPollingFallback();
    };
  } catch (error) {
    onError?.(error instanceof Error ? error.message : String(error));
    startPollingFallback();
  }

  if (signal) {
    if (signal.aborted) {
      close();
    } else {
      signal.addEventListener('abort', close, { once: true });
    }
  }

  return { close };
}
