/**
 * Image Storage Utilities
 *
 * Store PDF images in IndexedDB to avoid sessionStorage 5MB limit.
 * Images are stored as Blobs for efficient storage.
 */

import type { ImageFileRecord } from './database';
import { nanoid } from 'nanoid';
import { createLogger } from '@/lib/logger';
import { getStorageAdapter } from '@/lib/storage';

const log = createLogger('ImageStorage');

/**
 * Convert base64 data URL to Blob
 */
function base64ToBlob(base64DataUrl: string): Blob {
  const parts = base64DataUrl.split(',');
  const mimeMatch = parts[0].match(/:(.*?);/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
  const base64Data = parts[1];
  const byteString = atob(base64Data);
  const arrayBuffer = new ArrayBuffer(byteString.length);
  const uint8Array = new Uint8Array(arrayBuffer);

  for (let i = 0; i < byteString.length; i++) {
    uint8Array[i] = byteString.charCodeAt(i);
  }

  return new Blob([uint8Array], { type: mimeType });
}

/**
 * Convert Blob to base64 data URL
 */
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Store images in IndexedDB
 * Returns array of stored image IDs
 */
export async function storeImages(
  images: Array<{ id: string; src: string; pageNumber?: number }>,
): Promise<string[]> {
  const storage = getStorageAdapter();
  const sessionId = nanoid(10);
  const storedIds: string[] = [];

  for (const img of images) {
    try {
      const blob = base64ToBlob(img.src);
      const mimeMatch = img.src.match(/data:(.*?);/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';

      // Use session-prefixed ID to allow cleanup
      const storageId = `session_${sessionId}_${img.id}`;

      const record: ImageFileRecord = {
        id: storageId,
        blob,
        filename: `${img.id}.png`,
        mimeType,
        size: blob.size,
        createdAt: Date.now(),
      };

      await storage.saveImageFileRecord(record);
      storedIds.push(storageId);
    } catch (error) {
      log.error(`Failed to store image ${img.id}:`, error);
    }
  }

  return storedIds;
}

/**
 * Load images from IndexedDB and return as imageMapping
 * @param imageIds - Array of storage IDs (session_xxx_img_1 format)
 * @returns ImageMapping { img_1: "data:image/png;base64,..." }
 */
export async function loadImageMapping(imageIds: string[]): Promise<Record<string, string>> {
  const storage = getStorageAdapter();
  const mapping: Record<string, string> = {};

  for (const storageId of imageIds) {
    try {
      const record = await storage.getImageFileRecord(storageId);
      if (record) {
        const base64 = await blobToBase64(record.blob);
        // Extract original ID (img_1) from storage ID (session_xxx_img_1)
        const originalId = storageId.replace(/^session_[^_]+_/, '');
        mapping[originalId] = base64;
      }
    } catch (error) {
      log.error(`Failed to load image ${storageId}:`, error);
    }
  }

  return mapping;
}

/**
 * Clean up images by session prefix
 */
export async function cleanupSessionImages(sessionId: string): Promise<void> {
  try {
    const storage = getStorageAdapter();
    const prefix = `session_${sessionId}_`;
    const allImages = await storage.listImageFileRecords();
    const toDelete = allImages.filter((img) => img.id.startsWith(prefix));

    for (const img of toDelete) {
      await storage.deleteImageFileRecord(img.id);
    }

    log.info(`Cleaned up ${toDelete.length} images for session ${sessionId}`);
  } catch (error) {
    log.error('Failed to cleanup session images:', error);
  }
}

/**
 * Clean up old images (older than specified hours)
 */
export async function cleanupOldImages(hoursOld: number = 24): Promise<void> {
  try {
    const storage = getStorageAdapter();
    const cutoff = Date.now() - hoursOld * 60 * 60 * 1000;
    await storage.deleteImageFileRecordsBefore(cutoff);
    log.info(`Cleaned up images older than ${hoursOld} hours`);
  } catch (error) {
    log.error('Failed to cleanup old images:', error);
  }
}

/**
 * Get total size of stored images
 */
export async function getImageStorageSize(): Promise<number> {
  const storage = getStorageAdapter();
  const images = await storage.listImageFileRecords();
  return images.reduce((total, img) => total + img.size, 0);
}

/**
 * Store a PDF file as a Blob in IndexedDB.
 * Returns a storage key that can be used to retrieve the blob later.
 */
export async function storePdfBlob(file: File): Promise<string> {
  const storage = getStorageAdapter();
  const storageKey = `pdf_${nanoid(10)}`;
  const blob = new Blob([await file.arrayBuffer()], {
    type: file.type || 'application/pdf',
  });

  const record: ImageFileRecord = {
    id: storageKey,
    blob,
    filename: file.name,
    mimeType: file.type || 'application/pdf',
    size: blob.size,
    createdAt: Date.now(),
  };

  await storage.saveImageFileRecord(record);
  return storageKey;
}

/**
 * Load a PDF Blob from IndexedDB by its storage key.
 */
export async function loadPdfBlob(key: string): Promise<Blob | null> {
  const storage = getStorageAdapter();
  const record = await storage.getImageFileRecord(key);
  return record?.blob ?? null;
}
