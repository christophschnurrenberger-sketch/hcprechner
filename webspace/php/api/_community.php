<?php
/**
 * Golf HCP Rechner – Community der Webspace-Edition (Ranking, Mitglieder, öffentliche Runden).
 *
 * Gleiche Regeln wie src/lib/community/policy.ts und projection.ts (Paritätstest
 * tests/community/php-parity.test.ts):
 * - Alles ist Opt-in. Runden- und Statistikfreigabe setzen ein sichtbares Profil voraus.
 * - Runde: PRIVATE / MEMBERS_BASIC / MEMBERS_FULL; ohne Statistikfreigabe wird FULL zu BASIC;
 *   Notizen nur bei FULL mit ausdrücklich freigegebenen Notizen; verborgene (moderierte) Runden nie.
 * - Ranking: Teilnehmer, HCPI aufsteigend, Gleichstand = gleicher Platz (1, 1, 3).
 *
 * Gespeichert wird nur die Projektion (freigegebene Felder) – andere Mitglieder erhalten nie Daten aus dem
 * Mitglieder-Dokument selbst:
 *   data/community/profiles.php          Community-Profile (Einstellungen, HCPI, freigegebene Kennzahlen)
 *   data/community/rounds/<id>.php       freigegebene Runden eines Mitglieds
 *   data/community/feed.php              neueste freigegebene Runden (Aktivität)
 *   data/community/admin.php             Summen der Spielleistung je Mitglied, geteilte/verborgene Runden (Admin)
 *   data/community/ranking/<datum>.php   Tagesstand des Rankings (Trend)
 *   data/avatars/<id>.php                Profilbilder
 *
 * Hinweis: In dieser Edition berechnet der Browser (gleiche Engine wie der Node-Server) HCPI und Statistik;
 * PHP prüft Wertebereiche und Struktur. Für ein manipulationssicheres Ranking die Node-Edition verwenden.
 */
declare(strict_types=1);

const HCP_CM_FEED_MAX = 500;
const HCP_CM_PAGE_RANKING = 25;
const HCP_CM_PAGE_MEMBERS = 24;
const HCP_CM_PAGE_FEED = 20;
const HCP_CM_AVATAR_MAX = 153600;
/** COMPETITION: 1, 1, 3 · DENSE: 1, 1, 2 (identisch zu COMMUNITY_POLICY.ranking.ties) */
const HCP_CM_TIES = 'COMPETITION';
const HCP_CM_HIDDEN_SEES_POSITION = true;

function hcp_cm_dir(): string
{
    return hcp_data_dir() . '/community';
}

function hcp_cm_flags(): array
{
    return hcp_settings()['community'];
}

function hcp_cm_require_flags(array $flags, array $keys = []): void
{
    if (empty($flags['communityEnabled'])) {
        hcp_fail('COMMUNITY_DISABLED', 'Diese Community-Funktion ist derzeit nicht aktiviert.', 403);
    }
    foreach ($keys as $k) {
        if (empty($flags[$k])) {
            hcp_fail('COMMUNITY_DISABLED', 'Diese Community-Funktion ist derzeit nicht aktiviert.', 403);
        }
    }
}

// ---------------------------------------------------------------------------
// Einstellungen
// ---------------------------------------------------------------------------

function hcp_cm_default_settings(): array
{
    return [
        'displayName' => null,
        'rankingVisible' => false,
        'profileVisible' => false,
        'roundsVisible' => false,
        'statsVisible' => false,
        'notesVisible' => false,
        'defaultRoundVisibility' => 'PRIVATE',
        'publicId' => null,
        'avatarVersion' => null,
        'updatedAt' => null,
    ];
}

function hcp_cm_visibilities(): array
{
    return ['PRIVATE', 'MEMBERS_BASIC', 'MEMBERS_FULL'];
}

/** Einstellungen aus dem Dokument (mit Standardwerten, Typen geprüft). */
function hcp_cm_settings(array $doc): array
{
    $s = hcp_cm_default_settings();
    $in = isset($doc['community']) && is_array($doc['community']) ? $doc['community'] : [];
    foreach (['rankingVisible', 'profileVisible', 'roundsVisible', 'statsVisible', 'notesVisible'] as $k) {
        $s[$k] = ($in[$k] ?? false) === true;
    }
    $s['displayName'] = is_string($in['displayName'] ?? null) && $in['displayName'] !== '' ? mb_substr_safe($in['displayName'], 60) : null;
    $s['defaultRoundVisibility'] = in_array($in['defaultRoundVisibility'] ?? null, hcp_cm_visibilities(), true) ? $in['defaultRoundVisibility'] : 'PRIVATE';
    $s['publicId'] = is_string($in['publicId'] ?? null) && preg_match('/^[a-f0-9-]{8,64}$/', $in['publicId']) ? $in['publicId'] : null;
    $s['avatarVersion'] = is_int($in['avatarVersion'] ?? null) ? $in['avatarVersion'] : null;
    $s['updatedAt'] = is_string($in['updatedAt'] ?? null) ? substr($in['updatedAt'], 0, 40) : null;
    return $s;
}

