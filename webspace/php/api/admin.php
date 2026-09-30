<?php
/**
 * Golf HCP Rechner – Admin-Backend der Webspace-Edition.
 *
 * Jede Aktion: POST ?action=… mit Header X-CSRF-Token; Berechtigung wird serverseitig aus der Rolle
 * der Sitzung geprüft (siehe hcp_role_permissions, identisch zu src/lib/auth/permissions.ts).
 *
 *   stats                    admin.access    Kennzahlen, letzte Aktionen
 *   users                    users.read      { q, role, status, verified, sort, page, pageSize }
 *   user                     users.read      { id } → Konto + Mitglieder-Dokument (Audit: USER_DATA_VIEWED)
 *   impersonate              users.impersonate { id } → Lesende Benutzeransicht (Audit: IMPERSONATION_VIEW)
 *   user-create              users.write     { firstName, lastName, email, role, password? } (ohne Passwort: Einladung per E-Mail)
 *   user-update              users.write     { id, firstName?, lastName?, email?, role?, status?, emailVerified? }
 *   user-password            users.write     { id, mode: "mail"|"temporary", password? }
 *   user-delete              users.delete    { id, confirm }
 *   rounds                   rounds.read     { q, userId, status, from, to, page, pageSize }
 *   round                    rounds.read     { userId, roundId }
 *   logs                     logs.read       { action, actorId, userId, q, from, to, page, pageSize }
 *   system                   system.read     Systemprüfung, Fehler, Mail-Protokoll
 *   settings                 settings.write  Einstellungen lesen
 *   settings-save            settings.write  Einstellungen speichern
 *   mail-test                settings.write  { to }
 *   search                   admin.access    { q } → Benutzer, Runden (Golfplätze sucht der Browser im Datensatz)
 *   courses-load             courses.read    Golfplatz-Datensatz inkl. Änderungsprotokoll
 *   courses-save             courses.write   { baseRevision, dataset } → 409 bei zwischenzeitlicher Änderung
 *   community                community.read  Übersicht, Summen der Spielleistung (Quoten berechnet der Browser)
 *   community-ranking        community.read  { filter, q, page, pageSize } Ranking inkl. Nicht-Teilnehmern
 *   community-rounds         community.read  { filter, q, page, pageSize } geteilte und verborgene Runden
 *   community-moderate       community.moderate { userId, roundId, action: HIDE|UNHIDE|MAKE_PRIVATE|REMOVE_NOTES, reason }
 *   community-refresh        community.moderate Community-Daten neu aufbauen, heutigen Ranking-Stand ersetzen
 *   user-community           community.moderate { id, rankingVisible?: false, profileVisible?: false } (nur abschalten)
 */
declare(strict_types=1);
require __DIR__ . '/_lib.php';

hcp_require_post();
$action = (string)($_GET['action'] ?? '');
$config = hcp_require_installed();

$permissions = [
    'stats' => 'admin.access', 'users' => 'users.read', 'user' => 'users.read', 'impersonate' => 'users.impersonate',
    'user-create' => 'users.write', 'user-update' => 'users.write', 'user-password' => 'users.write', 'user-delete' => 'users.delete',
    'rounds' => 'rounds.read', 'round' => 'rounds.read', 'logs' => 'logs.read', 'system' => 'system.read',
    'settings' => 'settings.write', 'settings-save' => 'settings.write', 'mail-test' => 'settings.write',
    'search' => 'admin.access', 'courses-load' => 'courses.read', 'courses-save' => 'courses.write',
    'community' => 'community.read', 'community-ranking' => 'community.read', 'community-rounds' => 'community.read',
    'community-moderate' => 'community.moderate', 'community-refresh' => 'community.moderate', 'user-community' => 'community.moderate',
];
if (!isset($permissions[$action])) {
    hcp_fail('NOT_FOUND', 'Unbekannte Aktion');
}
$actor = hcp_require_permission($config, $permissions[$action]);

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

function adm_user_row(array $u, ?int $rounds = null): array
{
    return [
        'id' => $u['id'],
        'email' => $u['email'],
        'username' => $u['username'],
        'firstName' => $u['firstName'],
        'lastName' => $u['lastName'],
        'role' => $u['role'],
        'status' => $u['status'],
        'emailVerified' => (bool)$u['emailVerified'],
        'createdAt' => (string)($u['createdAt'] ?? ''),
        'lastLoginAt' => $u['lastLoginAt'],
        'lastActivityAt' => $u['lastActivityAt'],
        'rounds' => $rounds ?? hcp_member_round_count($u['id']),
    ];
}

function adm_name(array $u): string
{
    return trim($u['firstName'] . ' ' . $u['lastName']);
}

function adm_page(array $body): array
{
    $page = max(1, (int)($body['page'] ?? 1));
    $size = min(200, max(5, (int)($body['pageSize'] ?? 25)));
    return [$page, $size];
}

function adm_paginate(array $items, array $body): array
{
    list($page, $size) = adm_page($body);
    return ['items' => array_values(array_slice($items, ($page - 1) * $size, $size)), 'total' => count($items), 'page' => $page, 'pageSize' => $size];
}

function adm_contains(string $haystack, string $needle): bool
{
    if ($needle === '') {
        return true;
    }
    $lower = function (string $s) {
        return function_exists('mb_strtolower') ? mb_strtolower($s, 'UTF-8') : strtolower($s);
    };
    return strpos($lower($haystack), $lower($needle)) !== false;
}

function adm_target(string $id): array
{
    $u = hcp_find_user('id', $id);
    if ($u === null) {
        hcp_fail('NOT_FOUND', 'Benutzer nicht gefunden');
    }
    return $u;
}

/** Entspricht canManageUser (src/lib/auth/permissions.ts). */
function adm_can_manage(array $actor, array $target): bool
{
    if (!hcp_can($actor, 'users.write') || $actor['id'] === $target['id']) {
        return false;
    }
    if ($actor['role'] === 'SUPER_ADMIN') {
        return true;
    }
    return hcp_role_rank($target['role']) < hcp_role_rank($actor['role']);
}

/** Entspricht canAssignRole. */
function adm_can_assign(array $actor, array $target, string $next): bool
{
    if (!hcp_can($actor, 'users.roles') || $actor['id'] === $target['id']) {
        return false;
    }
    return hcp_role_rank($next) <= hcp_role_rank($actor['role']);
}

function adm_all_docs(): array
{
    $out = [];
    foreach (hcp_load_users() as $u) {
        $doc = hcp_load_member_doc($u['id']);
        $out[] = ['user' => $u, 'doc' => $doc];
    }
    return $out;
}

function adm_round_row(array $u, array $r, string $updatedFallback = ''): array
{
    return [
        'userId' => $u['id'],
        'userName' => adm_name($u),
        'roundId' => (string)($r['id'] ?? ''),
        'date' => (string)($r['date'] ?? ''),
        'courseName' => (string)($r['course']['courseName'] ?? ''),
        'holes' => (int)($r['holes'] ?? 18),
        'status' => ($r['status'] ?? 'COMPLETED') === 'DELETED' ? 'DELETED' : 'COMPLETED',
        'scoreDifferential' => $r['computed']['scoreDifferential'] ?? null,
        'adjustedGrossScore' => $r['computed']['adjustedGrossScore'] ?? null,
        'handicapIndexAfter' => $r['computed']['handicapIndexAfter'] ?? null,
        'engine' => $r['computed']['engine'] ?? null,
        'updatedAt' => (string)($r['updatedAt'] ?? $updatedFallback),
    ];
}

