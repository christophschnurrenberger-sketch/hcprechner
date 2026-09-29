import { ButtonLink, EmptyState } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <EmptyState title="Seite nicht gefunden" action={<ButtonLink href="/">Zur Startseite</ButtonLink>}>
        Die angeforderte Seite existiert nicht (mehr).
      </EmptyState>
    </div>
  );
}
