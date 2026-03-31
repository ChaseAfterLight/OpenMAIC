import { AdminUsersClient } from '@/components/auth/admin-users-client';
import { requirePageRole } from '@/lib/server/auth-guards';

export default async function AdminUsersPage() {
  await requirePageRole(['admin']);
  return <AdminUsersClient />;
}
