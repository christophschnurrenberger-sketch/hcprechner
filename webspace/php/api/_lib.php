<?php
/**
 * Golf HCP Rechner – WHS 2026 · Webspace-Edition
 * Gemeinsame Funktionen der PHP-Endpunkte (PHP >= 7.4, keine Datenbank nötig).
 *
 * Alle Daten liegen im Ordner data/ als "geschützte" PHP-Dateien: Die erste Zeile
 * `<?php exit; ?>` verhindert, dass der Inhalt über den Browser abrufbar ist – auch
 * wenn der Webserver .htaccess-Dateien ignoriert.
 */

declare(strict_types=1);

if (!defined('HCP_APP')) {
    define('HCP_APP', 'golf-hcp-rechner');
}

const HCP_GUARD = "<?php exit; ?>\n";
const HCP_MAX_BODY = 12 * 1024 * 1024; // 12 MB (CSV-Import, großer Datensatz)
const HCP_BACKUPS = 10;
const HCP_SYNC_MAX = 2 * 1024 * 1024; // 2 MB je Sync-Profil

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

function hcp_error(string $message, int $status): void
{
    hcp_json(['error' => $message], $status);
}

/** Liest den JSON-Body der Anfrage. */
function hcp_body(int $max = HCP_MAX_BODY): array
{
    $raw = file_get_contents('php://input', false, null, 0, $max + 1);
    if ($raw === false || $raw === '') {
        return [];
    }
    if (strlen($raw) > $max) {
        hcp_error('Anfrage zu groß', 413);
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        hcp_error('Ungültiges JSON', 400);
    }
    return $data;
}

function hcp_require_post(): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
        header('Allow: POST');
        hcp_error('Nur POST erlaubt', 405);
    }
}

/** Liest eine geschützte Datei (ohne Schutzzeile). */
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

/** Schreibt atomar (temporäre Datei + rename) mit Schutzzeile. */
function hcp_write_guarded(string $file, string $content): void
{
    $dir = dirname($file);
    if (!is_dir($dir) && !@mkdir($dir, 0755, true)) {
        hcp_error('Ordner ' . basename($dir) . ' kann nicht angelegt werden (Schreibrechte prüfen)', 500);
    }
    $tmp = $file . '.' . bin2hex(random_bytes(4)) . '.tmp';
    if (file_put_contents($tmp, HCP_GUARD . $content, LOCK_EX) === false) {
        hcp_error('Speichern fehlgeschlagen (Schreibrechte für den Ordner data prüfen)', 500);
    }
    @chmod($tmp, 0644);
    if (!@rename($tmp, $file)) {
        // Windows/einige Dateisysteme: Ziel zuerst entfernen
        @unlink($file);
        if (!@rename($tmp, $file)) {
            @unlink($tmp);
            hcp_error('Speichern fehlgeschlagen', 500);
        }
    }
}

function hcp_config_file(): string
{
    return hcp_data_dir() . '/config.php';
}

/** Konfiguration (von install.php angelegt) oder null, wenn nicht installiert. */
function hcp_config(): ?array
{
    $raw = hcp_read_guarded(hcp_config_file());
    if ($raw === null) {
        return null;
    }
    $config = json_decode($raw, true);
    return is_array($config) ? $config : null;
}

