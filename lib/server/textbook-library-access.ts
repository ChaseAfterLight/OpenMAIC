import type { AuthPublicUser } from '@/lib/server/auth-types';
import type {
  TextbookAttachmentLocation,
  TextbookLibraryRecord,
  TextbookLibraryScope,
  TextbookLibraryView,
} from '@/lib/server/textbook-library-types';

export function canManageTextbookLibrary(
  user: AuthPublicUser,
  scope: TextbookLibraryScope,
  ownerUserId?: string,
): boolean {
  if (scope === 'official') {
    return user.role === 'admin';
  }
  if (user.role === 'admin') {
    return true;
  }
  return user.role === 'teacher' && ownerUserId === user.id;
}

export function canReadTextbookLibrary(
  user: AuthPublicUser,
  library: TextbookLibraryRecord,
  view: TextbookLibraryView,
): boolean {
  if (library.scope === 'official') {
    if (view === 'draft') {
      return user.role === 'admin';
    }
    return user.role === 'admin' || user.role === 'teacher';
  }

  if (user.role === 'admin') {
    return true;
  }

  return user.role === 'teacher' && library.ownerUserId === user.id;
}

export function canReadTextbookAttachment(
  user: AuthPublicUser,
  location: TextbookAttachmentLocation,
): boolean {
  if (location.source === 'official-draft') {
    return user.role === 'admin';
  }

  if (location.source === 'official-published') {
    return user.role === 'admin' || user.role === 'teacher';
  }

  if (user.role === 'admin') {
    return true;
  }

  return user.role === 'teacher' && location.library.ownerUserId === user.id;
}
