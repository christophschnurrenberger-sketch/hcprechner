<?php
/**
 * Golf HCP Rechner – WHS 2026 · Installation für klassischen PHP-Webspace
 *
 * 1. Alle Dateien des ZIP-Archivs per FTP in einen Ordner hochladen (z. B. /hcp oder die Domain-Wurzel).
 * 2. https://ihre-domain.de/<ordner>/install.php im Browser aufrufen.
 * 3. Super-Admin-Konto (Name, E-Mail, Passwort) und E-Mail-Versand festlegen – fertig.
 *
 * Was passiert dabei?
 * - Der Installationsordner wird in alle Seiten-/Skriptdateien eingetragen (Platzhalter /__HCP_BASE__ → z. B. /hcp).
 * - data/config.php (Schlüssel, Adresse, E-Mail-Versand) und data/users.php (Konten, nur Passwort-Hashes) werden angelegt.
 * - .htaccess (Zugangsschutz für /member und /admin, Fehlerseite, Sicherheits-Header) und robots.txt werden geschrieben.
 *
 * Update: Neue Version über die alte hochladen (der Ordner data/ bleibt erhalten) und install.php erneut aufrufen.
 * Bestätigt wird mit einem Super-Admin-Konto. Bei einem Update von Version 1 (Haupt-Passwort) wird dabei das
 * Super-Admin-Konto angelegt; vorhandene Benutzer werden übernommen (player → USER, editor → ADMIN).
 *
 * Notfall-Zugang: Per FTP eine leere Datei data/recovery.txt anlegen, install.php aufrufen und ein neues
 * Super-Admin-Passwort setzen (die Datei wird danach gelöscht).
 */

error_reporting(E_ALL);
ini_set('display_errors', '0');