/** Abhängigkeiten der Schalter (wie normalizeSettings). */
function hcp_cm_normalize(array $s): array
{
    $s['roundsVisible'] = $s['profileVisible'] && $s['roundsVisible'];
    $s['statsVisible'] = $s['profileVisible'] && $s['statsVisible'];
    $s['notesVisible'] = $s['roundsVisible'] && $s['statsVisible'] && $s['notesVisible'];
    return $s;
}

function hcp_cm_sanitize_name($value): ?string
{
    if (!is_string($value)) {
        return null;
    }
    $v = preg_replace('/\s+/u', ' ', trim($value));
    if (!is_string($v) || !preg_match("/^[\\p{L}\\p{N}][\\p{L}\\p{N} .'’-]{1,39}$/u", $v) || preg_match('/@|https?:|www\./i', $v)) {
        return null;
    }
    return $v;
}

function hcp_cm_default_name(string $first, string $last): string
{
    $first = trim($first) !== '' ? trim($first) : 'Mitglied';
    $last = trim($last);
    return $last !== '' ? $first . ' ' . mb_strtoupper(mb_substr($last, 0, 1)) . '.' : $first;
}

function hcp_cm_display_name(array $settings, array $user): string
{
    return $settings['displayName'] ?? hcp_cm_default_name((string)($user['firstName'] ?? ''), (string)($user['lastName'] ?? ''));
}

function hcp_cm_initials(string $name): string
{
    $parts = preg_split('/\s+/u', $name, -1, PREG_SPLIT_NO_EMPTY) ?: [];
    $out = '';
    foreach (array_slice($parts, 0, 2) as $p) {
        $out .= mb_strtoupper(mb_substr($p, 0, 1));
    }
    return $out !== '' ? $out : '?';
}

/** Vom Mitglied änderbare Einstellungen übernehmen (publicId und Profilbild setzt nur der Server). */
function hcp_cm_apply_input(array $current, array $input): array
{
    $next = $current;
    if (array_key_exists('displayName', $input)) {
        if ($input['displayName'] === null || $input['displayName'] === '') {
            $next['displayName'] = null;
        } else {
            $name = hcp_cm_sanitize_name($input['displayName']);
            if ($name === null) {
                hcp_fail('VALIDATION', 'Anzeigename: 2–40 Zeichen, keine E-Mail-Adresse oder Links.', 0, ['displayName' => '2–40 Zeichen, keine E-Mail-Adresse oder Links.']);
            }
            $next['displayName'] = $name;
        }
    }
    foreach (['rankingVisible', 'profileVisible', 'roundsVisible', 'statsVisible', 'notesVisible'] as $k) {
        if (array_key_exists($k, $input)) {
            $next[$k] = $input[$k] === true;
        }
    }
    if (array_key_exists('defaultRoundVisibility', $input)) {
        if (!in_array($input['defaultRoundVisibility'], hcp_cm_visibilities(), true)) {
            hcp_fail('VALIDATION', 'Ungültige Sichtbarkeit.');
        }
        $next['defaultRoundVisibility'] = $input['defaultRoundVisibility'];
    }
    $next = hcp_cm_normalize($next);
    $next['updatedAt'] = hcp_now();
    return $next;
}

// ---------------------------------------------------------------------------
// Projektion (freigegebene Daten) – wie src/lib/community/projection.ts
// ---------------------------------------------------------------------------

function hcp_cm_round_level(array $settings, array $round): ?string
{
    $s = hcp_cm_normalize($settings);
    if (!$s['roundsVisible']) {
        return null;
    }
    if (($round['status'] ?? 'COMPLETED') === 'DELETED' || !empty($round['moderation']['hidden'])) {
        return null;
    }
    $v = $round['visibility'] ?? 'PRIVATE';
    if ($v !== 'MEMBERS_BASIC' && $v !== 'MEMBERS_FULL') {
        return null;
    }
    return $v === 'MEMBERS_FULL' && $s['statsVisible'] ? 'FULL' : 'BASIC';
}

function hcp_cm_level_with_flags(string $level, array $flags): ?string
{
    if (empty($flags['communityEnabled']) || empty($flags['publicRoundsEnabled'])) {
        return null;
    }
    return $level === 'FULL' && empty($flags['statsSharingEnabled']) ? 'BASIC' : $level;
}

