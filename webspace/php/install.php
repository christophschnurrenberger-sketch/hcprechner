<?php
/**
 * Golf HCP Rechner – WHS 2026 · Installation für klassischen PHP-Webspace
 *
 * 1. Alle Dateien des ZIP-Archivs per FTP in einen Ordner hochladen (z. B. /hcp oder die Domain-Wurzel).
 * 2. https://ihre-domain.de/<ordner>/install.php im Browser aufrufen.
 * 3. Admin-Passwort festlegen – fertig.
 *
 * Was passiert dabei?
 * - Der Installationsordner wird erkannt und in alle Seiten-/Skriptdateien eingetragen
 *   (Platzhalter /__HCP_BASE__ → z. B. /hcp).
 * - data/config.php mit dem Passwort-Hash wird angelegt (kein Klartext, keine Datenbank nötig).
 * - .htaccess (Fehlerseite, Caching, Sicherheits-Header) und robots.txt werden geschrieben.
 *
 * Update: Neue Version einfach über die alte hochladen (der Ordner data/ bleibt erhalten) und
 * install.php erneut aufrufen – dann genügt das Admin-Passwort.
 *
 * Bewusst einfach gehalten: eine Datei, keine Abhängigkeiten, lauffähig ab PHP 7.4.
 */

error_reporting(E_ALL);
ini_set('display_errors', '0');

define('HCP_PLACEHOLDER', '/__HCP_BASE__');
define('HCP_GUARD', "<?php exit; ?>\n");
define('HCP_MIN_PHP', '7.4.0');

$ROOT = __DIR__;
$DATA = $ROOT . '/data';
$CONFIG_FILE = $DATA . '/config.php';
$TEXT_EXTENSIONS = array('html', 'htm', 'js', 'mjs', 'css', 'txt', 'json', 'xml', 'webmanifest', 'svg', 'map', 'rsc');
$SKIP_DIRS = array('data', 'api', '.well-known');

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

function h($s)
{
    return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
}

function read_guarded($file)
{
    if (!is_file($file)) {
        return null;
    }
    $c = file_get_contents($file);
    if ($c === false) {
        return null;
    }
    if (strncmp($c, HCP_GUARD, strlen(HCP_GUARD)) === 0) {
        $c = substr($c, strlen(HCP_GUARD));
    }
    return $c;
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

function load_config($file)
{
    $raw = read_guarded($file);
    if ($raw === null) {
        return null;
    }
    $c = json_decode($raw, true);
    return is_array($c) ? $c : null;
}

function detect_base_path()
{
    $script = isset($_SERVER['SCRIPT_NAME']) ? (string)$_SERVER['SCRIPT_NAME'] : '/install.php';
    $dir = str_replace('\\', '/', dirname($script));
    return normalize_base_path($dir);
}

/** '' für die Domain-Wurzel, sonst '/ordner' bzw. '/ordner/unterordner' (ohne Schrägstrich am Ende). */
function normalize_base_path($value)
{
    $value = trim((string)$value);
    $value = '/' . trim($value, "/ \t");
    if ($value === '/') {
        return '';
    }
    if (!preg_match('#^(/[A-Za-z0-9._~-]+)+$#', $value)) {
        return false;
    }
    return $value;
}

function is_https()
{
    if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
        return true;
    }
    return isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && strtolower($_SERVER['HTTP_X_FORWARDED_PROTO']) === 'https';
}

function site_origin()
{
    $host = isset($_SERVER['HTTP_HOST']) ? preg_replace('/[^A-Za-z0-9.:\-\[\]]/', '', $_SERVER['HTTP_HOST']) : 'localhost';
    return (is_https() ? 'https' : 'http') . '://' . $host;
}

