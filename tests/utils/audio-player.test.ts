import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  audioGetMock: vi.fn(),
}));
const createObjectURLMock = vi.fn(() => 'blob:local-audio');
const revokeObjectURLMock = vi.fn();

vi.mock('@/lib/utils/database', () => ({
  db: {
    audioFiles: {
      get: mocks.audioGetMock,
    },
  },
}));

import { createAudioPlayer } from '@/lib/utils/audio-player';

class FakeAudio {
  src = '';
  volume = 1;
  defaultPlaybackRate = 1;
  playbackRate = 1;
  paused = false;
  private endedHandler: (() => void) | null = null;

  addEventListener(event: string, handler: () => void): void {
    if (event === 'ended') {
      this.endedHandler = handler;
    }
  }

  pause(): void {
    this.paused = true;
  }

  async play(): Promise<void> {
    this.paused = false;
    if (this.src.includes('downloadAudio')) {
      throw new Error('shared audio unavailable');
    }
  }

  triggerEnded(): void {
    this.endedHandler?.();
  }
}

describe('AudioPlayer', () => {
  beforeEach(() => {
    mocks.audioGetMock.mockReset();
    createObjectURLMock.mockClear();
    revokeObjectURLMock.mockClear();
    vi.stubGlobal('Audio', FakeAudio as unknown as typeof Audio);
    vi.stubGlobal('URL', {
      createObjectURL: createObjectURLMock,
      revokeObjectURL: revokeObjectURLMock,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('falls back to IndexedDB when the shared audio URL fails', async () => {
    mocks.audioGetMock.mockResolvedValue({
      blob: new Blob(['local-audio'], { type: 'audio/mpeg' }),
    });

    const player = createAudioPlayer();
    const started = await player.play(
      'audio-1',
      '/api/storage?action=downloadAudio&stageId=stage-1&id=audio-1',
    );

    expect(started).toBe(true);
    expect(mocks.audioGetMock).toHaveBeenCalledWith('audio-1');
    expect(createObjectURLMock).toHaveBeenCalledTimes(1);
  });

  it('returns false when both shared audio and local cache are unavailable', async () => {
    mocks.audioGetMock.mockResolvedValue(undefined);

    const player = createAudioPlayer();
    const started = await player.play(
      'audio-1',
      '/api/storage?action=downloadAudio&stageId=stage-1&id=audio-1',
    );

    expect(started).toBe(false);
    expect(mocks.audioGetMock).toHaveBeenCalledWith('audio-1');
  });
});
