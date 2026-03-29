import type { StorageAdapter } from '@/lib/storage/types';

function createNotImplemented(method: string): never {
  throw new Error(
    `[storage:server] 方法 "${method}" 尚未实现。请将 NEXT_PUBLIC_STORAGE_DRIVER 设置为 indexeddb 以继续使用本地存储。`,
  );
}

export const serverStorageAdapter: StorageAdapter = {
  async saveStageRecord() {
    return createNotImplemented('saveStageRecord');
  },
  async getStageRecord() {
    return createNotImplemented('getStageRecord');
  },
  async deleteStageRecord() {
    return createNotImplemented('deleteStageRecord');
  },
  async listStageRecordsByUpdatedAtDesc() {
    return createNotImplemented('listStageRecordsByUpdatedAtDesc');
  },
  async replaceScenesByStageId() {
    return createNotImplemented('replaceScenesByStageId');
  },
  async listScenesByStageId() {
    return createNotImplemented('listScenesByStageId');
  },
  async countScenesByStageId() {
    return createNotImplemented('countScenesByStageId');
  },
  async deleteScenesByStageId() {
    return createNotImplemented('deleteScenesByStageId');
  },
  async replaceChatSessionsByStageId() {
    return createNotImplemented('replaceChatSessionsByStageId');
  },
  async listChatSessionsByStageId() {
    return createNotImplemented('listChatSessionsByStageId');
  },
  async deleteChatSessionsByStageId() {
    return createNotImplemented('deleteChatSessionsByStageId');
  },
  async savePlaybackStateRecord() {
    return createNotImplemented('savePlaybackStateRecord');
  },
  async getPlaybackStateRecord() {
    return createNotImplemented('getPlaybackStateRecord');
  },
  async deletePlaybackStateRecord() {
    return createNotImplemented('deletePlaybackStateRecord');
  },
  async saveStageOutlinesRecord() {
    return createNotImplemented('saveStageOutlinesRecord');
  },
  async getStageOutlinesRecord() {
    return createNotImplemented('getStageOutlinesRecord');
  },
  async deleteStageOutlinesRecord() {
    return createNotImplemented('deleteStageOutlinesRecord');
  },
  async listMediaFilesByStageId() {
    return createNotImplemented('listMediaFilesByStageId');
  },
  async deleteMediaFilesByStageId() {
    return createNotImplemented('deleteMediaFilesByStageId');
  },
  async saveImageFileRecord() {
    return createNotImplemented('saveImageFileRecord');
  },
  async getImageFileRecord() {
    return createNotImplemented('getImageFileRecord');
  },
  async listImageFileRecords() {
    return createNotImplemented('listImageFileRecords');
  },
  async deleteImageFileRecord() {
    return createNotImplemented('deleteImageFileRecord');
  },
  async deleteImageFileRecordsBefore() {
    return createNotImplemented('deleteImageFileRecordsBefore');
  },
};
