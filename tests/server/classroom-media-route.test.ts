import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getMediaFileBlob: vi.fn(),
  listMediaFilesByStageId: vi.fn(),
  getAudioFileBlob: vi.fn(),
  listAudioFileRecordsByStageId: vi.fn(),
}));

vi.mock('@/lib/server/storage-repository', () => ({
  getMediaFileBlob: mocks.getMediaFileBlob,
  listMediaFilesByStageId: mocks.listMediaFilesByStageId,
  getAudioFileBlob: mocks.getAudioFileBlob,
  listAudioFileRecordsByStageId: mocks.listAudioFileRecordsByStageId,
}));

import { GET } from '@/app/api/classroom-media/[classroomId]/[...path]/route';

describe('/api/classroom-media', () => {
  it('resolves generated media from server storage before falling back to legacy files', async () => {
    mocks.getMediaFileBlob.mockImplementation(async (_stageId, mediaId) => {
      if (mediaId === 'element-1') {
        return null;
      }
      if (mediaId === 'stage-1:element-1') {
        return {
          buffer: Buffer.from('stored-media'),
          mimeType: 'image/png',
        };
      }
      return null;
    });
    mocks.listMediaFilesByStageId.mockResolvedValue([
      {
        id: 'stage-1:element-1',
      },
    ]);

    const response = await GET(new Request('http://localhost/api/classroom-media/stage-1/media/element-1.png') as never, {
      params: Promise.resolve({
        classroomId: 'stage-1',
        path: ['media', 'element-1.png'],
      }) as never,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(await response.text()).toBe('stored-media');
    expect(mocks.listMediaFilesByStageId).toHaveBeenCalledWith('stage-1');
  });
});