function hcp_cm_nullable_int($v): ?int
{
    return is_int($v) ? $v : (is_float($v) && floor($v) === $v ? (int)$v : null);
}

function hcp_cm_nullable_bool($v): ?bool
{
    return is_bool($v) ? $v : null;
}

function hcp_cm_nullable_num($v)
{
    return is_int($v) || is_float($v) ? $v : null;
}

function hcp_cm_public_hole(array $h, bool $withNotes): array
{
    return [
        'number' => (int)($h['number'] ?? 0),
        'par' => hcp_cm_nullable_int($h['par'] ?? null),
        'strokeIndex' => hcp_cm_nullable_int($h['strokeIndex'] ?? null),
        'score' => hcp_cm_nullable_int($h['score'] ?? null),
        'putts' => hcp_cm_nullable_int($h['putts'] ?? null),
        'fir' => hcp_cm_nullable_bool($h['fir'] ?? null),
        'gir' => hcp_cm_nullable_bool($h['gir'] ?? null),
        'bunkerVisit' => hcp_cm_nullable_bool($h['bunkerVisit'] ?? null),
        'bunkerShots' => hcp_cm_nullable_int($h['bunkerShots'] ?? null),
        'sandSave' => hcp_cm_nullable_bool($h['sandSave'] ?? null),
        'upAndDown' => hcp_cm_nullable_bool($h['upAndDown'] ?? null),
        'penaltyStrokes' => hcp_cm_nullable_int($h['penaltyStrokes'] ?? null),
        'note' => $withNotes && is_string($h['note'] ?? null) && $h['note'] !== '' ? mb_substr_safe($h['note'], 200) : null,
    ];
}

/** Rundenstatistik nur mit bekannten Zahlenfeldern übernehmen. */
function hcp_cm_clean_stats($stats): ?array
{
    if (!is_array($stats)) {
        return null;
    }
    $out = [];
    foreach ($stats as $k => $v) {
        if (is_string($k) && preg_match('/^[a-zA-Z]{2,30}$/', $k) && (is_int($v) || is_float($v) || is_bool($v) || $v === null)) {
            $out[$k] = $v;
        }
    }
    return $out;
}

function hcp_cm_round_record(string $userId, string $publicId, array $round, string $level, bool $notesVisible): array
{
    $computed = is_array($round['computed'] ?? null) ? $round['computed'] : [];
    $stats = hcp_cm_clean_stats($computed['stats'] ?? null);
    $full = $level === 'FULL';
    $withNotes = $full && $notesVisible;
    $holes = [];
    if ($full && !empty($round['holeStats']) && is_array($round['holeStats'])) {
        foreach ($round['holeStats'] as $h) {
            if (is_array($h)) {
                $holes[] = hcp_cm_public_hole($h, $withNotes);
            }
        }
    }
    $course = is_array($round['course'] ?? null) ? $round['course'] : [];
    $rating = is_array($round['rating'] ?? null) ? $round['rating'] : [];
    return [
        'userId' => $userId,
        'publicId' => $publicId,
        'roundId' => (string)$round['id'],
        'level' => $level,
        'date' => (string)$round['date'],
        'courseId' => is_string($course['courseId'] ?? null) ? $course['courseId'] : null,
        'courseName' => (string)($course['courseName'] ?? ''),
        'layoutName' => is_string($course['layoutName'] ?? null) ? $course['layoutName'] : null,
        'teeColor' => is_string($course['teeColor'] ?? null) ? $course['teeColor'] : null,
        'holes' => (int)$round['holes'],
        'nine' => in_array($rating['nine'] ?? null, ['FRONT', 'BACK'], true) ? $rating['nine'] : null,
        'par' => hcp_cm_nullable_int($rating['par'] ?? null),
        'grossScore' => $stats !== null ? hcp_cm_nullable_int($stats['grossScore'] ?? null) : null,
        'adjustedGrossScore' => hcp_cm_nullable_int($computed['adjustedGrossScore'] ?? null),
        'scoreDifferential' => hcp_cm_nullable_num($computed['scoreDifferential'] ?? null),
        'handicapIndexBefore' => hcp_cm_nullable_num($computed['handicapIndexBefore'] ?? null),
        'handicapIndexAfter' => hcp_cm_nullable_num($computed['handicapIndexAfter'] ?? null),
        'createdAt' => (string)($round['createdAt'] ?? ''),
        'updatedAt' => (string)($round['updatedAt'] ?? ''),
        'stats' => $full ? $stats : null,
        'holeStats' => $full && count($holes) > 0 ? $holes : null,
        'notes' => $withNotes && is_string($round['notes'] ?? null) && $round['notes'] !== '' ? $round['notes'] : null,
    ];
}

