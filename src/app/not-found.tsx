import { ButtonLink, EmptyState } from "@/components/ui";

export default function NotFound() {
  return (
    <EmptyState title="Seite nicht gefunden" action={<ButtonLink href="/">Zum Dashboard</ButtonLink>}>
      Die angeforderte Seite existiert nicht (mehr).
    </EmptyState>
  );
}
