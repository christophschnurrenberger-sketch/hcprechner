<?php
/**
 * Golf HCP Rechner – Zugangsschutz für /member und /admin (Webspace-Edition).
 *
 * .htaccess leitet alle Aufrufe dieser Bereiche hierher (RewriteRule … /<ordner>/gate.php?area=…). Ohne gültige
 * Sitzung → Anmeldeseite; der Admin-Bereich zusätzlich nur mit der Berechtigung admin.access.
 * Die Seiten selbst enthalten keine Benutzerdaten – diese liefert ausschließlich die API nach eigener
 * Prüfung. Das Gate ist eine zusätzliche Schutzschicht und sorgt für saubere Weiterleitungen.
 */
declare(strict_types=1);
require __DIR__ . '/api/_lib.php';

$config = hcp_config();
$base = rtrim((string)($config['basePath'] ?? ''), '/');

/** 404 mit der Fehlerseite der Anwendung. */
function gate_not_found(): void
{
    http_response_code(404);
    header('Cache-Control: no-store');
    $notFound = __DIR__ . '/404.html';
    if (is_file($notFound)) {
        header('Content-Type: text/html; charset=utf-8');
        readfile($notFound);
    }
    exit;
}

/** Entfernt den internen Parameter area=member|admin (auch mehrfach) aus einer Query. */
function gate_clean_query(string $query): string
{
    $parts = array_filter(explode('&', $query), function ($part) {
        return $part !== '' && !preg_match('/^area=(member|admin)$/', $part);
    });
    return implode('&', $parts);
}

if ($config === null) {
    header('Location: ' . $base . '/install.php', true, 302);
    exit;
}

// Angefragten Pfad relativ zum Installationsordner bestimmen. REQUEST_URI ist die ursprüngliche Adresse;
// einzelne Server liefern dort die umgeschriebene (gate.php) – dann gilt REDIRECT_URL.
$area = '';
$path = '';
$rawQuery = '';
$candidates = [(string)($_SERVER['REQUEST_URI'] ?? '')];
if (!empty($_SERVER['REDIRECT_URL'])) {
    $candidates[] = (string)$_SERVER['REDIRECT_URL'] . (isset($_SERVER['REDIRECT_QUERY_STRING']) ? '?' . $_SERVER['REDIRECT_QUERY_STRING'] : '');
}
foreach ($candidates as $uri) {
    $p = rawurldecode((string)parse_url($uri, PHP_URL_PATH));
    if ($base !== '' && strpos($p, $base . '/') === 0) {
        $p = substr($p, strlen($base));
    }
    if (preg_match('#^/(member|admin)(/|$)#', $p, $m)) {
        $area = $m[1];
        $path = $p;
        $rawQuery = (string)parse_url($uri, PHP_URL_QUERY);
        break;
    }
}
if ($area === '' || strpos($path, "\0") !== false || strpos($path, '..') !== false) {
    gate_not_found();
}
$query = gate_clean_query($rawQuery);

// Adresse mit angehängtem area=… (z. B. aus einer Verzeichnis-Weiterleitung von Apache) bereinigen
if ($query !== $rawQuery) {
    header('Cache-Control: no-store');
    header('Location: ' . $base . $path . ($query !== '' ? '?' . $query : ''), true, 302);
    exit;
}

$isPage = !preg_match('#\.[a-z0-9]+$#i', $path) || substr($path, -5) === '.html';
if ($isPage && substr($path, -1) !== '/' && substr($path, -5) !== '.html') {
    header('Location: ' . $base . $path . '/' . ($query !== '' ? '?' . $query : ''), true, 301);
    exit;
}

$reason = null;
$user = hcp_session_user($config, $reason);
if ($user === null || ($area === 'admin' && !hcp_can($user, 'admin.access'))) {
    if (!$isPage) {
        http_response_code($user === null ? 401 : 403);
        header('Cache-Control: no-store');
        exit;
    }
    header('Cache-Control: no-store');
    if ($user === null) {
        $next = $path . ($query !== '' ? '?' . $query : '');
        header('Location: ' . $base . '/login/?next=' . rawurlencode($next) . ($reason === 'expired' ? '&expired=1' : ''), true, 302);
    } else {
        header('Location: ' . $base . '/member/?denied=admin', true, 302);
    }
    exit;
}

$file = __DIR__ . $path . (substr($path, -1) === '/' ? 'index.html' : '');
$real = realpath($file);
$rootArea = realpath(__DIR__ . '/' . $area);
if ($real === false || $rootArea === false || strpos($real, $rootArea . DIRECTORY_SEPARATOR) !== 0 && $real !== $rootArea || !is_file($real)) {
    gate_not_found();
}

$types = ['html' => 'text/html; charset=utf-8', 'txt' => 'text/plain; charset=utf-8', 'json' => 'application/json'];
$ext = strtolower(pathinfo($real, PATHINFO_EXTENSION));
header('Content-Type: ' . ($types[$ext] ?? 'application/octet-stream'));
header('Cache-Control: private, no-store');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: same-origin');
readfile($real);
