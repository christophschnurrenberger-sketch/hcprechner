<?php
/**
 * Golf HCP Rechner – Zugangsschutz für /member und /admin (Webspace-Edition).
 *
 * .htaccess leitet alle Aufrufe dieser Bereiche hierher (RewriteRule … gate.php?area=…). Ohne gültige
 * Sitzung → Anmeldeseite; der Admin-Bereich zusätzlich nur mit der Berechtigung admin.access.
 * Die Seiten selbst enthalten keine Benutzerdaten – diese liefert ausschließlich die API nach eigener
 * Prüfung. Das Gate ist eine zusätzliche Schutzschicht und sorgt für saubere Weiterleitungen.
 */
declare(strict_types=1);
require __DIR__ . '/api/_lib.php';

$area = (string)($_GET['area'] ?? '');
if (!in_array($area, ['member', 'admin'], true)) {
    http_response_code(404);
    exit;
}

$config = hcp_config();
$base = rtrim((string)($config['basePath'] ?? ''), '/');
if ($config === null) {
    header('Location: ' . $base . '/install.php', true, 302);
    exit;
}

// Angefragten Pfad relativ zum Installationsordner bestimmen
$path = (string)parse_url((string)($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);
$path = rawurldecode($path);
if ($base !== '' && strpos($path, $base . '/') === 0) {
    $path = substr($path, strlen($base));
}
if (!preg_match('#^/' . $area . '(/|$)#', $path) || strpos($path, "\0") !== false || strpos($path, '..') !== false) {
    http_response_code(404);
    exit;
}
$query = (string)($_SERVER['QUERY_STRING'] ?? '');
$query = preg_replace('/(^|&)area=(member|admin)(&|$)/', '$1', $query);
$query = trim((string)$query, '&');

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
    http_response_code(404);
    $notFound = __DIR__ . '/404.html';
    if (is_file($notFound)) {
        header('Content-Type: text/html; charset=utf-8');
        readfile($notFound);
    }
    exit;
}

$types = ['html' => 'text/html; charset=utf-8', 'txt' => 'text/plain; charset=utf-8', 'json' => 'application/json'];
$ext = strtolower(pathinfo($real, PATHINFO_EXTENSION));
header('Content-Type: ' . ($types[$ext] ?? 'application/octet-stream'));
header('Cache-Control: private, no-store');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: same-origin');
readfile($real);