/** Alle Textdateien der Anwendung (ohne data/, api/ und install.php). */
function text_files($root, $extensions, $skipDirs)
{
    $result = array();
    $it = new RecursiveIteratorIterator(
        new RecursiveCallbackFilterIterator(
            new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS),
            function ($current, $key, $iterator) use ($root, $skipDirs) {
                if ($current->isDir()) {
                    $rel = ltrim(str_replace('\\', '/', substr($current->getPathname(), strlen($root))), '/');
                    return !in_array($rel, $skipDirs, true);
                }
                return true;
            }
        )
    );
    foreach ($it as $file) {
        if (!$file->isFile()) {
            continue;
        }
        $ext = strtolower(pathinfo($file->getFilename(), PATHINFO_EXTENSION));
        if (!in_array($ext, $extensions, true)) {
            continue;
        }
        if ($file->getPathname() === __FILE__) {
            continue;
        }
        $result[] = $file->getPathname();
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
    $index = $root . '/index.html';
    if (!is_file($index)) {
        return false;
    }
    $c = file_get_contents($index);
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
            $errors[] = 'Nicht lesbar: ' . $f;
            continue;
        }
        $n = str_replace(array('\\/__HCP_BASE__', HCP_PLACEHOLDER), array($escapedBase, $base), $c);
        if ($n === $c) {
            continue;
        }
        if (@file_put_contents($f, $n, LOCK_EX) === false) {
            $errors[] = 'Nicht beschreibbar: ' . $f;
            continue;
        }
        $count++;
    }
    return $count;
}