/**
 * Community-Profil und freigegebene Runden eines Mitglieds.
 * $home: ['id' => …, 'name' => …, 'region' => …] oder null.
 */
function hcp_cm_project(array $user, array $doc, ?array $home, string $now): array
{
    $settings = hcp_cm_normalize(hcp_cm_settings($doc));
    if ($settings['publicId'] === null) {
        hcp_fail('SERVER', 'publicId fehlt');
    }
    $publicId = $settings['publicId'];
    $userId = (string)$user['id'];
    $displayName = hcp_cm_display_name($settings, $user);
    $rounds = [];
    foreach (($doc['rounds'] ?? []) as $r) {
        if (!is_array($r) || !isset($r['id'], $r['date'], $r['holes'])) {
            continue;
        }
        $level = hcp_cm_round_level($settings, $r);
        if ($level !== null) {
            $rounds[] = hcp_cm_round_record($userId, $publicId, $r, $level, $settings['notesVisible']);
        }
    }
    $last = null;
    foreach ($rounds as $r) {
        if ($last === null || strcmp($r['createdAt'], $last) > 0) {
            $last = $r['createdAt'];
        }
    }
    $summary = hcp_cm_clean_summary($doc['summary'] ?? null);
    return [
        'profile' => [
            'userId' => $userId,
            'publicId' => $publicId,
            'displayName' => $displayName,
            'initials' => hcp_cm_initials($displayName),
            'avatarVersion' => $settings['avatarVersion'],
            'rankingVisible' => $settings['rankingVisible'],
            'profileVisible' => $settings['profileVisible'],
            'roundsVisible' => $settings['roundsVisible'],
            'statsVisible' => $settings['statsVisible'],
            'notesVisible' => $settings['notesVisible'],
            'handicapIndex' => $summary['handicapIndex'] ?? null,
            'roundsCount' => $summary['roundsCount'] ?? 0,
            'publicRoundsCount' => count($rounds),
            'homeCourseId' => $home['id'] ?? null,
            'homeCourseName' => $home['name'] ?? null,
            'region' => $home['region'] ?? null,
            'performance' => $settings['statsVisible'] ? ($summary['performance'] ?? null) : null,
            'lastActivityAt' => $last ?? $settings['updatedAt'],
            'updatedAt' => $now,
        ],
        'rounds' => $rounds,
    ];
}

// ---------------------------------------------------------------------------
// Zusammenfassung (vom Browser berechnet, hier geprüft)
// ---------------------------------------------------------------------------

function hcp_cm_clean_performance($p): ?array
{
    if (!is_array($p)) {
        return null;
    }
    $out = [];
    foreach ($p as $k => $v) {
        if (!is_string($k) || !preg_match('/^[a-zA-Z0-9]{2,30}$/', $k)) {
            continue;
        }
        if ($k === 'distribution' && is_array($v)) {
            $d = [];
            foreach (['eagles', 'birdies', 'pars', 'bogeys', 'doubleBogeys', 'triplePlus'] as $dk) {
                $d[$dk] = is_int($v[$dk] ?? null) ? max(0, $v[$dk]) : 0;
            }
            $out[$k] = $d;
        } elseif (is_int($v) || is_float($v) || $v === null) {
            $out[$k] = $v;
        }
    }
    return $out;
}

/** Zusammenfassung prüfen (HCPI −10 … 54, Zähler ≥ 0); ungültig → null. */
function hcp_cm_clean_summary($s): ?array
{
    if (!is_array($s)) {
        return null;
    }
    $h = $s['handicapIndex'] ?? null;
    if ((!is_int($h) && !is_float($h)) || $h < -10 || $h > 54) {
        return null;
    }
    $low = $s['lowHandicapIndex'] ?? null;
    return [
        'handicapIndex' => round((float)$h, 1),
        'lowHandicapIndex' => (is_int($low) || is_float($low)) && $low >= -10 && $low <= 54 ? round((float)$low, 1) : null,
        'roundsCount' => is_int($s['roundsCount'] ?? null) ? max(0, min(100000, $s['roundsCount'])) : 0,
        'lastRoundDate' => is_string($s['lastRoundDate'] ?? null) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $s['lastRoundDate']) ? $s['lastRoundDate'] : null,
        'performance' => hcp_cm_clean_performance($s['performance'] ?? null),
        'computedAt' => is_string($s['computedAt'] ?? null) ? substr($s['computedAt'], 0, 40) : hcp_now(),
    ];
}

// ---------------------------------------------------------------------------
// Speicher
// ---------------------------------------------------------------------------

