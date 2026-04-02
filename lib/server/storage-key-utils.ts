import path from 'path';

function sanitizeSegment(value: string): string {
  const sanitized = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return sanitized || 'file';
}

export function safeStorageId(id: string): string {
  return Buffer.from(id).toString('base64url');
}

export function inferFileExtension(filename: string, mimeType: string): string {
  const ext = path.extname(filename).trim().toLowerCase();
  if (ext) {
    return ext;
  }

  switch (mimeType) {
    case 'image/png':
      return '.png';
    case 'image/jpeg':
      return '.jpg';
    case 'image/webp':
      return '.webp';
    case 'application/pdf':
      return '.pdf';
    case 'video/mp4':
      return '.mp4';
    default:
      return '';
  }
}

export function buildStageMediaObjectKey(
  prefix: string,
  stageId: string,
  mediaId: string,
  mimeType: string,
): string {
  const suffix = sanitizeSegment(mimeType.replace('/', '-')) || 'bin';
  return `${prefix}/stages/${safeStorageId(stageId)}/media/${safeStorageId(mediaId)}/original.${suffix}`;
}

export function buildStageMediaPosterObjectKey(
  prefix: string,
  stageId: string,
  mediaId: string,
): string {
  return `${prefix}/stages/${safeStorageId(stageId)}/media/${safeStorageId(mediaId)}/poster.png`;
}

export function buildStageAudioObjectKey(
  prefix: string,
  stageId: string,
  audioId: string,
  mimeType: string,
): string {
  const suffix = sanitizeSegment(mimeType.replace('/', '-')) || 'bin';
  return `${prefix}/stages/${safeStorageId(stageId)}/audio/${safeStorageId(audioId)}/original.${suffix}`;
}

export function buildImageObjectKey(
  prefix: string,
  imageId: string,
  filename: string,
  mimeType: string,
): string {
  const basename = sanitizeSegment(path.basename(filename, path.extname(filename)));
  const extension = inferFileExtension(filename, mimeType);
  return `${prefix}/images/${safeStorageId(imageId)}/${basename}${extension}`;
}
