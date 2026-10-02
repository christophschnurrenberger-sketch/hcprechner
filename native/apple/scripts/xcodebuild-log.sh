#!/bin/bash
# Führt xcodebuild aus, schreibt das vollständige Protokoll nach xcodebuild-<aktion>.log und zeigt kompakt
# Fehler (bei Misserfolg) bzw. Warnungen aus eigenem Code. Aufruf: scripts/xcodebuild-log.sh <aktion> [Argumente …]
set -u
action="$1"
log="xcodebuild-${action}.log"
xcodebuild "$@" > "$log" 2>&1
status=$?
own='(GolfApp|GolfAppUITests|Companion|Watch|HCPGolfKit)/'
if [ $status -ne 0 ]; then
  echo "::group::Fehler"
  grep -E "(error|fatal error):" "$log" | sort -u | head -400
  echo "::endgroup::"
  grep -nE "Failing tests:|Test Case .* failed|XCTAssert|\*\* (BUILD|TEST) " "$log" | head -80
  tail -40 "$log"
  echo "xcodebuild $action fehlgeschlagen (Status $status), Protokoll: $log"
  exit $status
fi
grep -E "warning:" "$log" | grep -E "$own" | sort -u | head -150 || true
grep -E "Executed [0-9]+ tests?|\*\* (BUILD|TEST) " "$log" | tail -5 || true
echo "xcodebuild $action erfolgreich"
