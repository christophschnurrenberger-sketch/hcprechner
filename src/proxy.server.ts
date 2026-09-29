import { NextResponse, type NextRequest } from "next/server";

/**
 * Node-Edition: Ohne Sitzungscookie gar nicht erst in den Mitglieder- oder Admin-Bereich.
 * Die verbindliche Prüfung (Signatur, Konto, Status, Rolle) erfolgt in den Server-Layouts und in jeder API-Route.
 */
export default function proxy(request: NextRequest) {
  if (request.cookies.get("hcp_session")?.value) return NextResponse.next();
  const url = request.nextUrl.clone();
  const next = request.nextUrl.pathname + request.nextUrl.search;
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(next)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/member/:path*", "/admin/:path*"],
};