if (version_compare(PHP_VERSION, '7.4.0', '<')) {
    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><meta charset="utf-8"><title>Installation</title><p style="font-family:sans-serif;padding:2em">Diese Anwendung benötigt PHP 7.4 oder neuer (aktuell: '
        . htmlspecialchars(PHP_VERSION) . '). Bitte im Kundenmenü des Hosters die PHP-Version auf 8.x umstellen.</p>';
    exit;
}
if (!is_file(__DIR__ . '/api/_lib.php')) {
    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><meta charset="utf-8"><title>Installation</title><p style="font-family:sans-serif;padding:2em">Der Ordner <code>api</code> fehlt. Bitte alle Dateien vollständig hochladen.</p>';
    exit;
}
require __DIR__ . '/api/_lib.php';

define('HCP_PLACEHOLDER', '/__HCP_BASE__');

$ROOT = __DIR__;
$DATA = $ROOT . '/data';
$CONFIG_FILE = $DATA . '/config.php';
$TEXT_EXTENSIONS = array('html', 'htm', 'js', 'mjs', 'css', 'txt', 'json', 'xml', 'webmanifest', 'svg', 'map', 'rsc');
$SKIP_DIRS = array('data', 'api', '.well-known');
/** Dateien früherer Versionen, die entfernt werden. */
$OBSOLETE = array('api/account.php', 'api/sync.php');

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

function h($s)
{
    return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
}

function post($key, $max = 500)
{
    return isset($_POST[$key]) && is_string($_POST[$key]) ? trim(substr($_POST[$key], 0, $max)) : '';
}

function write_file($file, $content)
{
    $dir = dirname($file);
    if (!is_dir($dir) && !@mkdir($dir, 0755, true)) {
        return false;
    }
    $tmp = $file . '.' . bin2hex(random_bytes(4)) . '.tmp';
    if (@file_put_contents($tmp, $content, LOCK_EX) === false) {
        return false;
    }
    @chmod($tmp, 0644);
    if (!@rename($tmp, $file)) {
        @unlink($file);
        if (!@rename($tmp, $file)) {
            @unlink($tmp);
            return false;
        }
    }
    return true;
}

function write_guarded_json($file, $data)
{
    return write_file($file, HCP_GUARD . json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
}

function detect_base_path()
{
    $script = isset($_SERVER['SCRIPT_NAME']) ? (string)$_SERVER['SCRIPT_NAME'] : '/install.php';
    return normalize_base_path(str_replace('\\', '/', dirname($script)));
}

/** '' für die Domain-Wurzel, sonst '/ordner' bzw. '/ordner/unterordner' (ohne Schrägstrich am Ende). */
function normalize_base_path($value)
{
    $value = '/' . trim(trim((string)$value), "/ \t");
    if ($value === '/') {
        return '';
    }
    return preg_match('#^(/[A-Za-z0-9._~-]+)+$#', $value) ? $value : false;
}

function site_origin()
{
    $host = isset($_SERVER['HTTP_HOST']) ? preg_replace('/[^A-Za-z0-9.:\-\[\]]/', '', $_SERVER['HTTP_HOST']) : 'localhost';
    return (hcp_is_https() ? 'https' : 'http') . '://' . $host;
}

/** Alle Textdateien der Anwendung (ohne data/, api/ und install.php). */
function text_files($root, $extensions, $skipDirs)
{
    $result = array();
    $it = new RecursiveIteratorIterator(
        new RecursiveCallbackFilterIterator(
            new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS),
            function ($current) use ($root, $skipDirs) {
                if ($current->isDir()) {
                    $rel = ltrim(str_replace('\\', '/', substr($current->getPathname(), strlen($root))), '/');
                    return !in_array($rel, $skipDirs, true);
                }
                return true;
            }
        )
    );
    foreach ($it as $file) {
        if (!$file->isFile() || $file->getPathname() === __FILE__) {
            continue;
        }
        if (in_array(strtolower(pathinfo($file->getFilename(), PATHINFO_EXTENSION)), $extensions, true)) {
            $result[] = $file->getPathname();
        }
    }
    return $result;
}

function files_with_placeholder($files)
{
    $hits = array();
    foreach ($files as $f) {
        $c = @file_get_contents($f);
        if ($c !== false && strpos($c, '__HCP_BASE__') !== false) {
            $hits[] = $f;
        }
    }
    return $hits;
}

function needs_rewrite($root)
{
    $c = is_file($root . '/index.html') ? file_get_contents($root . '/index.html') : false;
    return $c !== false && strpos($c, '__HCP_BASE__') !== false;
}

/** Ersetzt den Platzhalter; index.html zuletzt (dient als Kennzeichen „fertig“). */
function rewrite_files($files, $base, $root, &$errors)
{
    $escapedBase = str_replace('/', '\\/', $base);
    $index = $root . '/index.html';
    usort($files, function ($a, $b) use ($index) {
        return ($a === $index ? 1 : 0) - ($b === $index ? 1 : 0);
    });
    $count = 0;
    foreach ($files as $f) {
        $c = file_get_contents($f);
        if ($c === false) {
            $errors[] = 'Nicht lesbar: ' . h($f);
            continue;
        }
        $n = str_replace(array('\\/__HCP_BASE__', HCP_PLACEHOLDER), array($escapedBase, $base), $c);
        if ($n === $c) {
            continue;
        }
        if (@file_put_contents($f, $n, LOCK_EX) === false) {
            $errors[] = 'Nicht beschreibbar: ' . h($f);
            continue;
        }
        $count++;
    }
    return $count;
}

/**
 * $minimal: nur die Fehlerseite (Hoster erlaubt die übrigen Anweisungen nicht).
 * $gate: Vorprüfung von /member und /admin über gate.php (false, wenn der Server die Weiterleitung nicht ausführt).
 */
function htaccess_block($base, $minimal, $gate = true)
{
    $lines = array();
    $lines[] = '# BEGIN Golf HCP Rechner';
    $lines[] = '# Von install.php erzeugt – dieser Block wird bei jeder Installation/Aktualisierung neu geschrieben.';
    $lines[] = 'ErrorDocument 404 ' . $base . '/404.html';
    if (!$minimal) {
        if ($gate) {
            $lines[] = '<IfModule mod_rewrite.c>';
            $lines[] = '  RewriteEngine On';
            $lines[] = '  # Verzeichnis ohne Schrägstrich selbst umleiten (sonst hängt Apache „?area=…“ an die Adresse)';
            $lines[] = '  RewriteRule ^(member|admin)(/[^.]*[^/.])?$ %{REQUEST_URI}/ [R=302,L]';
            $lines[] = '  # Mitglieder- und Admin-Bereich nur mit gültiger Anmeldung (Prüfung in gate.php).';
            $lines[] = '  # Absoluter Pfad: funktioniert auch bei Hostern, die sonst RewriteBase verlangen (z. B. IONOS).';
            $lines[] = '  RewriteRule ^(member|admin)(/.*)?$ ' . $base . '/gate.php?area=$1 [QSA,L]';
            $lines[] = '</IfModule>';
        }
        $lines[] = '<IfModule mod_dir.c>';
        $lines[] = '  DirectoryIndex index.html index.php';
        $lines[] = '</IfModule>';
        $lines[] = '<IfModule mod_mime.c>';
        $lines[] = '  AddType application/javascript .js .mjs';
        $lines[] = '  AddType text/css .css';
        $lines[] = '  AddType text/plain .txt';
        $lines[] = '  AddCharset utf-8 .html .js .css .txt .json';
        $lines[] = '</IfModule>';
        $lines[] = '<IfModule mod_headers.c>';
        $lines[] = '  Header always set X-Content-Type-Options "nosniff"';
        $lines[] = '  Header always set Referrer-Policy "strict-origin-when-cross-origin"';
        $lines[] = '  Header always set X-Frame-Options "SAMEORIGIN"';
        $lines[] = '  Header always set Permissions-Policy "camera=(), microphone=(), geolocation=()"';
        $lines[] = '  <FilesMatch "\\.(html|txt)$">';
        $lines[] = '    Header set Cache-Control "no-cache"';
        $lines[] = '  </FilesMatch>';
        $lines[] = '</IfModule>';
        $lines[] = '<IfModule mod_deflate.c>';
        $lines[] = '  AddOutputFilterByType DEFLATE text/html text/css text/plain application/javascript application/json image/svg+xml';
        $lines[] = '</IfModule>';
    }
    $lines[] = '# END Golf HCP Rechner';
    return implode("\n", $lines) . "\n";
}

/** Schreibt den eigenen Block in .htaccess und lässt fremde Einträge unverändert. */
function write_htaccess($root, $base, $minimal, $gate = true)
{
    $file = $root . '/.htaccess';
    $existing = is_file($file) ? (string)file_get_contents($file) : '';
    $existing = preg_replace('/# BEGIN Golf HCP Rechner.*?# END Golf HCP Rechner\n?/s', '', $existing);
    return write_file($file, htaccess_block($base, $minimal, $gate) . ($existing !== '' ? "\n" . ltrim($existing) : ''));
}

function ensure_data_dir($data)
{
    $ok = true;
    foreach (array('', '/backups', '/ratelimit', '/userdata', '/audit', '/logs', '/locks') as $sub) {
        if (!is_dir($data . $sub)) {
            $ok = @mkdir($data . $sub, 0755, true) && $ok;
        }
    }
    $deny = "# Kein Zugriff über den Browser\n<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\n  Order deny,allow\n  Deny from all\n</IfModule>\n";
    if (!is_file($data . '/.htaccess')) {
        $ok = write_file($data . '/.htaccess', $deny) && $ok;
    }
    if (!is_file($data . '/index.html')) {
        $ok = write_file($data . '/index.html', '') && $ok;
    }
    return $ok;
}

function install_users()
{
    return hcp_load_users();
}

function super_admins($users)
{
    return array_values(array_filter($users, function ($u) {
        return $u['role'] === 'SUPER_ADMIN';
    }));
}

/** Mail-Einstellungen aus dem Formular. */
function mail_from_form($existing)
{
    $mode = post('mailMode', 10);
    if (!in_array($mode, array('mail', 'smtp', 'outbox', 'off'), true)) {
        $mode = 'mail';
    }
    $mail = is_array($existing) ? $existing : array();
    $mail['mode'] = $mode;
    if ($mode === 'smtp') {
        $mail['host'] = post('smtpHost', 200);
        $mail['port'] = max(1, min(65535, (int)post('smtpPort', 6) ?: 587));
        $mail['secure'] = in_array(post('smtpSecure', 5), array('tls', 'ssl', 'none'), true) ? post('smtpSecure', 5) : 'tls';
        $mail['user'] = post('smtpUser', 200);
        if (isset($_POST['smtpPass']) && is_string($_POST['smtpPass']) && $_POST['smtpPass'] !== '') {
            $mail['pass'] = substr($_POST['smtpPass'], 0, 500);
        }
    }
    return $mail;
}

// ---------------------------------------------------------------------------
// Ablauf
// ---------------------------------------------------------------------------

$checks = array();
$checks[] = array('PHP-Version ' . PHP_VERSION . ' (mindestens 7.4)', true);
$checks[] = array('PHP-Erweiterung json', function_exists('json_encode'));
$checks[] = array('Sichere Zufallszahlen (random_bytes)', function_exists('random_bytes'));
$checks[] = array('Passwort-Hashing (password_hash)', function_exists('password_hash'));
$checks[] = array('Anwendungsdateien vorhanden (index.html, _next/)', is_file($ROOT . '/index.html') && is_dir($ROOT . '/_next'));
$checks[] = array('PHP-Skripte vorhanden (api/, gate.php)', is_file($ROOT . '/api/auth.php') && is_file($ROOT . '/api/me.php') && is_file($ROOT . '/gate.php'));
$dataWritable = (is_dir($DATA) && is_writable($DATA)) || (!is_dir($DATA) && is_writable($ROOT));
$checks[] = array('Ordner data/ beschreibbar', $dataWritable);
$checks[] = array('Installationsordner beschreibbar (.htaccess)', is_writable($ROOT));
$allChecksOk = true;
foreach ($checks as $c) {
    $allChecksOk = $allChecksOk && $c[1];
}

$config = hcp_config();
$installed = $config !== null;
$users = $installed ? install_users() : array();
$legacy = $installed && !super_admins($users); // Version 1: Haupt-Passwort statt Super-Admin-Konto
$rewriteNeeded = needs_rewrite($ROOT);
$detectedBase = detect_base_path();
$recovery = $installed && is_file($DATA . '/recovery.txt');
$errors = array();
$done = null;

if (session_status() !== PHP_SESSION_ACTIVE && function_exists('session_start')) {
    session_name('hcp_install');
    @session_start();
}
if (empty($_SESSION['install_token'])) {
    $_SESSION['install_token'] = bin2hex(random_bytes(16));
}
$token = $_SESSION['install_token'];

// Nachträglich: minimale .htaccess, falls der Webserver einzelne Anweisungen nicht erlaubt (HTTP 500)
if (isset($_GET['fix']) && $_GET['fix'] === 'htaccess' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    header('Content-Type: application/json; charset=utf-8');
    $allowed = !empty($_SESSION['install_done_at']) && $_SESSION['install_done_at'] > time() - 1800
        && isset($_POST['token']) && hash_equals($token, (string)$_POST['token']) && $installed;
    if (!$allowed) {
        http_response_code(403);
        echo json_encode(array('ok' => false));
        exit;
    }
    // mode=nogate: Server führt die Weiterleitung auf gate.php nicht aus → ohne Vorprüfung, sonst vollständig
    $nogate = isset($_POST['mode']) && $_POST['mode'] === 'nogate';
    echo json_encode(array('ok' => write_htaccess($ROOT, (string)$config['basePath'], !$nogate, !$nogate)));
    exit;
}

// Notfall-Zugang (nur solange data/recovery.txt existiert)
if ($recovery && $_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['token'], $_POST['recovery'])) {
    if (!hash_equals($token, (string)$_POST['token'])) {
        $errors[] = 'Sitzung abgelaufen – bitte die Seite neu laden.';
    } else {
        $email = strtolower(post('email', 200));
        $password = isset($_POST['password']) ? (string)$_POST['password'] : '';
        if (strlen($password) < HCP_PASSWORD_MIN || $password !== (isset($_POST['password2']) ? (string)$_POST['password2'] : '')) {
            $errors[] = 'Passwort: mindestens ' . HCP_PASSWORD_MIN . ' Zeichen, beide Eingaben gleich.';
        }
        $found = false;
        foreach ($users as &$u) {
            if ($u['email'] === $email) {
                $found = true;
                if (!$errors) {
                    $u['passwordHash'] = password_hash($password, PASSWORD_DEFAULT);
                    $u['passwordChangedAt'] = hcp_now();
                    $u['role'] = 'SUPER_ADMIN';
                    $u['status'] = 'ACTIVE';
                    $u['emailVerified'] = true;
                    $u['mustChangePassword'] = false;
                }
            }
        }
        unset($u);
        if (!$found) {
            $errors[] = 'Kein Konto mit dieser E-Mail-Adresse.';
        }
        if (!$errors) {
            write_guarded_json(hcp_users_file(), array('schema' => 2, 'users' => array_values($users)));
            hcp_audit('USER_PASSWORD_RESET', null, array('entityType' => 'user', 'newValue' => array('recovery' => true, 'email' => $email)));
            @unlink($DATA . '/recovery.txt');
            $recovery = false;
            $done = array('recovered' => true, 'base' => (string)$config['basePath'], 'files' => 0, 'update' => true);
        }
    }
}

