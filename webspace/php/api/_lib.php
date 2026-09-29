<?php
/**
 * Golf HCP Rechner – WHS 2026 · Webspace-Edition · Backend-Bibliothek (PHP >= 7.4, keine Datenbank nötig)
 *
 * - Daten liegen in data/ als „geschützte“ Dateien: Die erste Zeile `<?php exit; ?>` verhindert den Abruf
 *   über den Browser – auch wenn der Webserver .htaccess ignoriert.
 * - Anmeldung über ein signiertes HttpOnly-Cookie; Rolle, Status und Passwortstand werden bei jeder Anfrage
 *   aus data/users.php geprüft (serverseitige Autorisierung).
 * - Fehler im Format { error: CODE, message, fields? } (siehe src/lib/api/errors.ts).
 */

declare(strict_types=1);

const HCP_GUARD = "<?php exit; ?>\n";
const HCP_MAX_BODY = 12 * 1024 * 1024;
const HCP_BACKUPS = 10;
const HCP_SESSION_DAYS = 14;
const HCP_USER_DATA_MAX = 5 * 1024 * 1024;
const HCP_EMAIL_PATTERN = '/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/';
const HCP_PASSWORD_MIN = 8;

/** Rollen → Berechtigungen (identisch zu src/lib/auth/permissions.ts). */
function hcp_role_permissions(): array
{
    $support = ['admin.access', 'users.read', 'rounds.read', 'courses.read', 'logs.read', 'system.read', 'rules.read'];
    $admin = array_merge($support, ['users.write', 'users.impersonate', 'courses.write', 'import']);
    $super = array_merge($admin, ['users.roles', 'users.delete', 'settings.write']);
    return ['USER' => [], 'SUPPORT' => $support, 'ADMIN' => $admin, 'SUPER_ADMIN' => $super];
}

function hcp_role_rank(string $role): int
{
    $ranks = ['USER' => 0, 'SUPPORT' => 1, 'ADMIN' => 2, 'SUPER_ADMIN' => 3];
    return $ranks[$role] ?? 0;
}

function hcp_can(?array $user, string $permission): bool
{
    if ($user === null) {
        return false;
    }
    $map = hcp_role_permissions();
    return in_array($permission, $map[$user['role']] ?? [], true);
}

// ---------------------------------------------------------------------------
// Antworten, Anfragen
// ---------------------------------------------------------------------------

function hcp_root(): string
{
    return dirname(__DIR__);
}

function hcp_data_dir(): string
{
    return hcp_root() . '/data';
}

function hcp_json($data, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/** Strukturierter Fehler (Code aus src/lib/api/errors.ts). */
function hcp_fail(string $code, string $message = '', int $status = 0, ?array $fields = null): void
{
    $defaults = [
        'UNAUTHENTICATED' => 401, 'SESSION_EXPIRED' => 401, 'INVALID_CREDENTIALS' => 401, 'FORBIDDEN' => 403,
        'EMAIL_NOT_VERIFIED' => 403, 'ACCOUNT_DISABLED' => 403, 'ACCOUNT_LOCKED' => 403, 'REGISTRATION_CLOSED' => 403,
        'NOT_FOUND' => 404, 'ROUND_NOT_FOUND' => 404, 'CONFLICT' => 409, 'EMAIL_TAKEN' => 409, 'RATE_LIMITED' => 429,
        'SERVER' => 500,
    ];
    $body = ['error' => $code];
    if ($message !== '') {
        $body['message'] = $message;
    }
    if ($fields) {
        $body['fields'] = $fields;
    }
    if (($status ?: ($defaults[$code] ?? 400)) >= 500) {
        hcp_log_error($code . ': ' . $message);
    }
    hcp_json($body, $status ?: ($defaults[$code] ?? 400));
}

/** Kompatibilität (courses.php/sitemap.php der ersten Version). */
function hcp_error(string $message, int $status): void
{
    hcp_fail($status === 404 ? 'NOT_FOUND' : ($status >= 500 ? 'SERVER' : 'VALIDATION'), $message, $status);
}

function hcp_body(int $max = HCP_MAX_BODY): array
{
    $raw = file_get_contents('php://input', false, null, 0, $max + 1);
    if ($raw === false || $raw === '') {
        return [];
    }
    if (strlen($raw) > $max) {
        hcp_fail('VALIDATION', 'Anfrage zu groß', 413);
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        hcp_fail('VALIDATION', 'Ungültiges JSON');
    }
    return $data;
}

function hcp_require_post(): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
        header('Allow: POST');
        hcp_fail('VALIDATION', 'Nur POST erlaubt', 405);
    }
}

