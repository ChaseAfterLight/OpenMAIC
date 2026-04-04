import path from 'path';
import type {
  K12ModulePresets,
  K12TextbookEdition,
  K12TextbookResource,
} from '@/lib/module-host/types';
import { k12ModuleManifest } from '@/modules/k12/manifest';
import type {
  TextbookAttachmentRecord,
  TextbookAttachmentType,
  TextbookChapterRecord,
  TextbookLibraryRecord,
} from '@/lib/server/textbook-library-types';

const SYSTEM_PUBLISHER_ID = 'system-seed';

function getK12Presets(): K12ModulePresets {
  return k12ModuleManifest.presets as K12ModulePresets;
}

function inferAttachmentMimeType(type: TextbookAttachmentType): string {
  switch (type) {
    case 'pdf':
      return 'application/pdf';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'html':
      return 'text/html';
    case 'image':
      return 'image/*';
    default:
      return 'application/octet-stream';
  }
}

function inferResourceFilename(resource: K12TextbookResource): string {
  if (resource.url) {
    try {
      const pathname = new URL(resource.url, 'https://openmaic.local').pathname;
      const basename = path.basename(pathname);
      if (basename) {
        return basename;
      }
    } catch {
      const basename = path.basename(resource.url);
      if (basename) {
        return basename;
      }
    }
  }

  const extension =
    resource.type === 'pdf'
      ? '.pdf'
      : resource.type === 'docx'
        ? '.docx'
        : resource.type === 'html'
          ? '.html'
          : resource.type === 'image'
            ? '.png'
            : '';
  return `${resource.id}${extension}`;
}

function buildSeedAttachment(
  resource: K12TextbookResource,
  order: number,
  timestamp: number,
): TextbookAttachmentRecord {
  return {
    id: resource.id,
    filename: inferResourceFilename(resource),
    title: resource.title,
    mimeType: inferAttachmentMimeType(resource.type),
    type: resource.type,
    size: 0,
    description: resource.description,
    order,
    uploadedAt: timestamp,
    updatedAt: timestamp,
    status: 'ready',
    externalUrl: resource.url,
    extractedSummary: resource.description,
  };
}

function buildSeedChapter(
  chapter: K12TextbookEdition['volumes'][number]['units'][number]['chapters'][number],
  order: number,
  timestamp: number,
): TextbookChapterRecord {
  return {
    id: chapter.id,
    title: chapter.title,
    summary: chapter.summary,
    keywords: chapter.keywords,
    order,
    attachments: chapter.sourceDocuments.map((resource, attachmentIndex) =>
      buildSeedAttachment(resource, attachmentIndex, timestamp),
    ),
  };
}

export function buildOfficialTextbookSeedLibraries(
  timestamp = Date.now(),
): TextbookLibraryRecord[] {
  const presets = getK12Presets();
  const gradeLabelMap = new Map(
    presets.grades.map((grade) => [grade.id, grade.label['zh-CN'] ?? grade.id]),
  );
  const subjectLabelMap = new Map(
    presets.subjects.map((subject) => [subject.id, subject.label['zh-CN'] ?? subject.id]),
  );

  const libraries: TextbookLibraryRecord[] = [];

  for (const edition of presets.textbookEditions) {
    const groupedVolumes = new Map<string, typeof edition.volumes>();

    for (const volume of edition.volumes) {
      const key = `${edition.id}:${volume.subjectId}:${volume.gradeId}`;
      const existing = groupedVolumes.get(key) ?? [];
      existing.push(volume);
      groupedVolumes.set(key, existing);
    }

    for (const [key, volumes] of groupedVolumes.entries()) {
      const [editionId, subjectId, gradeId] = key.split(':');
      libraries.push({
        id: key.replace(/:/g, '-'),
        scope: 'official',
        publisher: edition.publisher ?? '未知出版社',
        subjectId,
        subjectLabel: subjectLabelMap.get(subjectId),
        gradeId,
        gradeLabel: gradeLabelMap.get(gradeId),
        editionId,
        editionLabel: edition.label['zh-CN'] ?? edition.id,
        createdAt: timestamp,
        updatedAt: timestamp,
        volumes: volumes.map((volume, volumeIndex) => ({
          id: volume.id,
          label: volume.label['zh-CN'] ?? volume.id,
          order: volumeIndex,
          gradeId: volume.gradeId,
          semester: volume.semester,
          units: volume.units.map((unit, unitIndex) => ({
            id: unit.id,
            title: unit.title,
            order: unitIndex,
            chapters: unit.chapters.map((chapter, chapterIndex) =>
              buildSeedChapter(chapter, chapterIndex, timestamp),
            ),
          })),
        })),
      });
    }
  }

  return libraries.sort(
    (left, right) =>
      left.publisher.localeCompare(right.publisher) ||
      left.subjectId.localeCompare(right.subjectId) ||
      left.gradeId.localeCompare(right.gradeId) ||
      left.editionLabel.localeCompare(right.editionLabel),
  );
}

export function buildPublishedTextbookSeedLibraries(
  timestamp = Date.now(),
): TextbookLibraryRecord[] {
  return buildOfficialTextbookSeedLibraries(timestamp).map((library) => ({
    ...library,
    publishedAt: timestamp,
    publishedByUserId: SYSTEM_PUBLISHER_ID,
    updatedAt: timestamp,
  }));
}