$wasInstalled = $installed;
if (!$done && $_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['token']) && !isset($_POST['recovery'])) {
    if (!hash_equals($token, (string)$_POST['token'])) {
        $errors[] = 'Sitzung abgelaufen – bitte die Seite neu laden.';
    } elseif (!$allChecksOk) {
        $errors[] = 'Bitte zuerst die markierten Voraussetzungen erfüllen.';
    } else {
        $base = normalize_base_path(isset($_POST['base']) ? $_POST['base'] : $detectedBase);
        $password = isset($_POST['password']) ? (string)$_POST['password'] : '';
        $email = strtolower(post('email', 200));
        $firstName = post('firstName', 60);
        $lastName = post('lastName', 60);
        $siteUrl = rtrim(post('siteUrl', 300), '/');
        $newSuper = null;   // anzulegendes Super-Admin-Konto
        if ($base === false) {
            $errors[] = 'Der Installationsordner darf nur Buchstaben, Ziffern, Punkt, Bindestrich und Unterstrich enthalten.';
        }
        if ($siteUrl !== '' && !preg_match('#^https?://[^\s/]+(/[^\s]*)?$#i', $siteUrl)) {
            $errors[] = 'Die Adresse der Anwendung ist ungültig (Beispiel: https://www.golfclub.de/hcp).';
        }
        if ($installed && !$legacy) {
            // Aktualisierung: Bestätigung mit einem Super-Admin-Konto
            $ok = false;
            foreach (super_admins($users) as $u) {
                if ($u['email'] === $email && $u['status'] === 'ACTIVE' && password_verify($password, (string)$u['passwordHash'])) {
                    $ok = true;
                }
            }
            if (!$ok) {
                usleep(700000);
                $errors[] = 'E-Mail-Adresse oder Passwort des Super-Admin-Kontos falsch.';
            }
        } else {
            if ($legacy) {
                // Version 1: altes Haupt-Passwort bestätigt, es wird zum Passwort des Super-Admin-Kontos
                if (!password_verify($password, (string)($config['adminPasswordHash'] ?? ''))) {
                    usleep(700000);
                    $errors[] = 'Admin-Passwort (bisheriges Haupt-Passwort) falsch.';
                }
            } else {
                if (strlen($password) < HCP_PASSWORD_MIN) {
                    $errors[] = 'Das Passwort muss mindestens ' . HCP_PASSWORD_MIN . ' Zeichen lang sein.';
                } elseif ($password !== (isset($_POST['password2']) ? (string)$_POST['password2'] : '')) {
                    $errors[] = 'Die Passwörter stimmen nicht überein.';
                }
            }
            if ($firstName === '' || $lastName === '') {
                $errors[] = 'Bitte Vor- und Nachnamen für das Super-Admin-Konto angeben.';
            }
            if (!preg_match(HCP_EMAIL_PATTERN, $email)) {
                $errors[] = 'Bitte eine gültige E-Mail-Adresse für das Super-Admin-Konto angeben.';
            }
            $newSuper = array('email' => $email, 'firstName' => $firstName, 'lastName' => $lastName, 'password' => $password);
        }
        if ($installed && !$rewriteNeeded && $base !== false && $base !== (string)$config['basePath']) {
            $errors[] = 'Die Anwendung ist bereits für ' . ($config['basePath'] === '' ? 'die Domain-Wurzel' : h($config['basePath']))
                . ' eingerichtet. Zum Verschieben bitte alle Dateien (außer data/) neu hochladen und install.php erneut aufrufen.';
        }

        $files = array();
        if (!$errors) {
            $files = $rewriteNeeded ? files_with_placeholder(text_files($ROOT, $TEXT_EXTENSIONS, $SKIP_DIRS)) : array();
            $notWritable = array();
            foreach ($files as $f) {
                if (!is_writable($f)) {
                    $notWritable[] = substr($f, strlen($ROOT) + 1);
                }
            }
            if ($notWritable) {
                $errors[] = count($notWritable) . ' Datei(en) sind für PHP nicht beschreibbar, z. B. ' . h(implode(', ', array_slice($notWritable, 0, 3)))
                    . '. Bitte im FTP-Programm die Rechte der hochgeladenen Dateien auf 644 (Ordner 755) setzen oder beim Hoster nachfragen.';
            }
        }

        if (!$errors) {
            $rewritten = $files ? rewrite_files($files, $base, $ROOT, $errors) : 0;
            if (!ensure_data_dir($DATA)) {
                $errors[] = 'Der Ordner data/ konnte nicht vollständig angelegt werden.';
            }
            $newConfig = $installed ? $config : array('installedAt' => hcp_now());
            if (empty($newConfig['secret'])) {
                $newConfig['secret'] = bin2hex(random_bytes(32));
            }
            $newConfig['basePath'] = $base;
            $newConfig['siteUrl'] = $siteUrl !== '' ? $siteUrl : (isset($newConfig['siteUrl']) ? $newConfig['siteUrl'] : site_origin() . $base);
            if (isset($_POST['mailMode'])) {
                $newConfig['mail'] = mail_from_form(isset($newConfig['mail']) ? $newConfig['mail'] : array());
            } elseif (!isset($newConfig['mail'])) {
                $newConfig['mail'] = array('mode' => 'mail');
            }
            unset($newConfig['syncEnabled'], $newConfig['adminPasswordHash']);
            $newConfig['appVersion'] = hcp_app_version();
            $newConfig['schema'] = 2;
            $newConfig['updatedAt'] = hcp_now();

            // Konten: bestehende übernehmen (werden beim Laden auf Version 2 gehoben), Super-Admin anlegen
            $migrated = array_values($users);
            if ($newSuper !== null) {
                $now = hcp_now();
                $existingIndex = null;
                foreach ($migrated as $i => $u) {
                    if ($u['email'] === $newSuper['email']) {
                        $existingIndex = $i;
                    }
                }
                $account = array(
                    'firstName' => $newSuper['firstName'],
                    'lastName' => $newSuper['lastName'],
                    'email' => $newSuper['email'],
                    'role' => 'SUPER_ADMIN',
                    'status' => 'ACTIVE',
                    'emailVerified' => true,
                    'emailVerifiedAt' => $now,
                    'mustChangePassword' => false,
                    'passwordHash' => password_hash($newSuper['password'], PASSWORD_DEFAULT),
                    'passwordChangedAt' => $now,
                    'updatedAt' => $now,
                );
                if ($existingIndex !== null) {
                    $migrated[$existingIndex] = array_merge($migrated[$existingIndex], $account);
                    $superId = $migrated[$existingIndex]['id'];
                } else {
                    $superId = hcp_new_id();
                    $migrated[] = hcp_normalize_user(array_merge($account, array('id' => $superId, 'username' => null, 'createdAt' => $now)));
                }
            }
            if (!write_guarded_json($CONFIG_FILE, $newConfig)) {
                $errors[] = 'data/config.php konnte nicht geschrieben werden.';
            }
            if (!write_guarded_json(hcp_users_file(), array('schema' => 2, 'users' => $migrated))) {
                $errors[] = 'data/users.php konnte nicht geschrieben werden.';
            }
            if ($newSuper !== null && !is_file(hcp_member_file($superId))) {
                write_guarded_json(hcp_member_file($superId), array('data' => hcp_default_member_doc($superId), 'revision' => 1, 'updatedAt' => hcp_now()));
            }
            foreach ($OBSOLETE as $old) {
                if (is_file($ROOT . '/' . $old)) {
                    @unlink($ROOT . '/' . $old);
                }
            }
            if (!write_htaccess($ROOT, $base, false)) {
                $errors[] = '.htaccess konnte nicht geschrieben werden (die Anwendung funktioniert trotzdem, nur ohne Weiterleitungen und eigene Fehlerseite).';
            }
            if ($base === '') {
                $robots = "User-agent: *\nAllow: /\nDisallow: /member/\nDisallow: /admin/\nDisallow: /api/\nDisallow: /data/\n\nSitemap: " . site_origin() . "/sitemap.php\n";
                write_file($ROOT . '/robots.txt', $robots);
            }
            $left = $rewriteNeeded ? count(files_with_placeholder(text_files($ROOT, $TEXT_EXTENSIONS, $SKIP_DIRS))) : 0;
            if ($left > 0) {
                $errors[] = $left . ' Datei(en) enthalten noch den Platzhalter – bitte install.php erneut ausführen.';
            }
            if (!$errors) {
                $_SESSION['install_done_at'] = time();
                $config = $newConfig;
                $installed = true;
                $rewriteNeeded = false;
                $done = array('base' => $base, 'files' => $rewritten, 'update' => $wasInstalled, 'migrated' => $legacy, 'users' => count($migrated), 'email' => $newSuper ? $newSuper['email'] : $email);
                hcp_audit($wasInstalled ? 'RULE_VERSION_CHANGED' : 'SETTINGS_CHANGED', null, array('entityType' => 'installation', 'newValue' => array('version' => hcp_app_version(), 'update' => $wasInstalled, 'migratedFromV1' => $legacy)));
            }
        }
    }
}