function hcp_cm_profiles(): array
{
    $data = hcp_read_json_file(hcp_cm_dir() . '/profiles.php');
    return is_array($data['profiles'] ?? null) ? $data['profiles'] : [];
}

function hcp_cm_user_rounds(string $userId): array
{
    if (!preg_match('/^[a-f0-9]{32}$/', $userId)) {
        return [];
    }
    $data = hcp_read_json_file(hcp_cm_dir() . '/rounds/' . $userId . '.php');
    return is_array($data['rounds'] ?? null) ? $data['rounds'] : [];
}

function hcp_cm_feed(): array
{
    $data = hcp_read_json_file(hcp_cm_dir() . '/feed.php');
    return is_array($data['items'] ?? null) ? $data['items'] : [];
}

function hcp_cm_admin_index(): array
{
    $data = hcp_read_json_file(hcp_cm_dir() . '/admin.php');
    return is_array($data['users'] ?? null) ? $data['users'] : [];
}

/** Heimatplatz aus dem veröffentlichten Golfplatz-Datensatz. */
function hcp_cm_home(array $doc): ?array
{
    $id = $doc['preferences']['homeCourseId'] ?? null;
    if (!is_string($id) || $id === '') {
        return null;
    }
    foreach ((hcp_dataset()['courses'] ?? []) as $c) {
        if (($c['id'] ?? null) === $id) {
            return ['id' => $id, 'name' => (string)($c['name'] ?? ''), 'region' => is_string($c['region'] ?? null) ? $c['region'] : null];
        }
    }
    return null;
}

/** Summen der Spielleistung (wie sumsOf in src/lib/stats/aggregate.ts). */
function hcp_cm_empty_sums(): array
{
    return ['rounds' => 0, 'detailedRounds' => 0, 'completeRounds' => 0, 'totalPutts' => 0, 'puttHoles' => 0, 'puttRounds' => 0, 'girs' => 0, 'girHoles' => 0, 'firs' => 0, 'fairwayOpportunities' => 0, 'upAndDowns' => 0, 'upAndDownAttempts' => 0, 'sandSaves' => 0, 'sandAttempts' => 0, 'threePutts' => 0, 'penaltyStrokes' => 0, 'penaltyRounds' => 0];
}

function hcp_cm_has_stats($st): bool
{
    return is_array($st) && ((int)($st['holesScored'] ?? 0) > 0 || (int)($st['puttHoles'] ?? 0) > 0 || (int)($st['girHoles'] ?? 0) > 0 || (int)($st['fairwayOpportunities'] ?? 0) > 0);
}

/** Einfache Plausibilitätshinweise (Statistik ohne Schlagzahl, ungewöhnliche GIR-Angabe). */
function hcp_cm_round_warnings(array $round): int
{
    $n = 0;
    foreach (($round['holeStats'] ?? []) as $h) {
        if (!is_array($h)) {
            continue;
        }
        $score = $h['score'] ?? null;
        $any = false;
        foreach (['putts', 'fir', 'gir', 'bunkerVisit', 'bunkerShots', 'sandSave', 'upAndDown', 'penaltyStrokes'] as $k) {
            if (($h[$k] ?? null) !== null) {
                $any = true;
            }
        }
        if ($score === null && $any) {
            $n++;
        } elseif (is_int($score) && ($h['gir'] ?? null) === true && is_int($h['putts'] ?? null) && is_int($h['par'] ?? null) && $score - $h['putts'] > $h['par'] - 2) {
            $n++;
        }
    }
    return $n;
}

function hcp_cm_admin_entry(array $doc, array $settings): array
{
    $sums = hcp_cm_empty_sums();
    $warnings = 0;
    $hidden = 0;
    $rows = [];
    foreach (($doc['rounds'] ?? []) as $r) {
        if (!is_array($r) || ($r['status'] ?? 'COMPLETED') === 'DELETED' || !isset($r['id'])) {
            continue;
        }
        $st = $r['computed']['stats'] ?? null;
        $sums['rounds']++;
        $detailed = hcp_cm_has_stats($st);
        if ($detailed) {
            $sums['detailedRounds']++;
            if ((int)($st['holesTracked'] ?? -1) === (int)($st['holes'] ?? -2)) {
                $sums['completeRounds']++;
            }
            foreach (['puttHoles', 'girs', 'girHoles', 'firs', 'fairwayOpportunities', 'upAndDowns', 'upAndDownAttempts', 'sandSaves', 'sandAttempts', 'threePutts'] as $k) {
                $sums[$k] += (int)($st[$k] ?? 0);
            }
            $sums['totalPutts'] += (int)($st['totalPutts'] ?? 0);
            if ((int)($st['puttHoles'] ?? 0) > 0) {
                $sums['puttRounds']++;
            }
            if (is_int($st['penaltyStrokes'] ?? null)) {
                $sums['penaltyStrokes'] += $st['penaltyStrokes'];
                $sums['penaltyRounds']++;
            }
        }
        $w = hcp_cm_round_warnings($r);
        if ($w > 0) {
            $warnings++;
        }
        $isHidden = !empty($r['moderation']['hidden']);
        if ($isHidden) {
            $hidden++;
        }
        $vis = in_array($r['visibility'] ?? null, hcp_cm_visibilities(), true) ? $r['visibility'] : 'PRIVATE';
        if ($vis !== 'PRIVATE' || $isHidden) {
            $rows[] = [
                'roundId' => (string)$r['id'],
                'date' => (string)$r['date'],
                'courseName' => (string)($r['course']['courseName'] ?? ''),
                'holes' => (int)$r['holes'],
                'visibility' => $vis,
                'hidden' => $isHidden,
                'detailed' => $detailed,
                'level' => hcp_cm_round_level($settings, $r),
            ];
        }
    }
    return ['sums' => $sums, 'withWarnings' => $warnings, 'hidden' => $hidden, 'rounds' => $rows];
}

