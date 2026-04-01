import { AdminTextbooksClient } from '@/components/auth/admin-textbooks-client';
import { requirePageRole } from '@/lib/server/auth-guards';

export default async function AdminTextbooksPage() {
  await requirePageRole(['admin']);
  return <AdminTextbooksClient />;
}