function adm_audit_view(array $e): array
{
    return [
        'id' => (string)($e['id'] ?? ''),
        'timestamp' => (string)($e['timestamp'] ?? ''),
        'action' => (string)($e['action'] ?? ''),
        'actorId' => $e['actorId'] ?? null,
        'actorName' => $e['actorName'] ?? null,
        'userId' => $e['userId'] ?? null,
        'entityType' => $e['entityType'] ?? null,
        'entityId' => $e['entityId'] ?? null,
        'oldValue' => $e['oldValue'] ?? null,
        'newValue' => $e['newValue'] ?? null,
    ];
}

function adm_active_super_admins(array $users): int
{
    $n = 0;
    foreach ($users as $u) {
        if ($u['role'] === 'SUPER_ADMIN' && $u['status'] === 'ACTIVE') {
            $n++;
        }
    }
    return $n;
}

/** Kennzahlen des Golfplatz-Datensatzes. */
function adm_dataset_stats(): array
{
    $ds = hcp_dataset();
    $courses = 0;
    $ratings = 0;
    $verified = 0;
    foreach (($ds['courses'] ?? []) as $c) {
        if (isset($c['active']) && !$c['active']) {
            continue;
        }
        $courses++;
        foreach (($c['layouts'] ?? []) as $l) {
            foreach (($l['ratingSets'] ?? []) as $rs) {
                if (isset($rs['active']) && !$rs['active']) {
                    continue;
                }
                $ratings++;
                if (!empty($rs['verified'])) {
                    $verified++;
                }
            }
        }
    }
    return ['courses' => $courses, 'ratings' => $ratings, 'verified' => $verified, 'updatedAt' => $ds['updatedAt'] ?? null];
}

const ADM_ADMIN_ACTIONS = ['USER_CREATED', 'USER_ROLE_CHANGED', 'USER_STATUS_CHANGED', 'USER_DISABLED', 'USER_LOCKED', 'USER_ENABLED', 'USER_VERIFIED_BY_ADMIN', 'USER_DELETED', 'USER_DATA_VIEWED', 'IMPERSONATION_VIEW', 'COURSE_CREATED', 'COURSE_UPDATED', 'COURSE_MERGED', 'LAYOUT_UPDATED', 'RATING_CREATED', 'RATING_UPDATED', 'RATING_VERIFIED', 'RATING_UNVERIFIED', 'RATING_DEACTIVATED', 'HOLES_UPDATED', 'GREENS_UPDATED', 'IMPORT_APPLIED', 'SETTINGS_CHANGED', 'RULE_VERSION_CHANGED'];
const ADM_MEMBER_ACTIVITY = ['USER_REGISTERED', 'USER_EMAIL_VERIFIED', 'ROUND_CREATED', 'ROUND_MODIFIED', 'ROUND_DELETED', 'ROUNDS_IMPORTED'];

function adm_course_audit_action(string $entityType, string $action): string
{
    if ($entityType === 'course') {
        return $action === 'CREATE' ? 'COURSE_CREATED' : ($action === 'MERGE' ? 'COURSE_MERGED' : 'COURSE_UPDATED');
    }
    if ($entityType === 'layout') {
        return $action === 'REPLACE_HOLES' ? 'HOLES_UPDATED' : ($action === 'SET_GREENS' ? 'GREENS_UPDATED' : 'LAYOUT_UPDATED');
    }
    $map = ['CREATE' => 'RATING_CREATED', 'VERIFY' => 'RATING_VERIFIED', 'UNVERIFY' => 'RATING_UNVERIFIED', 'DEACTIVATE' => 'RATING_DEACTIVATED'];
    return $map[$action] ?? 'RATING_UPDATED';
}

function adm_mail_view(array $config): array
{
    $m = is_array($config['mail'] ?? null) ? $config['mail'] : [];
    return [
        'mode' => hcp_mail_mode($config),
        'host' => (string)($m['host'] ?? ''),
        'port' => (int)($m['port'] ?? 587),
        'secure' => (string)($m['secure'] ?? 'tls'),
        'user' => (string)($m['user'] ?? ''),
        'hasPassword' => !empty($m['pass']),
    ];
}

// ---------------------------------------------------------------------------
// Aktionen
// ---------------------------------------------------------------------------

$body = hcp_body($action === 'courses-save' ? HCP_MAX_BODY : 64 * 1024);

