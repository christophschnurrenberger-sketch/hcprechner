<?php
/**
 * Golf HCP Rechner – Sitemap der Webspace-Edition (statische Seiten + Golfanlagen).
 */
declare(strict_types=1);
require __DIR__ . '/api/_lib.php';

$config = hcp_config();
$base = $config !== null ? (string)($config['basePath'] ?? '') : '';
$origin = (hcp_is_https() ? 'https' : 'http') . '://' . preg_replace('/[^A-Za-z0-9.:\-\[\]]/', '', (string)($_SERVER['HTTP_HOST'] ?? 'localhost'));
$root = $origin . $base;

$urls = [];
foreach (['/', '/golfplaetze/', '/methodik/', '/gbe-rechner/', '/simulator/'] as $p) {
    $urls[] = ['loc' => $root . $p, 'lastmod' => null];
}
$data = json_decode(hcp_dataset_json(), true);
if (is_array($data) && isset($data['courses']) && is_array($data['courses'])) {
    foreach ($data['courses'] as $c) {
        if (!is_array($c) || empty($c['active']) || ($c['facilityType'] ?? '') === 'DRIVING_RANGE' || empty($c['slug'])) {
            continue;
        }
        $urls[] = ['loc' => $root . '/golfplaetze/anlage/?slug=' . rawurlencode((string)$c['slug']), 'lastmod' => $c['lastVerifiedAt'] ?? null];
    }
}

header('Content-Type: application/xml; charset=utf-8');
header('Cache-Control: public, max-age=3600');
echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
foreach ($urls as $u) {
    echo '  <url><loc>' . htmlspecialchars($u['loc'], ENT_XML1 | ENT_QUOTES, 'UTF-8') . '</loc>';
    if (is_string($u['lastmod']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $u['lastmod'])) {
        echo '<lastmod>' . $u['lastmod'] . '</lastmod>';
    }
    echo "</url>\n";
}
echo "</urlset>\n";
