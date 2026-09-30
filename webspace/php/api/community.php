<?php
/**
 * Golf HCP Rechner – Community (Webspace-Edition): nur für angemeldete Mitglieder, nur freigegebene Daten.
 * Grundlage ist ausschließlich die Projektion aus _community.php – private Runden, E-Mail-Adressen oder
 * interne Benutzer-IDs werden nie ausgeliefert.
 *
 *   ranking        GET  { scope=ALL|HOME|REGION, page }
 *   members        GET  { q, sort=HCP|NAME|ACTIVITY, page }
 *   member         GET  { id }                  öffentliches Profil
 *   member-rounds  GET  { id, page }            öffentliche Runden eines Mitglieds
 *   activity       GET  { page }                neueste öffentliche Runden
 *   round          GET  { member, round }       öffentliche Runde (Basis oder Details)
 *   avatar         GET  { id }                  Profilbild
 *   my             GET                          eigene Community-Einstellungen
 *   my-ranking     GET                          eigene Position und Verlauf
 */
declare(strict_types=1);
require __DIR__ . '/_lib.php';

$config = hcp_require_installed();
$user = hcp_require_user($config, false);
$action = (string)($_GET['action'] ?? '');
$flags = hcp_cm_flags();
header('Cache-Control: private, no-store');

function cm_page(): int
{
    return max(1, min(10000, (int)($_GET['page'] ?? 1)));
}

function cm_param(string $key, int $max = 64): string
{
    return mb_substr_safe(trim((string)($_GET[$key] ?? '')), $max);
}

/** Sichtbares Profil (oder das eigene) – sonst MEMBER_NOT_FOUND. */
function cm_visible_profile(string $publicId, array $user, array $status): array
{
    $p = $publicId !== '' ? hcp_cm_profile_by_public($publicId) : null;
    $isMe = $p !== null && $p['userId'] === $user['id'];
    if ($p === null || ($status[$p['userId']] ?? '') !== 'ACTIVE' || (empty($p['profileVisible']) && !$isMe)) {
        hcp_fail('MEMBER_NOT_FOUND', 'Dieses Mitglied gibt es nicht oder es teilt sein Profil nicht.', 404);
    }
    return [$p, $isMe];
}

/** Eigenes Community-Profil (bei Bedarf erst anlegen). */
function cm_my_profile(array $user): ?array
{
    $profiles = hcp_cm_profiles();
    if (!isset($profiles[$user['id']])) {
        hcp_cm_reindex($user['id']);
        $profiles = hcp_cm_profiles();
    }
    return $profiles[$user['id']] ?? null;
}

function cm_my_ranking(array $user, ?array $me, array $ranked, string $scope, array $prev): ?array
{
    if ($me === null || !isset($me['handicapIndex'])) {
        return null;
    }
    $participating = !empty($me['rankingVisible']) && $user['status'] === 'ACTIVE';
    if (!$participating && !HCP_CM_HIDDEN_SEES_POSITION) {
        return ['participating' => false, 'position' => null, 'handicapIndex' => $me['handicapIndex'], 'trend' => null, 'trendSince' => null, 'total' => count($ranked)];
    }
    $others = array_values(array_filter($ranked, function ($p) use ($user) {
        return $p['userId'] !== $user['id'];
    }));
    $position = hcp_cm_position_for($me['handicapIndex'], $others);
    $prevPos = $scope === 'ALL' && $participating ? ($prev['positions'][$user['id']] ?? null) : null;
    return [
        'participating' => $participating,
        'position' => $position,
        'handicapIndex' => $me['handicapIndex'],
        'trend' => $prevPos !== null ? $prevPos - $position : null,
        'trendSince' => $prevPos !== null ? $prev['date'] : null,
        'total' => count($ranked),
    ];
}

function cm_region_label(?string $key): ?string
{
    $labels = ['OBERBAYERN' => 'Oberbayern', 'MUENCHEN' => 'München', 'NIEDERBAYERN' => 'Niederbayern', 'OBERPFALZ' => 'Oberpfalz', 'OBERFRANKEN' => 'Oberfranken', 'MITTELFRANKEN' => 'Mittelfranken', 'UNTERFRANKEN' => 'Unterfranken', 'SCHWABEN' => 'Schwaben'];
    return $key === null ? null : ($labels[$key] ?? $key);
}