switch ($action) {
    case 'stats':
        $users = hcp_load_users();
        $rounds = 0;
        foreach ($users as $u) {
            $rounds += hcp_member_round_count($u['id']);
        }
        $ds = adm_dataset_stats();
        $recentActions = array_map('adm_audit_view', hcp_audit_entries(8, function ($e) {
            return in_array($e['action'] ?? '', ADM_ADMIN_ACTIONS, true);
        }));
        $recentActivity = array_map('adm_audit_view', hcp_audit_entries(8, function ($e) {
            return in_array($e['action'] ?? '', ADM_MEMBER_ACTIVITY, true);
        }));
        hcp_json([
            'users' => count($users),
            'activeUsers' => count(array_filter($users, function ($u) {
                return $u['status'] === 'ACTIVE' && !empty($u['lastActivityAt']) && strtotime((string)$u['lastActivityAt']) > time() - 30 * 86400;
            })),
            'unverifiedUsers' => count(array_filter($users, function ($u) {
                return !$u['emailVerified'];
            })),
            'admins' => count(array_filter($users, function ($u) {
                return $u['role'] !== 'USER';
            })),
            'rounds' => $rounds,
            'courses' => $ds['courses'],
            'ratings' => $ds['ratings'],
            'verifiedRatings' => $ds['verified'],
            'dataQualityPercent' => $ds['ratings'] > 0 ? (int)round($ds['verified'] * 100 / $ds['ratings']) : 0,
            'lastCourseUpdate' => $ds['updatedAt'],
            'recentActions' => $recentActions,
            'recentActivity' => $recentActivity,
        ]);
        break;

    case 'users':
        $q = hcp_str($body, 'q', 100);
        $role = hcp_str($body, 'role', 20);
        $status = hcp_str($body, 'status', 20);
        $verified = hcp_str($body, 'verified', 10);
        $sort = hcp_str($body, 'sort', 30) ?: 'name';
        $list = array_values(array_filter(hcp_load_users(), function ($u) use ($q, $role, $status, $verified) {
            if ($role !== '' && $u['role'] !== $role) {
                return false;
            }
            if ($status !== '' && $u['status'] !== $status) {
                return false;
            }
            if ($verified === 'yes' && !$u['emailVerified'] || $verified === 'no' && $u['emailVerified']) {
                return false;
            }
            return adm_contains(adm_name($u) . ' ' . $u['email'] . ' ' . $u['username'] . ' ' . $u['id'], $q);
        }));
        usort($list, function ($a, $b) use ($sort) {
            switch ($sort) {
                case 'created':
                    return strcmp((string)$b['createdAt'], (string)$a['createdAt']);
                case 'lastLogin':
                    return strcmp((string)$b['lastLoginAt'], (string)$a['lastLoginAt']);
                case 'lastActivity':
                    return strcmp((string)$b['lastActivityAt'], (string)$a['lastActivityAt']);
                case 'role':
                    return hcp_role_rank($b['role']) <=> hcp_role_rank($a['role']) ?: strcmp($a['lastName'], $b['lastName']);
                default:
                    return strcasecmp($a['lastName'] . ' ' . $a['firstName'], $b['lastName'] . ' ' . $b['firstName']);
            }
        });
        $page = adm_paginate($list, $body);
        $page['items'] = array_map(function ($u) {
            return adm_user_row($u);
        }, $page['items']);
        hcp_json($page);
        break;

    case 'user':
    case 'impersonate':
        $target = adm_target(hcp_str($body, 'id', 64));
        $doc = hcp_load_member_doc($target['id']);
        hcp_audit($action === 'impersonate' ? 'IMPERSONATION_VIEW' : 'USER_DATA_VIEWED', $actor, ['userId' => $target['id'], 'entityType' => 'user', 'entityId' => $target['id']]);
        hcp_json([
            'user' => adm_user_row($target) + ['mustChangePassword' => (bool)$target['mustChangePassword'], 'pendingEmail' => $target['pendingEmail'] ?? null],
            'doc' => $doc['data'],
            'revision' => $doc['revision'],
            'updatedAt' => $doc['updatedAt'],
            'canManage' => adm_can_manage($actor, $target),
            'canAssignRole' => hcp_can($actor, 'users.roles') && $actor['id'] !== $target['id'],
        ]);
        break;

    case 'user-create':
        $firstName = hcp_check_name(hcp_str($body, 'firstName', 200), 'firstName');
        $lastName = hcp_check_name(hcp_str($body, 'lastName', 200), 'lastName');
        $email = hcp_check_email(hcp_str($body, 'email', 200));
        $role = hcp_str($body, 'role', 20) ?: 'USER';
        if (!in_array($role, ['USER', 'SUPPORT', 'ADMIN', 'SUPER_ADMIN'], true)) {
            hcp_fail('VALIDATION', 'Unbekannte Rolle', 0, ['role' => 'Unbekannte Rolle']);
        }
        if ($role !== 'USER' && !adm_can_assign($actor, ['id' => ''], $role)) {
            hcp_fail('FORBIDDEN', 'Diese Rolle darfst du nicht vergeben.');
        }
        $password = (string)($body['password'] ?? '');
        $invite = $password === '';
        if (!$invite) {
            hcp_check_password($password);
        }
        list($token, $tokenHash) = hcp_new_token();
        $created = hcp_with_users(function (array &$users) use ($firstName, $lastName, $email, $role, $password, $invite, $tokenHash) {
            foreach ($users as $u) {
                if ($u['email'] === $email) {
                    hcp_fail('EMAIL_TAKEN', '', 0, ['email' => 'Für diese E-Mail-Adresse gibt es bereits ein Konto.']);
                }
            }
            $now = hcp_now();
            $user = hcp_normalize_user([
                'id' => hcp_new_id(),
                'email' => $email,
                'username' => null,
                'firstName' => $firstName,
                'lastName' => $lastName,
                'role' => $role,
                'status' => 'ACTIVE',
                'emailVerified' => true,
                'emailVerifiedAt' => $now,
                'mustChangePassword' => !$invite,
                // Einladung: zufälliges Passwort, der Benutzer legt über den Link ein eigenes fest
                'passwordHash' => password_hash($invite ? bin2hex(random_bytes(24)) : $password, PASSWORD_DEFAULT),
                'passwordChangedAt' => $now,
                'resetTokenHash' => $invite ? $tokenHash : null,
                'resetExpires' => $invite ? time() + 7 * 86400 : null,
                'createdAt' => $now,
                'updatedAt' => $now,
            ]);
            $users[] = $user;
            return $user;
        });
        hcp_with_member_doc($created['id'], function (array &$doc) use ($created) {
            $doc = hcp_default_member_doc($created['id']);
        });
        $mailSent = null;
        if ($invite) {
            $s = hcp_settings();
            $link = hcp_site_url($config) . '/reset-password/?token=' . rawurlencode($token) . '&invite=1';
            $mailSent = hcp_send_mail($config, $email, 'Einladung: ' . $s['siteName'], 'Hallo ' . $firstName . ",\n\nfür dich wurde ein Zugang zu " . $s['siteName'] . " angelegt.\n"
                . "Über diesen Link legst du dein Passwort fest:\n\n" . $link . "\n\nDer Link ist 7 Tage gültig.\n");
        }
        hcp_audit('USER_CREATED', $actor, ['userId' => $created['id'], 'entityType' => 'user', 'entityId' => $created['id'], 'newValue' => ['email' => $email, 'role' => $role, 'invite' => $invite]]);
        hcp_json(['user' => adm_user_row($created, 0), 'invite' => $invite, 'mailSent' => $mailSent], 201);
        break;

    case 'user-update':
        $target = adm_target(hcp_str($body, 'id', 64));
        if (!adm_can_manage($actor, $target)) {
            hcp_fail('FORBIDDEN', $actor['id'] === $target['id'] ? 'Das eigene Konto wird unter „Profil“ bearbeitet.' : 'Keine Berechtigung für dieses Konto.');
        }
        $audits = [];
        $updated = hcp_with_users(function (array &$users) use ($body, $actor, $target, &$audits) {
            foreach ($users as &$u) {
                if ($u['id'] !== $target['id']) {
                    continue;
                }
                $profileOld = ['firstName' => $u['firstName'], 'lastName' => $u['lastName'], 'email' => $u['email']];
                if (array_key_exists('firstName', $body)) {
                    $u['firstName'] = hcp_check_name((string)$body['firstName'], 'firstName');
                }
                if (array_key_exists('lastName', $body)) {
                    $u['lastName'] = hcp_check_name((string)$body['lastName'], 'lastName');
                }
                if (array_key_exists('email', $body) && trim((string)$body['email']) !== '' && strtolower(trim((string)$body['email'])) !== $u['email']) {
                    $email = hcp_check_email((string)$body['email']);
                    foreach ($users as $other) {
                        if ($other['id'] !== $u['id'] && $other['email'] === $email) {
                            hcp_fail('EMAIL_TAKEN', '', 0, ['email' => 'Diese E-Mail-Adresse wird bereits verwendet.']);
                        }
                    }
                    $u['email'] = $email;
                }
                $profileNew = ['firstName' => $u['firstName'], 'lastName' => $u['lastName'], 'email' => $u['email']];
                if ($profileNew !== $profileOld) {
                    $audits[] = ['USER_PROFILE_UPDATED', $profileOld, $profileNew];
                }
                if (array_key_exists('role', $body) && (string)$body['role'] !== $u['role']) {
                    $role = (string)$body['role'];
                    if (!in_array($role, ['USER', 'SUPPORT', 'ADMIN', 'SUPER_ADMIN'], true) || !adm_can_assign($actor, $u, $role)) {
                        hcp_fail('FORBIDDEN', 'Diese Rolle darfst du nicht vergeben.');
                    }
                    if ($u['role'] === 'SUPER_ADMIN' && adm_active_super_admins($users) <= 1) {
                        hcp_fail('CONFLICT', 'Es muss mindestens ein aktives Super-Admin-Konto geben.');
                    }
                    $audits[] = ['USER_ROLE_CHANGED', ['role' => $u['role']], ['role' => $role]];
                    $u['role'] = $role;
                }
                if (array_key_exists('status', $body) && (string)$body['status'] !== $u['status']) {
                    $status = (string)$body['status'];
                    if (!in_array($status, ['ACTIVE', 'DISABLED', 'LOCKED'], true)) {
                        hcp_fail('VALIDATION', 'Unbekannter Status', 0, ['status' => 'Unbekannter Status']);
                    }
                    if ($u['role'] === 'SUPER_ADMIN' && $status !== 'ACTIVE' && adm_active_super_admins($users) <= 1) {
                        hcp_fail('CONFLICT', 'Es muss mindestens ein aktives Super-Admin-Konto geben.');
                    }
                    $map = ['ACTIVE' => 'USER_ENABLED', 'DISABLED' => 'USER_DISABLED', 'LOCKED' => 'USER_LOCKED'];
                    $audits[] = [$map[$status], ['status' => $u['status']], ['status' => $status]];
                    $u['status'] = $status;
                }
                if (array_key_exists('emailVerified', $body) && $body['emailVerified'] === true && !$u['emailVerified']) {
                    $u['emailVerified'] = true;
                    $u['emailVerifiedAt'] = hcp_now();
                    $u['verifyTokenHash'] = null;
                    $audits[] = ['USER_VERIFIED_BY_ADMIN', ['emailVerified' => false], ['emailVerified' => true]];
                }
                $u['updatedAt'] = hcp_now();
                return $u;
            }
            hcp_fail('NOT_FOUND', 'Benutzer nicht gefunden');
        });
        foreach ($audits as $a) {
            hcp_audit($a[0], $actor, ['userId' => $updated['id'], 'entityType' => 'user', 'entityId' => $updated['id'], 'oldValue' => $a[1], 'newValue' => $a[2]]);
            if ($a[0] === 'USER_PROFILE_UPDATED') {
                hcp_cm_reindex($updated['id']);
            }
        }
        hcp_json(['user' => adm_user_row($updated)]);
        break;

    case 'user-password':
        $target = adm_target(hcp_str($body, 'id', 64));
        if (!adm_can_manage($actor, $target)) {
            hcp_fail('FORBIDDEN', 'Keine Berechtigung für dieses Konto.');
        }
        $mode = hcp_str($body, 'mode', 20);
        if ($mode === 'mail') {
            if (empty($target['email'])) {
                hcp_fail('VALIDATION', 'Für dieses Konto ist keine E-Mail-Adresse hinterlegt.');
            }
            list($token, $tokenHash) = hcp_new_token();
            $target = hcp_update_user($target['id'], function (array &$u) use ($tokenHash) {
                $u['resetTokenHash'] = $tokenHash;
                $u['resetExpires'] = time() + 24 * 3600;
            });
            $sent = hcp_send_reset($config, $target, $token, 24);
            hcp_audit('USER_PASSWORD_RESET_REQUESTED', $actor, ['userId' => $target['id'], 'entityType' => 'user', 'entityId' => $target['id'], 'newValue' => ['byAdmin' => true]]);
            hcp_json(['ok' => true, 'mailSent' => $sent]);
        }
        $password = (string)($body['password'] ?? '');
        hcp_check_password($password);
        $target = hcp_update_user($target['id'], function (array &$u) use ($password) {
            $u['passwordHash'] = password_hash($password, PASSWORD_DEFAULT);
            $u['mustChangePassword'] = true;
            $u['passwordChangedAt'] = hcp_now(); // meldet alle Geräte des Benutzers ab
            $u['resetTokenHash'] = null;
        });
        hcp_audit('USER_PASSWORD_RESET', $actor, ['userId' => $target['id'], 'entityType' => 'user', 'entityId' => $target['id'], 'newValue' => ['temporary' => true]]);
        hcp_json(['ok' => true]);
        break;

    case 'user-delete':
        $target = adm_target(hcp_str($body, 'id', 64));
        if ($target['id'] === $actor['id']) {
            hcp_fail('FORBIDDEN', 'Das eigene Konto kann hier nicht gelöscht werden.');
        }
        if ((string)($body['confirm'] ?? '') !== 'LÖSCHEN') {
            hcp_fail('VALIDATION', 'Bitte zur Bestätigung LÖSCHEN eingeben.', 0, ['confirm' => 'Bitte LÖSCHEN eingeben.']);
        }
        $rounds = hcp_member_round_count($target['id']);
        hcp_with_users(function (array &$users) use ($target) {
            if ($target['role'] === 'SUPER_ADMIN' && adm_active_super_admins($users) <= 1) {
                hcp_fail('CONFLICT', 'Es muss mindestens ein aktives Super-Admin-Konto geben.');
            }
            $users = array_values(array_filter($users, function ($u) use ($target) {
                return $u['id'] !== $target['id'];
            }));
        });
        @unlink(hcp_member_file($target['id']));
        hcp_cm_remove_user($target['id']);
        hcp_audit('USER_DELETED', $actor, ['userId' => $target['id'], 'entityType' => 'user', 'entityId' => $target['id'], 'oldValue' => ['email' => $target['email'], 'name' => adm_name($target), 'role' => $target['role'], 'rounds' => $rounds]]);
        hcp_json(['ok' => true]);
        break;

    case 'rounds':
        $q = hcp_str($body, 'q', 100);
        $userId = hcp_str($body, 'userId', 64);
        $status = hcp_str($body, 'status', 20);
        $from = hcp_str($body, 'from', 10);
        $to = hcp_str($body, 'to', 10);
        $rows = [];
        foreach (hcp_load_users() as $u) {
            if ($userId !== '' && $u['id'] !== $userId) {
                continue;
            }
            $doc = hcp_load_member_doc($u['id']);
            foreach (($doc['data']['rounds'] ?? []) as $r) {
                if (!is_array($r)) {
                    continue;
                }
                $row = adm_round_row($u, $r, (string)$doc['updatedAt']);
                if ($status !== '' && $row['status'] !== $status) {
                    continue;
                }
                if ($from !== '' && $row['date'] < $from || $to !== '' && $row['date'] > $to) {
                    continue;
                }
                if (!adm_contains($row['courseName'] . ' ' . $row['userName'] . ' ' . $row['roundId'], $q)) {
                    continue;
                }
                $rows[] = $row;
            }
        }
        usort($rows, function ($a, $b) {
            return strcmp($b['date'], $a['date']) ?: strcmp($b['updatedAt'], $a['updatedAt']);
        });
        hcp_json(adm_paginate($rows, $body));
        break;

    case 'round':
        $target = adm_target(hcp_str($body, 'userId', 64));
        $roundId = hcp_str($body, 'roundId', 64);
        $doc = hcp_load_member_doc($target['id']);
        $found = null;
        foreach (($doc['data']['rounds'] ?? []) as $r) {
            if (($r['id'] ?? null) === $roundId) {
                $found = $r;
            }
        }
        if ($found === null) {
            hcp_fail('ROUND_NOT_FOUND');
        }
        hcp_audit('USER_DATA_VIEWED', $actor, ['userId' => $target['id'], 'entityType' => 'round', 'entityId' => $roundId]);
        hcp_json(['user' => ['id' => $target['id'], 'name' => adm_name($target), 'email' => $target['email']], 'roundId' => $roundId, 'doc' => $doc['data']]);
        break;

    case 'logs':
        $f = [
            'action' => hcp_str($body, 'action', 60),
            'actorId' => hcp_str($body, 'actorId', 64),
            'userId' => hcp_str($body, 'userId', 64),
            'q' => hcp_str($body, 'q', 100),
            'from' => hcp_str($body, 'from', 10),
            'to' => hcp_str($body, 'to', 10),
            'group' => hcp_str($body, 'group', 20),
        ];
        list($page, $size) = adm_page($body);
        $total = 0;
        $items = hcp_audit_entries($size, function ($e) use ($f) {
            if ($f['action'] !== '' && ($e['action'] ?? '') !== $f['action']) {
                return false;
            }
            if ($f['group'] === 'admin' && !in_array($e['action'] ?? '', ADM_ADMIN_ACTIONS, true)) {
                return false;
            }
            if ($f['group'] === 'member' && !in_array($e['action'] ?? '', ADM_MEMBER_ACTIVITY, true)) {
                return false;
            }
            if ($f['actorId'] !== '' && ($e['actorId'] ?? '') !== $f['actorId']) {
                return false;
            }
            if ($f['userId'] !== '' && ($e['userId'] ?? '') !== $f['userId']) {
                return false;
            }
            $day = substr((string)($e['timestamp'] ?? ''), 0, 10);
            if ($f['from'] !== '' && $day < $f['from'] || $f['to'] !== '' && $day > $f['to']) {
                return false;
            }
            return $f['q'] === '' || adm_contains(json_encode($e, JSON_UNESCAPED_UNICODE) ?: '', $f['q']);
        }, ($page - 1) * $size, $total);
        hcp_json(['items' => array_map('adm_audit_view', $items), 'total' => $total, 'page' => $page, 'pageSize' => $size]);
        break;

    case 'system':
        $data = hcp_data_dir();
        $checks = [];
        $add = function (string $key, string $label, string $state, string $detail) use (&$checks) {
            $checks[] = ['key' => $key, 'label' => $label, 'state' => $state, 'detail' => $detail];
        };
        $add('php', 'PHP-Version', version_compare(PHP_VERSION, '7.4.0', '>=') ? 'OK' : 'ERROR', PHP_VERSION);
        $add('data', 'Datenordner beschreibbar', is_writable($data) ? 'OK' : 'ERROR', is_writable($data) ? 'data/ ist beschreibbar' : 'data/ ist nicht beschreibbar');
        $add('protect', 'Datenordner geschützt', is_file($data . '/.htaccess') && is_file($data . '/index.html') ? 'OK' : 'WARNING', 'Dateien beginnen zusätzlich mit einer PHP-Sperrzeile');
        $add('https', 'HTTPS', hcp_is_https() ? 'OK' : 'WARNING', hcp_is_https() ? 'Verbindung verschlüsselt' : 'Ohne HTTPS werden Sitzungscookies nicht als „Secure“ markiert');
        $mode = hcp_mail_mode($config);
        $mailLabels = ['mail' => 'PHP mail()', 'smtp' => 'SMTP', 'outbox' => 'Testmodus (Ablage in data/mail-outbox)', 'off' => 'ausgeschaltet'];
        $add('mail', 'E-Mail-Versand', in_array($mode, ['mail', 'smtp'], true) ? 'OK' : 'WARNING', $mailLabels[$mode]);
        $add('siteUrl', 'Adresse für E-Mail-Links', !empty($config['siteUrl']) ? 'OK' : 'WARNING', !empty($config['siteUrl']) ? (string)$config['siteUrl'] : 'nicht festgelegt – wird aus der Anfrage ermittelt');
        $ds = adm_dataset_stats();
        $add('courses', 'Golfplatzdatenbank', $ds['courses'] > 0 ? 'OK' : 'WARNING', $ds['courses'] . ' Anlagen, ' . $ds['ratings'] . ' Ratings (' . $ds['verified'] . ' verifiziert)');
        $free = @disk_free_space($data);
        $add('disk', 'Freier Speicher', $free === false ? 'WARNING' : ($free > 100 * 1024 * 1024 ? 'OK' : 'WARNING'), $free === false ? 'unbekannt' : round($free / 1024 / 1024) . ' MB');
        $users = hcp_load_users();
        $add('superadmin', 'Super-Admin vorhanden', adm_active_super_admins($users) > 0 ? 'OK' : 'ERROR', adm_active_super_admins($users) . ' aktiv');
        $errors = [];
        foreach (array_slice(array_reverse(glob($data . '/logs/errors-*.php') ?: []), 0, 2) as $file) {
            $errors = array_merge($errors, hcp_read_lines($file));
        }
        usort($errors, function ($a, $b) {
            return strcmp((string)($b['timestamp'] ?? ''), (string)($a['timestamp'] ?? ''));
        });
        $since = gmdate('Y-m-d\TH:i:s\Z', time() - 86400);
        $mails = [];
        foreach (array_slice(array_reverse(glob($data . '/logs/mail-*.php') ?: []), 0, 2) as $file) {
            $mails = array_merge($mails, hcp_read_lines($file));
        }
        usort($mails, function ($a, $b) {
            return strcmp((string)($b['timestamp'] ?? ''), (string)($a['timestamp'] ?? ''));
        });
        hcp_json([
            'checks' => $checks,
            'engine' => ['ruleSet' => '', 'version' => hcp_app_version(), 'build' => null],
            'errorsLast24h' => count(array_filter($errors, function ($e) use ($since) {
                return (string)($e['timestamp'] ?? '') >= $since;
            })),
            'recentErrors' => array_slice($errors, 0, 20),
            'storage' => 'Dateien im Ordner data/ (PHP ' . PHP_VERSION . ')',
            'mail' => ['mode' => $mode, 'recent' => array_slice($mails, 0, 20)],
        ]);
        break;

    case 'settings':
        hcp_json(hcp_settings() + ['siteUrl' => (string)($config['siteUrl'] ?? ''), 'mail' => adm_mail_view($config)]);
        break;

    case 'settings-save':
        $old = hcp_settings();
        $next = $old;
        foreach (['siteName' => 80, 'contactEmail' => 200, 'mailFrom' => 200] as $k => $max) {
            if (array_key_exists($k, $body)) {
                $v = trim((string)$body[$k]);
                $next[$k] = $v === '' ? ($k === 'siteName' ? 'Golf HCP Rechner' : null) : mb_substr_safe($v, $max);
            }
        }
        foreach (['contactEmail', 'mailFrom'] as $k) {
            if ($next[$k] !== null && !preg_match(HCP_EMAIL_PATTERN, (string)$next[$k])) {
                hcp_fail('VALIDATION', 'Bitte eine gültige E-Mail-Adresse eingeben.', 0, [$k => 'Bitte eine gültige E-Mail-Adresse eingeben.']);
            }
        }
        foreach (['imprintText', 'privacyText'] as $k) {
            if (array_key_exists($k, $body)) {
                $v = trim((string)$body[$k]);
                $next[$k] = $v === '' ? null : mb_substr_safe($v, 20000);
            }
        }
        foreach (['registrationOpen', 'emailVerificationRequired'] as $k) {
            if (array_key_exists($k, $body)) {
                $next[$k] = (bool)$body[$k];
            }
        }
        if (isset($body['community']) && is_array($body['community'])) {
            foreach (array_keys(hcp_default_community_flags()) as $k) {
                if (array_key_exists($k, $body['community'])) {
                    $next['community'][$k] = (bool)$body['community'][$k];
                }
            }
        }
        hcp_save_settings($next);
        $changedConfig = [];
        if (array_key_exists('siteUrl', $body)) {
            $url = rtrim(trim((string)$body['siteUrl']), '/');
            if ($url !== '' && !preg_match('#^https?://[^\s/]+(/[^\s]*)?$#i', $url)) {
                hcp_fail('VALIDATION', 'Adresse ungültig (z. B. https://www.example.de/hcp)', 0, ['siteUrl' => 'Adresse ungültig']);
            }
            if ($url !== (string)($config['siteUrl'] ?? '')) {
                $changedConfig['siteUrl'] = [$config['siteUrl'] ?? null, $url];
                $config['siteUrl'] = $url;
            }
        }
        if (isset($body['mail']) && is_array($body['mail'])) {
            $m = $body['mail'];
            $mail = is_array($config['mail'] ?? null) ? $config['mail'] : [];
            $mode = in_array($m['mode'] ?? '', ['mail', 'smtp', 'outbox', 'off'], true) ? $m['mode'] : hcp_mail_mode($config);
            $newMail = [
                'mode' => $mode,
                'host' => mb_substr_safe(trim((string)($m['host'] ?? ($mail['host'] ?? ''))), 200),
                'port' => max(1, min(65535, (int)($m['port'] ?? ($mail['port'] ?? 587)))),
                'secure' => in_array($m['secure'] ?? '', ['tls', 'ssl', 'none'], true) ? $m['secure'] : ($mail['secure'] ?? 'tls'),
                'user' => mb_substr_safe(trim((string)($m['user'] ?? ($mail['user'] ?? ''))), 200),
                // Passwort wird nie ausgeliefert; leer lassen = unverändert
                'pass' => isset($m['pass']) && (string)$m['pass'] !== '' ? (string)$m['pass'] : (string)($mail['pass'] ?? ''),
            ];
            $viewOld = adm_mail_view($config);
            $config['mail'] = $newMail;
            $viewNew = adm_mail_view($config);
            if ($viewOld !== $viewNew || $newMail['pass'] !== (string)($mail['pass'] ?? '')) {
                $changedConfig['mail'] = [$viewOld, $viewNew];
            }
        }
        if ($changedConfig) {
            hcp_save_config($config);
        }
        $diffOld = [];
        $diffNew = [];
        foreach ($next['community'] as $k => $v) {
            if (($old['community'][$k] ?? null) !== $v) {
                $diffOld['community.' . $k] = $old['community'][$k] ?? null;
                $diffNew['community.' . $k] = $v;
            }
        }
        foreach ($next as $k => $v) {
            if ($k === 'community') {
                continue;
            }
            if (($old[$k] ?? null) !== $v) {
                $diffOld[$k] = in_array($k, ['imprintText', 'privacyText'], true) ? '(Text)' : ($old[$k] ?? null);
                $diffNew[$k] = in_array($k, ['imprintText', 'privacyText'], true) ? '(Text geändert)' : $v;
            }
        }
        foreach ($changedConfig as $k => $pair) {
            $diffOld[$k] = $pair[0];
            $diffNew[$k] = $pair[1];
        }
        if ($diffNew) {
            hcp_audit('SETTINGS_CHANGED', $actor, ['entityType' => 'settings', 'oldValue' => $diffOld, 'newValue' => $diffNew]);
        }
        hcp_json(hcp_settings() + ['siteUrl' => (string)($config['siteUrl'] ?? ''), 'mail' => adm_mail_view($config)]);
        break;

    case 'mail-test':
        $to = hcp_check_email(hcp_str($body, 'to', 200));
        $s = hcp_settings();
        $ok = hcp_send_mail($config, $to, 'Testnachricht von ' . $s['siteName'], "Diese Testnachricht bestätigt, dass der E-Mail-Versand funktioniert.\n\n" . hcp_site_url($config) . "\n");
        hcp_json(['ok' => $ok, 'mode' => hcp_mail_mode($config)]);
        break;

    case 'search':
        $q = hcp_str($body, 'q', 100);
        if (hcp_len($q) < 2) {
            hcp_json(['users' => [], 'rounds' => []]);
        }
        $users = [];
        $rounds = [];
        foreach (hcp_load_users() as $u) {
            $match = adm_contains(adm_name($u) . ' ' . $u['email'] . ' ' . $u['username'] . ' ' . $u['id'], $q);
            if ($match && hcp_can($actor, 'users.read') && count($users) < 10) {
                $users[] = adm_user_row($u);
            }
            if (hcp_can($actor, 'rounds.read') && count($rounds) < 10) {
                $doc = hcp_load_member_doc($u['id']);
                foreach (($doc['data']['rounds'] ?? []) as $r) {
                    if (is_array($r) && ($match || adm_contains((string)($r['course']['courseName'] ?? '') . ' ' . (string)($r['id'] ?? ''), $q)) && count($rounds) < 10) {
                        $rounds[] = adm_round_row($u, $r, (string)$doc['updatedAt']);
                    }
                }
            }
        }
        hcp_json(['users' => $users, 'rounds' => $rounds]);
        break;

    case 'courses-load':
        hcp_send_raw_json(hcp_dataset_json());
        break;

    case 'courses-save':
        $base = $body['baseRevision'] ?? null;
        $dataset = $body['dataset'] ?? null;
        if (!is_int($base) || !is_array($dataset)) {
            hcp_fail('VALIDATION', 'Ungültige Anfrage');
        }
        if (($dataset['format'] ?? '') !== 'golf-hcp-rechner/courses' || !isset($dataset['courses']) || !is_array($dataset['courses'])) {
            hcp_fail('VALIDATION', 'Ungültiger Datensatz');
        }
        foreach ($dataset['courses'] as $course) {
            if (!is_array($course) || !isset($course['id'], $course['slug'], $course['name']) || !isset($course['layouts']) || !is_array($course['layouts'])) {
                hcp_fail('VALIDATION', 'Ungültiger Datensatz (Anlage ohne id/slug/name/layouts)');
            }
        }
        $lock = hcp_lock('courses');
        $current = hcp_dataset();
        $currentRevision = (int)($current['revision'] ?? 0);
        if ($base !== $currentRevision) {
            hcp_unlock($lock);
            hcp_json(['error' => 'CONFLICT', 'message' => 'Die Golfplatzdaten wurden zwischenzeitlich geändert.', 'revision' => $currentRevision], 409);
        }
        // Neue Einträge des Änderungsprotokolls: Akteur serverseitig setzen und ins Audit-Log übernehmen
        $known = [];
        foreach (($current['changes'] ?? []) as $c) {
            $known[(string)($c['id'] ?? '')] = true;
        }
        $fresh = [];
        $actorName = adm_name($actor);
        foreach (($dataset['changes'] ?? []) as $i => $c) {
            if (is_array($c) && !isset($known[(string)($c['id'] ?? '')])) {
                $dataset['changes'][$i]['actor'] = $actorName;
                $fresh[] = $dataset['changes'][$i];
            }
        }
        $existing = hcp_read_guarded(hcp_courses_file());
        if ($existing !== null && $existing !== '') {
            $backupDir = hcp_data_dir() . '/backups';
            hcp_write_guarded($backupDir . '/courses-r' . $currentRevision . '-' . gmdate('Ymd-His') . '.php', $existing);
            $backups = glob($backupDir . '/courses-r*.php') ?: [];
            usort($backups, function ($a, $b) {
                return filemtime($b) <=> filemtime($a);
            });
            foreach (array_slice($backups, HCP_BACKUPS) as $old) {
                @unlink($old);
            }
        }
        $dataset['revision'] = $currentRevision + 1;
        $dataset['updatedAt'] = hcp_now();
        $json = json_encode($dataset, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            hcp_unlock($lock);
            hcp_fail('VALIDATION', 'Datensatz kann nicht gespeichert werden');
        }
        hcp_write_guarded(hcp_courses_file(), $json);
        hcp_unlock($lock);
        $imports = ['CSV_IMPORT' => 0, 'SEED' => 0, 'IMPORTER' => 0];
        $logged = 0;
        foreach (array_reverse($fresh) as $c) {
            $source = (string)($c['source'] ?? 'ADMIN');
            if (isset($imports[$source])) {
                $imports[$source]++;
                continue;
            }
            if ($logged++ >= 50) {
                continue;
            }
            hcp_audit(adm_course_audit_action((string)($c['entityType'] ?? ''), (string)($c['action'] ?? '')), $actor, [
                'entityType' => (string)($c['entityType'] ?? ''), 'entityId' => $c['entityId'] ?? null, 'newValue' => $c['changes'] ?? null,
            ]);
        }
        foreach ($imports as $source => $count) {
            if ($count > 0) {
                hcp_audit('IMPORT_APPLIED', $actor, ['entityType' => 'courses', 'newValue' => ['source' => $source, 'changes' => $count]]);
            }
        }
        hcp_json(['ok' => true, 'revision' => $dataset['revision'], 'updatedAt' => $dataset['updatedAt']]);
        break;

    case 'community':
        $status = hcp_cm_status_map();
        $profiles = hcp_cm_profiles();
        $index = hcp_cm_admin_index();
        $counts = ['profilesVisible' => 0, 'rankingOptIn' => 0, 'roundsVisibleUsers' => 0, 'statsVisibleUsers' => 0, 'publicRounds' => 0];
        foreach ($profiles as $uid => $p) {
            if (($status[$uid] ?? '') !== 'ACTIVE') {
                continue;
            }
            $counts['profilesVisible'] += !empty($p['profileVisible']) ? 1 : 0;
            $counts['rankingOptIn'] += !empty($p['rankingVisible']) ? 1 : 0;
            $counts['roundsVisibleUsers'] += !empty($p['roundsVisible']) ? 1 : 0;
            $counts['statsVisibleUsers'] += !empty($p['statsVisible']) ? 1 : 0;
            $counts['publicRounds'] += (int)($p['publicRoundsCount'] ?? 0);
        }
        $sums = hcp_cm_empty_sums();
        $warnings = 0;
        $hidden = 0;
        $full = 0;
        foreach ($index as $uid => $e) {
            if (!isset($status[$uid])) {
                continue;
            }
            foreach ($sums as $k => $v) {
                $sums[$k] += (int)($e['sums'][$k] ?? 0);
            }
            $warnings += (int)($e['withWarnings'] ?? 0);
            $hidden += (int)($e['hidden'] ?? 0);
            foreach (($e['rounds'] ?? []) as $r) {
                if (($r['level'] ?? null) === 'FULL' && ($status[$uid] ?? '') === 'ACTIVE') {
                    $full++;
                }
            }
        }
        $dates = array_map(function ($f) {
            return basename($f, '.php');
        }, glob(hcp_cm_dir() . '/ranking/*.php') ?: []);
        rsort($dates);
        hcp_json($counts + [
            'flags' => hcp_cm_flags(),
            'members' => count(array_filter($status, function ($s) {
                return $s === 'ACTIVE';
            })),
            'publicRoundsFull' => $full,
            'hiddenRounds' => $hidden,
            'sums' => $sums,
            'withWarnings' => $warnings,
            'lastSnapshotDate' => $dates[0] ?? null,
        ]);
        break;

    case 'community-ranking':
        $users = [];
        foreach (hcp_load_users() as $u) {
            $users[$u['id']] = $u;
        }
        $status = array_map(function ($u) {
            return $u['status'];
        }, $users);
        $profiles = hcp_cm_profiles();
        $positions = [];
        foreach (hcp_cm_ranked($profiles, $status) as $p) {
            $positions[$p['userId']] = $p['position'];
        }
        $filter = hcp_str($body, 'filter', 20);
        $q = hcp_str($body, 'q', 60);
        $rows = [];
        foreach ($profiles as $uid => $p) {
            $u = $users[$uid] ?? null;
            if ($u === null) {
                continue;
            }
            if (($filter === 'OPT_IN' && empty($p['rankingVisible'])) || ($filter === 'OPT_OUT' && !empty($p['rankingVisible'])) || ($filter === 'ACTIVE' && $u['status'] !== 'ACTIVE')) {
                continue;
            }
            if ($q !== '' && !adm_contains($p['displayName'] . ' ' . adm_name($u), $q)) {
                continue;
            }
            $rows[] = [
                'userId' => $uid,
                'name' => adm_name($u),
                'displayName' => (string)$p['displayName'],
                'publicId' => $p['publicId'] ?? null,
                'position' => $positions[$uid] ?? null,
                'handicapIndex' => $p['handicapIndex'] ?? null,
                'rankingVisible' => !empty($p['rankingVisible']),
                'profileVisible' => !empty($p['profileVisible']),
                'roundsVisible' => !empty($p['roundsVisible']),
                'statsVisible' => !empty($p['statsVisible']),
                'status' => $u['status'],
                'publicRoundsCount' => (int)($p['publicRoundsCount'] ?? 0),
            ];
        }
        usort($rows, function ($a, $b) {
            if ($a['rankingVisible'] !== $b['rankingVisible']) {
                return $a['rankingVisible'] ? -1 : 1;
            }
            $ha = $a['handicapIndex'];
            $hb = $b['handicapIndex'];
            if ($ha === null || $hb === null) {
                return $ha === $hb ? strnatcasecmp($a['displayName'], $b['displayName']) : ($ha === null ? 1 : -1);
            }
            $d = hcp_cm_tenths($ha) - hcp_cm_tenths($hb);
            return $d !== 0 ? $d : strnatcasecmp($a['displayName'], $b['displayName']);
        });
        hcp_json(adm_paginate($rows, $body));
        break;

    case 'community-rounds':
        $users = [];
        foreach (hcp_load_users() as $u) {
            $users[$u['id']] = $u;
        }
        $profiles = hcp_cm_profiles();
        $flags = hcp_cm_flags();
        $filter = hcp_str($body, 'filter', 20);
        $q = hcp_str($body, 'q', 60);
        $rows = [];
        foreach (hcp_cm_admin_index() as $uid => $e) {
            $u = $users[$uid] ?? null;
            if ($u === null) {
                continue;
            }
            $display = (string)($profiles[$uid]['displayName'] ?? '');
            foreach (($e['rounds'] ?? []) as $r) {
                if (($filter === 'HIDDEN' && empty($r['hidden'])) || ($filter === 'FULL' && ($r['visibility'] ?? '') !== 'MEMBERS_FULL')) {
                    continue;
                }
                if ($q !== '' && !adm_contains($r['courseName'] . ' ' . $display . ' ' . adm_name($u), $q)) {
                    continue;
                }
                $rows[] = [
                    'userId' => $uid,
                    'userName' => adm_name($u),
                    'displayName' => $display,
                    'roundId' => $r['roundId'],
                    'date' => $r['date'],
                    'courseName' => $r['courseName'],
                    'holes' => $r['holes'],
                    'visibility' => $r['visibility'],
                    'hidden' => (bool)$r['hidden'],
                    'detailed' => (bool)$r['detailed'],
                    'level' => $r['level'] !== null ? hcp_cm_level_with_flags((string)$r['level'], $flags) : null,
                ];
            }
        }
        usort($rows, function ($a, $b) {
            $d = strcmp($b['date'], $a['date']);
            return $d !== 0 ? $d : strcmp($a['roundId'], $b['roundId']);
        });
        hcp_json(adm_paginate($rows, $body));
        break;

    case 'community-moderate':
        $target = adm_target(hcp_str($body, 'userId', 64));
        $roundId = hcp_str($body, 'roundId', 64);
        $action = hcp_str($body, 'action', 20);
        if (!in_array($action, ['HIDE', 'UNHIDE', 'MAKE_PRIVATE', 'REMOVE_NOTES'], true)) {
            hcp_fail('VALIDATION', 'Unbekannte Aktion.');
        }
        $reason = hcp_str($body, 'reason', 300);
        $reason = $reason === '' ? null : $reason;
        $res = hcp_with_member_doc($target['id'], function (array &$doc) use ($roundId, $action, $reason, $actor) {
            foreach ($doc['rounds'] as $i => $r) {
                if (($r['id'] ?? null) !== $roundId || ($r['status'] ?? 'COMPLETED') === 'DELETED') {
                    continue;
                }
                $notes = function (array $x) {
                    if (!empty($x['notes'])) {
                        return true;
                    }
                    foreach (($x['holeStats'] ?? []) as $h) {
                        if (!empty($h['note'])) {
                            return true;
                        }
                    }
                    return false;
                };
                $old = ['visibility' => $r['visibility'] ?? 'PRIVATE', 'hidden' => !empty($r['moderation']['hidden']), 'notes' => $notes($r)];
                if ($action === 'HIDE') {
                    $r['moderation'] = ['hidden' => true, 'reason' => $reason, 'at' => hcp_now(), 'by' => adm_name($actor)];
                } elseif ($action === 'UNHIDE') {
                    $r['moderation'] = null;
                } elseif ($action === 'MAKE_PRIVATE') {
                    $r['visibility'] = 'PRIVATE';
                } else {
                    unset($r['notes']);
                    if (isset($r['holeStats']) && is_array($r['holeStats'])) {
                        foreach ($r['holeStats'] as $j => $h) {
                            $r['holeStats'][$j]['note'] = null;
                        }
                    }
                }
                $doc['rounds'][$i] = $r;
                return ['old' => $old, 'new' => ['visibility' => $r['visibility'] ?? 'PRIVATE', 'hidden' => !empty($r['moderation']['hidden']), 'notes' => $notes($r)], 'courseName' => $r['course']['courseName'] ?? null, 'date' => $r['date'] ?? null];
            }
            hcp_fail('ROUND_NOT_FOUND');
        });
        hcp_cm_reindex($target['id']);
        $auditAction = $action === 'HIDE' ? 'PUBLIC_ROUND_HIDDEN' : ($action === 'UNHIDE' ? 'PUBLIC_ROUND_UNHIDDEN' : 'PUBLIC_ROUND_MODIFIED');
        hcp_audit($auditAction, $actor, ['userId' => $target['id'], 'entityType' => 'round', 'entityId' => $roundId, 'oldValue' => $res['result']['old'], 'newValue' => $res['result']['new'] + ['action' => $action, 'reason' => $reason, 'courseName' => $res['result']['courseName'], 'date' => $res['result']['date']]]);
        hcp_json(['ok' => true]);
        break;

    case 'community-refresh':
        $n = 0;
        foreach (hcp_load_users() as $u) {
            hcp_cm_reindex($u['id']);
            $n++;
        }
        $date = hcp_cm_snapshot_ensure(hcp_cm_ranked(hcp_cm_profiles(), hcp_cm_status_map()), true);
        hcp_audit('RANKING_REFRESHED', $actor, ['entityType' => 'ranking', 'newValue' => ['users' => $n, 'snapshotDate' => $date]]);
        hcp_json(['users' => $n, 'snapshotDate' => $date]);
        break;

    case 'user-community':
        $target = adm_target(hcp_str($body, 'id', 64));
        $changes = [];
        foreach (['rankingVisible', 'profileVisible'] as $k) {
            if (array_key_exists($k, $body) && $body[$k] === false) {
                $changes[] = $k;
            }
        }
        if (!$changes) {
            hcp_fail('VALIDATION', 'Der Admin kann Sichtbarkeit nur abschalten.');
        }
        $res = hcp_with_member_doc($target['id'], function (array &$doc) use ($changes) {
            $s = hcp_cm_settings($doc);
            $old = ['rankingVisible' => $s['rankingVisible'], 'profileVisible' => $s['profileVisible']];
            foreach ($changes as $k) {
                $s[$k] = false;
            }
            $s = hcp_cm_normalize($s);
            $s['updatedAt'] = hcp_now();
            $doc['community'] = $s;
            return $old;
        });
        hcp_cm_reindex($target['id']);
        foreach ($changes as $k) {
            if ($res['result'][$k]) {
                hcp_audit($k === 'rankingVisible' ? 'USER_RANKING_VISIBILITY_CHANGED' : 'USER_PROFILE_VISIBILITY_CHANGED', $actor, ['userId' => $target['id'], 'entityType' => 'user', 'entityId' => $target['id'], 'oldValue' => [$k => true], 'newValue' => [$k => false]]);
            }
        }
        hcp_json(['ok' => true]);
        break;

}