function htaccess_block($base, $minimal)
{
    $lines = array();
    $lines[] = '# BEGIN Golf HCP Rechner';
    $lines[] = '# Von install.php erzeugt – dieser Block wird bei jeder Installation/Aktualisierung neu geschrieben.';
    $lines[] = 'ErrorDocument 404 ' . ($base === '' ? '' : $base) . '/404.html';
    if (!$minimal) {
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
function write_htaccess($root, $base, $minimal)
{
    $file = $root . '/.htaccess';
    $existing = is_file($file) ? (string)file_get_contents($file) : '';
    $existing = preg_replace('/# BEGIN Golf HCP Rechner.*?# END Golf HCP Rechner\n?/s', '', $existing);
    $content = htaccess_block($base, $minimal) . ($existing !== '' ? "\n" . ltrim($existing) : '');
    return write_file($file, $content);
}

function ensure_data_dir($data)
{
    $ok = true;
    foreach (array('', '/sync', '/backups', '/ratelimit', '/sessions') as $sub) {
        $dir = $data . $sub;
        if (!is_dir($dir)) {
            $ok = @mkdir($dir, 0755, true) && $ok;
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

function app_version($root)
{
    $f = $root . '/version.txt';
    return is_file($f) ? trim((string)file_get_contents($f)) : '';
}

// ---------------------------------------------------------------------------
// Ablauf
// ---------------------------------------------------------------------------

$checks = array();
$phpOk = version_compare(PHP_VERSION, HCP_MIN_PHP, '>=');
$checks[] = array('PHP-Version ' . PHP_VERSION . ' (mindestens 7.4)', $phpOk);
$checks[] = array('PHP-Erweiterung json', function_exists('json_encode'));
$checks[] = array('PHP-Sessions', function_exists('session_start'));
$checks[] = array('Sichere Zufallszahlen (random_bytes)', function_exists('random_bytes'));
$checks[] = array('Passwort-Hashing (password_hash)', function_exists('password_hash'));
$checks[] = array('Anwendungsdateien vorhanden (index.html, _next/)', is_file($ROOT . '/index.html') && is_dir($ROOT . '/_next'));
$checks[] = array('PHP-Skripte vorhanden (api/admin.php)', is_file($ROOT . '/api/admin.php'));
$dataWritable = (is_dir($DATA) && is_writable($DATA)) || (!is_dir($DATA) && is_writable($ROOT));
$checks[] = array('Ordner data/ beschreibbar', $dataWritable);
$checks[] = array('Installationsordner beschreibbar (.htaccess)', is_writable($ROOT));
$allChecksOk = true;
foreach ($checks as $c) {
    $allChecksOk = $allChecksOk && $c[1];
}

$config = load_config($CONFIG_FILE);
$installed = $config !== null;
$rewriteNeeded = needs_rewrite($ROOT);
$detectedBase = detect_base_path();
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
    $ok = write_htaccess($ROOT, (string)$config['basePath'], true);
    echo json_encode(array('ok' => $ok));
    exit;
}

$wasInstalled = $installed;
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['token'])) {
    if (!hash_equals($token, (string)$_POST['token'])) {
        $errors[] = 'Sitzung abgelaufen – bitte die Seite neu laden.';
    } elseif (!$allChecksOk) {
        $errors[] = 'Bitte zuerst die markierten Voraussetzungen erfüllen.';
    } else {
        $base = normalize_base_path(isset($_POST['base']) ? $_POST['base'] : $detectedBase);
        $password = isset($_POST['password']) ? (string)$_POST['password'] : '';
        if ($base === false) {
            $errors[] = 'Der Installationsordner darf nur Buchstaben, Ziffern, Punkt, Bindestrich und Unterstrich enthalten.';
        }
        if ($installed) {
            // Aktualisierung: nur mit dem bestehenden Admin-Passwort
            if (!password_verify($password, (string)$config['adminPasswordHash'])) {
                usleep(700000);
                $errors[] = 'Admin-Passwort falsch.';
            }
        } else {
            $repeat = isset($_POST['password2']) ? (string)$_POST['password2'] : '';
            if (strlen($password) < 8) {
                $errors[] = 'Das Admin-Passwort muss mindestens 8 Zeichen lang sein.';
            } elseif ($password !== $repeat) {
                $errors[] = 'Die Passwörter stimmen nicht überein.';
            }
        }
        if ($installed && !$rewriteNeeded && $base !== false && $base !== (string)$config['basePath']) {
            $errors[] = 'Die Anwendung ist bereits für ' . ($config['basePath'] === '' ? 'die Domain-Wurzel' : $config['basePath'])
                . ' eingerichtet. Zum Verschieben bitte alle Dateien (außer data/) neu hochladen und install.php erneut aufrufen.';
        }

        if (!$errors) {
            // 1. Platzhalter in allen Textdateien ersetzen – vorher Schreibrechte prüfen
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
            $newConfig = $installed ? $config : array();
            if (!$installed) {
                $newConfig['adminPasswordHash'] = password_hash($password, PASSWORD_DEFAULT);
                $newConfig['installedAt'] = gmdate('Y-m-d\TH:i:s\Z');
            }
            $newConfig['basePath'] = $base;
            $newConfig['syncEnabled'] = !empty($_POST['sync']);
            $newConfig['appVersion'] = app_version($ROOT);
            $newConfig['updatedAt'] = gmdate('Y-m-d\TH:i:s\Z');
            if (!write_file($CONFIG_FILE, HCP_GUARD . json_encode($newConfig, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES))) {
                $errors[] = 'data/config.php konnte nicht geschrieben werden.';
            }
            if (!write_htaccess($ROOT, $base, false)) {
                $errors[] = '.htaccess konnte nicht geschrieben werden (die Anwendung funktioniert trotzdem, nur ohne eigene Fehlerseite).';
            }
            if ($base === '') {
                $robots = "User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/\nDisallow: /data/\n\nSitemap: " . site_origin() . "/sitemap.php\n";
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
                $done = array('base' => $base, 'files' => $rewritten, 'update' => $wasInstalled);
            }
        }
    }
}

$mode = $done ? 'done' : (!$installed ? 'install' : ($rewriteNeeded ? 'update' : 'installed'));
$baseForForm = $installed && !$rewriteNeeded ? (string)$config['basePath'] : ($installed ? (string)$config['basePath'] : $detectedBase);
if ($installed && $rewriteNeeded && $detectedBase !== false && $detectedBase !== (string)$config['basePath']) {
    $baseForForm = $detectedBase; // Dateien wurden in einen anderen Ordner hochgeladen
}
$appUrl = ($mode === 'done' ? $done['base'] : ($installed ? (string)$config['basePath'] : (string)$detectedBase)) . '/';
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');
?><!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Installation · Golf HCP Rechner</title>
<style>
  :root { --bg:#f6f7f5; --surface:#fff; --ink:#1b1f1c; --ink2:#4b534d; --border:#dfe3de; --brand:#1f6f43; --good:#1f7a3f; --bad:#b42318; --warn:#9a6700; }
  @media (prefers-color-scheme: dark) { :root { --bg:#111412; --surface:#1a1e1b; --ink:#eef1ee; --ink2:#a9b2ab; --border:#2c332e; --brand:#5fc28b; --good:#5fc28b; --bad:#ff8a80; --warn:#e3b341; } }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
  main { max-width:640px; margin:0 auto; padding:32px 16px 64px; }
  h1 { font-size:22px; margin:0 0 4px; } h2 { font-size:16px; margin:0 0 12px; }
  .sub { color:var(--ink2); margin:0 0 24px; }
  .card { background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:20px; margin-bottom:16px; }
  ul.checks { list-style:none; padding:0; margin:0; } ul.checks li { display:flex; gap:8px; padding:3px 0; }
  .ok { color:var(--good); font-weight:600; } .no { color:var(--bad); font-weight:600; }
  label { display:block; font-weight:600; margin:14px 0 4px; } .hint { color:var(--ink2); font-size:13px; font-weight:400; }
  input[type=password], input[type=text] { width:100%; padding:10px 12px; border:1px solid var(--border); border-radius:8px; background:var(--bg); color:var(--ink); font:inherit; }
  .row { display:flex; gap:8px; align-items:center; margin-top:14px; } .row label { margin:0; font-weight:400; }
  button, .btn { display:inline-block; margin-top:18px; background:var(--brand); color:#fff; border:0; border-radius:8px; padding:10px 18px; font:inherit; font-weight:600; cursor:pointer; text-decoration:none; }
  .btn.secondary { background:transparent; color:var(--brand); border:1px solid var(--border); margin-left:8px; }
  .err { border-color:var(--bad); } .err li { color:var(--bad); }
  code { background:var(--bg); padding:1px 5px; border-radius:4px; font-size:13px; }
  .small { font-size:13px; color:var(--ink2); }
</style>
</head>
<body>
<main>
  <h1>Golf HCP Rechner – WHS 2026</h1>
  <p class="sub">Installation auf Ihrem Webspace<?php echo app_version($ROOT) !== '' ? ' · Version ' . h(app_version($ROOT)) : ''; ?></p>

  <?php if ($errors): ?>
    <div class="card err"><h2>Bitte prüfen</h2><ul><?php foreach ($errors as $e): ?><li><?php echo $e; ?></li><?php endforeach; ?></ul></div>
  <?php endif; ?>

  <?php if ($mode === 'done'): ?>
    <div class="card">
      <h2 class="ok">✓ <?php echo $done['update'] ? 'Aktualisierung' : 'Installation'; ?> abgeschlossen</h2>
      <p>Die Anwendung ist unter <code><?php echo h(site_origin() . $appUrl); ?></code> eingerichtet<?php echo $done['files'] ? ' (' . (int)$done['files'] . ' Dateien angepasst)' : ''; ?>.</p>
      <p id="selftest" class="small">Prüfe die Erreichbarkeit …</p>
      <a class="btn" href="<?php echo h($appUrl); ?>">Zur Anwendung</a>
      <a class="btn secondary" href="<?php echo h($appUrl); ?>admin/">Admin-Bereich</a>
    </div>
    <div class="card small">
      <p><strong>Nächste Schritte:</strong> Im Admin-Bereich Golfanlagen anlegen oder verifizierte Ratingdaten per CSV importieren. Ihre Runden speichert jeder Nutzer lokal im eigenen Browser.</p>
      <p>Diese Datei (<code>install.php</code>) kann bleiben: Sie ist ohne Admin-Passwort wirkungslos und wird für künftige Updates benötigt.</p>
    </div>
    <script>
      (function () {
        var el = document.getElementById('selftest');
        fetch(<?php echo json_encode($appUrl); ?>, { cache: 'no-store' }).then(function (r) {
          if (r.status === 500) {
            // Einzelne .htaccess-Anweisungen sind beim Hoster nicht erlaubt → minimale Fassung schreiben
            var body = new URLSearchParams({ token: <?php echo json_encode($token); ?> });
            return fetch('install.php?fix=htaccess', { method: 'POST', body: body }).then(function () {
              el.textContent = 'Hinweis: Die .htaccess wurde auf eine vereinfachte Fassung umgestellt (Ihr Hoster erlaubt nicht alle Anweisungen).';
            });
          }
          el.textContent = r.ok ? '✓ Startseite erreichbar.' : 'Startseite antwortet mit HTTP ' + r.status + '.';
        }).catch(function () { el.textContent = ''; });
      })();
    </script>

  <?php elseif ($mode === 'installed'): ?>
    <div class="card">
      <h2 class="ok">✓ Bereits installiert</h2>
      <p>Die Anwendung ist unter <code><?php echo h(site_origin() . $appUrl); ?></code> eingerichtet.</p>
      <a class="btn" href="<?php echo h($appUrl); ?>">Zur Anwendung</a>
      <a class="btn secondary" href="<?php echo h($appUrl); ?>admin/">Admin-Bereich</a>
    </div>
    <div class="card">
      <h2>Einstellungen ändern</h2>
      <form method="post">
        <input type="hidden" name="token" value="<?php echo h($token); ?>">
        <input type="hidden" name="base" value="<?php echo h($baseForForm); ?>">
        <div class="row"><input type="checkbox" id="sync" name="sync" value="1" <?php echo !empty($config['syncEnabled']) ? 'checked' : ''; ?>><label for="sync">Optionale Synchronisation zwischen Geräten erlauben</label></div>
        <label for="password">Admin-Passwort <span class="hint">zur Bestätigung</span></label>
        <input type="password" id="password" name="password" autocomplete="current-password" required>
        <button type="submit">Speichern</button>
      </form>
      <p class="small">Update auf eine neue Version: alle Dateien des neuen ZIP-Archivs hochladen (der Ordner <code>data/</code> bleibt erhalten) und diese Seite erneut aufrufen.</p>
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
        <p class="small">Fehlt eine Voraussetzung, hilft meist: PHP-Version im Kundenmenü des Hosters auf 8.x stellen, alle Dateien vollständig hochladen (inkl. <code>_next</code> und <code>api</code>) und Schreibrechte setzen (Ordner 755, Dateien 644).</p>
      <?php endif; ?>
    </div>

    <div class="card">
      <h2><?php echo $mode === 'update' ? 'Aktualisierung abschließen' : 'Einrichten'; ?></h2>
      <?php if ($mode === 'update'): ?>
        <p class="small">Neue Dateien wurden hochgeladen. Bestätigen Sie mit dem Admin-Passwort, um die Aktualisierung abzuschließen. Golfplatzdaten und Einstellungen bleiben erhalten.</p>
      <?php endif; ?>
      <form method="post">
        <input type="hidden" name="token" value="<?php echo h($token); ?>">
        <label for="base">Installationsordner <span class="hint">– automatisch erkannt</span></label>
        <input type="text" id="base" name="base" value="<?php echo h($baseForForm === '' ? '/' : $baseForForm); ?>">
        <p class="small">Adresse der Anwendung: <code><?php echo h(site_origin()); ?><span id="basePreview"><?php echo h($baseForForm); ?></span>/</code></p>
        <?php if ($mode === 'install'): ?>
          <label for="password">Admin-Passwort <span class="hint">– mindestens 8 Zeichen, für die Pflege der Golfplatzdaten</span></label>
          <input type="password" id="password" name="password" autocomplete="new-password" minlength="8" required>
          <label for="password2">Passwort wiederholen</label>
          <input type="password" id="password2" name="password2" autocomplete="new-password" minlength="8" required>
        <?php else: ?>
          <label for="password">Admin-Passwort</label>
          <input type="password" id="password" name="password" autocomplete="current-password" required>
        <?php endif; ?>
        <div class="row"><input type="checkbox" id="sync" name="sync" value="1" <?php echo (!$installed || !empty($config['syncEnabled'])) ? 'checked' : ''; ?>><label for="sync">Optionale Synchronisation zwischen Geräten erlauben <span class="hint">(anonymes Profil mit geheimem Schlüssel)</span></label></div>
        <button type="submit" <?php echo $allChecksOk ? '' : 'disabled'; ?>><?php echo $mode === 'update' ? 'Aktualisierung abschließen' : 'Installieren'; ?></button>
      </form>
    </div>
    <script>
      (function () {
        var input = document.getElementById('base'), out = document.getElementById('basePreview');
        if (!input || !out) return;
        input.addEventListener('input', function () { var v = '/' + input.value.replace(/^\/+|\/+$/g, ''); out.textContent = v === '/' ? '' : v; });
      })();
    </script>
  <?php endif; ?>
  <p class="small">Keine Datenbank nötig · Daten liegen im Ordner <code>data/</code> (vor Browserzugriff geschützt) · Runden der Nutzer bleiben in deren Browser.</p>
</main>
</body>
</html>
