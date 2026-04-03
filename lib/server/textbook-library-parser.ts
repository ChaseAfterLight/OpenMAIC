import { randomUUID } from 'crypto';
import { createLogger } from '@/lib/logger';
import {
  findTextbookAttachment,
  readTextbookAttachmentBlob,
  updateTextbookAttachmentProcessing,
} from '@/lib/server/textbook-library-repository';

const log = createLogger('TextbookLibraryParser');

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function stripHtmlTags(text: string): string {
  return text.replace(/<[^>]+>/g, ' ');
}

function summarizeText(text: string, maxLength = 240): string {
  const normalized = collapseWhitespace(text);
  if (!normalized) {
    return '';
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function extractTextFromAttachmentBuffer(mimeType: string, buffer: Buffer): string {
  const decoded = buffer.toString('utf-8');
  if (mimeType === 'text/html') {
    return collapseWhitespace(stripHtmlTags(decoded));
  }
  if (mimeType.startsWith('text/')) {
    return collapseWhitespace(decoded);
  }
  return '';
}

export async function runTextbookAttachmentProcessing(attachmentId: string): Promise<void> {
  const location = await findTextbookAttachment(attachmentId);
  if (!location) {
    return;
  }

  const parserJobId = `textbook-parse-${randomUUID()}`;
  await updateTextbookAttachmentProcessing({
    attachmentId,
    status: 'parsing',
    parserJobId,
    parseError: undefined,
    extractedText: undefined,
    extractedSummary: undefined,
  });

  try {
    if (location.attachment.externalUrl) {
      await updateTextbookAttachmentProcessing({
        attachmentId,
        status: 'ready',
        parserJobId,
        extractedSummary: location.attachment.description ?? location.attachment.title,
        extractedText: undefined,
        parseError: undefined,
      });
      return;
    }

    const blob = await readTextbookAttachmentBlob(attachmentId);
    const extractedText =
      blob ? extractTextFromAttachmentBuffer(blob.mimeType, blob.buffer) : '';
    const extractedSummary =
      summarizeText(extractedText) ||
      location.attachment.description ||
      location.attachment.title;

    await updateTextbookAttachmentProcessing({
      attachmentId,
      status: 'ready',
      parserJobId,
      extractedText: extractedText || undefined,
      extractedSummary,
      parseError: undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(`教材附件解析失败 [attachmentId=${attachmentId}]`, error);
    await updateTextbookAttachmentProcessing({
      attachmentId,
      status: 'failed',
      parserJobId,
      extractedText: undefined,
      extractedSummary: location.attachment.description ?? location.attachment.title,
      parseError: message,
    });
  }
}
