import { describe, expect, it } from "vitest";
import {
  classifyFacility,
  extractPostalCity,
  extractRatingCandidates,
  extractWebsiteFromDetail,
  findScorecardLinks,
  isBavarianPostalCode,
  parseClubListHtml,
} from "@/lib/importer/parseClubList";

// Fiktives HTML – bildet typische Strukturen von Verbandslisten nach.
const BLOCK_PAGE = `
<html><body>
<ul class="clubs">
  <li class="club"><h3><a href="/club/1">Golfclub Musterberg e.V.</a></h3>
    <p>Am Golfplatz 1, 87700 Musterberg</p><p>18-Loch-Platz, 9-Loch-Kurzplatz</p>
    <a href="https://www.gc-musterberg.example">Website</a></li>
  <li class="club"><h3><a href="/club/2">Golfpark Beispielhausen</a></h3>
    <p>Parkweg 5 · 90123 Beispielhausen</p><p>27 Loch · Oberpfalz</p></li>
  <li class="club"><h3><a href="/club/3">Range am See</a></h3>
    <p>94000 Seedorf</p><p>Driving Range / Übungsanlage</p></li>
</ul>
<nav><a href="/clubs?page=2" rel="next">Weiter ›</a></nav>
</body></html>`;

const JSON_LD_PAGE = `
<html><head><script type="application/ld+json">
{"@context":"https://schema.org","@graph":[
 {"@type":"GolfCourse","name":"Golfclub Testtal","url":"https://verband.example/club/9",
  "address":{"streetAddress":"Talstraße 3","postalCode":"97000","addressLocality":"Testtal","addressRegion":"Unterfranken"}}
]}</script></head><body></body></html>`;

describe("Importer: Parser der Clubübersicht", () => {
  it("liest Einträge mit PLZ, Ort, Website und Detailseite", () => {
    const page = parseClubListHtml(BLOCK_PAGE, "https://verband.example/clubs");
    expect(page.strategy).toBe("ENTRY_BLOCKS");
    expect(page.entries).toHaveLength(3);
    const first = page.entries[0];
    expect(first.name).toBe("Golfclub Musterberg e.V.");
    expect(first.postalCode).toBe("87700");
    expect(first.city).toBe("Musterberg");
    expect(first.website).toBe("https://www.gc-musterberg.example/");
    expect(first.detailUrl).toBe("https://verband.example/club/1");
    expect(first.holes).toEqual([18, 9]);
  });

  it("findet die nächste Seite (Paginierung)", () => {
    expect(parseClubListHtml(BLOCK_PAGE, "https://verband.example/clubs").nextPageUrl).toBe(
      "https://verband.example/clubs?page=2",
    );
  });

  it("unterscheidet Driving Range, 27-Loch-Anlage und Region", () => {
    const page = parseClubListHtml(BLOCK_PAGE, "https://verband.example/clubs");
    expect(page.entries[2].facilityType).toBe("DRIVING_RANGE");
    expect(page.entries[1].holes).toEqual([27]);
    expect(page.entries[1].region).toBe("OBERPFALZ");
  });

  it("wertet JSON-LD aus", () => {
    const page = parseClubListHtml(JSON_LD_PAGE, "https://verband.example/clubs");
    expect(page.strategy).toBe("JSON_LD");
    expect(page.entries[0]).toMatchObject({ name: "Golfclub Testtal", postalCode: "97000", city: "Testtal", region: "UNTERFRANKEN" });
  });

  it("leere Seite → keine Einträge", () => {
    expect(parseClubListHtml("<html><body><p>Keine Daten</p></body></html>", "https://verband.example").strategy).toBe("NONE");
  });

  it("Klassifizierung Kurzplatz / Par-3", () => {
    expect(classifyFacility("9-Loch Kurzplatz").facilityType).toBe("SHORT_COURSE");
    expect(classifyFacility("Par-3-Anlage mit 6 Loch").facilityType).toBe("PAR3");
    expect(classifyFacility("18-Loch-Meisterschaftsplatz und Driving Range").facilityType).toBe("GOLF_COURSE");
  });

  it("PLZ/Ort-Erkennung und bayerische PLZ", () => {
    expect(extractPostalCity("Hauptstr. 1, 86150 Augsburg Tel. 0821")).toEqual({ postalCode: "86150", city: "Augsburg" });
    expect(isBavarianPostalCode("80331")).toBe(true);
    expect(isBavarianPostalCode("63739")).toBe(true);
    expect(isBavarianPostalCode("10115")).toBe(false);
  });

  it("offizielle Website auf der Detailseite (ohne Social Media)", () => {
    const html = `<a href="https://facebook.com/x">FB</a><a href="/intern">intern</a><a href="https://www.gc-test.example">Homepage</a>`;
    expect(extractWebsiteFromDetail(html, "https://verband.example/club/1").website).toBe("https://www.gc-test.example/");
  });

  it("Rating-Kandidaten aus Text – nur als Kandidaten", () => {
    const text = "Abschlag Gelb Herren: Course Rating 72,4 / Slope 131. Rot Damen CR 73.1 Slope 127.";
    const c = extractRatingCandidates(text, "https://gc-test.example/scorekarte");
    expect(c).toHaveLength(2);
    expect(c[0]).toMatchObject({ teeColor: "Gelb", gender: "M", courseRating: 72.4, slopeRating: 131, holes: 18 });
    expect(c[1]).toMatchObject({ teeColor: "Rot", gender: "F", courseRating: 73.1, slopeRating: 127 });
  });

  it("unplausible Zahlen werden ignoriert", () => {
    expect(extractRatingCandidates("CR 12,3 Slope 999", "x")).toHaveLength(0);
  });

  it("Scorekarten-Links auf der Club-Website", () => {
    const html = `<a href="/platz/scorekarte.pdf">Scorekarte</a><a href="/kontakt">Kontakt</a>`;
    expect(findScorecardLinks(html, "https://gc-test.example/")).toEqual(["https://gc-test.example/platz/scorekarte.pdf"]);
  });
});
