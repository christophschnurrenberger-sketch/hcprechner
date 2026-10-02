#!/usr/bin/env python3
"""Prüft und pflegt den String-Katalog der Golf-App.

Quelle der Schlüssel und deutschen Texte ist `GolfApp/Core/Localization/L10n.swift`
(`String(localized: "schlüssel", defaultValue: "Deutsch \\(wert)")`), Übersetzungen stehen in
`GolfApp/Resources/Localizable.xcstrings`.

  python3 native/apple/scripts/strings.py --check   # Fehler, wenn Schlüssel/Übersetzungen fehlen oder abweichen
  python3 native/apple/scripts/strings.py --sync    # neue Schlüssel eintragen (de aus dem Code, en leer markiert)
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
L10N = ROOT / "GolfApp/Core/Localization/L10n.swift"
CATALOG = ROOT / "GolfApp/Resources/Localizable.xcstrings"
SOURCE = "de"
REQUIRED = ["de", "en"]
PREPARED = ["fr", "it", "es"]  # vorbereitet: ohne Übersetzung gilt Deutsch

CALL = re.compile(r'String\(localized: "([^"]+)", defaultValue: "((?:[^"\\]|\\.)*)"\)')


def code_strings():
    out = {}
    for key, value in CALL.findall(L10N.read_text(encoding="utf-8")):
        # wie String.LocalizationValue: literales „%“ wird zu „%%“, Interpolationen (nur Strings) zu „%@“
        text = re.sub(r"\\\([^)]*\)", "%@", value.replace("%", "%%"))
        if key in out and out[key] != text:
            raise SystemExit(f"Schlüssel doppelt mit verschiedenen Texten: {key}")
        out[key] = text
    return out


def placeholders(text):
    return len(re.findall(r"%(?:\d+\$)?@", text))


def load_catalog():
    if CATALOG.exists():
        return json.loads(CATALOG.read_text(encoding="utf-8"))
    return {"sourceLanguage": SOURCE, "strings": {}, "version": "1.0"}


def save_catalog(catalog):
    catalog["strings"] = dict(sorted(catalog["strings"].items()))
    CATALOG.write_text(json.dumps(catalog, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def unit(value, state="translated"):
    return {"stringUnit": {"state": state, "value": value}}


def check():
    strings = code_strings()
    catalog = load_catalog()
    problems = []
    entries = catalog.get("strings", {})
    for key, de in strings.items():
        entry = entries.get(key)
        if not entry:
            problems.append(f"fehlt im Katalog: {key}")
            continue
        locs = entry.get("localizations", {})
        for lang in REQUIRED:
            value = locs.get(lang, {}).get("stringUnit", {}).get("value", "")
            if not value:
                problems.append(f"{lang} fehlt: {key}")
            elif placeholders(value) != placeholders(de):
                problems.append(f"{lang} Platzhalter ({placeholders(value)} statt {placeholders(de)}): {key}")
        if locs.get("de", {}).get("stringUnit", {}).get("value") not in (None, de):
            problems.append(f"de weicht vom Code ab: {key}")
    for key in entries:
        if key not in strings:
            problems.append(f"im Katalog, aber nicht im Code: {key}")
    if problems:
        print("\n".join(problems))
        print(f"{len(problems)} Problem(e)")
        return 1
    print(f"String-Katalog in Ordnung: {len(strings)} Texte, Sprachen {', '.join(REQUIRED)} (vorbereitet: {', '.join(PREPARED)})")
    return 0


def sync(translations=None):
    strings = code_strings()
    catalog = load_catalog()
    entries = catalog.setdefault("strings", {})
    for key in list(entries):
        if key not in strings:
            del entries[key]
    for key, de in strings.items():
        entry = entries.setdefault(key, {"extractionState": "manual", "localizations": {}})
        entry["extractionState"] = "manual"
        locs = entry.setdefault("localizations", {})
        locs["de"] = unit(de)
        if translations and key in translations:
            locs["en"] = unit(translations[key])
        elif "en" not in locs:
            locs["en"] = unit("", "needs_review")
    save_catalog(catalog)
    print(f"{len(strings)} Texte geschrieben: {CATALOG.relative_to(ROOT)}")


if __name__ == "__main__":
    if "--sync" in sys.argv:
        sync()
    sys.exit(check() if "--check" in sys.argv or "--sync" not in sys.argv else 0)
