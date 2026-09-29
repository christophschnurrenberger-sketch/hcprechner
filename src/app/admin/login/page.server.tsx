import { redirect } from "next/navigation";
import { adminMode, isAdmin } from "@/server/adminAuth";
import { Card, CardBody, CardHeader } from "@/components/ui";
import { LoginForm } from "@/components/admin/AdminForms";
import { loginAction } from "../actions";

export default async function AdminLoginPage() {
  if (await isAdmin()) redirect("/admin");
  if (adminMode() === "DISABLED") return null;
  return (
    <Card className="mx-auto max-w-md">
      <CardHeader title="Admin-Anmeldung" subtitle="Pflege der Golfplatzdatenbank" />
      <CardBody>
        <LoginForm loginAction={loginAction} />
      </CardBody>
    </Card>
  );
}
