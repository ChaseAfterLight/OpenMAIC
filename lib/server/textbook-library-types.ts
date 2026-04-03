export type TextbookLibraryScope = 'official' | 'personal';
export type TextbookLibraryView = 'draft' | 'published';
export type TextbookSemester = 'upper' | 'lower' | 'full-year';
export type TextbookAttachmentType = 'pdf' | 'docx' | 'image' | 'html' | 'other';
export type TextbookAttachmentStatus = 'uploaded' | 'parsing' | 'ready' | 'failed';

export interface TextbookAttachmentRecord {
  id: string;
  filename: string;
  title: string;
  mimeType: string;
  type: TextbookAttachmentType;
  size: number;
  description?: string;
  order: number;
  uploadedAt: number;
  updatedAt: number;
  status: TextbookAttachmentStatus;
  storageKey?: string;
  objectKey?: string;
  externalUrl?: string;
  parserJobId?: string;
  extractedText?: string;
  extractedSummary?: string;
  parseError?: string;
}

export interface TextbookChapterRecord {
  id: string;
  title: string;
  summary: string;
  keywords: string[];
  order: number;
  attachments: TextbookAttachmentRecord[];
}

export interface TextbookUnitRecord {
  id: string;
  title: string;
  order: number;
  chapters: TextbookChapterRecord[];
}

export interface TextbookVolumeRecord {
  id: string;
  label: string;
  order: number;
  gradeId: string;
  semester?: TextbookSemester;
  units: TextbookUnitRecord[];
}

export interface TextbookLibraryRecord {
  id: string;
  scope: TextbookLibraryScope;
  ownerUserId?: string;
  cover?: string;
  publisher: string;
  subjectId: string;
  subjectLabel?: string;
  gradeId: string;
  gradeLabel?: string;
  editionId: string;
  editionLabel: string;
  createdAt: number;
  updatedAt: number;
  publishedAt?: number;
  publishedByUserId?: string;
  volumes: TextbookVolumeRecord[];
}

export interface TextbookLibraryStore {
  officialDraft: TextbookLibraryRecord[];
  officialPublished: TextbookLibraryRecord[];
  personalLibraries: TextbookLibraryRecord[];
  updatedAt: number;
}

export interface TextbookLibraryFilters {
  publisher?: string;
  subjectId?: string;
  gradeId?: string;
  editionId?: string;
  semester?: TextbookSemester;
  query?: string;
}

export interface ListTextbookLibrariesOptions extends TextbookLibraryFilters {
  scope: TextbookLibraryScope;
  view?: TextbookLibraryView;
  ownerUserId?: string;
}

export interface SaveTextbookLibraryInput {
  library: TextbookLibraryRecord;
  view?: TextbookLibraryView;
}

export interface SaveTextbookAttachmentInput {
  scope: TextbookLibraryScope;
  view?: TextbookLibraryView;
  libraryId: string;
  chapterId: string;
  ownerUserId?: string;
  filename: string;
  title?: string;
  mimeType: string;
  type: TextbookAttachmentType;
  size: number;
  description?: string;
  order?: number;
  buffer: Buffer;
}

export interface UpdateTextbookAttachmentProcessingInput {
  attachmentId: string;
  status: TextbookAttachmentStatus;
  parserJobId?: string;
  extractedText?: string;
  extractedSummary?: string;
  parseError?: string;
}

export interface TextbookAttachmentLocation {
  source: 'official-draft' | 'official-published' | 'personal';
  library: TextbookLibraryRecord;
  chapter: TextbookChapterRecord;
  attachment: TextbookAttachmentRecord;
}
