<?php
// Emuliert das Apache-Verhalten eines typischen Webspaces für php -S (Test).
$uri = urldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));
$docroot = $_SERVER['DOCUMENT_ROOT'];
if (preg_match('#/data(/|$)#', $uri)) { http_response_code(403); echo "Forbidden"; return true; }
// RewriteRule ^(member|admin)(/.*)?$ gate.php?area=$1 (aus der von install.php geschriebenen .htaccess)
if (preg_match('#^(.*?)/(member|admin)(/.*)?$#', $uri, $m)) {
    $dir = $docroot . $m[1];
    $ht = $dir . '/.htaccess';
    if (is_file($dir . '/gate.php') && is_file($ht) && strpos((string)file_get_contents($ht), 'gate.php') !== false) {
        $_GET['area'] = $m[2];
        chdir($dir);
        include $dir . '/gate.php';
        return true;
    }
}
$path = $docroot . $uri;
if (is_dir($path)) {
    if (substr($uri, -1) !== '/') { header('Location: ' . $uri . '/'); http_response_code(301); return true; }
    if (is_file($path . 'index.html') || is_file($path . 'index.php')) return false;
}
if (is_file($path)) return false;
// ErrorDocument 404 → <base>/404.html
foreach (['/hcp/404.html', '/404.html'] as $e) {
    if (strpos($uri, dirname($e) === '/' ? '/' : dirname($e) . '/') === 0 && is_file($docroot . $e)) { http_response_code(404); readfile($docroot . $e); return true; }
}
http_response_code(404); echo "Not Found"; return true;
