<?php
/**
 * Golf HCP Rechner – Admin-Endpunkt der Webspace-Edition.
 *
 * Aktionen (immer POST, ?action=…):
 *   status        – installiert? angemeldet? Rolle? (liefert CSRF-Token der Sitzung)
 *   login         – { password } (Haupt-Passwort) oder { username, password } (Benutzer mit Golfplatzpflege)
 *   logout
 *   load          – kompletter Datensatz inkl. Änderungsprotokoll
 *   save          – { baseRevision, dataset }  → 409 bei zwischenzeitlicher Änderung
 *   password      – { current, next }               (nur Haupt-Passwort)
 *   users         – Benutzerliste                   (nur Haupt-Passwort)
 *   user-create   – { username, displayName, role, password }
 *   user-update   – { id, displayName, role, active }
 *   user-password – { id, password }  (Benutzer muss es bei der nächsten Anmeldung ändern)
 *   user-delete   – { id }            (löscht auch die gespeicherten Runden)
 */
declare(strict_types=1);
require __DIR__ . '/_lib.php';

hcp_require_post();
$action = (string)($_GET['action'] ?? '');
$config = hcp_config();

if ($action === 'status') {
    if ($config === null) {
        hcp_json(['installed' => false, 'loggedIn' => false, 'csrf' => null, 'syncEnabled' => false]);
    }
    hcp_start_session($config);
    $loggedIn = hcp_is_admin();
    hcp_json([
        'installed' => true,
        'loggedIn' => $loggedIn,
        'csrf' => $loggedIn ? $_SESSION['hcp_csrf'] : null,
        'role' => $loggedIn ? hcp_admin_role() : null,
        'syncEnabled' => !empty($config['syncEnabled']),
        'appVersion' => hcp_app_version(),
    ]);
}

$config = hcp_require_installed();
hcp_start_session($config);

