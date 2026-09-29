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
    // Eigener Session-Ordner, falls der Standardordner des Hosters nicht beschreibbar ist
    $dir = hcp_data_dir() . '/sessions';
    if (is_dir($dir) && is_writable($dir)) {
        session_save_path($dir);
    }
    @session_start();
}

function hcp_is_admin(): bool
{
    return !empty($_SESSION['hcp_admin']) && !empty($_SESSION['hcp_csrf'])
        && isset($_SESSION['hcp_expires']) && $_SESSION['hcp_expires'] > time();
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
