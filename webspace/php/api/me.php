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
        $res = hcp_with_member_doc($uid, function (array &$doc, int $revision) use ($body, $round, $draftId) {
            me_check_revision($body, $revision);
            $old = null;
            $found = false;
            foreach ($doc['rounds'] as $i => $r) {
                if (($r['id'] ?? null) === $round['id']) {
                    if (($r['status'] ?? 'COMPLETED') === 'DELETED') {
                        hcp_fail('ROUND_NOT_FOUND');
                    }
                    $old = $r;
                    $round['createdAt'] = $r['createdAt'] ?? $round['createdAt'] ?? hcp_now();
                    $round['status'] = 'COMPLETED';
                    $doc['rounds'][$i] = $round;
                    $found = true;
                }
            }
            if (!$found) {
                if (count($doc['rounds']) >= ME_MAX_ROUNDS) {
                    hcp_fail('VALIDATION', 'Maximale Anzahl an Runden erreicht.');
                }
                $round['status'] = 'COMPLETED';
                $doc['rounds'][] = $round;
            }
            if (is_string($draftId) && $draftId !== '') {
                $doc['drafts'] = array_values(array_filter($doc['drafts'], function ($d) use ($draftId) {
                    return ($d['id'] ?? null) !== $draftId;
                }));
            }
            return $old;
        });
        $old = $res['result'];
        me_audit($user, $old === null ? 'ROUND_CREATED' : 'ROUND_MODIFIED', [
            'entityType' => 'round', 'entityId' => $round['id'],
            'oldValue' => $old === null ? null : me_round_summary($old),
            'newValue' => me_round_summary($round),
        ]);
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
                    return $r;
                }
            }
            hcp_fail('ROUND_NOT_FOUND');
        });
        me_audit($user, 'ROUND_DELETED', ['entityType' => 'round', 'entityId' => $id, 'oldValue' => me_round_summary($res['result'])]);
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
                $r['status'] = 'COMPLETED';
                $doc['rounds'][] = $r;
                $added++;
            }
            return $added;
        });
        me_audit($user, 'ROUNDS_IMPORTED', ['entityType' => 'round', 'newValue' => ['count' => $res['result']]]);
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
            return ['gender' => $old['gender'] ?? null, 'startHandicapIndex' => $old['startHandicapIndex'] ?? null];
        });
        me_audit($user, 'USER_PROFILE_UPDATED', ['entityType' => 'profile', 'entityId' => $uid, 'oldValue' => $res['result'], 'newValue' => ['gender' => $gender, 'startHandicapIndex' => round((float)$start, 1)]]);
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
        $res = hcp_with_member_doc($uid, function (array &$doc) use ($favorites, $home, $onboarded) {
            $doc['preferences'] = [
                'favorites' => array_slice($favorites, 0, 100),
                'homeCourseId' => $home,
                'onboardedAt' => $onboarded ?? ($doc['preferences']['onboardedAt'] ?? null),
            ];
        });
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

    default:
        hcp_fail('NOT_FOUND', 'Unbekannte Aktion');
}