switch ($action) {
    case 'login':
        if (hcp_rate_limited('login', 10, 900)) {
            hcp_error('Zu viele Fehlversuche – bitte 15 Minuten warten.', 429);
        }
        $body = hcp_body(10000);
        $password = (string)($body['password'] ?? '');
        $username = hcp_normalize_username((string)($body['username'] ?? ''));
        $editor = null;
        if ($username !== '') {
            // Benutzer mit der Rolle „Golfplatzpflege“
            $editor = hcp_find_user('username', $username);
            $ok = $editor !== null && !empty($editor['active']) && ($editor['role'] ?? '') === 'editor'
                && password_verify($password, (string)($editor['passwordHash'] ?? ''));
        } else {
            $ok = $password !== '' && password_verify($password, (string)($config['adminPasswordHash'] ?? ''));
        }
        if (!$ok) {
            hcp_rate_hit('login', 900);
            usleep(700000);
            hcp_error($username !== '' ? 'Benutzername oder Passwort falsch (oder keine Berechtigung für die Golfplatzpflege).' : 'Passwort falsch.', 401);
        }
        session_regenerate_id(true);
        $_SESSION['hcp_admin'] = true;
        $_SESSION['hcp_csrf'] = bin2hex(random_bytes(24));
        $_SESSION['hcp_expires'] = time() + 12 * 3600;
        if ($editor !== null) {
            $_SESSION['hcp_role'] = 'editor';
            $_SESSION['hcp_uid'] = $editor['id'];
            $_SESSION['hcp_pwv'] = (string)($editor['passwordChangedAt'] ?? '');
        } else {
            $_SESSION['hcp_role'] = 'owner';
            unset($_SESSION['hcp_uid'], $_SESSION['hcp_pwv']);
            if (password_needs_rehash((string)$config['adminPasswordHash'], PASSWORD_DEFAULT)) {
                $config['adminPasswordHash'] = password_hash($password, PASSWORD_DEFAULT);
                hcp_save_config($config);
            }
        }
        hcp_json(['ok' => true, 'csrf' => $_SESSION['hcp_csrf'], 'role' => hcp_admin_role()]);
        break;

    case 'logout':
        $_SESSION = [];
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_destroy();
        }
        hcp_json(['ok' => true]);
        break;

    case 'load':
        hcp_require_admin();
        hcp_send_raw_json(hcp_dataset_json());
        break;

    case 'save':
        hcp_require_admin();
        $body = hcp_body();
        $base = $body['baseRevision'] ?? null;
        $dataset = $body['dataset'] ?? null;
        if (!is_int($base) || !is_array($dataset)) {
            hcp_error('Ungültige Anfrage', 400);
        }
        if (($dataset['format'] ?? '') !== 'golf-hcp-rechner/courses' || !isset($dataset['courses']) || !is_array($dataset['courses'])) {
            hcp_error('Ungültiger Datensatz', 400);
        }
        foreach ($dataset['courses'] as $course) {
            if (!is_array($course) || !isset($course['id'], $course['slug'], $course['name']) || !isset($course['layouts']) || !is_array($course['layouts'])) {
                hcp_error('Ungültiger Datensatz (Anlage ohne id/slug/name/layouts)', 400);
            }
        }
        $lockFile = hcp_data_dir() . '/courses.lock';
        $lock = fopen($lockFile, 'c');
        if ($lock === false || !flock($lock, LOCK_EX)) {
            hcp_error('Datensatz ist gesperrt – bitte erneut versuchen', 503);
        }
        $current = json_decode(hcp_dataset_json(), true);
        $currentRevision = is_array($current) && isset($current['revision']) ? (int)$current['revision'] : 0;
        if ($base !== $currentRevision) {
            flock($lock, LOCK_UN);
            hcp_json(['error' => 'Die Daten wurden zwischenzeitlich geändert.', 'revision' => $currentRevision], 409);
        }
        // Sicherung der bisherigen Fassung (die letzten HCP_BACKUPS Versionen)
        $existing = hcp_read_guarded(hcp_courses_file());
        if ($existing !== null && $existing !== '') {
            $backupDir = hcp_data_dir() . '/backups';
            hcp_write_guarded($backupDir . '/courses-r' . $currentRevision . '-' . date('Ymd-His') . '.php', $existing);
            $backups = glob($backupDir . '/courses-r*.php') ?: [];
            usort($backups, function ($a, $b) {
                return filemtime($b) <=> filemtime($a);
            });
            foreach (array_slice($backups, HCP_BACKUPS) as $old) {
                @unlink($old);
            }
        }
        $dataset['revision'] = $currentRevision + 1;
        $dataset['updatedAt'] = gmdate('Y-m-d\TH:i:s\Z');
        $json = json_encode($dataset, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            flock($lock, LOCK_UN);
            hcp_error('Datensatz kann nicht gespeichert werden', 400);
        }
        hcp_write_guarded(hcp_courses_file(), $json);
        flock($lock, LOCK_UN);
        fclose($lock);
        hcp_json(['ok' => true, 'revision' => $dataset['revision'], 'updatedAt' => $dataset['updatedAt']]);
        break;

    case 'password':
        hcp_require_owner();
        $body = hcp_body(10000);
        $current = (string)($body['current'] ?? '');
        $next = (string)($body['next'] ?? '');
        if (!password_verify($current, (string)($config['adminPasswordHash'] ?? ''))) {
            hcp_error('Aktuelles Passwort falsch.', 400);
        }
        if (strlen($next) < 8) {
            hcp_error('Das neue Passwort muss mindestens 8 Zeichen lang sein.', 400);
        }
        $config['adminPasswordHash'] = password_hash($next, PASSWORD_DEFAULT);
        hcp_save_config($config);
        hcp_json(['ok' => true]);
        break;

    case 'users':
        hcp_require_owner();
        $list = [];
        foreach (hcp_load_users() as $u) {
            $stored = hcp_load_user_data((string)$u['id']);
            $rounds = is_array($stored['data']) && isset($stored['data']['rounds']) && is_array($stored['data']['rounds']) ? count($stored['data']['rounds']) : 0;
            $list[] = admin_user_view($u, $rounds, $stored['updatedAt']);
        }
        usort($list, function ($a, $b) {
            return strcmp($a['username'], $b['username']);
        });
        hcp_json(['users' => $list]);
        break;

    case 'user-create':
        hcp_require_owner();
        $body = hcp_body(10000);
        $username = hcp_normalize_username((string)($body['username'] ?? ''));
        hcp_check_username($username);
        $displayName = hcp_check_display_name((string)($body['displayName'] ?? ''));
        $password = (string)($body['password'] ?? '');
        hcp_check_password($password);
        $role = ($body['role'] ?? 'player') === 'editor' ? 'editor' : 'player';
        $created = hcp_with_users(function (array &$users) use ($username, $displayName, $password, $role) {
            foreach ($users as $u) {
                if ($u['username'] === $username) {
                    hcp_error('Der Benutzername „' . $username . '“ ist bereits vergeben.', 409);
                }
            }
            if (count($users) >= 2000) {
                hcp_error('Zu viele Benutzer', 400);
            }
            $now = gmdate('Y-m-d\TH:i:s\Z');
            $user = [
                'id' => hcp_new_id(),
                'username' => $username,
                'displayName' => $displayName,
                'role' => $role,
                'active' => true,
                'mustChangePassword' => true,
                'passwordHash' => password_hash($password, PASSWORD_DEFAULT),
                'passwordChangedAt' => $now,
                'createdAt' => $now,
                'updatedAt' => $now,
                'lastLoginAt' => null,
            ];
            $users[] = $user;
            return $user;
        });
        hcp_json(['user' => admin_user_view($created, 0, null)], 201);
        break;

    case 'user-update':
        hcp_require_owner();
        $body = hcp_body(10000);
        $id = (string)($body['id'] ?? '');
        $updated = hcp_with_users(function (array &$users) use ($id, $body) {
            foreach ($users as &$u) {
                if ($u['id'] !== $id) {
                    continue;
                }
                if (array_key_exists('displayName', $body)) {
                    $u['displayName'] = hcp_check_display_name((string)$body['displayName']);
                }
                if (array_key_exists('role', $body)) {
                    $u['role'] = $body['role'] === 'editor' ? 'editor' : 'player';
                }
                if (array_key_exists('active', $body)) {
                    $u['active'] = (bool)$body['active'];
                }
                $u['updatedAt'] = gmdate('Y-m-d\TH:i:s\Z');
                return $u;
            }
            hcp_error('Benutzer nicht gefunden', 404);
        });
        $stored = hcp_load_user_data((string)$updated['id']);
        $rounds = is_array($stored['data']) && isset($stored['data']['rounds']) && is_array($stored['data']['rounds']) ? count($stored['data']['rounds']) : 0;
        hcp_json(['user' => admin_user_view($updated, $rounds, $stored['updatedAt'])]);
        break;

    case 'user-password':
        hcp_require_owner();
        $body = hcp_body(10000);
        $id = (string)($body['id'] ?? '');
        $password = (string)($body['password'] ?? '');
        hcp_check_password($password);
        hcp_with_users(function (array &$users) use ($id, $password) {
            foreach ($users as &$u) {
                if ($u['id'] === $id) {
                    $now = gmdate('Y-m-d\TH:i:s\Z');
                    $u['passwordHash'] = password_hash($password, PASSWORD_DEFAULT);
                    $u['mustChangePassword'] = true;
                    $u['passwordChangedAt'] = $now; // meldet alle Geräte des Benutzers ab
                    $u['updatedAt'] = $now;
                    return true;
                }
            }
            hcp_error('Benutzer nicht gefunden', 404);
        });
        hcp_json(['ok' => true]);
        break;

    case 'user-delete':
        hcp_require_owner();
        $body = hcp_body(10000);
        $id = (string)($body['id'] ?? '');
        hcp_with_users(function (array &$users) use ($id) {
            $before = count($users);
            $users = array_values(array_filter($users, function ($u) use ($id) {
                return $u['id'] !== $id;
            }));
            if (count($users) === $before) {
                hcp_error('Benutzer nicht gefunden', 404);
            }
            return true;
        });
        $file = hcp_user_data_file($id);
        @unlink($file);
        @unlink($file . '.lock');
        hcp_json(['ok' => true]);
        break;

    default:
        hcp_error('Unbekannte Aktion', 400);
}

function admin_user_view(array $u, int $rounds, $dataUpdatedAt): array
{
    return hcp_user_public($u) + [
        'active' => !empty($u['active']),
        'createdAt' => (string)($u['createdAt'] ?? ''),
        'lastLoginAt' => $u['lastLoginAt'] ?? null,
        'dataUpdatedAt' => $dataUpdatedAt,
        'rounds' => $rounds,
    ];
}