/**
 * Community-Daten eines Mitglieds neu aufbauen (nach jeder Änderung am Mitglieder-Dokument).
 * Vergibt bei Bedarf die öffentliche Kennung.
 */
function hcp_cm_reindex(string $userId): void
{
    $user = hcp_find_user('id', $userId);
    if ($user === null) {
        hcp_cm_remove_user($userId);
        return;
    }
    $stored = hcp_load_member_doc($userId);
    $doc = is_array($stored['data']) ? $stored['data'] : hcp_default_member_doc($userId);
    if (hcp_cm_settings($doc)['publicId'] === null) {
        hcp_with_member_doc($userId, function (array &$d) {
            $s = hcp_cm_settings($d);
            if ($s['publicId'] === null) {
                $s['publicId'] = bin2hex(random_bytes(8)) . '-' . bin2hex(random_bytes(8));
                $d['community'] = $s;
            }
        });
        $doc = hcp_load_member_doc($userId)['data'];
    }
    $projection = hcp_cm_project($user, $doc, hcp_cm_home($doc), hcp_now());
    $settings = hcp_cm_normalize(hcp_cm_settings($doc));

    $lock = hcp_lock('community');
    try {
        $profiles = hcp_cm_profiles();
        $profiles[$userId] = $projection['profile'];
        hcp_write_json_file(hcp_cm_dir() . '/profiles.php', ['profiles' => $profiles]);
        hcp_write_json_file(hcp_cm_dir() . '/rounds/' . $userId . '.php', ['rounds' => $projection['rounds']]);

        $feed = array_values(array_filter(hcp_cm_feed(), function ($i) use ($userId) {
            return ($i['userId'] ?? null) !== $userId;
        }));
        foreach ($projection['rounds'] as $r) {
            $feed[] = ['userId' => $userId, 'roundId' => $r['roundId'], 'createdAt' => $r['createdAt']];
        }
        usort($feed, function ($a, $b) {
            return strcmp((string)$b['createdAt'], (string)$a['createdAt']);
        });
        hcp_write_json_file(hcp_cm_dir() . '/feed.php', ['items' => array_slice($feed, 0, HCP_CM_FEED_MAX)]);

        $admin = hcp_cm_admin_index();
        $admin[$userId] = hcp_cm_admin_entry($doc, $settings);
        hcp_write_json_file(hcp_cm_dir() . '/admin.php', ['users' => $admin]);
    } finally {
        hcp_unlock($lock);
    }
}

/** Beim Löschen eines Kontos: alle Community-Daten entfernen. */
function hcp_cm_remove_user(string $userId): void
{
    $lock = hcp_lock('community');
    try {
        $profiles = hcp_cm_profiles();
        unset($profiles[$userId]);
        hcp_write_json_file(hcp_cm_dir() . '/profiles.php', ['profiles' => $profiles]);
        $feed = array_values(array_filter(hcp_cm_feed(), function ($i) use ($userId) {
            return ($i['userId'] ?? null) !== $userId;
        }));
        hcp_write_json_file(hcp_cm_dir() . '/feed.php', ['items' => $feed]);
        $admin = hcp_cm_admin_index();
        unset($admin[$userId]);
        hcp_write_json_file(hcp_cm_dir() . '/admin.php', ['users' => $admin]);
        if (preg_match('/^[a-f0-9]{32}$/', $userId)) {
            @unlink(hcp_cm_dir() . '/rounds/' . $userId . '.php');
            @unlink(hcp_data_dir() . '/avatars/' . $userId . '.php');
        }
    } finally {
        hcp_unlock($lock);
    }
}

