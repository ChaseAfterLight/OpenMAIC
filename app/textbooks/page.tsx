import { ResourceLibraryManager } from '@/components/workbench/resource-library-manager';
import { requirePageRole } from '@/lib/server/auth-guards';

export default async function PersonalTextbooksPage() {
  await requirePageRole(['admin', 'teacher']);
  return <ResourceLibraryManager scope="personal" />;
}
