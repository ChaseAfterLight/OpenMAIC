import { TextbookLibraryManager } from '@/components/workbench/textbook-library-manager';
import { requirePageRole } from '@/lib/server/auth-guards';

export default async function AdminTextbooksPage() {
  await requirePageRole(['admin']);
  return <TextbookLibraryManager scope="official" />;
}
