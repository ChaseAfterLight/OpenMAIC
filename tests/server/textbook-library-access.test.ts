import { describe, expect, it } from 'vitest';
import {
  canManageTextbookLibrary,
  canReadTextbookAttachment,
  canReadTextbookLibrary,
} from '@/lib/server/textbook-library-access';
import type { AuthPublicUser } from '@/lib/server/auth-types';
import type { TextbookAttachmentLocation, TextbookLibraryRecord } from '@/lib/server/textbook-library-types';

const adminUser: AuthPublicUser = {
  id: 'admin-1',
  email: 'admin@example.com',
  role: 'admin',
  createdAt: 1,
  updatedAt: 1,
};

const teacherUser: AuthPublicUser = {
  id: 'teacher-1',
  email: 'teacher@example.com',
  role: 'teacher',
  createdAt: 1,
  updatedAt: 1,
};

const otherTeacherUser: AuthPublicUser = {
  id: 'teacher-2',
  email: 'teacher2@example.com',
  role: 'teacher',
  createdAt: 1,
  updatedAt: 1,
};

function createLibrary(scope: 'official' | 'personal', ownerUserId?: string): TextbookLibraryRecord {
  return {
    id: `${scope}-library`,
    scope,
    ownerUserId,
    publisher: 'PEP',
    subjectId: 'math',
    gradeId: 'grade-4',
    editionId: 'pep-grade-4',
    editionLabel: 'Grade 4',
    createdAt: 1,
    updatedAt: 1,
    volumes: [],
  };
}

function createAttachmentLocation(
  source: TextbookAttachmentLocation['source'],
  library: TextbookLibraryRecord,
): TextbookAttachmentLocation {
  return {
    source,
    library,
    chapter: {
      id: 'chapter-1',
      title: 'Chapter 1',
      summary: '',
      keywords: [],
      order: 0,
      attachments: [],
    },
    attachment: {
      id: 'attachment-1',
      filename: 'lesson.pdf',
      title: 'lesson.pdf',
      mimeType: 'application/pdf',
      type: 'pdf',
      size: 100,
      order: 0,
      uploadedAt: 1,
      updatedAt: 1,
      status: 'uploaded',
      storageKey: 'textbooks/attachment-1.pdf',
    },
  };
}

describe('textbook library access', () => {
  it('allows only admins to manage official libraries', () => {
    expect(canManageTextbookLibrary(adminUser, 'official')).toBe(true);
    expect(canManageTextbookLibrary(teacherUser, 'official')).toBe(false);
  });

  it('allows owners and admins to manage personal libraries', () => {
    expect(canManageTextbookLibrary(teacherUser, 'personal', teacherUser.id)).toBe(true);
    expect(canManageTextbookLibrary(otherTeacherUser, 'personal', teacherUser.id)).toBe(false);
    expect(canManageTextbookLibrary(adminUser, 'personal', teacherUser.id)).toBe(true);
  });

  it('restricts official draft reads to admins', () => {
    const officialLibrary = createLibrary('official');
    expect(canReadTextbookLibrary(adminUser, officialLibrary, 'draft')).toBe(true);
    expect(canReadTextbookLibrary(teacherUser, officialLibrary, 'draft')).toBe(false);
    expect(canReadTextbookLibrary(teacherUser, officialLibrary, 'published')).toBe(true);
  });

  it('restricts personal library reads to the owner or admin', () => {
    const personalLibrary = createLibrary('personal', teacherUser.id);
    expect(canReadTextbookLibrary(teacherUser, personalLibrary, 'draft')).toBe(true);
    expect(canReadTextbookLibrary(otherTeacherUser, personalLibrary, 'draft')).toBe(false);
    expect(canReadTextbookLibrary(adminUser, personalLibrary, 'draft')).toBe(true);
  });

  it('applies attachment access rules based on source visibility', () => {
    const officialLibrary = createLibrary('official');
    const personalLibrary = createLibrary('personal', teacherUser.id);

    expect(
      canReadTextbookAttachment(adminUser, createAttachmentLocation('official-draft', officialLibrary)),
    ).toBe(true);
    expect(
      canReadTextbookAttachment(teacherUser, createAttachmentLocation('official-draft', officialLibrary)),
    ).toBe(false);
    expect(
      canReadTextbookAttachment(teacherUser, createAttachmentLocation('official-published', officialLibrary)),
    ).toBe(true);
    expect(
      canReadTextbookAttachment(otherTeacherUser, createAttachmentLocation('personal', personalLibrary)),
    ).toBe(false);
    expect(
      canReadTextbookAttachment(teacherUser, createAttachmentLocation('personal', personalLibrary)),
    ).toBe(true);
  });
});