function hcp_save_config(array $config): void
{
    hcp_write_guarded(hcp_config_file(), json_encode($config, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
}

function hcp_require_installed(): array
{
    $config = hcp_config();
    if ($config === null) {
        hcp_error('Die Anwendung ist noch nicht installiert. Bitte install.php aufrufen.', 503);
    }
    return $config;
}

function hcp_is_https(): bool
{
    if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
        return true;
    }
    return strtolower((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
}

function hcp_start_session(array $config): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    $base = isset($config['basePath']) ? (string)$config['basePath'] : '';
    session_name('hcp_admin');
    $params = [
        'lifetime' => 0,
        'path' => ($base === '' ? '' : $base) . '/',
        'secure' => hcp_is_https(),
        'httponly' => true,
        'samesite' => 'Strict',
    ];
    session_set_cookie_params($params);
    // Eigener Session-Ordner, falls der Standardordner des Hosters nicht beschreibbar ist;
    // Lebensdauer passend zur 12-Stunden-Anmeldung (PHP-Standard wären 24 Minuten)
    $dir = hcp_data_dir() . '/sessions';
    if (is_dir($dir) && is_writable($dir)) {
        session_save_path($dir);
        @ini_set('session.gc_maxlifetime', '43200');
    }
    @session_start();
}

function hcp_is_admin(): bool
{
    if (empty($_SESSION['hcp_admin']) || empty($_SESSION['hcp_csrf'])
        || !isset($_SESSION['hcp_expires']) || $_SESSION['hcp_expires'] <= time()) {
        return false;
    }
    if (hcp_admin_role() === 'editor') {
        // Co-Admin: Konto muss weiterhin aktiv sein, die Rolle behalten und das Passwort unverändert sein
        $user = hcp_find_user('id', (string)($_SESSION['hcp_uid'] ?? ''));
        if ($user === null || empty($user['active']) || ($user['role'] ?? '') !== 'editor'
            || (string)($user['passwordChangedAt'] ?? '') !== (string)($_SESSION['hcp_pwv'] ?? '')) {
            return false;
        }
    }
    return true;
}

/** 'owner' (Installations-Passwort) oder 'editor' (Benutzer mit Golfplatzpflege). */
function hcp_admin_role(): string
{
    return (($_SESSION['hcp_role'] ?? 'owner') === 'editor') ? 'editor' : 'owner';
}

function hcp_require_owner(): void
{
    hcp_require_admin();
    if (hcp_admin_role() !== 'owner') {
        hcp_error('Nur mit dem Haupt-Passwort des Admin-Bereichs möglich', 403);
    }
}

function hcp_require_admin(): void
{
    if (!hcp_is_admin()) {
        hcp_error('Nicht angemeldet', 401);
    }
    $token = (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    if ($token === '' || !hash_equals((string)$_SESSION['hcp_csrf'], $token)) {
        hcp_error('Sicherheitstoken ungültig – bitte neu anmelden', 401);
    }
    // gleitende Sitzung: 12 Stunden ab letzter Aktion
    $_SESSION['hcp_expires'] = time() + 12 * 3600;
}

function hcp_courses_file(): string
{
    return hcp_data_dir() . '/courses.php';
}

/** Leerer Datensatz (entspricht emptyDataset() in src/lib/courses/dataset.ts). */
function hcp_empty_dataset(): array
{
    return [
        'format' => 'golf-hcp-rechner/courses',
        'schemaVersion' => 1,
        'revision' => 0,
        'updatedAt' => null,
        'courses' => [],
        'changes' => [],
        'importRuns' => [],
    ];
}

/** Veröffentlichter Datensatz als JSON-Text (data/courses.php, sonst mitgelieferte Startdaten). */
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

/** Einfache Begrenzung von Fehlversuchen (Login) je IP-Adresse. */
function hcp_rate_limited(string $bucket, int $max, int $window): bool
{
    $ip = (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    $file = hcp_data_dir() . '/ratelimit/' . $bucket . '-' . hash('sha256', $ip) . '.php';
    $entries = [];
    $raw = hcp_read_guarded($file);
    if ($raw !== null) {
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) {
            $entries = array_values(array_filter($decoded, function ($t) use ($window) {
                return is_int($t) && $t > time() - $window;
            }));
        }
    }
    return count($entries) >= $max;
}

function hcp_rate_hit(string $bucket, int $window): void
{
    $ip = (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    $file = hcp_data_dir() . '/ratelimit/' . $bucket . '-' . hash('sha256', $ip) . '.php';
    $entries = [];
    $raw = hcp_read_guarded($file);
    if ($raw !== null) {
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) {
            $entries = array_values(array_filter($decoded, function ($t) use ($window) {
                return is_int($t) && $t > time() - $window;
            }));
        }
    }
    $entries[] = time();
    hcp_write_guarded($file, json_encode($entries));
}

function hcp_app_version(): string
{
    $file = hcp_root() . '/version.txt';
    return is_file($file) ? trim((string)file_get_contents($file)) : '';
}

// ---------------------------------------------------------------------------
// Benutzerkonten
// ---------------------------------------------------------------------------

const HCP_USERNAME_PATTERN = '/^[a-z0-9][a-z0-9._-]{2,39}$/';
const HCP_PASSWORD_MIN = 8;
const HCP_USER_DATA_MAX = 5 * 1024 * 1024; // 5 MB je Konto
const HCP_USER_SESSION_DAYS = 30;

function hcp_users_file(): string
{
    return hcp_data_dir() . '/users.php';
}

function hcp_user_data_file(string $id): string
{
    if (!preg_match('/^[a-f0-9]{32}$/', $id)) {
        hcp_error('Ungültige Benutzer-ID', 400);
    }
    return hcp_data_dir() . '/userdata/' . $id . '.php';
}

/** @return array<int, array> */
function hcp_load_users(): array
{
    $raw = hcp_read_guarded(hcp_users_file());
    $data = $raw === null ? null : json_decode($raw, true);
    return is_array($data) && isset($data['users']) && is_array($data['users']) ? array_values($data['users']) : [];
}

function hcp_save_users(array $users): void
{
    hcp_write_guarded(hcp_users_file(), json_encode(['users' => array_values($users)], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT));
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

/** Änderungen an users.php unter Dateisperre (gleichzeitige Admin-Aktionen/Anmeldungen). */
function hcp_with_users(callable $fn)
{
    $lock = fopen(hcp_data_dir() . '/users.lock', 'c');
    if ($lock === false || !flock($lock, LOCK_EX)) {
        hcp_error('Benutzerdaten gesperrt – bitte erneut versuchen', 503);
    }
    try {
        $users = hcp_load_users();
        $result = $fn($users);
        hcp_save_users($users);
        return $result;
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}

function hcp_user_public(array $u): array
{
    return [
        'id' => (string)$u['id'],
        'username' => (string)$u['username'],
        'displayName' => (string)($u['displayName'] ?? $u['username']),
        'role' => ($u['role'] ?? 'player') === 'editor' ? 'editor' : 'player',
        'mustChangePassword' => !empty($u['mustChangePassword']),
    ];
}

function hcp_normalize_username(string $value): string
{
    return strtolower(trim($value));
}

function hcp_check_username(string $username): void
{
    if (!preg_match(HCP_USERNAME_PATTERN, $username)) {
        hcp_error('Benutzername: 3–40 Zeichen, nur Kleinbuchstaben, Ziffern, Punkt, Bindestrich oder Unterstrich.', 400);
    }
}

function hcp_check_password(string $password): void
{
    if (strlen($password) < HCP_PASSWORD_MIN) {
        hcp_error('Das Passwort muss mindestens ' . HCP_PASSWORD_MIN . ' Zeichen lang sein.', 400);
    }
    if (strlen($password) > 200) {
        hcp_error('Das Passwort ist zu lang.', 400);
    }
}

function hcp_check_display_name(string $name): string
{
    $name = trim($name);
    if ($name === '' || preg_match_all('/./us', $name) > 80) {
        hcp_error('Bitte einen Namen mit höchstens 80 Zeichen angeben.', 400);
    }
    return $name;
}

/** Serverseitiges Geheimnis für signierte Anmelde-Cookies (wird bei Bedarf einmalig erzeugt). */
function hcp_secret(array &$config): string
{
    if (empty($config['secret']) || !is_string($config['secret'])) {
        $config['secret'] = bin2hex(random_bytes(32));
        hcp_save_config($config);
    }
    return $config['secret'];
}

function hcp_b64url(string $data): string
{
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function hcp_b64url_decode(string $data): string
{
    $decoded = base64_decode(strtr($data, '-_', '+/'), true);
    return $decoded === false ? '' : $decoded;
}

function hcp_user_cookie_params(array $config, int $expires): array
{
    $base = isset($config['basePath']) ? (string)$config['basePath'] : '';
    return [
        'expires' => $expires,
        'path' => ($base === '' ? '' : $base) . '/',
        'secure' => hcp_is_https(),
        'httponly' => true,
        'samesite' => 'Lax',
    ];
}

/** Setzt das signierte Anmelde-Cookie eines Benutzers (30 Tage, gleitend). */
function hcp_issue_user_token(array &$config, array $user): string
{
    $exp = time() + HCP_USER_SESSION_DAYS * 86400;
    $payload = hcp_b64url(json_encode(['uid' => $user['id'], 'pwv' => (string)($user['passwordChangedAt'] ?? ''), 'exp' => $exp]));
    $sig = hcp_b64url(hash_hmac('sha256', $payload, hcp_secret($config), true));
    setcookie('hcp_user', $payload . '.' . $sig, hcp_user_cookie_params($config, $exp));
    return hcp_user_csrf($config, $user);
}

function hcp_clear_user_token(array $config): void
{
    setcookie('hcp_user', '', hcp_user_cookie_params($config, time() - 3600));
}

/** CSRF-Token: an Benutzer und Passwortstand gebunden (Double-Submit über Header X-CSRF-Token). */
function hcp_user_csrf(array &$config, array $user): string
{
    return hash_hmac('sha256', 'csrf|' . $user['id'] . '|' . (string)($user['passwordChangedAt'] ?? ''), hcp_secret($config));
}

/** Angemeldeter Benutzer aus dem Cookie oder null. */
function hcp_current_user(array &$config): ?array
{
    $cookie = (string)($_COOKIE['hcp_user'] ?? '');
    $parts = explode('.', $cookie);
    if (count($parts) !== 2) {
        return null;
    }
    $expected = hcp_b64url(hash_hmac('sha256', $parts[0], hcp_secret($config), true));
    if (!hash_equals($expected, $parts[1])) {
        return null;
    }
    $payload = json_decode(hcp_b64url_decode($parts[0]), true);
    if (!is_array($payload) || !isset($payload['uid'], $payload['exp']) || (int)$payload['exp'] < time()) {
        return null;
    }
    $user = hcp_find_user('id', (string)$payload['uid']);
    if ($user === null || empty($user['active']) || (string)($user['passwordChangedAt'] ?? '') !== (string)($payload['pwv'] ?? '')) {
        return null;
    }
    return $user;
}

function hcp_require_user(array &$config, bool $checkCsrf = true): array
{
    $user = hcp_current_user($config);
    if ($user === null) {
        hcp_error('Nicht angemeldet', 401);
    }
    if ($checkCsrf) {
        $token = (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
        if ($token === '' || !hash_equals(hcp_user_csrf($config, $user), $token)) {
            hcp_error('Sicherheitstoken ungültig – bitte neu anmelden', 401);
        }
    }
    return $user;
}

/** Gespeicherte Daten eines Benutzers: ['data' => …|null, 'revision' => int, 'updatedAt' => …]. */
function hcp_load_user_data(string $id): array
{
    $raw = hcp_read_guarded(hcp_user_data_file($id));
    $stored = $raw === null ? null : json_decode($raw, true);
    if (!is_array($stored)) {
        return ['data' => null, 'revision' => 0, 'updatedAt' => null];
    }
    return [
        'data' => $stored['data'] ?? null,
        'revision' => (int)($stored['revision'] ?? 0),
        'updatedAt' => $stored['updatedAt'] ?? null,
    ];
}

function hcp_new_id(): string
{
    return bin2hex(random_bytes(16));
}
