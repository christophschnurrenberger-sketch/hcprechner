"""Wählt aus `xcrun simctl list devices available -j` (stdin) das iPhone mit der neuesten iOS-Laufzeit und gibt die UDID aus."""
import json
import re
import sys

devices = json.load(sys.stdin)["devices"]
candidates = []
for runtime, entries in devices.items():
    match = re.search(r"iOS-(\d+)-(\d+)", runtime)
    if not match:
        continue
    version = (int(match.group(1)), int(match.group(2)))
    for device in entries:
        if device.get("isAvailable", True) and device["name"].startswith("iPhone"):
            # ohne Plus/Max/Pro bevorzugt (schneller), sonst beliebig
            plain = not re.search(r"Plus|Max|Pro", device["name"])
            candidates.append((version, plain, device["name"], device["udid"]))
if not candidates:
    sys.exit("kein iPhone-Simulator verfügbar")
candidates.sort()
print(candidates[-1][3])
print(f"{candidates[-1][2]} (iOS {candidates[-1][0][0]}.{candidates[-1][0][1]})", file=sys.stderr)
