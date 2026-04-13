import { ResourceLibraryManager } from '@/components/workbench/resource-library-manager';
import { requirePageRole } from '@/lib/server/auth-guards';

export default async function AdminTextbooksPage() {
  await requirePageRole(['admin']);
  return <ResourceLibraryManager scope="official" />;
}
