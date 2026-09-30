<?php
/**
 * Golf HCP Rechner – Daten des angemeldeten Mitglieds (Webspace-Edition).
 *
 * Jede Aktion arbeitet ausschließlich auf dem Dokument des Sitzungsbenutzers (data/userdata/<id>.php);
 * eine Benutzer-ID aus der Anfrage wird nie verwendet. Schreibende Aktionen: POST + Header X-CSRF-Token.
 *
 *   load             GET   { doc, revision, updatedAt }
 *   round-save       POST  { round, draftId?, baseRevision }   neu oder geändert (Soft-Delete-Status bleibt Server-Sache)
 *   round-delete     POST  { id, baseRevision }                Soft Delete (Status DELETED)
 *   rounds-import    POST  { rounds: [...], baseRevision }
 *   profile-save     POST  { profile, baseRevision }
 *   prefs-save       POST  { preferences }
 *   draft-save       POST  { draft }
 *   draft-delete     POST  { id }
 *   round-visibility POST  { id, visibility, summary? }      Sichtbarkeit für andere Mitglieder
 *   round-stats-save POST  { id, holeStats, stats, summary }  Lochstatistik (ändert keine WHS-Daten)
 *   community-save   POST  { settings, summary? }            Community- und Privatsphäre-Einstellungen
 *   avatar-save      POST  { dataUrl }  ·  avatar-delete POST
 *
 * `summary` (HCPI, Rundenzahl, Statistik) berechnet der Browser mit derselben Service-Schicht wie der
 * Node-Server; PHP prüft die Wertebereiche. Nach jeder Änderung werden die Community-Daten neu aufgebaut.
 * Moderation (vom Admin verborgene Runden) kann über diese Schnittstelle nie geändert werden.
 *
 * Die WHS-Berechnung erfolgt in der gemeinsamen Service-Schicht (src/lib/member) – in dieser Edition im
 * API-Adapter des Browsers; PHP übernimmt Anmeldung, Datentrennung, Prüfung, Speicherung und Audit-Log.
 */
declare(strict_types=1);
require __DIR__ . '/_lib.php';

const ME_MAX_ROUNDS = 3000;
const ME_MAX_DRAFTS = 10;

$action = (string)($_GET['action'] ?? '');
$config = hcp_require_installed();

if ($action === 'load') {
    $user = hcp_require_user($config, false);
    $doc = hcp_load_member_doc($user['id']);
    hcp_json(['doc' => $doc['data'], 'revision' => $doc['revision'], 'updatedAt' => $doc['updatedAt']]);
}

hcp_require_post();
$user = hcp_require_user($config);
$uid = $user['id'];

function me_is_list($value): bool
{
    return is_array($value) && ($value === [] || array_keys($value) === range(0, count($value) - 1));
}

function me_id_ok($id): bool
{
    return is_string($id) && preg_match('/^[A-Za-z0-9_-]{1,64}$/', $id) === 1;
}

/** Strukturprüfung einer Runde (die fachliche Prüfung erfolgt in der Service-Schicht). */
function me_check_round($round, string $field = 'round'): array
{
    $fail = function (string $why) use ($field) {
        hcp_fail('ROUND_INVALID', 'Die Runde ist unvollständig (' . $why . ').', 0, [$field => $why]);
    };
    if (!is_array($round) || me_is_list($round)) {
        $fail('keine Runde');
    }
    if (!me_id_ok($round['id'] ?? null)) {
        $fail('ID');
    }
    if (!is_string($round['date'] ?? null) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $round['date'])) {
        $fail('Datum');
    }
    if (!in_array($round['holes'] ?? null, [9, 18], true)) {
        $fail('Löcher');
    }
    if (!is_array($round['course'] ?? null) || !is_string($round['course']['courseName'] ?? null)) {
        $fail('Golfplatz');
    }
    if (!is_array($round['rating'] ?? null) || !is_array($round['entry'] ?? null)) {
        $fail('Rating/Ergebnis');
    }
    if (!is_int($round['sequence'] ?? null) || $round['sequence'] < 0) {
        $fail('Reihenfolge');
    }
    if (!in_array($round['category'] ?? null, ['TOURNAMENT', 'RPR', 'OTHER'], true)) {
        $fail('Art');
    }
    $json = json_encode($round);
    if ($json === false || strlen($json) > 64 * 1024) {
        $fail('zu groß');
    }
    return $round;
}