switch ($action) {
    case 'ranking':
        hcp_cm_require_flags($flags, ['rankingEnabled']);
        $status = hcp_cm_status_map();
        $profiles = hcp_cm_profiles();
        $me = cm_my_profile($user);
        $profiles = hcp_cm_profiles();
        $rankedAll = hcp_cm_ranked($profiles, $status);
        hcp_cm_snapshot_ensure($rankedAll);
        $scopes = [['scope' => 'ALL', 'label' => 'Gesamt']];
        if (!empty($me['homeCourseId'])) {
            $scopes[] = ['scope' => 'HOME', 'label' => $me['homeCourseName'] ?? 'Mein Heimatclub'];
        }
        if (!empty($me['region'])) {
            $scopes[] = ['scope' => 'REGION', 'label' => cm_region_label($me['region'])];
        }
        $requested = (string)($_GET['scope'] ?? 'ALL');
        $scope = 'ALL';
        $label = null;
        $ranked = $rankedAll;
        if ($requested === 'HOME' && !empty($me['homeCourseId'])) {
            $scope = 'HOME';
            $label = $me['homeCourseName'] ?? null;
            $ranked = hcp_cm_ranked($profiles, $status, function ($p) use ($me) {
                return ($p['homeCourseId'] ?? null) === $me['homeCourseId'];
            });
        } elseif ($requested === 'REGION' && !empty($me['region'])) {
            $scope = 'REGION';
            $label = cm_region_label($me['region']);
            $ranked = hcp_cm_ranked($profiles, $status, function ($p) use ($me) {
                return ($p['region'] ?? null) === $me['region'];
            });
        }
        $prev = hcp_cm_previous_snapshot();
        $entry = function (array $p) use ($user, $scope, $prev) {
            $prevPos = $scope === 'ALL' ? ($prev['positions'][$p['userId']] ?? null) : null;
            return hcp_cm_ref($p) + [
                'position' => $p['position'],
                'handicapIndex' => $p['handicapIndex'],
                'homeCourseName' => $p['homeCourseName'] ?? null,
                'roundsCount' => (int)($p['roundsCount'] ?? 0),
                'trend' => $prevPos !== null ? $prevPos - $p['position'] : null,
                'isMe' => $p['userId'] === $user['id'],
            ];
        };
        $page = cm_page();
        $size = HCP_CM_PAGE_RANKING;
        hcp_json([
            'scope' => $scope,
            'scopeLabel' => $label,
            'page' => $page,
            'pageSize' => $size,
            'total' => count($ranked),
            'items' => array_map($entry, array_slice($ranked, ($page - 1) * $size, $size)),
            'top' => array_map($entry, array_slice($ranked, 0, 3)),
            'me' => cm_my_ranking($user, $me, $ranked, $scope, $prev),
            'scopes' => $scopes,
            'previousSnapshotDate' => $prev['date'],
        ]);
        break;

    case 'members':
        hcp_cm_require_flags($flags);
        $status = hcp_cm_status_map();
        $q = mb_strtolower(cm_param('q', 60));
        $list = [];
        foreach (hcp_cm_profiles() as $p) {
            if (empty($p['profileVisible']) || ($status[$p['userId']] ?? '') !== 'ACTIVE') {
                continue;
            }
            if ($q !== '' && mb_strpos(mb_strtolower((string)$p['displayName']), $q) === false) {
                continue;
            }
            $list[] = $p;
        }
        $sort = (string)($_GET['sort'] ?? 'HCP');
        usort($list, function ($a, $b) use ($sort) {
            if ($sort === 'NAME') {
                return strnatcasecmp((string)$a['displayName'], (string)$b['displayName']);
            }
            if ($sort === 'ACTIVITY') {
                $x = strcmp((string)($b['lastActivityAt'] ?? ''), (string)($a['lastActivityAt'] ?? ''));
                return $x !== 0 ? $x : strnatcasecmp((string)$a['displayName'], (string)$b['displayName']);
            }
            $ha = $a['handicapIndex'] ?? null;
            $hb = $b['handicapIndex'] ?? null;
            if ($ha === null || $hb === null) {
                return $ha === $hb ? strnatcasecmp((string)$a['displayName'], (string)$b['displayName']) : ($ha === null ? 1 : -1);
            }
            $d = hcp_cm_tenths($ha) - hcp_cm_tenths($hb);
            return $d !== 0 ? $d : strnatcasecmp((string)$a['displayName'], (string)$b['displayName']);
        });
        $page = cm_page();
        $size = HCP_CM_PAGE_MEMBERS;
        $items = [];
        foreach (array_slice($list, ($page - 1) * $size, $size) as $p) {
            $items[] = hcp_cm_ref($p) + [
                'handicapIndex' => $p['handicapIndex'] ?? null,
                'homeCourseName' => $p['homeCourseName'] ?? null,
                'roundsCount' => (int)($p['roundsCount'] ?? 0),
                'lastActivityAt' => $p['lastActivityAt'] ?? null,
                'isMe' => $p['userId'] === $user['id'],
            ];
        }
        hcp_json(['items' => $items, 'total' => count($list), 'page' => $page, 'pageSize' => $size]);
        break;

    case 'member':
        hcp_cm_require_flags($flags);
        $status = hcp_cm_status_map();
        [$p, $isMe] = cm_visible_profile(cm_param('id'), $user, $status);
        $position = null;
        if (!empty($p['rankingVisible']) && !empty($flags['rankingEnabled']) && isset($p['handicapIndex'])) {
            $others = array_values(array_filter(hcp_cm_ranked(hcp_cm_profiles(), $status), function ($x) use ($p) {
                return $x['userId'] !== $p['userId'];
            }));
            $position = hcp_cm_position_for($p['handicapIndex'], $others);
        }
        hcp_json(hcp_cm_ref($p) + [
            'handicapIndex' => $p['handicapIndex'] ?? null,
            'homeCourseName' => $p['homeCourseName'] ?? null,
            'roundsCount' => (int)($p['roundsCount'] ?? 0),
            'publicRoundsCount' => !empty($flags['publicRoundsEnabled']) ? (int)($p['publicRoundsCount'] ?? 0) : 0,
            'rankingPosition' => $position,
            'performance' => !empty($p['statsVisible']) && !empty($flags['statsSharingEnabled']) ? ($p['performance'] ?? null) : null,
            'isMe' => $isMe,
        ]);
        break;

    case 'member-rounds':
        hcp_cm_require_flags($flags);
        [$p] = cm_visible_profile(cm_param('id'), $user, hcp_cm_status_map());
        $size = HCP_CM_PAGE_FEED;
        if (empty($flags['publicRoundsEnabled'])) {
            hcp_json(['items' => [], 'total' => 0, 'page' => 1, 'pageSize' => $size]);
        }
        $rounds = hcp_cm_user_rounds($p['userId']);
        usort($rounds, function ($a, $b) {
            $d = strcmp((string)$b['date'], (string)$a['date']);
            return $d !== 0 ? $d : strcmp((string)$b['createdAt'], (string)$a['createdAt']);
        });
        $page = cm_page();
        $ref = hcp_cm_ref($p);
        $items = [];
        foreach (array_slice($rounds, ($page - 1) * $size, $size) as $r) {
            $s = hcp_cm_round_summary($r, $ref, $flags);
            if ($s !== null) {
                $items[] = $s;
            }
        }
        hcp_json(['items' => $items, 'total' => count($rounds), 'page' => $page, 'pageSize' => $size]);
        break;

    case 'activity':
        hcp_cm_require_flags($flags, ['activityFeedEnabled', 'publicRoundsEnabled']);
        $status = hcp_cm_status_map();
        $profiles = hcp_cm_profiles();
        $visible = [];
        foreach (hcp_cm_feed() as $i) {
            $p = $profiles[$i['userId']] ?? null;
            if ($p !== null && !empty($p['profileVisible']) && ($status[$p['userId']] ?? '') === 'ACTIVE') {
                $visible[] = $i;
            }
        }
        $page = cm_page();
        $size = HCP_CM_PAGE_FEED;
        $cache = [];
        $items = [];
        foreach (array_slice($visible, ($page - 1) * $size, $size) as $i) {
            $uid = $i['userId'];
            if (!isset($cache[$uid])) {
                $cache[$uid] = [];
                foreach (hcp_cm_user_rounds($uid) as $r) {
                    $cache[$uid][$r['roundId']] = $r;
                }
            }
            $rec = $cache[$uid][$i['roundId']] ?? null;
            $s = $rec !== null ? hcp_cm_round_summary($rec, hcp_cm_ref($profiles[$uid]), $flags) : null;
            if ($s !== null) {
                $items[] = ['type' => 'ROUND', 'round' => $s];
            }
        }
        hcp_json(['items' => $items, 'total' => count($visible), 'page' => $page, 'pageSize' => $size]);
        break;

    case 'round':
        hcp_cm_require_flags($flags, ['publicRoundsEnabled']);
        [$p, $isMe] = cm_visible_profile(cm_param('member'), $user, hcp_cm_status_map());
        $roundId = cm_param('round');
        $view = null;
        foreach (hcp_cm_user_rounds($p['userId']) as $r) {
            if (($r['roundId'] ?? null) === $roundId) {
                $view = hcp_cm_round_view($r, hcp_cm_ref($p), $flags, $isMe);
            }
        }
        if ($view === null) {
            hcp_fail('ROUND_NOT_FOUND');
        }
        hcp_json($view);
        break;

    case 'avatar':
        $p = hcp_cm_profile_by_public(cm_param('id'));
        $status = hcp_cm_status_map();
        $allowed = $p !== null && ($p['userId'] === $user['id'] || (($status[$p['userId']] ?? '') === 'ACTIVE' && (!empty($p['profileVisible']) || !empty($p['rankingVisible']))));
        $img = $allowed ? hcp_read_json_file(hcp_cm_avatar_file($p['userId'])) : null;
        if (!is_array($img) || !is_string($img['data'] ?? null)) {
            http_response_code(404);
            exit;
        }
        header('Content-Type: ' . (in_array($img['mime'] ?? '', ['image/jpeg', 'image/png', 'image/webp'], true) ? $img['mime'] : 'application/octet-stream'));
        header('Cache-Control: private, max-age=86400');
        header('X-Content-Type-Options: nosniff');
        echo base64_decode($img['data']);
        exit;

    case 'my':
        $doc = hcp_load_member_doc($user['id'])['data'] ?? hcp_default_member_doc($user['id']);
        if (hcp_cm_settings($doc)['publicId'] === null) {
            hcp_cm_reindex($user['id']);
            $doc = hcp_load_member_doc($user['id'])['data'];
        }
        $s = hcp_cm_normalize(hcp_cm_settings($doc));
        hcp_json([
            'settings' => $s,
            'effectiveDisplayName' => hcp_cm_display_name($s, $user),
            'avatarUrl' => $s['avatarVersion'] ? hcp_cm_avatar_url((string)$s['publicId'], (int)$s['avatarVersion']) : null,
            'flags' => $flags,
        ]);
        break;

    case 'my-ranking':
        $ranking = null;
        if (!empty($flags['communityEnabled']) && !empty($flags['rankingEnabled'])) {
            $status = hcp_cm_status_map();
            $me = cm_my_profile($user);
            $rankedAll = hcp_cm_ranked(hcp_cm_profiles(), $status);
            hcp_cm_snapshot_ensure($rankedAll);
            $ranking = cm_my_ranking($user, $me, $rankedAll, 'ALL', hcp_cm_previous_snapshot());
        }
        hcp_json(['ranking' => $ranking, 'history' => hcp_cm_history($user['id'])]);
        break;

    default:
        hcp_fail('NOT_FOUND', 'Unbekannte Aktion');
}
