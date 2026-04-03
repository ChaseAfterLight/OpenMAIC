import type {
  SaveTextbookLibraryInput,
  SaveTextbookPdfImportDraftInput,
  TextbookLibraryFilters,
  TextbookLibraryRecord,
  TextbookLibraryScope,
  TextbookLibraryView,
  TextbookPdfImportDraftRecord,
  UpdateTextbookAttachmentProcessingInput,
} from '@/lib/server/textbook-library-types';

export type TextbookLibraryJsonAction =
  | {
      action: 'listLibraries';
      scope: TextbookLibraryScope;
      view?: TextbookLibraryView;
      filters?: TextbookLibraryFilters;
    }
  | {
      action: 'getLibrary';
      scope: TextbookLibraryScope;
      libraryId: string;
      view?: TextbookLibraryView;
    }
  | {
      action: 'saveLibrary';
      payload: SaveTextbookLibraryInput;
    }
  | {
      action: 'deleteLibrary';
      scope: TextbookLibraryScope;
      libraryId: string;
    }
  | {
      action: 'publishOfficialLibraries';
    }
  | {
      action: 'updateAttachmentProcessing';
      payload: UpdateTextbookAttachmentProcessingInput;
    }
  | {
      action: 'listImportDrafts';
      scope: TextbookLibraryScope;
      libraryId: string;
      volumeId?: string;
      view?: TextbookLibraryView;
    }
  | {
      action: 'getImportDraft';
      draftId: string;
    }
  | {
      action: 'saveImportDraft';
      payload: SaveTextbookPdfImportDraftInput;
    }
  | {
      action: 'confirmImportDraft';
      draftId: string;
    }
  | {
      action: 'deleteImportDraft';
      draftId: string;
    }
  | {
      action: 'retryAttachmentProcessing';
      attachmentId: string;
    }
  | {
      action: 'deleteAttachment';
      attachmentId: string;
    };

export interface UploadTextbookAttachmentMetadata {
  scope: TextbookLibraryScope;
  view?: TextbookLibraryView;
  libraryId: string;
  chapterId: string;
  title?: string;
  description?: string;
  order?: number;
}

export interface UploadTextbookImportDraftMetadata {
  scope: TextbookLibraryScope;
  view?: TextbookLibraryView;
  libraryId: string;
  volumeId: string;
}

export type TextbookLibraryJsonResponse =
  | { ok: true }
  | { ok: true; library: TextbookLibraryRecord | null }
  | { ok: true; libraries: TextbookLibraryRecord[] }
  | { ok: true; attachmentId: string }
  | { ok: true; importDraft: TextbookPdfImportDraftRecord | null }
  | { ok: true; importDrafts: TextbookPdfImportDraftRecord[] };
