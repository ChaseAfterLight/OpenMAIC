import { TextbookLibraryManager } from '@/components/workbench/textbook-library-manager';
import { requirePageRole } from '@/lib/server/auth-guards';

export default async function PersonalTextbooksPage() {
  await requirePageRole(['admin', 'teacher']);
  return <TextbookLibraryManager scope="personal" />;
}
