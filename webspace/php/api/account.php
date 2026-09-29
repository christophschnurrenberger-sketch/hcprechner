<?php
/**
 * Golf HCP Rechner – Benutzerkonten (vom Admin angelegte Zugänge).
 *
 * Aktionen (immer POST, ?action=…):
 *   status            – angemeldeter Benutzer (+ CSRF-Token) oder null
 *   login             – { username, password }
 *   logout
 *   password          – { current, next }
 *   load              – gespeicherte Daten { data, revision, updatedAt }
 *   save              – { baseRevision, data } → 409 mit aktuellem Stand bei zwischenzeitlicher Änderung
 *
 * Anmeldung über ein signiertes Cookie (30 Tage); schreibende Aufrufe zusätzlich mit Header X-CSRF-Token.
 */
declare(strict_types=1);
require __DIR__ . '/_lib.php';

hcp_require_post();
$action = (string)($_GET['action'] ?? '');
$config = hcp_config();

if ($config === null) {
    if ($action === 'status') {
        hcp_json(['enabled' => false, 'user' => null, 'csrf' => null]);
    }
    hcp_error('Die Anwendung ist noch nicht installiert.', 503);
}

switch ($action) {
    case 'status':
        $user = hcp_current_user($config);
        hcp_json([
            'enabled' => true,
            'user' => $user ? hcp_user_public($user) : null,
            'csrf' => $user ? hcp_user_csrf($config, $user) : null,
        ]);
        break;

    case 'login':
        if (hcp_rate_limited('userlogin', 10, 900)) {
            hcp_error('Zu viele Fehlversuche – bitte 15 Minuten warten.', 429);
        }
        $body = hcp_body(10000);
        $username = hcp_normalize_username((string)($body['username'] ?? ''));
        $password = (string)($body['password'] ?? '');
        $user = hcp_find_user('username', $username);
        if ($user === null || empty($user['active']) || !password_verify($password, (string)($user['passwordHash'] ?? ''))) {
            hcp_rate_hit('userlogin', 900);
            usleep(700000);
            hcp_error('Benutzername oder Passwort falsch.', 401);
        }
        $user = hcp_with_users(function (array &$users) use ($user, $password) {
            foreach ($users as &$u) {
                if ($u['id'] === $user['id']) {
                    $u['lastLoginAt'] = gmdate('Y-m-d\TH:i:s\Z');
                    if (password_needs_rehash((string)$u['passwordHash'], PASSWORD_DEFAULT)) {
                        $u['passwordHash'] = password_hash($password, PASSWORD_DEFAULT);
                    }
                    return $u;
                }
            }
            return $user;
        });
        $csrf = hcp_issue_user_token($config, $user);
        hcp_json(['user' => hcp_user_public($user), 'csrf' => $csrf]);
        break;

    case 'logout':
        hcp_clear_user_token($config);
        hcp_json(['ok' => true]);
        break;

    case 'password':
        $user = hcp_require_user($config);
        $body = hcp_body(10000);
        $current = (string)($body['current'] ?? '');
        $next = (string)($body['next'] ?? '');
        if (!password_verify($current, (string)$user['passwordHash'])) {
            hcp_error('Aktuelles Passwort falsch.', 400);
        }
        hcp_check_password($next);
        $updated = hcp_with_users(function (array &$users) use ($user, $next) {
            foreach ($users as &$u) {
                if ($u['id'] === $user['id']) {
                    $u['passwordHash'] = password_hash($next, PASSWORD_DEFAULT);
                    $u['mustChangePassword'] = false;
                    $u['passwordChangedAt'] = gmdate('Y-m-d\TH:i:s\Z');
                    $u['updatedAt'] = $u['passwordChangedAt'];
                    return $u;
                }
            }
            hcp_error('Benutzer nicht gefunden', 404);
        });
        // neues Cookie (das alte ist durch den geänderten Passwortstand ungültig)
        $csrf = hcp_issue_user_token($config, $updated);
        hcp_json(['ok' => true, 'user' => hcp_user_public($updated), 'csrf' => $csrf]);
        break;

    case 'load':
        $user = hcp_require_user($config);
        hcp_json(hcp_load_user_data((string)$user['id']));
        break;

    case 'save':
        $user = hcp_require_user($config);
        $body = hcp_body(HCP_USER_DATA_MAX);
        $base = $body['baseRevision'] ?? null;
        $data = $body['data'] ?? null;
        if (!is_int($base) || !is_array($data) || !isset($data['profile']) || !is_array($data['profile'])
            || !isset($data['rounds']) || !is_array($data['rounds'])) {
            hcp_error('Ungültige Daten', 400);
        }
        if (count($data['rounds']) > 5000) {
            hcp_error('Zu viele Runden', 413);
        }
        $file = hcp_user_data_file((string)$user['id']);
        if (!is_dir(dirname($file))) {
            @mkdir(dirname($file), 0755, true);
        }
        $lock = fopen($file . '.lock', 'c');
        if ($lock === false || !flock($lock, LOCK_EX)) {
            hcp_error('Daten gesperrt – bitte erneut versuchen', 503);
        }
        $current = hcp_load_user_data((string)$user['id']);
        if ($base !== $current['revision']) {
            flock($lock, LOCK_UN);
            hcp_json(['error' => 'Die Daten wurden zwischenzeitlich auf einem anderen Gerät geändert.'] + $current, 409);
        }
        $record = [
            'data' => ['profile' => $data['profile'], 'rounds' => array_values($data['rounds']), 'settings' => $data['settings'] ?? null],
            'revision' => $current['revision'] + 1,
            'updatedAt' => gmdate('Y-m-d\TH:i:s\Z'),
        ];
        hcp_write_guarded($file, json_encode($record, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        flock($lock, LOCK_UN);
        fclose($lock);
        hcp_json(['ok' => true, 'revision' => $record['revision'], 'updatedAt' => $record['updatedAt']]);
        break;

    default:
        hcp_error('Unbekannte Aktion', 400);
}
