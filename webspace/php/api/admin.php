<?php
/**
 * Golf HCP Rechner – Admin-Endpunkt der Webspace-Edition.
 *
 * Aktionen (immer POST, ?action=…):
 *   status   – installiert? angemeldet? (liefert CSRF-Token der Sitzung)
 *   login    – { password }
 *   logout
 *   load     – kompletter Datensatz inkl. Änderungsprotokoll
 *   save     – { baseRevision, dataset }  → 409 bei zwischenzeitlicher Änderung
 *   password – { current, next }
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
        if ($password === '' || !password_verify($password, (string)($config['adminPasswordHash'] ?? ''))) {
            hcp_rate_hit('login', 900);
            usleep(700000);
            hcp_error('Passwort falsch.', 401);
        }
        session_regenerate_id(true);
        $_SESSION['hcp_admin'] = true;
        $_SESSION['hcp_csrf'] = bin2hex(random_bytes(24));
        $_SESSION['hcp_expires'] = time() + 12 * 3600;
        if (password_needs_rehash((string)$config['adminPasswordHash'], PASSWORD_DEFAULT)) {
            $config['adminPasswordHash'] = password_hash($password, PASSWORD_DEFAULT);
            hcp_save_config($config);
        }
        hcp_json(['ok' => true, 'csrf' => $_SESSION['hcp_csrf']]);
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
        hcp_require_admin();
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

    default:
        hcp_error('Unbekannte Aktion', 400);
}