function hcp_now(): string
{
    return gmdate('Y-m-d\TH:i:s\Z');
}

function hcp_new_id(): string
{
    return bin2hex(random_bytes(16));
}

function hcp_str(array $a, string $key, int $max = 500): string
{
    $v = isset($a[$key]) && (is_string($a[$key]) || is_numeric($a[$key])) ? trim((string)$a[$key]) : '';
    return mb_substr_safe($v, $max);
}

function mb_substr_safe(string $v, int $max): string
{
    return function_exists('mb_substr') ? mb_substr($v, 0, $max, 'UTF-8') : substr($v, 0, $max);
}

function hcp_len(string $v): int
{
    return function_exists('mb_strlen') ? mb_strlen($v, 'UTF-8') : strlen($v);
}

// ---------------------------------------------------------------------------
// Geschützte Dateien
// ---------------------------------------------------------------------------

function hcp_read_guarded(string $file): ?string
{
    if (!is_file($file)) {
        return null;
    }
    $content = file_get_contents($file);
    if ($content === false) {
        return null;
    }
    if (strncmp($content, HCP_GUARD, strlen(HCP_GUARD)) === 0) {
        $content = substr($content, strlen(HCP_GUARD));
    }
    return $content;
}

function hcp_write_guarded(string $file, string $content): void
{
    $dir = dirname($file);
    if (!is_dir($dir) && !@mkdir($dir, 0755, true)) {
        hcp_fail('SERVER', 'Ordner ' . basename($dir) . ' kann nicht angelegt werden (Schreibrechte prüfen)');
    }
    $tmp = $file . '.' . bin2hex(random_bytes(4)) . '.tmp';
    if (file_put_contents($tmp, HCP_GUARD . $content, LOCK_EX) === false) {
        hcp_fail('SERVER', 'Speichern fehlgeschlagen (Schreibrechte für den Ordner data prüfen)');
    }
    @chmod($tmp, 0644);
    if (!@rename($tmp, $file)) {
        @unlink($file);
        if (!@rename($tmp, $file)) {
            @unlink($tmp);
            hcp_fail('SERVER', 'Speichern fehlgeschlagen');
        }
    }
}

