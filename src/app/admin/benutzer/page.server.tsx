import { requireOwnerPage } from "@/server/adminAuth";
import { listUsers } from "@/server/userRepository";
import { UsersView } from "@/components/admin/UsersView";

export default async function UsersPage() {
  await requireOwnerPage();
  return <UsersView users={await listUsers()} />;
}