/** Lochstatistik: Struktur und Wertebereiche (fachliche Prüfung in der Service-Schicht). */
function me_clean_hole_stats($holes, string $field = 'holeStats'): ?array
{
    if ($holes === null) {
        return null;
    }
    if (!me_is_list($holes) || count($holes) < 9 || count($holes) > 18) {
        hcp_fail('VALIDATION', 'Die Lochstatistik ist ungültig.', 0, [$field => 'Lochstatistik ungültig']);
    }
    $int = function ($v, int $min, int $max) use ($field) {
        if ($v === null) {
            return null;
        }
        if (!is_int($v) || $v < $min || $v > $max) {
            hcp_fail('VALIDATION', 'Die Lochstatistik ist ungültig.', 0, [$field => 'Wert außerhalb des zulässigen Bereichs']);
        }
        return $v;
    };
    $bool = function ($v) use ($field) {
        if ($v !== null && !is_bool($v)) {
            hcp_fail('VALIDATION', 'Die Lochstatistik ist ungültig.', 0, [$field => 'Ja/Nein erwartet']);
        }
        return $v;
    };
    $out = [];
    foreach ($holes as $h) {
        if (!is_array($h)) {
            hcp_fail('VALIDATION', 'Die Lochstatistik ist ungültig.', 0, [$field => 'Loch ungültig']);
        }
        $out[] = [
            'number' => $int($h['number'] ?? null, 1, 18) ?? hcp_fail('VALIDATION', 'Lochnummer fehlt.'),
            'par' => $int($h['par'] ?? null, 3, 6),
            'strokeIndex' => $int($h['strokeIndex'] ?? null, 1, 18),
            'score' => $int($h['score'] ?? null, 1, 20),
            'putts' => $int($h['putts'] ?? null, 0, 10),
            'fir' => $bool($h['fir'] ?? null),
            'gir' => $bool($h['gir'] ?? null),
            'bunkerVisit' => $bool($h['bunkerVisit'] ?? null),
            'bunkerShots' => $int($h['bunkerShots'] ?? null, 0, 10),
            'sandSave' => $bool($h['sandSave'] ?? null),
            'upAndDown' => $bool($h['upAndDown'] ?? null),
            'penaltyStrokes' => $int($h['penaltyStrokes'] ?? null, 0, 10),
            'note' => is_string($h['note'] ?? null) && trim($h['note']) !== '' ? mb_substr_safe(trim($h['note']), 200) : null,
        ];
    }
    return $out;
}

/** Community-Felder einer Runde: Sichtbarkeit prüfen, Lochstatistik prüfen, Moderation nur vom Server. */
function me_round_extras(array $round, ?array $old): array
{
    // Entwurfs-Kennung (idempotentes Speichern) – bleibt bei späteren Änderungen erhalten
    if (!me_id_ok($round['clientRef'] ?? null)) {
        unset($round['clientRef']);
    }
    if ($old !== null && me_id_ok($old['clientRef'] ?? null)) {
        $round['clientRef'] = $old['clientRef'];
    }
    $round['visibility'] = in_array($round['visibility'] ?? null, hcp_cm_visibilities(), true) ? $round['visibility'] : 'PRIVATE';
    if (array_key_exists('holeStats', $round)) {
        $clean = me_clean_hole_stats($round['holeStats'], 'round.holeStats');
        if ($clean === null) {
            unset($round['holeStats']);
        } else {
            $round['holeStats'] = $clean;
        }
    }
    if (isset($round['computed']) && is_array($round['computed'])) {
        $round['computed']['stats'] = hcp_cm_clean_stats($round['computed']['stats'] ?? null);
    }
    unset($round['moderation']);
    if ($old !== null && !empty($old['moderation']) && is_array($old['moderation'])) {
        $round['moderation'] = $old['moderation'];
    }
    return $round;
}

/** Vom Browser berechnete Zusammenfassung übernehmen (nur gültige Werte). */
function me_store_summary(array &$doc, array $body): void
{
    if (array_key_exists('summary', $body)) {
        $clean = hcp_cm_clean_summary($body['summary']);
        if ($clean !== null) {
            $doc['summary'] = $clean;
        }
    }
}

function me_round_summary(array $round): array
{
    return [
        'date' => $round['date'] ?? null,
        'courseName' => $round['course']['courseName'] ?? null,
        'holes' => $round['holes'] ?? null,
        'scoreDifferential' => $round['computed']['scoreDifferential'] ?? null,
        'handicapIndexAfter' => $round['computed']['handicapIndexAfter'] ?? null,
    ];
}