function hcp_read_json_file(string $file): ?array
{
    $raw = hcp_read_guarded($file);
    if ($raw === null || $raw === '') {
        return null;
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : null;
}

function hcp_write_json_file(string $file, array $data, bool $pretty = false): void
{
    $flags = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | ($pretty ? JSON_PRETTY_PRINT : 0);
    $json = json_encode($data, $flags);
    if ($json === false) {
        hcp_fail('SERVER', 'Daten können nicht gespeichert werden');
    }
    hcp_write_guarded($file, $json);
}

/** Exklusive Sperre für Lese-Ändern-Schreib-Vorgänge. */
function hcp_lock(string $name)
{
    $dir = hcp_data_dir() . '/locks';
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    $lock = @fopen($dir . '/' . preg_replace('/[^a-z0-9_-]/i', '', $name) . '.lock', 'c');
    if ($lock === false || !flock($lock, LOCK_EX)) {
        hcp_fail('SERVER', 'Daten gesperrt – bitte erneut versuchen', 503);
    }
    return $lock;
}

function hcp_unlock($lock): void
{
    if (is_resource($lock)) {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}

/** JSON-Zeilen an eine geschützte Protokolldatei anhängen (Audit, Fehler, Mail). */
function hcp_append_line(string $file, array $entry): void
{
    $dir = dirname($file);
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    $new = !is_file($file);
    $fh = @fopen($file, 'a');
    if ($fh === false) {
        return;
    }
    flock($fh, LOCK_EX);
    if ($new) {
        fwrite($fh, HCP_GUARD);
    }
    fwrite($fh, json_encode($entry, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n");
    flock($fh, LOCK_UN);
    fclose($fh);
}

/** Zeilen eines Protokolls (älteste zuerst). */
function hcp_read_lines(string $file): array
{
    $raw = hcp_read_guarded($file);
    if ($raw === null) {
        return [];
    }
    $out = [];
    foreach (explode("\n", $raw) as $line) {
        if ($line === '') {
            continue;
        }
        $e = json_decode($line, true);
        if (is_array($e)) {
            $out[] = $e;
        }
    }
    return $out;
}

// ---------------------------------------------------------------------------
// Konfiguration und Einstellungen
// ---------------------------------------------------------------------------

function hcp_config_file(): string
{
    return hcp_data_dir() . '/config.php';
}

function hcp_config(): ?array
{
    return hcp_read_json_file(hcp_config_file());
}

function hcp_save_config(array $config): void
{
    hcp_write_json_file(hcp_config_file(), $config, true);
}

function hcp_require_installed(): array
{
    $config = hcp_config();
    if ($config === null) {
        hcp_fail('SERVER', 'Die Anwendung ist noch nicht installiert. Bitte install.php aufrufen.', 503);
    }
    return $config;
}

function hcp_secret(array &$config): string
{
    if (empty($config['secret']) || !is_string($config['secret'])) {
        $config['secret'] = bin2hex(random_bytes(32));
        hcp_save_config($config);
    }
    return $config['secret'];
}

function hcp_default_settings(): array
{
    return [
        'siteName' => 'Golf HCP Rechner',
        'registrationOpen' => true,
        'emailVerificationRequired' => true,
        'imprintText' => null,
        'privacyText' => null,
        'contactEmail' => null,
        'mailFrom' => null,
    ];
}

function hcp_settings(): array
{
    $stored = hcp_read_json_file(hcp_data_dir() . '/settings.php') ?? [];
    return array_merge(hcp_default_settings(), array_intersect_key($stored, hcp_default_settings()));
}

function hcp_save_settings(array $settings): void
{
    hcp_write_json_file(hcp_data_dir() . '/settings.php', array_intersect_key(array_merge(hcp_settings(), $settings), hcp_default_settings()), true);
}

function hcp_public_settings(): array
{
    $s = hcp_settings();
    unset($s['mailFrom']);
    return $s;
}

function hcp_is_https(): bool
{
    if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
        return true;
    }
    return strtolower((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
}

/** Öffentliche Adresse der Anwendung (bei der Installation gespeichert – nicht aus dem Host-Header). */
function hcp_site_url(array $config): string
{
    if (!empty($config['siteUrl'])) {
        return rtrim((string)$config['siteUrl'], '/');
    }
    $host = preg_replace('/[^A-Za-z0-9.:\-\[\]]/', '', (string)($_SERVER['HTTP_HOST'] ?? 'localhost'));
    return (hcp_is_https() ? 'https' : 'http') . '://' . $host . (string)($config['basePath'] ?? '');
}

function hcp_app_version(): string
{
    $file = hcp_root() . '/version.txt';
    return is_file($file) ? trim((string)file_get_contents($file)) : '';
}

// ---------------------------------------------------------------------------
// Protokolle
// ---------------------------------------------------------------------------

function hcp_log_error(string $message): void
{
    hcp_append_line(hcp_data_dir() . '/logs/errors-' . gmdate('Y-m') . '.php', ['timestamp' => hcp_now(), 'message' => mb_substr_safe($message, 500)]);
}

/**
 * Audit-Log: timestamp, action, actorId/actorName, userId (betroffener Benutzer), entityType, entityId, oldValue, newValue.
 */
function hcp_audit(string $action, ?array $actor, array $data = []): void
{
    hcp_append_line(hcp_data_dir() . '/audit/' . gmdate('Y-m') . '.php', [
        'id' => bin2hex(random_bytes(8)),
        'timestamp' => hcp_now(),
        'action' => $action,
        'actorId' => $actor['id'] ?? null,
        'actorName' => $actor ? trim(($actor['firstName'] ?? '') . ' ' . ($actor['lastName'] ?? '')) : null,
        'userId' => $data['userId'] ?? null,
        'entityType' => $data['entityType'] ?? null,
        'entityId' => $data['entityId'] ?? null,
        'oldValue' => $data['oldValue'] ?? null,
        'newValue' => $data['newValue'] ?? null,
    ]);
}

/** Audit-Einträge, neueste zuerst (über Monatsdateien). */
function hcp_audit_entries(int $limit = 500, ?callable $filter = null, int $offset = 0, int &$total = 0): array
{
    $files = glob(hcp_data_dir() . '/audit/*.php') ?: [];
    rsort($files);
    $out = [];
    $total = 0;
    foreach ($files as $file) {
        $lines = array_reverse(hcp_read_lines($file));
        foreach ($lines as $e) {
            if ($filter !== null && !$filter($e)) {
                continue;
            }
            if ($total >= $offset && count($out) < $limit) {
                $out[] = $e;
            }
            $total++;
        }
        if ($total > 20000) {
            break;
        }
    }
    return $out;
}

// ---------------------------------------------------------------------------
// Rate Limiting
// ---------------------------------------------------------------------------

function hcp_rate_file(string $bucket, string $key): string
{
    return hcp_data_dir() . '/ratelimit/' . preg_replace('/[^a-z0-9-]/i', '', $bucket) . '-' . hash('sha256', $key) . '.php';
}

function hcp_rate_entries(string $bucket, string $key, int $window): array
{
    $raw = hcp_read_json_file(hcp_rate_file($bucket, $key)) ?? [];
    return array_values(array_filter($raw, function ($t) use ($window) {
        return is_int($t) && $t > time() - $window;
    }));
}

function hcp_rate_limited(string $bucket, int $max, int $window, ?string $key = null): bool
{
    return count(hcp_rate_entries($bucket, $key ?? (string)($_SERVER['REMOTE_ADDR'] ?? ''), $window)) >= $max;
}

function hcp_rate_hit(string $bucket, int $window, ?string $key = null): void
{
    $key = $key ?? (string)($_SERVER['REMOTE_ADDR'] ?? '');
    $entries = hcp_rate_entries($bucket, $key, $window);
    $entries[] = time();
    hcp_write_json_file(hcp_rate_file($bucket, $key), $entries);
}

// ---------------------------------------------------------------------------
// Benutzer
// ---------------------------------------------------------------------------

function hcp_users_file(): string
{
    return hcp_data_dir() . '/users.php';
}

/** Ältere Konten (Version 1: Benutzername, Rolle player/editor) auf das aktuelle Schema heben. */
function hcp_normalize_user(array $u): array
{
    if (!isset($u['firstName'])) {
        $parts = preg_split('/\s+/', trim((string)($u['displayName'] ?? $u['username'] ?? '')), 2);
        $u['firstName'] = $parts[0] ?? '';
        $u['lastName'] = $parts[1] ?? '';
    }
    $role = (string)($u['role'] ?? 'USER');
    if ($role === 'player') {
        $role = 'USER';
    } elseif ($role === 'editor') {
        $role = 'ADMIN';
    }
    $u['role'] = in_array($role, ['USER', 'SUPPORT', 'ADMIN', 'SUPER_ADMIN'], true) ? $role : 'USER';
    if (!isset($u['status'])) {
        $u['status'] = array_key_exists('active', $u) && !$u['active'] ? 'DISABLED' : 'ACTIVE';
    }
    unset($u['active'], $u['displayName']);
    $u['email'] = isset($u['email']) && $u['email'] !== '' ? strtolower((string)$u['email']) : null;
    $u['username'] = $u['username'] ?? null;
    if (!array_key_exists('emailVerified', $u)) {
        $u['emailVerified'] = true; // vom Admin angelegte Konten der Version 1
    }
    $u['mustChangePassword'] = !empty($u['mustChangePassword']);
    foreach (['lastLoginAt', 'lastActivityAt', 'verifyTokenHash', 'verifyExpires', 'resetTokenHash', 'resetExpires', 'emailVerifiedAt', 'pendingEmail'] as $k) {
        $u[$k] = $u[$k] ?? null;
    }
    return $u;
}

function hcp_load_users(): array
{
    $data = hcp_read_json_file(hcp_users_file());
    $list = is_array($data) && isset($data['users']) && is_array($data['users']) ? $data['users'] : [];
    return array_values(array_map('hcp_normalize_user', $list));
}

function hcp_save_users(array $users): void
{
    hcp_write_json_file(hcp_users_file(), ['schema' => 2, 'users' => array_values($users)], true);
}

function hcp_find_user(string $field, string $value): ?array
{
    if ($value === '') {
        return null;
    }
    foreach (hcp_load_users() as $u) {
        if (isset($u[$field]) && (string)$u[$field] === $value) {
            return $u;
        }
    }
    return null;
}

/** Änderung an users.php unter Sperre. $fn erhält die Liste per Referenz. */
function hcp_with_users(callable $fn)
{
    $lock = hcp_lock('users');
    try {
        $users = hcp_load_users();
        $result = $fn($users);
        hcp_save_users($users);
        return $result;
    } finally {
        hcp_unlock($lock);
    }
}

function hcp_update_user(string $id, callable $mutate): array
{
    return hcp_with_users(function (array &$users) use ($id, $mutate) {
        foreach ($users as &$u) {
            if ($u['id'] === $id) {
                $mutate($u);
                $u['updatedAt'] = hcp_now();
                return $u;
            }
        }
        hcp_fail('NOT_FOUND', 'Benutzer nicht gefunden');
    });
}

function hcp_check_email(string $email): string
{
    $email = strtolower(trim($email));
    if (strlen($email) > 200 || !preg_match(HCP_EMAIL_PATTERN, $email)) {
        hcp_fail('VALIDATION', 'Bitte eine gültige E-Mail-Adresse eingeben.', 0, ['email' => 'Bitte eine gültige E-Mail-Adresse eingeben.']);
    }
    return $email;
}

function hcp_check_password(string $password, string $field = 'password'): void
{
    if (strlen($password) < HCP_PASSWORD_MIN || strlen($password) > 200) {
        hcp_fail('VALIDATION', 'Mindestens ' . HCP_PASSWORD_MIN . ' Zeichen.', 0, [$field => 'Mindestens ' . HCP_PASSWORD_MIN . ' Zeichen.']);
    }
}

function hcp_check_name(string $name, string $field): string
{
    $name = trim($name);
    $len = hcp_len($name);
    if ($len === 0 || $len > 60) {
        hcp_fail('VALIDATION', 'Bitte einen Namen angeben.', 0, [$field => $len === 0 ? 'Bitte ausfüllen.' : 'Zu lang.']);
    }
    return $name;
}

// ---------------------------------------------------------------------------
// Sitzung (signiertes Cookie)
// ---------------------------------------------------------------------------

function hcp_b64url(string $data): string
{
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function hcp_b64url_decode(string $data): string
{
    $decoded = base64_decode(strtr($data, '-_', '+/'), true);
    return $decoded === false ? '' : $decoded;
}

function hcp_cookie_params(array $config, int $expires): array
{
    $base = (string)($config['basePath'] ?? '');
    return ['expires' => $expires, 'path' => ($base === '' ? '' : $base) . '/', 'secure' => hcp_is_https(), 'httponly' => true, 'samesite' => 'Lax'];
}

function hcp_issue_session(array &$config, array $user): string
{
    $exp = time() + HCP_SESSION_DAYS * 86400;
    $payload = hcp_b64url(json_encode(['uid' => $user['id'], 'pwv' => (string)($user['passwordChangedAt'] ?? ''), 'iat' => time(), 'exp' => $exp]));
    $sig = hcp_b64url(hash_hmac('sha256', 'session|' . $payload, hcp_secret($config), true));
    setcookie('hcp_session', $payload . '.' . $sig, hcp_cookie_params($config, $exp));
    return hcp_csrf_token($config, $user);
}

function hcp_clear_session(array $config): void
{
    setcookie('hcp_session', '', hcp_cookie_params($config, time() - 3600));
    setcookie('hcp_user', '', hcp_cookie_params($config, time() - 3600)); // Cookie der Version 1
}

function hcp_csrf_token(array &$config, array $user): string
{
    return hash_hmac('sha256', 'csrf|' . $user['id'] . '|' . (string)($user['passwordChangedAt'] ?? ''), hcp_secret($config));
}

/** Angemeldeter Benutzer oder null (Signatur, Ablauf, Status, Passwortstand). */
function hcp_session_user(array &$config, ?string &$reason = null): ?array
{
    $cookie = (string)($_COOKIE['hcp_session'] ?? '');
    $parts = explode('.', $cookie);
    if (count($parts) !== 2) {
        $reason = 'none';
        return null;
    }
    $expected = hcp_b64url(hash_hmac('sha256', 'session|' . $parts[0], hcp_secret($config), true));
    if (!hash_equals($expected, $parts[1])) {
        $reason = 'invalid';
        return null;
    }
    $payload = json_decode(hcp_b64url_decode($parts[0]), true);
    if (!is_array($payload) || !isset($payload['uid'], $payload['exp'])) {
        $reason = 'invalid';
        return null;
    }
    if ((int)$payload['exp'] < time()) {
        $reason = 'expired';
        return null;
    }
    $user = hcp_find_user('id', (string)$payload['uid']);
    if ($user === null || (string)$user['passwordChangedAt'] !== (string)($payload['pwv'] ?? '')) {
        $reason = 'expired';
        return null;
    }
    if ($user['status'] !== 'ACTIVE') {
        $reason = $user['status'] === 'LOCKED' ? 'locked' : 'disabled';
        return null;
    }
    // Gleitende Sitzung: Cookie täglich erneuern; letzte Aktivität höchstens stündlich speichern
    if ((int)($payload['iat'] ?? 0) < time() - 86400) {
        hcp_issue_session($config, $user);
    }
    if (empty($user['lastActivityAt']) || strtotime((string)$user['lastActivityAt']) < time() - 3600) {
        hcp_update_user($user['id'], function (array &$u) {
            $u['lastActivityAt'] = hcp_now();
        });
    }
    return $user;
}

/** Für geschützte Aktionen: Anmeldung, bestätigte E-Mail und CSRF-Token (Header X-CSRF-Token). */
function hcp_require_user(array &$config, bool $checkCsrf = true): array
{
    $reason = null;
    $user = hcp_session_user($config, $reason);
    if ($user === null) {
        $codes = ['expired' => 'SESSION_EXPIRED', 'disabled' => 'ACCOUNT_DISABLED', 'locked' => 'ACCOUNT_LOCKED'];
        hcp_fail($codes[$reason] ?? 'UNAUTHENTICATED', '', $reason === 'disabled' || $reason === 'locked' ? 401 : 0);
    }
    if ($checkCsrf) {
        $token = (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
        if ($token === '' || !hash_equals(hcp_csrf_token($config, $user), $token)) {
            hcp_fail('SESSION_EXPIRED', 'Sicherheitstoken ungültig – bitte neu anmelden');
        }
    }
    return $user;
}

function hcp_require_permission(array &$config, string $permission, bool $checkCsrf = true): array
{
    $user = hcp_require_user($config, $checkCsrf);
    if (!hcp_can($user, $permission)) {
        hcp_fail('FORBIDDEN');
    }
    return $user;
}

function hcp_session_view(array &$config, array $user): array
{
    $doc = hcp_load_member_doc($user['id']);
    $map = hcp_role_permissions();
    return [
        'id' => $user['id'],
        'email' => $user['email'],
        'firstName' => $user['firstName'],
        'lastName' => $user['lastName'],
        'role' => $user['role'],
        'permissions' => $map[$user['role']] ?? [],
        'emailVerified' => (bool)$user['emailVerified'],
        'mustChangePassword' => (bool)$user['mustChangePassword'],
        'onboarded' => !empty($doc['data']['preferences']['onboardedAt']),
    ];
}

// ---------------------------------------------------------------------------
// Mitglieder-Dokument (Profil, Runden, Entwürfe, Vorlieben)
// ---------------------------------------------------------------------------

function hcp_member_file(string $id): string
{
    if (!preg_match('/^[a-f0-9]{32}$/', $id)) {
        hcp_fail('VALIDATION', 'Ungültige Benutzer-ID');
    }
    return hcp_data_dir() . '/userdata/' . $id . '.php';
}

/** ['data' => array|null, 'revision' => int, 'updatedAt' => ?string] */
function hcp_load_member_doc(string $id): array
{
    $stored = hcp_read_json_file(hcp_member_file($id));
    if ($stored === null) {
        return ['data' => null, 'revision' => 0, 'updatedAt' => null];
    }
    return ['data' => $stored['data'] ?? null, 'revision' => (int)($stored['revision'] ?? 0), 'updatedAt' => $stored['updatedAt'] ?? null];
}

function hcp_default_member_doc(string $id, float $startHcp = 54.0): array
{
    return [
        'profile' => ['id' => $id, 'gender' => 'M', 'startHandicapIndex' => $startHcp, 'startDate' => null, 'brake265LiftedAt' => null, 'ruleSet' => ['country' => 'DE', 'version' => '2026']],
        'rounds' => [],
        'drafts' => [],
        'preferences' => ['favorites' => [], 'homeCourseId' => null, 'onboardedAt' => null],
    ];
}

/** Dokument unter Sperre ändern; $fn erhält das Dokument per Referenz und die aktuelle Revision. */
function hcp_with_member_doc(string $id, callable $fn): array
{
    $lock = hcp_lock('member-' . $id);
    try {
        $current = hcp_load_member_doc($id);
        $doc = is_array($current['data']) ? $current['data'] : hcp_default_member_doc($id);
        foreach (['rounds', 'drafts'] as $k) {
            if (!isset($doc[$k]) || !is_array($doc[$k])) {
                $doc[$k] = [];
            }
        }
        if (!isset($doc['preferences']) || !is_array($doc['preferences'])) {
            $doc['preferences'] = ['favorites' => [], 'homeCourseId' => null, 'onboardedAt' => null];
        }
        $result = $fn($doc, $current['revision']);
        $record = ['data' => $doc, 'revision' => $current['revision'] + 1, 'updatedAt' => hcp_now()];
        $json = json_encode($record, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($json === false || strlen($json) > HCP_USER_DATA_MAX) {
            hcp_fail('VALIDATION', 'Datenmenge zu groß');
        }
        hcp_write_guarded(hcp_member_file($id), $json);
        return ['result' => $result, 'revision' => $record['revision'], 'updatedAt' => $record['updatedAt']];
    } finally {
        hcp_unlock($lock);
    }
}

function hcp_member_round_count(string $id): int
{
    $doc = hcp_load_member_doc($id);
    $n = 0;
    foreach (($doc['data']['rounds'] ?? []) as $r) {
        if (($r['status'] ?? 'COMPLETED') !== 'DELETED') {
            $n++;
        }
    }
    return $n;
}

// ---------------------------------------------------------------------------
// Golfplatz-Datensatz
// ---------------------------------------------------------------------------

function hcp_courses_file(): string
{
    return hcp_data_dir() . '/courses.php';
}

function hcp_empty_dataset(): array
{
    return ['format' => 'golf-hcp-rechner/courses', 'schemaVersion' => 1, 'revision' => 0, 'updatedAt' => null, 'courses' => [], 'changes' => [], 'importRuns' => []];
}

function hcp_dataset_json(): string
{
    $raw = hcp_read_guarded(hcp_courses_file());
    if ($raw !== null && $raw !== '') {
        return $raw;
    }
    $seed = hcp_root() . '/golfplaetze-daten.json';
    if (is_file($seed)) {
        $content = file_get_contents($seed);
        if ($content !== false && $content !== '') {
            return $content;
        }
    }
    return json_encode(hcp_empty_dataset());
}

function hcp_dataset(): array
{
    $data = json_decode(hcp_dataset_json(), true);
    return is_array($data) ? $data : hcp_empty_dataset();
}

function hcp_send_raw_json(string $json): void
{
    $etag = '"' . md5($json) . '"';
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-cache');
    header('X-Content-Type-Options: nosniff');
    header('ETag: ' . $etag);
    if (trim((string)($_SERVER['HTTP_IF_NONE_MATCH'] ?? '')) === $etag) {
        http_response_code(304);
        exit;
    }
    echo $json;
    exit;
}

// ---------------------------------------------------------------------------
// E-Mail (PHP mail(), SMTP oder Testmodus „Outbox“)
// ---------------------------------------------------------------------------

function hcp_mail_mode(array $config): string
{
    $mode = (string)($config['mail']['mode'] ?? 'mail');
    return in_array($mode, ['mail', 'smtp', 'outbox', 'off'], true) ? $mode : 'mail';
}

function hcp_send_mail(array $config, string $to, string $subject, string $text): bool
{
    $settings = hcp_settings();
    $from = (string)($settings['mailFrom'] ?? ($config['mail']['from'] ?? ''));
    if ($from === '') {
        $host = parse_url(hcp_site_url($config), PHP_URL_HOST) ?: 'localhost';
        $from = 'noreply@' . preg_replace('/^www\./', '', (string)$host);
    }
    $siteName = (string)$settings['siteName'];
    $mode = hcp_mail_mode($config);
    $ok = false;
    $error = '';
    if ($mode === 'outbox') {
        hcp_write_json_file(hcp_data_dir() . '/mail-outbox/' . gmdate('Ymd-His') . '-' . bin2hex(random_bytes(3)) . '.php', ['to' => $to, 'subject' => $subject, 'text' => $text, 'timestamp' => hcp_now()]);
        $ok = true;
    } elseif ($mode === 'smtp') {
        $ok = hcp_smtp_send($config['mail'] ?? [], $from, $siteName, $to, $subject, $text, $error);
    } elseif ($mode === 'mail') {
        $headers = 'From: =?UTF-8?B?' . base64_encode($siteName) . '?= <' . $from . ">\r\n"
            . "MIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n";
        $ok = @mail($to, '=?UTF-8?B?' . base64_encode($subject) . '?=', $text, $headers, '-f' . $from);
        if (!$ok) {
            $error = 'mail() fehlgeschlagen';
        }
    }
    hcp_append_line(hcp_data_dir() . '/logs/mail-' . gmdate('Y-m') . '.php', ['timestamp' => hcp_now(), 'to' => $to, 'subject' => $subject, 'status' => $ok ? 'OK' : ($mode === 'off' ? 'AUS' : 'FEHLER ' . $error)]);
    return $ok;
}

/** Schlanker SMTP-Client (SSL/TLS oder STARTTLS, AUTH LOGIN). */
function hcp_smtp_send(array $smtp, string $from, string $fromName, string $to, string $subject, string $text, string &$error): bool
{
    $host = (string)($smtp['host'] ?? '');
    $port = (int)($smtp['port'] ?? 587);
    $secure = (string)($smtp['secure'] ?? 'tls');
    if ($host === '') {
        $error = 'SMTP-Server fehlt';
        return false;
    }
    $remote = ($secure === 'ssl' ? 'ssl://' : '') . $host . ':' . $port;
    $fp = @stream_socket_client($remote, $errno, $errstr, 15, STREAM_CLIENT_CONNECT, stream_context_create(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true]]));
    if (!$fp) {
        $error = "Verbindung: $errstr";
        return false;
    }
    stream_set_timeout($fp, 15);
    $read = function () use ($fp) {
        $data = '';
        while (($line = fgets($fp, 515)) !== false) {
            $data .= $line;
            if (strlen($line) < 4 || $line[3] === ' ') {
                break;
            }
        }
        return $data;
    };
    $cmd = function (string $c, array $expect) use ($fp, $read, &$error) {
        if ($c !== '') {
            fwrite($fp, $c . "\r\n");
        }
        $resp = $read();
        if (!in_array((int)substr($resp, 0, 3), $expect, true)) {
            $error = trim($resp);
            return false;
        }
        return true;
    };
    $name = parse_url('http://' . ($_SERVER['HTTP_HOST'] ?? 'localhost'), PHP_URL_HOST) ?: 'localhost';
    $ok = $cmd('', [220]) && $cmd('EHLO ' . $name, [250]);
    if ($ok && $secure === 'tls') {
        $ok = $cmd('STARTTLS', [220]) && stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT) && $cmd('EHLO ' . $name, [250]);
    }
    if ($ok && !empty($smtp['user'])) {
        $ok = $cmd('AUTH LOGIN', [334]) && $cmd(base64_encode((string)$smtp['user']), [334]) && $cmd(base64_encode((string)($smtp['pass'] ?? '')), [235]);
    }
    $ok = $ok && $cmd('MAIL FROM:<' . $from . '>', [250]) && $cmd('RCPT TO:<' . $to . '>', [250, 251]) && $cmd('DATA', [354]);
    if ($ok) {
        $body = str_replace("\n.", "\n..", str_replace(["\r\n", "\r"], "\n", $text));
        $msg = 'From: =?UTF-8?B?' . base64_encode($fromName) . '?= <' . $from . ">\r\nTo: <" . $to . ">\r\nSubject: =?UTF-8?B?" . base64_encode($subject) . "?=\r\n"
            . 'Date: ' . date('r') . "\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n"
            . str_replace("\n", "\r\n", $body) . "\r\n.";
        $ok = $cmd($msg, [250]);
    }
    @fwrite($fp, "QUIT\r\n");
    fclose($fp);
    return $ok;
}

/** Einmal-Token: Klartext für den Link, gespeichert wird nur der Hash. */
function hcp_new_token(): array
{
    $token = hcp_b64url(random_bytes(24));
    return [$token, hash('sha256', $token)];
}

function hcp_send_verification(array &$config, array $user, string $token): bool
{
    $s = hcp_settings();
    $link = hcp_site_url($config) . '/verify-email/?token=' . rawurlencode($token);
    $text = "Hallo " . $user['firstName'] . ",\n\nbitte bestätige deine E-Mail-Adresse für " . $s['siteName'] . ":\n\n" . $link
        . "\n\nDer Link ist 48 Stunden gültig. Wenn du dich nicht registriert hast, kannst du diese E-Mail ignorieren.\n";
    return hcp_send_mail($config, (string)$user['email'], 'Bitte bestätige deine E-Mail-Adresse', $text);
}

function hcp_send_reset(array &$config, array $user, string $token, int $hours = 1): bool
{
    $s = hcp_settings();
    $link = hcp_site_url($config) . '/reset-password/?token=' . rawurlencode($token);
    $text = "Hallo " . $user['firstName'] . ",\n\nüber diesen Link kannst du ein neues Passwort für " . $s['siteName'] . " festlegen:\n\n" . $link
        . "\n\nDer Link ist " . ($hours === 1 ? '1 Stunde' : $hours . ' Stunden') . " gültig. Wenn du das nicht angefordert hast, ignoriere diese E-Mail – dein Passwort bleibt unverändert.\n";
    return hcp_send_mail($config, (string)$user['email'], 'Passwort zurücksetzen', $text);
}
