<?php
/**
 * Golf HCP Rechner – optionale Synchronisation (anonymes Profil, nur mit geheimem Schlüssel).
 * Gespeichert wird nur der SHA-256-Hash des Schlüssels. Keine E-Mail, kein Name.
 *
 * Aktionen (immer POST, ?action=…; Schlüssel im Header X-Sync-Key):
 *   create            – Body { profile, rounds } → { profileId, key }
 *   pull   &id=…      – → { profile, rounds, updatedAt }
 *   push   &id=…      – Body { profile, rounds }
 *   delete &id=…
 */
declare(strict_types=1);
require __DIR__ . '/_lib.php';

hcp_require_post();
$config = hcp_require_installed();
if (empty($config['syncEnabled'])) {
    hcp_error('Synchronisation ist auf diesem Server deaktiviert', 403);
}

$action = (string)($_GET['action'] ?? '');

function sync_file(string $id): string
{
    if (!preg_match('/^[a-f0-9]{32}$/', $id)) {
        hcp_error('Profil nicht gefunden', 401);
    }
    return hcp_data_dir() . '/sync/' . $id . '.php';
}

/** Minimale Strukturprüfung – die vollständige Prüfung erfolgt im Browser (gleiches Schema wie der JSON-Export). */
function sync_payload(): array
{
    $body = hcp_body(HCP_SYNC_MAX);
    if (!isset($body['profile']) || !is_array($body['profile']) || !isset($body['rounds']) || !is_array($body['rounds'])) {
        hcp_error('Ungültige Daten', 400);
    }
    if (count($body['rounds']) > 5000) {
        hcp_error('Zu viele Runden', 413);
    }
    return ['profile' => $body['profile'], 'rounds' => array_values($body['rounds'])];
}

function sync_load(string $id): array
{
    $raw = hcp_read_guarded(sync_file($id));
    $data = $raw === null ? null : json_decode($raw, true);
    if (!is_array($data)) {
        hcp_error('Profil nicht gefunden', 401);
    }
    $key = (string)($_SERVER['HTTP_X_SYNC_KEY'] ?? '');
    if ($key === '' || !hash_equals((string)$data['keyHash'], hash('sha256', $key))) {
        hcp_rate_hit('sync', 900);
        hcp_error('Schlüssel ungültig', 401);
    }
    return $data;
}

if (hcp_rate_limited('sync', 30, 900)) {
    hcp_error('Zu viele Fehlversuche – bitte später erneut versuchen.', 429);
}

$id = (string)($_GET['id'] ?? '');
switch ($action) {
    case 'create':
        if (hcp_rate_limited('sync-create', 20, 3600)) {
            hcp_error('Zu viele neue Profile – bitte später erneut versuchen.', 429);
        }
        $payload = sync_payload();
        hcp_rate_hit('sync-create', 3600);
        $profileId = bin2hex(random_bytes(16));
        $key = bin2hex(random_bytes(24));
        $now = gmdate('Y-m-d\TH:i:s\Z');
        hcp_write_guarded(sync_file($profileId), json_encode([
            'keyHash' => hash('sha256', $key),
            'profile' => $payload['profile'],
            'rounds' => $payload['rounds'],
            'createdAt' => $now,
            'updatedAt' => $now,
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        hcp_json(['profileId' => $profileId, 'key' => $key], 201);
        break;

    case 'pull':
        $data = sync_load($id);
        hcp_json(['profile' => $data['profile'], 'rounds' => $data['rounds'], 'updatedAt' => $data['updatedAt'] ?? null]);
        break;

    case 'push':
        $data = sync_load($id);
        $payload = sync_payload();
        $data['profile'] = $payload['profile'];
        $data['rounds'] = $payload['rounds'];
        $data['updatedAt'] = gmdate('Y-m-d\TH:i:s\Z');
        hcp_write_guarded(sync_file($id), json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        hcp_json(['ok' => true, 'updatedAt' => $data['updatedAt']]);
        break;

    case 'delete':
        sync_load($id);
        @unlink(sync_file($id));
        hcp_json(['ok' => true]);
        break;

    default:
        hcp_error('Unbekannte Aktion', 400);
}