function me_check_revision(array $body, int $current): void
{
    if (!array_key_exists('baseRevision', $body)) {
        return;
    }
    if (!is_int($body['baseRevision']) || $body['baseRevision'] !== $current) {
        hcp_json(['error' => 'CONFLICT', 'message' => 'Deine Daten wurden zwischenzeitlich auf einem anderen Gerät geändert.', 'revision' => $current], 409);
    }
}

function me_audit(array $user, string $action, array $data): void
{
    hcp_audit($action, $user, $data + ['userId' => $user['id']]);
}

switch ($action) {
    case 'round-save':
        $body = hcp_body(256 * 1024);
        $round = me_check_round($body['round'] ?? null);
        $draftId = $body['draftId'] ?? null;
        $res = hcp_with_member_doc($uid, function (array &$doc, int $revision) use ($body, &$round, $draftId) {
            me_check_revision($body, $revision);
            $old = null;
            $found = false;
            foreach ($doc['rounds'] as $i => $r) {
                if (($r['id'] ?? null) === $round['id']) {
                    if (($r['status'] ?? 'COMPLETED') === 'DELETED') {
                        hcp_fail('ROUND_NOT_FOUND');
                    }
                    $old = $r;
                    $round = me_round_extras($round, $r);
                    $round['createdAt'] = $r['createdAt'] ?? $round['createdAt'] ?? hcp_now();
                    $round['status'] = 'COMPLETED';
                    $doc['rounds'][$i] = $round;
                    $found = true;
                }
            }
            if (!$found && me_id_ok($round['clientRef'] ?? null)) {
                // Wiederholte Anfrage aus demselben Entwurf (z. B. nach Verbindungsabbruch): keine zweite Runde
                foreach ($doc['rounds'] as $r) {
                    if (($r['clientRef'] ?? null) === $round['clientRef'] && ($r['status'] ?? 'COMPLETED') !== 'DELETED') {
                        return ['duplicate' => $r['id']];
                    }
                }
            }
            if (!$found) {
                if (count($doc['rounds']) >= ME_MAX_ROUNDS) {
                    hcp_fail('VALIDATION', 'Maximale Anzahl an Runden erreicht.');
                }
                $round = me_round_extras($round, null);
                $round['status'] = 'COMPLETED';
                $doc['rounds'][] = $round;
            }
            me_store_summary($doc, $body);
            if (is_string($draftId) && $draftId !== '') {
                $doc['drafts'] = array_values(array_filter($doc['drafts'], function ($d) use ($draftId) {
                    return ($d['id'] ?? null) !== $draftId;
                }));
            }
            return $old;
        });
        $old = $res['result'];
        if (is_array($old) && isset($old['duplicate'])) {
            hcp_json(['ok' => true, 'duplicate' => true, 'roundId' => $old['duplicate'], 'revision' => $res['revision'], 'updatedAt' => $res['updatedAt']]);
        }
        me_audit($user, $old === null ? 'ROUND_CREATED' : 'ROUND_MODIFIED', [
            'entityType' => 'round', 'entityId' => $round['id'],
            'oldValue' => $old === null ? null : me_round_summary($old),
            'newValue' => me_round_summary($round),
        ]);
        hcp_cm_reindex($uid);
        hcp_json(['ok' => true, 'revision' => $res['revision'], 'updatedAt' => $res['updatedAt']]);
        break;

    case 'round-delete':
        $body = hcp_body(4000);
        $id = $body['id'] ?? null;
        if (!me_id_ok($id)) {
            hcp_fail('ROUND_NOT_FOUND');
        }
        $res = hcp_with_member_doc($uid, function (array &$doc, int $revision) use ($body, $id) {
            me_check_revision($body, $revision);
            foreach ($doc['rounds'] as $i => $r) {
                if (($r['id'] ?? null) === $id && ($r['status'] ?? 'COMPLETED') !== 'DELETED') {
                    $now = hcp_now();
                    $doc['rounds'][$i]['status'] = 'DELETED';
                    $doc['rounds'][$i]['deletedAt'] = $now;
                    $doc['rounds'][$i]['updatedAt'] = $now;
                    me_store_summary($doc, $body);
                    return $r;
                }
            }
            hcp_fail('ROUND_NOT_FOUND');
        });
        me_audit($user, 'ROUND_DELETED', ['entityType' => 'round', 'entityId' => $id, 'oldValue' => me_round_summary($res['result'])]);
        hcp_cm_reindex($uid);
        hcp_json(['ok' => true, 'revision' => $res['revision'], 'updatedAt' => $res['updatedAt']]);
        break;

    case 'rounds-import':
        $body = hcp_body(HCP_USER_DATA_MAX);
        $rounds = $body['rounds'] ?? null;
        if (!me_is_list($rounds) || count($rounds) === 0 || count($rounds) > 1000) {
            hcp_fail('VALIDATION', 'Keine gültigen Runden zum Import.');
        }
        $checked = [];
        foreach ($rounds as $i => $r) {
            $checked[] = me_check_round($r, 'rounds.' . $i);
        }
        $res = hcp_with_member_doc($uid, function (array &$doc, int $revision) use ($body, $checked) {
            me_check_revision($body, $revision);
            $ids = [];
            foreach ($doc['rounds'] as $r) {
                $ids[$r['id'] ?? ''] = true;
            }
            if (count($doc['rounds']) + count($checked) > ME_MAX_ROUNDS) {
                hcp_fail('VALIDATION', 'Maximale Anzahl an Runden erreicht.');
            }
            $added = 0;
            foreach ($checked as $r) {
                if (isset($ids[$r['id']])) {
                    continue;
                }
                $r = me_round_extras($r, null);
                $r['status'] = 'COMPLETED';
                $doc['rounds'][] = $r;
                $added++;
            }
            me_store_summary($doc, $body);
            return $added;
        });
        me_audit($user, 'ROUNDS_IMPORTED', ['entityType' => 'round', 'newValue' => ['count' => $res['result']]]);
        hcp_cm_reindex($uid);
        hcp_json(['ok' => true, 'imported' => $res['result'], 'revision' => $res['revision'], 'updatedAt' => $res['updatedAt']]);
        break;

    case 'profile-save':
        $body = hcp_body(8000);
        $p = $body['profile'] ?? null;
        if (!is_array($p)) {
            hcp_fail('VALIDATION', 'Ungültiges Profil');
        }
        $start = $p['startHandicapIndex'] ?? null;
        if ((!is_int($start) && !is_float($start)) || $start < -10 || $start > 54) {
            hcp_fail('VALIDATION', 'Handicap zwischen +10 und 54,0.', 0, ['startHandicapIndex' => 'Handicap zwischen +10 und 54,0.']);
        }
        $gender = in_array($p['gender'] ?? null, ['M', 'F'], true) ? $p['gender'] : 'M';
        $res = hcp_with_member_doc($uid, function (array &$doc, int $revision) use ($body, $p, $start, $gender, $uid) {
            me_check_revision($body, $revision);
            $old = $doc['profile'] ?? [];
            $date = function ($v) {
                return is_string($v) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $v) ? $v : null;
            };
            $doc['profile'] = array_merge($old, [
                'id' => $uid,
                'gender' => $gender,
                'startHandicapIndex' => round((float)$start, 1),
                'startDate' => $date($p['startDate'] ?? null),
                'brake265LiftedAt' => $date($p['brake265LiftedAt'] ?? null),
            ]);
            me_store_summary($doc, $body);
            return ['gender' => $old['gender'] ?? null, 'startHandicapIndex' => $old['startHandicapIndex'] ?? null];
        });
        me_audit($user, 'USER_PROFILE_UPDATED', ['entityType' => 'profile', 'entityId' => $uid, 'oldValue' => $res['result'], 'newValue' => ['gender' => $gender, 'startHandicapIndex' => round((float)$start, 1)]]);
        hcp_cm_reindex($uid);
        hcp_json(['ok' => true, 'revision' => $res['revision'], 'updatedAt' => $res['updatedAt']]);
        break;

    case 'prefs-save':
        $body = hcp_body(16000);
        $prefs = $body['preferences'] ?? null;
        if (!is_array($prefs)) {
            hcp_fail('VALIDATION', 'Ungültige Einstellungen');
        }
        $favorites = [];
        foreach ((me_is_list($prefs['favorites'] ?? null) ? $prefs['favorites'] : []) as $f) {
            if (me_id_ok($f) && !in_array($f, $favorites, true)) {
                $favorites[] = $f;
            }
        }
        $home = me_id_ok($prefs['homeCourseId'] ?? null) ? $prefs['homeCourseId'] : null;
        $onboarded = is_string($prefs['onboardedAt'] ?? null) ? substr($prefs['onboardedAt'], 0, 40) : null;
        $entryMode = in_array($prefs['roundEntryMode'] ?? null, ['ASK', 'QUICK', 'DETAILED'], true) ? $prefs['roundEntryMode'] : null;
        $unit = in_array($prefs['distanceUnit'] ?? null, ['M', 'YD'], true) ? $prefs['distanceUnit'] : null;
        $res = hcp_with_member_doc($uid, function (array &$doc) use ($favorites, $home, $onboarded, $entryMode, $unit, $body) {
            $before = $doc['preferences']['homeCourseId'] ?? null;
            $doc['preferences'] = [
                'favorites' => array_slice($favorites, 0, 100),
                'homeCourseId' => $home,
                'onboardedAt' => $onboarded ?? ($doc['preferences']['onboardedAt'] ?? null),
                'roundEntryMode' => $entryMode ?? ($doc['preferences']['roundEntryMode'] ?? 'ASK'),
                'distanceUnit' => $unit ?? ($doc['preferences']['distanceUnit'] ?? 'M'),
            ];
            me_store_summary($doc, $body);
            return $before !== $home;
        });
        if ($res['result'] || array_key_exists('summary', $body)) {
            hcp_cm_reindex($uid);
        }
        hcp_json(['ok' => true, 'revision' => $res['revision'], 'updatedAt' => $res['updatedAt']]);
        break;

    case 'draft-save':
        $body = hcp_body(64 * 1024);
        $draft = $body['draft'] ?? null;
        if (!is_array($draft) || !me_id_ok($draft['id'] ?? null) || !is_array($draft['input'] ?? null)) {
            hcp_fail('VALIDATION', 'Ungültiger Entwurf');
        }
        $item = [
            'id' => $draft['id'],
            'label' => mb_substr_safe(is_string($draft['label'] ?? null) && $draft['label'] !== '' ? $draft['label'] : 'Entwurf', 120),
            'updatedAt' => hcp_now(),
            'input' => $draft['input'],
        ];
        $res = hcp_with_member_doc($uid, function (array &$doc) use ($item) {
            $others = array_values(array_filter($doc['drafts'], function ($d) use ($item) {
                return ($d['id'] ?? null) !== $item['id'];
            }));
            $doc['drafts'] = array_slice(array_merge([$item], $others), 0, ME_MAX_DRAFTS);
        });
        hcp_json(['ok' => true, 'draft' => $item, 'revision' => $res['revision'], 'updatedAt' => $res['updatedAt']]);
        break;

    case 'draft-delete':
        $body = hcp_body(2000);
        $id = $body['id'] ?? null;
        $res = hcp_with_member_doc($uid, function (array &$doc) use ($id) {
            $doc['drafts'] = array_values(array_filter($doc['drafts'], function ($d) use ($id) {
                return ($d['id'] ?? null) !== $id;
            }));
        });
        hcp_json(['ok' => true, 'revision' => $res['revision'], 'updatedAt' => $res['updatedAt']]);
        break;

    case 'round-visibility':
        $body = hcp_body(8000);
        $id = $body['id'] ?? null;
        $visibility = $body['visibility'] ?? null;
        if (!me_id_ok($id) || !in_array($visibility, hcp_cm_visibilities(), true)) {
            hcp_fail('VALIDATION', 'Ungültige Sichtbarkeit.');
        }
        $res = hcp_with_member_doc($uid, function (array &$doc) use ($id, $visibility, $body) {
            foreach ($doc['rounds'] as $i => $r) {
                if (($r['id'] ?? null) === $id && ($r['status'] ?? 'COMPLETED') !== 'DELETED') {
                    $old = $r['visibility'] ?? 'PRIVATE';
                    $doc['rounds'][$i]['visibility'] = $visibility;
                    $doc['rounds'][$i]['updatedAt'] = hcp_now();
                    me_store_summary($doc, $body);
                    return $old;
                }
            }
            hcp_fail('ROUND_NOT_FOUND');
        });
        me_audit($user, 'ROUND_VISIBILITY_CHANGED', ['entityType' => 'round', 'entityId' => $id, 'oldValue' => ['visibility' => $res['result']], 'newValue' => ['visibility' => $visibility]]);
        hcp_cm_reindex($uid);
        hcp_json(['ok' => true, 'visibility' => $visibility, 'revision' => $res['revision'], 'updatedAt' => $res['updatedAt']]);
        break;

    case 'round-stats-save':
        $body = hcp_body(128 * 1024);
        $id = $body['id'] ?? null;
        if (!me_id_ok($id)) {
            hcp_fail('ROUND_NOT_FOUND');
        }
        $holeStats = me_clean_hole_stats($body['holeStats'] ?? null);
        $stats = hcp_cm_clean_stats($body['stats'] ?? null);
        $res = hcp_with_member_doc($uid, function (array &$doc, int $revision) use ($id, $holeStats, $stats, $body) {
            me_check_revision($body, $revision);
            foreach ($doc['rounds'] as $i => $r) {
                if (($r['id'] ?? null) === $id && ($r['status'] ?? 'COMPLETED') !== 'DELETED') {
                    // nur Lochstatistik und Statistik – WHS-Daten (GBE, Rating, Ergebnis) bleiben unverändert
                    if ($holeStats === null) {
                        unset($doc['rounds'][$i]['holeStats']);
                    } else {
                        $doc['rounds'][$i]['holeStats'] = $holeStats;
                    }
                    if (isset($doc['rounds'][$i]['computed']) && is_array($doc['rounds'][$i]['computed'])) {
                        $doc['rounds'][$i]['computed']['stats'] = $holeStats === null ? null : $stats;
                    }
                    $doc['rounds'][$i]['updatedAt'] = hcp_now();
                    me_store_summary($doc, $body);
                    return $holeStats === null ? 0 : count($holeStats);
                }
            }
            hcp_fail('ROUND_NOT_FOUND');
        });
        me_audit($user, 'ROUND_STATS_UPDATED', ['entityType' => 'round', 'entityId' => $id, 'newValue' => ['holes' => $res['result']]]);
        hcp_cm_reindex($uid);
        hcp_json(['ok' => true, 'revision' => $res['revision'], 'updatedAt' => $res['updatedAt']]);
        break;

    case 'community-save':
        $body = hcp_body(8000);
        $input = $body['settings'] ?? null;
        if (!is_array($input)) {
            hcp_fail('VALIDATION', 'Ungültige Einstellungen');
        }
        $res = hcp_with_member_doc($uid, function (array &$doc) use ($input, $body) {
            $current = hcp_cm_settings($doc);
            $next = hcp_cm_apply_input($current, $input);
            if ($next['publicId'] === null) {
                $next['publicId'] = bin2hex(random_bytes(8)) . '-' . bin2hex(random_bytes(8));
            }
            $doc['community'] = $next;
            me_store_summary($doc, $body);
            $pick = function (array $s) {
                return array_intersect_key($s, array_flip(['displayName', 'rankingVisible', 'profileVisible', 'roundsVisible', 'statsVisible', 'notesVisible']));
            };
            return ['old' => $pick($current), 'new' => $pick($next)];
        });
        me_audit($user, 'COMMUNITY_SETTINGS_CHANGED', ['entityType' => 'community', 'entityId' => $uid, 'oldValue' => $res['result']['old'], 'newValue' => $res['result']['new']]);
        hcp_cm_reindex($uid);
        hcp_json(['ok' => true, 'revision' => $res['revision'], 'updatedAt' => $res['updatedAt']]);
        break;

    case 'avatar-save':
    case 'avatar-delete':
        $img = $action === 'avatar-save' ? hcp_cm_check_image(hcp_body(256 * 1024)['dataUrl'] ?? null) : null;
        $res = hcp_with_member_doc($uid, function (array &$doc) use ($img, $uid) {
            $s = hcp_cm_settings($doc);
            if ($img === null) {
                @unlink(hcp_cm_avatar_file($uid));
                $s['avatarVersion'] = null;
            } else {
                $version = (int)($s['avatarVersion'] ?? 0) + 1;
                hcp_write_json_file(hcp_cm_avatar_file($uid), ['mime' => $img['mime'], 'data' => $img['data'], 'version' => $version]);
                $s['avatarVersion'] = $version;
            }
            $doc['community'] = $s;
        });
        hcp_cm_reindex($uid);
        hcp_json(['ok' => true, 'revision' => $res['revision'], 'updatedAt' => $res['updatedAt']]);
        break;

    default:
        hcp_fail('NOT_FOUND', 'Unbekannte Aktion');
}
