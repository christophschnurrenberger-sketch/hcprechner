<?php
/**
 * Golf HCP Rechner – öffentlicher Golfplatz-Datensatz (nur lesen).
 * Suche und Filter laufen im Browser (gleiche Logik wie die Node-Edition).
 */
declare(strict_types=1);
require __DIR__ . '/_lib.php';

if (!in_array($_SERVER['REQUEST_METHOD'] ?? 'GET', ['GET', 'HEAD'], true)) {
    header('Allow: GET, HEAD');
    hcp_error('Nur GET erlaubt', 405);
}

$json = hcp_dataset_json();
// Änderungsprotokoll und Importläufe sind interne Admin-Daten
$data = json_decode($json, true);
if (is_array($data) && (isset($data['changes']) || isset($data['importRuns']))) {
    $data['changes'] = [];
    $data['importRuns'] = [];
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}
hcp_send_raw_json($json);