$mode = $done ? 'done' : ($recovery ? 'recovery' : (!$installed ? 'install' : ($legacy ? 'legacy' : ($rewriteNeeded ? 'update' : 'installed'))));
$baseForForm = $installed ? (string)$config['basePath'] : (string)$detectedBase;
if ($installed && $rewriteNeeded && $detectedBase !== false && $detectedBase !== (string)$config['basePath']) {
    $baseForForm = (string)$detectedBase; // Dateien wurden in einen anderen Ordner hochgeladen
}
$appUrl = ($mode === 'done' ? $done['base'] : $baseForForm) . '/';
$siteUrlDefault = $installed && !empty($config['siteUrl']) ? (string)$config['siteUrl'] : site_origin() . $baseForForm;
$mailCfg = $installed && isset($config['mail']) && is_array($config['mail']) ? $config['mail'] : array('mode' => 'mail');
$showMail = in_array($mode, array('install', 'legacy'), true);
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');
header('X-Frame-Options: DENY');
?><!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Installation · Golf HCP Rechner</title>
<style>
  :root { --bg:#f5f7f6; --surface:#fff; --ink:#15201a; --ink2:#4b574f; --border:#dde3df; --brand:#17603a; --good:#1f7a3f; --bad:#b42318; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0f1311; --surface:#171c19; --ink:#eef2ef; --ink2:#a8b3ab; --border:#2a322d; --brand:#5fc28b; --good:#5fc28b; --bad:#ff8a80; } }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
  main { max-width:660px; margin:0 auto; padding:32px 16px 64px; }
  h1 { font-size:22px; margin:0 0 4px; } h2 { font-size:16px; margin:0 0 12px; } h3 { font-size:14px; margin:18px 0 0; }
  .sub { color:var(--ink2); margin:0 0 24px; }
  .card { background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:20px; margin-bottom:16px; }
  ul.checks { list-style:none; padding:0; margin:0; } ul.checks li { display:flex; gap:8px; padding:3px 0; }
  .ok { color:var(--good); font-weight:600; } .no { color:var(--bad); font-weight:600; }
  label { display:block; font-weight:600; margin:14px 0 4px; } .hint { color:var(--ink2); font-size:13px; font-weight:400; }
  input[type=password], input[type=text], input[type=email], input[type=url], input[type=number], select { width:100%; padding:10px 12px; border:1px solid var(--border); border-radius:10px; background:var(--bg); color:var(--ink); font:inherit; }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:0 12px; } @media (max-width:520px) { .grid { grid-template-columns:1fr; } }
  button, .btn { display:inline-block; margin-top:18px; background:var(--brand); color:#fff; border:0; border-radius:10px; padding:11px 18px; font:inherit; font-weight:600; cursor:pointer; text-decoration:none; }
  .btn.secondary { background:transparent; color:var(--brand); border:1px solid var(--border); margin-left:8px; }
  .err { border-color:var(--bad); } .err li { color:var(--bad); }
  code { background:var(--bg); padding:1px 5px; border-radius:4px; font-size:13px; }
  .small { font-size:13px; color:var(--ink2); }
  .smtp { display:none; } .smtp.show { display:block; }
</style>
</head>
<body>
<main>
  <h1>Golf HCP Rechner – WHS 2026</h1>
  <p class="sub">Installation auf Ihrem Webspace<?php echo hcp_app_version() !== '' ? ' · Version ' . h(hcp_app_version()) : ''; ?></p>

  <?php if ($errors): ?>
    <div class="card err"><h2>Bitte prüfen</h2><ul><?php foreach ($errors as $e): ?><li><?php echo $e; ?></li><?php endforeach; ?></ul></div>
  <?php endif; ?>

  <?php if ($mode === 'done'): ?>
    <div class="card">
      <?php if (!empty($done['recovered'])): ?>
        <h2 class="ok">✓ Neues Passwort gesetzt</h2>
        <p>Sie können sich jetzt mit dem Super-Admin-Konto anmelden. Die Datei <code>data/recovery.txt</code> wurde entfernt.</p>
      <?php else: ?>
        <h2 class="ok">✓ <?php echo $done['update'] ? 'Aktualisierung' : 'Installation'; ?> abgeschlossen</h2>
        <p>Die Anwendung ist unter <code><?php echo h(site_origin() . $appUrl); ?></code> eingerichtet<?php echo $done['files'] ? ' (' . (int)$done['files'] . ' Dateien angepasst)' : ''; ?>.</p>
        <?php if (!empty($done['migrated'])): ?>
          <p>Umstellung von Version 1: Das Super-Admin-Konto <code><?php echo h($done['email']); ?></code> wurde mit dem bisherigen Haupt-Passwort angelegt; <?php echo (int)$done['users']; ?> Konten wurden übernommen.</p>
        <?php endif; ?>
      <?php endif; ?>
      <p id="selftest" class="small">Prüfe die Erreichbarkeit …</p>
      <a class="btn" href="<?php echo h($appUrl); ?>login/">Zur Anmeldung</a>
      <a class="btn secondary" href="<?php echo h($appUrl); ?>">Startseite</a>
    </div>
    <div class="card small">
      <p><strong>Nächste Schritte:</strong> Anmelden → <em>Admin</em> → <em>Einstellungen</em> (Registrierung, Impressum, Datenschutz, E-Mail-Test) → <em>Golfplätze</em> (Startdaten übernehmen oder verifizierte Ratings per CSV importieren).</p>
      <p>Diese Datei (<code>install.php</code>) kann bleiben: Ohne Super-Admin-Konto ist sie wirkungslos und wird für künftige Updates benötigt.</p>
    </div>
    <script>
      (function () {
        var el = document.getElementById('selftest');
        var base = <?php echo json_encode($appUrl); ?>;
        fetch(base, { cache: 'no-store' }).then(function (r) {
          if (r.status === 500) {
            var body = new URLSearchParams({ token: <?php echo json_encode($token); ?> });
            return fetch('install.php?fix=htaccess', { method: 'POST', body: body }).then(function () {
              el.textContent = 'Hinweis: Die .htaccess wurde auf eine vereinfachte Fassung umgestellt (Ihr Hoster erlaubt nicht alle Anweisungen). Der Zugangsschutz der Seiten entfällt – Ihre Daten bleiben durch die API geschützt.';
            });
          }
          var start = r.ok ? '✓ Startseite erreichbar. ' : 'Startseite antwortet mit HTTP ' + r.status + '. ';
          return fetch(base + 'member/', { cache: 'no-store', redirect: 'manual', credentials: 'omit' }).then(function (m) {
            if (m.type === 'opaqueredirect' || m.status === 302) {
              el.textContent = start + '✓ Mitgliederbereich nur nach Anmeldung erreichbar.';
              return;
            }
            if (m.status === 404 || m.status >= 500) {
              // Weiterleitung auf gate.php funktioniert auf diesem Server nicht → ohne Vorprüfung ausliefern
              var body = new URLSearchParams({ token: <?php echo json_encode($token); ?>, mode: 'nogate' });
              return fetch('install.php?fix=htaccess', { method: 'POST', body: body }).then(function () {
                el.textContent = start + 'Hinweis: Ihr Server leitet /member nicht an gate.php weiter (HTTP ' + m.status + '). Die Vorprüfung der Seiten wurde deshalb abgeschaltet – Ihre Daten liefert die API weiterhin nur nach Anmeldung und mit Berechtigung.';
              });
            }
            el.textContent = start + 'Hinweis: mod_rewrite ist nicht aktiv – Seiten werden ohne Vorprüfung ausgeliefert, Daten liefert die API aber nur nach Anmeldung.';
          });
        }).catch(function () { el.textContent = ''; });
      })();
    </script>

  <?php elseif ($mode === 'recovery'): ?>
    <div class="card">
      <h2>Notfall-Zugang</h2>
      <p class="small">Die Datei <code>data/recovery.txt</code> ist vorhanden. Legen Sie ein neues Passwort für ein bestehendes Konto fest – es erhält die Rolle Super-Admin.</p>
      <form method="post">
        <input type="hidden" name="token" value="<?php echo h($token); ?>">
        <input type="hidden" name="recovery" value="1">
        <label for="email">E-Mail-Adresse des Kontos</label>
        <input type="email" id="email" name="email" required autocomplete="username">
        <label for="password">Neues Passwort <span class="hint">– mindestens <?php echo HCP_PASSWORD_MIN; ?> Zeichen</span></label>
        <input type="password" id="password" name="password" required minlength="<?php echo HCP_PASSWORD_MIN; ?>" autocomplete="new-password">
        <label for="password2">Passwort wiederholen</label>
        <input type="password" id="password2" name="password2" required autocomplete="new-password">
        <button type="submit">Passwort setzen</button>
      </form>
    </div>

  <?php elseif ($mode === 'installed'): ?>
    <div class="card">
      <h2 class="ok">✓ Bereits installiert</h2>
      <p>Die Anwendung ist unter <code><?php echo h(site_origin() . $appUrl); ?></code> eingerichtet. Einstellungen (Registrierung, E-Mail-Versand, Impressum, Datenschutz) ändern Sie im Admin-Bereich.</p>
      <a class="btn" href="<?php echo h($appUrl); ?>login/">Zur Anmeldung</a>
      <a class="btn secondary" href="<?php echo h($appUrl); ?>">Startseite</a>
    </div>
    <div class="card small">
      <p>Update auf eine neue Version: alle Dateien des neuen ZIP-Archivs hochladen (der Ordner <code>data/</code> bleibt erhalten) und diese Seite erneut aufrufen.</p>
      <p>Passwort vergessen und kein E-Mail-Versand? Per FTP eine leere Datei <code>data/recovery.txt</code> anlegen und diese Seite neu laden.</p>
    </div>

  <?php else: ?>
    <div class="card">
      <h2>Voraussetzungen</h2>
      <ul class="checks">
        <?php foreach ($checks as $c): ?>
          <li><span class="<?php echo $c[1] ? 'ok' : 'no'; ?>"><?php echo $c[1] ? '✓' : '✗'; ?></span> <?php echo h($c[0]); ?></li>
        <?php endforeach; ?>
      </ul>
      <?php if (!$allChecksOk): ?>
        <p class="small">Fehlt eine Voraussetzung, hilft meist: alle Dateien vollständig hochladen (inkl. <code>_next</code> und <code>api</code>) und Schreibrechte setzen (Ordner 755, Dateien 644).</p>
      <?php endif; ?>
    </div>

    <div class="card">
      <h2><?php echo $mode === 'update' ? 'Aktualisierung abschließen' : ($mode === 'legacy' ? 'Umstellung auf Version 2' : 'Einrichten'); ?></h2>
      <?php if ($mode === 'update'): ?>
        <p class="small">Neue Dateien wurden hochgeladen. Bestätigen Sie mit Ihrem Super-Admin-Konto. Konten, Runden, Golfplatzdaten und Einstellungen bleiben erhalten.</p>
      <?php elseif ($mode === 'legacy'): ?>
        <p class="small">Version 2 ersetzt das Haupt-Passwort durch persönliche Konten mit Rollen. Geben Sie das bisherige Haupt-Passwort ein und legen Sie Ihr Super-Admin-Konto an (es erhält dieses Passwort). Vorhandene Benutzer und ihre Runden werden übernommen.</p>
      <?php endif; ?>
      <form method="post">
        <input type="hidden" name="token" value="<?php echo h($token); ?>">
        <label for="base">Installationsordner <span class="hint">– automatisch erkannt</span></label>
        <input type="text" id="base" name="base" value="<?php echo h($baseForForm === '' ? '/' : $baseForForm); ?>">
        <label for="siteUrl">Adresse der Anwendung <span class="hint">– für Links in E-Mails</span></label>
        <input type="url" id="siteUrl" name="siteUrl" value="<?php echo h($siteUrlDefault); ?>">

        <?php if ($mode === 'update'): ?>
          <h3>Super-Admin-Konto</h3>
          <label for="email">E-Mail-Adresse</label>
          <input type="email" id="email" name="email" required autocomplete="username">
          <label for="password">Passwort</label>
          <input type="password" id="password" name="password" required autocomplete="current-password">
        <?php else: ?>
          <h3>Super-Admin-Konto</h3>
          <div class="grid">
            <div><label for="firstName">Vorname</label><input type="text" id="firstName" name="firstName" required autocomplete="given-name"></div>
            <div><label for="lastName">Nachname</label><input type="text" id="lastName" name="lastName" required autocomplete="family-name"></div>
          </div>
          <label for="email">E-Mail-Adresse <span class="hint">– zugleich Ihr Anmeldename</span></label>
          <input type="email" id="email" name="email" required autocomplete="username">
          <?php if ($mode === 'legacy'): ?>
            <label for="password">Bisheriges Haupt-Passwort</label>
            <input type="password" id="password" name="password" required autocomplete="current-password">
          <?php else: ?>
            <div class="grid">
              <div><label for="password">Passwort <span class="hint">– mind. <?php echo HCP_PASSWORD_MIN; ?> Zeichen</span></label><input type="password" id="password" name="password" required minlength="<?php echo HCP_PASSWORD_MIN; ?>" autocomplete="new-password"></div>
              <div><label for="password2">Passwort wiederholen</label><input type="password" id="password2" name="password2" required minlength="<?php echo HCP_PASSWORD_MIN; ?>" autocomplete="new-password"></div>
            </div>
          <?php endif; ?>
        <?php endif; ?>

        <?php if ($showMail): ?>
          <h3>E-Mail-Versand <span class="hint">– für Bestätigung der Registrierung und „Passwort vergessen“</span></h3>
          <label for="mailMode">Versandart</label>
          <select id="mailMode" name="mailMode">
            <option value="mail" <?php echo ($mailCfg['mode'] ?? 'mail') === 'mail' ? 'selected' : ''; ?>>PHP mail() des Webspace (Standard)</option>
            <option value="smtp" <?php echo ($mailCfg['mode'] ?? '') === 'smtp' ? 'selected' : ''; ?>>SMTP-Postfach (empfohlen, z. B. noreply@ihre-domain.de)</option>
            <option value="off" <?php echo ($mailCfg['mode'] ?? '') === 'off' ? 'selected' : ''; ?>>kein Versand (Bestätigung durch Admin)</option>
          </select>
          <div class="smtp" id="smtpFields">
            <div class="grid">
              <div><label for="smtpHost">SMTP-Server</label><input type="text" id="smtpHost" name="smtpHost" value="<?php echo h($mailCfg['host'] ?? ''); ?>" placeholder="smtp.ihr-hoster.de"></div>
              <div><label for="smtpPort">Port</label><input type="number" id="smtpPort" name="smtpPort" value="<?php echo h($mailCfg['port'] ?? 587); ?>"></div>
              <div><label for="smtpSecure">Verschlüsselung</label><select id="smtpSecure" name="smtpSecure"><option value="tls">STARTTLS (587)</option><option value="ssl">SSL/TLS (465)</option><option value="none">keine</option></select></div>
              <div><label for="smtpUser">Benutzer</label><input type="text" id="smtpUser" name="smtpUser" value="<?php echo h($mailCfg['user'] ?? ''); ?>" autocomplete="off"></div>
            </div>
            <label for="smtpPass">SMTP-Passwort</label>
            <input type="password" id="smtpPass" name="smtpPass" autocomplete="new-password">
          </div>
        <?php endif; ?>
        <button type="submit" <?php echo $allChecksOk ? '' : 'disabled'; ?>><?php echo $mode === 'update' ? 'Aktualisierung abschließen' : ($mode === 'legacy' ? 'Umstellen' : 'Installieren'); ?></button>
      </form>
    </div>
    <script>
      (function () {
        var sel = document.getElementById('mailMode'), box = document.getElementById('smtpFields');
        if (sel && box) {
          var sync = function () { box.className = 'smtp' + (sel.value === 'smtp' ? ' show' : ''); };
          sel.addEventListener('change', sync); sync();
        }
      })();
    </script>
  <?php endif; ?>
  <p class="small">Keine Datenbank nötig · Daten liegen im Ordner <code>data/</code> (vor Browserzugriff geschützt) · Passwörter nur als Hash gespeichert.</p>
</main>
</body>
</html>