// ---------------------------------------------------------------------------
// Lesen (andere Mitglieder)
// ---------------------------------------------------------------------------

function hcp_cm_avatar_url(string $publicId, int $version): string
{
    $config = hcp_config();
    $base = rtrim((string)($config['basePath'] ?? ''), '/');
    return $base . '/api/community.php?action=avatar&id=' . rawurlencode($publicId) . '&v=' . $version;
}

function hcp_cm_ref(array $p): array
{
    return [
        'publicId' => (string)$p['publicId'],
        'displayName' => (string)$p['displayName'],
        'initials' => (string)$p['initials'],
        'avatarUrl' => is_int($p['avatarVersion'] ?? null) && $p['avatarVersion'] > 0 ? hcp_cm_avatar_url((string)$p['publicId'], $p['avatarVersion']) : null,
        'profileVisible' => (bool)$p['profileVisible'],
    ];
}

function hcp_cm_round_summary(array $rec, array $ref, array $flags): ?array
{
    $level = hcp_cm_level_with_flags((string)$rec['level'], $flags);
    if ($level === null) {
        return null;
    }
    return [
        'member' => $ref,
        'roundId' => $rec['roundId'],
        'level' => $level,
        'date' => $rec['date'],
        'courseName' => $rec['courseName'],
        'holes' => $rec['holes'],
        'grossScore' => $rec['grossScore'],
        'adjustedGrossScore' => $rec['adjustedGrossScore'],
        'scoreDifferential' => $rec['scoreDifferential'],
        'handicapIndexAfter' => $rec['handicapIndexAfter'],
        'createdAt' => $rec['createdAt'],
    ];
}

/** Öffentliche Runde; Texte der Hinweise ergänzt der Browser aus der Statistik. */
function hcp_cm_round_view(array $rec, array $ref, array $flags, bool $isMine): ?array
{
    $summary = hcp_cm_round_summary($rec, $ref, $flags);
    if ($summary === null) {
        return null;
    }
    $full = $summary['level'] === 'FULL';
    return $summary + [
        'courseId' => $rec['courseId'],
        'layoutName' => $rec['layoutName'],
        'teeColor' => $rec['teeColor'],
        'nine' => $rec['nine'],
        'par' => $rec['par'],
        'handicapIndexBefore' => $rec['handicapIndexBefore'],
        'stats' => $full ? $rec['stats'] : null,
        'holeStats' => $full ? $rec['holeStats'] : null,
        'insights' => [],
        'notes' => $full ? $rec['notes'] : null,
        'isMine' => $isMine,
    ];
}

/** Status aller Konten (nur aktive Mitglieder erscheinen in der Community). */
function hcp_cm_status_map(): array
{
    $out = [];
    foreach (hcp_load_users() as $u) {
        $out[$u['id']] = $u['status'];
    }
    return $out;
}

