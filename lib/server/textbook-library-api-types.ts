import type {
  SaveTextbookLibraryInput,
  TextbookLibraryFilters,
  TextbookLibraryRecord,
  TextbookLibraryScope,
  TextbookLibraryView,
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

export type TextbookLibraryJsonResponse =
  | { ok: true }
  | { ok: true; library: TextbookLibraryRecord | null }
  | { ok: true; libraries: TextbookLibraryRecord[] }
  | { ok: true; attachmentId: string };