function hcp_cm_profile_by_public(string $publicId): ?array
{
    foreach (hcp_cm_profiles() as $p) {
        if (($p['publicId'] ?? null) === $publicId) {
            return $p;
        }
    }
    return null;
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

function hcp_cm_tenths($h): int
{
    return (int)round((float)$h * 10);
}

/** Teilnehmer (aktiv, mit HCPI) sortiert, mit Platz nach Wettkampf-Rang. */
function hcp_cm_ranked(array $profiles, array $status, ?callable $scope = null): array
{
    $list = [];
    foreach ($profiles as $p) {
        if (empty($p['rankingVisible']) || !isset($p['handicapIndex']) || ($status[$p['userId']] ?? '') !== 'ACTIVE') {
            continue;
        }
        if ($scope !== null && !$scope($p)) {
            continue;
        }
        $list[] = $p;
    }
    usort($list, function ($a, $b) {
        $d = hcp_cm_tenths($a['handicapIndex']) - hcp_cm_tenths($b['handicapIndex']);
        if ($d !== 0) {
            return $d;
        }
        $n = strnatcasecmp((string)$a['displayName'], (string)$b['displayName']);
        return $n !== 0 ? $n : strcmp((string)$a['publicId'], (string)$b['publicId']);
    });
    $position = 0;
    $dense = 0;
    $previous = null;
    foreach ($list as $i => $p) {
        $v = hcp_cm_tenths($p['handicapIndex']);
        if ($v !== $previous) {
            $dense++;
            $position = HCP_CM_TIES === 'DENSE' ? $dense : $i + 1;
            $previous = $v;
        }
        $list[$i]['position'] = $position;
    }
    return $list;
}

function hcp_cm_position_for($hcp, array $ranked): int
{
    $me = hcp_cm_tenths($hcp);
    $better = [];
    foreach ($ranked as $p) {
        $v = hcp_cm_tenths($p['handicapIndex']);
        if ($v < $me) {
            $better[] = $v;
        }
    }
    return 1 + (HCP_CM_TIES === 'DENSE' ? count(array_unique($better)) : count($better));
}

function hcp_cm_today(): string
{
    return date('Y-m-d');
}

/** Tagesstand speichern (einmal täglich beim ersten Aufruf bzw. auf Knopfdruck). */
function hcp_cm_snapshot_ensure(array $rankedAll, bool $force = false): string
{
    $today = hcp_cm_today();
    $file = hcp_cm_dir() . '/ranking/' . $today . '.php';
    if (!$force && is_file($file)) {
        return $today;
    }
    $positions = [];
    foreach ($rankedAll as $p) {
        $positions[$p['userId']] = ['position' => $p['position'], 'handicapIndex' => $p['handicapIndex']];
    }
    hcp_write_json_file($file, ['date' => $today, 'positions' => $positions]);
    // ältere Stände nach gut einem Jahr entfernen
    foreach (glob(hcp_cm_dir() . '/ranking/*.php') ?: [] as $f) {
        if (basename($f, '.php') < date('Y-m-d', time() - 400 * 86400)) {
            @unlink($f);
        }
    }
    return $today;
}

/** Letzter Stand vor heute: ['date' => ?string, 'positions' => [userId => position]] */
function hcp_cm_previous_snapshot(): array
{
    $today = hcp_cm_today();
    $dates = [];
    foreach (glob(hcp_cm_dir() . '/ranking/*.php') ?: [] as $f) {
        $d = basename($f, '.php');
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $d) && $d < $today) {
            $dates[] = $d;
        }
    }
    if (!$dates) {
        return ['date' => null, 'positions' => []];
    }
    rsort($dates);
    $data = hcp_read_json_file(hcp_cm_dir() . '/ranking/' . $dates[0] . '.php') ?? [];
    $out = [];
    foreach (($data['positions'] ?? []) as $uid => $e) {
        if (is_array($e) && is_int($e['position'] ?? null)) {
            $out[$uid] = $e['position'];
        }
    }
    return ['date' => $dates[0], 'positions' => $out];
}

function hcp_cm_history(string $userId): array
{
    $out = [];
    foreach (glob(hcp_cm_dir() . '/ranking/*.php') ?: [] as $f) {
        $data = hcp_read_json_file($f) ?? [];
        $e = $data['positions'][$userId] ?? null;
        if (is_array($e)) {
            $out[] = ['date' => (string)($data['date'] ?? basename($f, '.php')), 'position' => (int)$e['position'], 'handicapIndex' => (float)$e['handicapIndex']];
        }
    }
    usort($out, function ($a, $b) {
        return strcmp($a['date'], $b['date']);
    });
    return $out;
}

// ---------------------------------------------------------------------------
// Profilbilder
// ---------------------------------------------------------------------------

function hcp_cm_avatar_file(string $userId): string
{
    if (!preg_match('/^[a-f0-9]{32}$/', $userId)) {
        hcp_fail('VALIDATION', 'Ungültige Benutzer-ID');
    }
    return hcp_data_dir() . '/avatars/' . $userId . '.php';
}

/** Bild prüfen: JPEG/PNG/WebP als data-URL, höchstens 150 KB, Dateisignatur passend. */
function hcp_cm_check_image($dataUrl): array
{
    if (!is_string($dataUrl) || !preg_match('#^data:(image/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$#', $dataUrl, $m)) {
        hcp_fail('VALIDATION', 'Bitte ein Bild (JPEG, PNG oder WebP) auswählen.', 0, ['avatar' => 'Bitte ein Bild auswählen.']);
    }
    $bytes = base64_decode($m[2], true);
    if ($bytes === false || strlen($bytes) > HCP_CM_AVATAR_MAX) {
        hcp_fail('VALIDATION', 'Das Bild ist zu groß (höchstens 150 KB).', 0, ['avatar' => 'Höchstens 150 KB.']);
    }
    $ok = ($m[1] === 'image/jpeg' && substr($bytes, 0, 2) === "\xFF\xD8")
        || ($m[1] === 'image/png' && substr($bytes, 0, 4) === "\x89PNG")
        || ($m[1] === 'image/webp' && substr($bytes, 0, 4) === 'RIFF' && substr($bytes, 8, 4) === 'WEBP');
    if (!$ok) {
        hcp_fail('VALIDATION', 'Die Datei ist kein gültiges Bild.', 0, ['avatar' => 'Kein gültiges Bild.']);
    }
    return ['mime' => $m[1], 'data' => $m[2]];
}
