<?php
/**
 * Golf HCP Rechner – Konto und Anmeldung (Webspace-Edition).
 *
 * Aktionen (?action=…):
 *   me                   GET/POST  Sitzung: { installed, user, csrf, settings }
 *   login                POST      { email, password }  (E-Mail oder – für ältere Konten – Benutzername)
 *   logout               POST
 *   register             POST      { firstName, lastName, email, password, passwordRepeat, handicapIndex?, acceptTerms }
 *   verify-email         POST      { token }
 *   resend-verification  POST      { email }             (Antwort immer gleich – keine Auskunft über Konten)
 *   forgot-password      POST      { email }             (Antwort immer gleich)
 *   reset-password       POST      { token, password, passwordRepeat }
 *   change-password      POST+CSRF { currentPassword, newPassword, newPasswordRepeat }
 *   update-profile       POST+CSRF { firstName, lastName, email, currentPassword? }
 *   export               POST+CSRF Datenauskunft (Konto + gespeicherte Daten)
 *   delete-account       POST+CSRF { password, confirm: "LÖSCHEN" }
 *
 * Die Rolle eines neuen Kontos ist immer USER – sie wird nie aus der Anfrage übernommen.
 */
declare(strict_types=1);
require __DIR__ . '/_lib.php';

$action = (string)($_GET['action'] ?? '');
$method = (string)($_SERVER['REQUEST_METHOD'] ?? 'GET');

if ($action === 'me') {
    $config = hcp_config();
    if ($config === null) {
        hcp_json(['installed' => false, 'user' => null, 'csrf' => null, 'settings' => hcp_public_settings()]);
    }
    $user = hcp_session_user($config);
    hcp_json([
        'installed' => true,
        'user' => $user ? hcp_session_view($config, $user) : null,
        'csrf' => $user ? hcp_csrf_token($config, $user) : null,
        'settings' => hcp_public_settings(),
        'appVersion' => hcp_app_version(),
    ]);
}

hcp_require_post();
$config = hcp_require_installed();
$settings = hcp_settings();

/** Konto zu E-Mail-Adresse oder (Konten der Version 1) Benutzername. */
function auth_find_login(string $login): ?array
{
    $login = strtolower(trim($login));
    if ($login === '') {
        return null;
    }
    return strpos($login, '@') !== false ? hcp_find_user('email', $login) : hcp_find_user('username', $login);
}

function auth_password_pair(array $body, string $field, string $repeatField): string
{
    $password = (string)($body[$field] ?? '');
    hcp_check_password($password, $field);
    if (array_key_exists($repeatField, $body) && (string)$body[$repeatField] !== $password) {
        hcp_fail('VALIDATION', 'Die Passwörter stimmen nicht überein.', 0, [$repeatField => 'Die Passwörter stimmen nicht überein.']);
    }
    return $password;
}

/** Generische Antwort (keine Auskunft, ob ein Konto existiert) mit gleichmäßiger Laufzeit. */
function auth_generic_ok(float $started): void
{
    $elapsed = microtime(true) - $started;
    if ($elapsed < 0.4) {
        usleep((int)((0.4 - $elapsed) * 1000000));
    }
    hcp_json(['ok' => true]);
}

switch ($action) {
    case 'login':
        if (hcp_rate_limited('login', 10, 900)) {
            hcp_fail('RATE_LIMITED', 'Zu viele Anmeldeversuche. Bitte in 15 Minuten erneut versuchen.');
        }
        $body = hcp_body(10000);
        $login = (string)($body['email'] ?? ($body['username'] ?? ''));
        $password = (string)($body['password'] ?? '');
        if (trim($login) === '' || $password === '') {
            hcp_fail('VALIDATION', 'Bitte E-Mail-Adresse und Passwort eingeben.', 0, array_filter([
                'email' => trim($login) === '' ? 'Bitte die E-Mail-Adresse eingeben.' : null,
                'password' => $password === '' ? 'Bitte das Passwort eingeben.' : null,
            ]));
        }
        $accountKey = 'acct:' . strtolower(trim($login));
        if (hcp_rate_limited('login-account', 8, 900, $accountKey)) {
            hcp_fail('RATE_LIMITED', 'Zu viele Anmeldeversuche für dieses Konto. Bitte in 15 Minuten erneut versuchen.');
        }
        $user = auth_find_login($login);
        $hash = $user !== null ? (string)($user['passwordHash'] ?? '') : '';
        // Gleiche Laufzeit mit und ohne Konto (Dummy-Hash)
        $ok = password_verify($password, $hash !== '' ? $hash : '$2y$12$YX/FoxoLk0uEU5H8LBYCmulL6rNss39lmm47W0mAeB7lthQ4ArgVq');
        if ($user === null || !$ok) {
            hcp_rate_hit('login', 900);
            hcp_rate_hit('login-account', 900, $accountKey);
            if ($user !== null) {
                hcp_audit('USER_LOGIN_FAILED', null, ['userId' => $user['id'], 'entityType' => 'user', 'entityId' => $user['id']]);
            }
            usleep(400000);
            hcp_fail('INVALID_CREDENTIALS');
        }
        if ($user['status'] === 'DISABLED') {
            hcp_fail('ACCOUNT_DISABLED');
        }
        if ($user['status'] === 'LOCKED') {
            hcp_fail('ACCOUNT_LOCKED');
        }
        if (!$user['emailVerified'] && !empty($settings['emailVerificationRequired'])) {
            hcp_fail('EMAIL_NOT_VERIFIED');
        }
        $user = hcp_update_user($user['id'], function (array &$u) use ($password) {
            $u['lastLoginAt'] = hcp_now();
            $u['lastActivityAt'] = $u['lastLoginAt'];
            if (password_needs_rehash((string)$u['passwordHash'], PASSWORD_DEFAULT)) {
                $u['passwordHash'] = password_hash($password, PASSWORD_DEFAULT);
            }
        });
        $csrf = hcp_issue_session($config, $user);
        hcp_json(['user' => hcp_session_view($config, $user), 'csrf' => $csrf]);
        break;

    case 'logout':
        hcp_clear_session($config);
        hcp_json(['ok' => true]);
        break;

    case 'register':
        if (empty($settings['registrationOpen'])) {
            hcp_fail('REGISTRATION_CLOSED');
        }
        if (hcp_rate_limited('register', 5, 3600)) {
            hcp_fail('RATE_LIMITED', 'Zu viele Registrierungen von diesem Anschluss. Bitte später erneut versuchen.');
        }
        $body = hcp_body(10000);
        $errors = [];
        $firstName = trim((string)($body['firstName'] ?? ''));
        $lastName = trim((string)($body['lastName'] ?? ''));
        $email = strtolower(trim((string)($body['email'] ?? '')));
        $password = (string)($body['password'] ?? '');
        if ($firstName === '' || hcp_len($firstName) > 60) {
            $errors['firstName'] = $firstName === '' ? 'Bitte den Vornamen eingeben.' : 'Zu lang.';
        }
        if ($lastName === '' || hcp_len($lastName) > 60) {
            $errors['lastName'] = $lastName === '' ? 'Bitte den Nachnamen eingeben.' : 'Zu lang.';
        }
        if (strlen($email) > 200 || !preg_match(HCP_EMAIL_PATTERN, $email)) {
            $errors['email'] = 'Bitte eine gültige E-Mail-Adresse eingeben.';
        }
        if (strlen($password) < HCP_PASSWORD_MIN || strlen($password) > 200) {
            $errors['password'] = 'Mindestens ' . HCP_PASSWORD_MIN . ' Zeichen.';
        } elseif ((string)($body['passwordRepeat'] ?? '') !== $password) {
            $errors['passwordRepeat'] = 'Die Passwörter stimmen nicht überein.';
        }
        $hcp = null;
        $rawHcp = $body['handicapIndex'] ?? null;
        if ($rawHcp !== null && $rawHcp !== '') {
            $hcp = is_numeric(str_replace(',', '.', (string)$rawHcp)) ? (float)str_replace(',', '.', (string)$rawHcp) : null;
            if ($hcp === null || $hcp < -10 || $hcp > 54) {
                $errors['handicapIndex'] = 'Handicap zwischen +10 und 54,0.';
            }
        }
        if (($body['acceptTerms'] ?? false) !== true) {
            $errors['acceptTerms'] = 'Bitte den Datenschutzhinweisen zustimmen.';
        }
        if ($errors) {
            hcp_fail('VALIDATION', 'Bitte die markierten Felder prüfen.', 0, $errors);
        }
        hcp_rate_hit('register', 3600);
        $verify = !empty($settings['emailVerificationRequired']);
        list($token, $tokenHash) = hcp_new_token();
        $user = hcp_with_users(function (array &$users) use ($firstName, $lastName, $email, $password, $verify, $tokenHash) {
            foreach ($users as $u) {
                if ($u['email'] === $email) {
                    hcp_fail('EMAIL_TAKEN', '', 0, ['email' => 'Für diese E-Mail-Adresse gibt es bereits ein Konto.']);
                }
            }
            if (count($users) >= 5000) {
                hcp_fail('REGISTRATION_CLOSED', 'Maximale Anzahl an Konten erreicht.');
            }
            $now = hcp_now();
            $user = hcp_normalize_user([
                'id' => hcp_new_id(),
                'email' => $email,
                'username' => null,
                'firstName' => $firstName,
                'lastName' => $lastName,
                'role' => 'USER',
                'status' => 'ACTIVE',
                'emailVerified' => !$verify,
                'emailVerifiedAt' => $verify ? null : $now,
                'verifyTokenHash' => $verify ? $tokenHash : null,
                'verifyExpires' => $verify ? time() + 48 * 3600 : null,
                'mustChangePassword' => false,
                'passwordHash' => password_hash($password, PASSWORD_DEFAULT),
                'passwordChangedAt' => $now,
                'createdAt' => $now,
                'updatedAt' => $now,
            ]);
            $users[] = $user;
            return $user;
        });
        $startHcp = $hcp === null ? 54.0 : round($hcp, 1);
        hcp_with_member_doc($user['id'], function (array &$doc) use ($user, $startHcp) {
            $doc = hcp_default_member_doc($user['id'], $startHcp);
        });
        hcp_audit('USER_REGISTERED', $user, ['userId' => $user['id'], 'entityType' => 'user', 'entityId' => $user['id'], 'newValue' => ['email' => $email, 'startHandicapIndex' => $startHcp]]);
        if ($verify) {
            $sent = hcp_send_verification($config, $user, $token);
            hcp_json(['verificationRequired' => true, 'mailSent' => $sent, 'email' => $email], 201);
        }
        $csrf = hcp_issue_session($config, $user);
        hcp_json(['verificationRequired' => false, 'user' => hcp_session_view($config, $user), 'csrf' => $csrf], 201);
        break;

    case 'verify-email':
        if (hcp_rate_limited('verify', 20, 900)) {
            hcp_fail('RATE_LIMITED');
        }
        $body = hcp_body(2000);
        $token = (string)($body['token'] ?? '');
        if ($token === '' || strlen($token) > 200) {
            hcp_fail('TOKEN_INVALID');
        }
        $hash = hash('sha256', $token);
        $found = hcp_with_users(function (array &$users) use ($hash) {
            foreach ($users as &$u) {
                if (!empty($u['verifyTokenHash']) && hash_equals((string)$u['verifyTokenHash'], $hash) && (int)$u['verifyExpires'] >= time()) {
                    $old = $u['email'];
                    if (!empty($u['pendingEmail'])) {
                        foreach ($users as $other) {
                            if ($other['id'] !== $u['id'] && $other['email'] === $u['pendingEmail']) {
                                hcp_fail('EMAIL_TAKEN');
                            }
                        }
                        $u['email'] = $u['pendingEmail'];
                    }
                    $u['pendingEmail'] = null;
                    $u['emailVerified'] = true;
                    $u['emailVerifiedAt'] = hcp_now();
                    $u['verifyTokenHash'] = null;
                    $u['verifyExpires'] = null;
                    $u['updatedAt'] = hcp_now();
                    return ['user' => $u, 'old' => $old];
                }
            }
            return null;
        });
        if ($found === null) {
            hcp_rate_hit('verify', 900);
            hcp_fail('TOKEN_INVALID');
        }
        $u = $found['user'];
        hcp_audit('USER_EMAIL_VERIFIED', $u, ['userId' => $u['id'], 'entityType' => 'user', 'entityId' => $u['id'], 'oldValue' => $found['old'] !== $u['email'] ? ['email' => $found['old']] : null, 'newValue' => ['email' => $u['email']]]);
        hcp_json(['ok' => true, 'email' => $u['email']]);
        break;

    case 'resend-verification':
        $started = microtime(true);
        $body = hcp_body(2000);
        $email = strtolower(trim((string)($body['email'] ?? '')));
        if (!hcp_rate_limited('resend', 5, 3600) && !hcp_rate_limited('resend-account', 3, 3600, $email) && preg_match(HCP_EMAIL_PATTERN, $email)) {
            hcp_rate_hit('resend', 3600);
            hcp_rate_hit('resend-account', 3600, $email);
            $user = hcp_find_user('email', $email);
            if ($user !== null && !$user['emailVerified'] && $user['status'] === 'ACTIVE') {
                list($token, $tokenHash) = hcp_new_token();
                $user = hcp_update_user($user['id'], function (array &$u) use ($tokenHash) {
                    $u['verifyTokenHash'] = $tokenHash;
                    $u['verifyExpires'] = time() + 48 * 3600;
                });
                hcp_send_verification($config, $user, $token);
            }
        }
        auth_generic_ok($started);
        break;

    case 'forgot-password':
        $started = microtime(true);
        $body = hcp_body(2000);
        $email = strtolower(trim((string)($body['email'] ?? '')));
        if (!preg_match(HCP_EMAIL_PATTERN, $email)) {
            hcp_fail('VALIDATION', 'Bitte eine gültige E-Mail-Adresse eingeben.', 0, ['email' => 'Bitte eine gültige E-Mail-Adresse eingeben.']);
        }
        if (!hcp_rate_limited('forgot', 5, 3600) && !hcp_rate_limited('forgot-account', 3, 3600, $email)) {
            hcp_rate_hit('forgot', 3600);
            hcp_rate_hit('forgot-account', 3600, $email);
            $user = hcp_find_user('email', $email);
            if ($user !== null && $user['status'] === 'ACTIVE') {
                list($token, $tokenHash) = hcp_new_token();
                $user = hcp_update_user($user['id'], function (array &$u) use ($tokenHash) {
                    $u['resetTokenHash'] = $tokenHash;
                    $u['resetExpires'] = time() + 3600;
                });
                hcp_send_reset($config, $user, $token);
                hcp_audit('USER_PASSWORD_RESET_REQUESTED', null, ['userId' => $user['id'], 'entityType' => 'user', 'entityId' => $user['id']]);
            }
        }
        auth_generic_ok($started);
        break;

    case 'reset-password':
        if (hcp_rate_limited('reset', 20, 900)) {
            hcp_fail('RATE_LIMITED');
        }
        $body = hcp_body(2000);
        $token = (string)($body['token'] ?? '');
        $password = auth_password_pair($body, 'password', 'passwordRepeat');
        if ($token === '' || strlen($token) > 200) {
            hcp_fail('TOKEN_INVALID');
        }
        $hash = hash('sha256', $token);
        $user = hcp_with_users(function (array &$users) use ($hash, $password) {
            foreach ($users as &$u) {
                if (!empty($u['resetTokenHash']) && hash_equals((string)$u['resetTokenHash'], $hash) && (int)$u['resetExpires'] >= time()) {
                    $now = hcp_now();
                    $u['passwordHash'] = password_hash($password, PASSWORD_DEFAULT);
                    $u['passwordChangedAt'] = $now; // meldet alle Geräte ab
                    $u['mustChangePassword'] = false;
                    $u['resetTokenHash'] = null;
                    $u['resetExpires'] = null;
                    // Der Link kam per E-Mail – damit ist die Adresse bestätigt
                    if (!$u['emailVerified']) {
                        $u['emailVerified'] = true;
                        $u['emailVerifiedAt'] = $now;
                    }
                    $u['updatedAt'] = $now;
                    return $u;
                }
            }
            return null;
        });
        if ($user === null) {
            hcp_rate_hit('reset', 900);
            hcp_fail('TOKEN_INVALID');
        }
        hcp_audit('USER_PASSWORD_RESET', $user, ['userId' => $user['id'], 'entityType' => 'user', 'entityId' => $user['id']]);
        hcp_json(['ok' => true]);
        break;

    case 'change-password':
        $user = hcp_require_user($config);
        if (hcp_rate_limited('change-password', 10, 900, $user['id'])) {
            hcp_fail('RATE_LIMITED');
        }
        $body = hcp_body(2000);
        $current = (string)($body['currentPassword'] ?? '');
        if (!password_verify($current, (string)$user['passwordHash'])) {
            hcp_rate_hit('change-password', 900, $user['id']);
            hcp_fail('VALIDATION', 'Das aktuelle Passwort ist falsch.', 0, ['currentPassword' => 'Das aktuelle Passwort ist falsch.']);
        }
        $next = auth_password_pair($body, 'newPassword', 'newPasswordRepeat');
        if ($next === $current) {
            hcp_fail('VALIDATION', 'Bitte ein neues Passwort wählen.', 0, ['newPassword' => 'Das neue Passwort muss sich vom bisherigen unterscheiden.']);
        }
        $user = hcp_update_user($user['id'], function (array &$u) use ($next) {
            $u['passwordHash'] = password_hash($next, PASSWORD_DEFAULT);
            $u['passwordChangedAt'] = hcp_now();
            $u['mustChangePassword'] = false;
        });
        hcp_audit('USER_PASSWORD_CHANGED', $user, ['userId' => $user['id'], 'entityType' => 'user', 'entityId' => $user['id']]);
        $csrf = hcp_issue_session($config, $user);
        hcp_json(['user' => hcp_session_view($config, $user), 'csrf' => $csrf]);
        break;

    case 'update-profile':
        $user = hcp_require_user($config);
        $body = hcp_body(4000);
        $firstName = hcp_check_name((string)($body['firstName'] ?? ''), 'firstName');
        $lastName = hcp_check_name((string)($body['lastName'] ?? ''), 'lastName');
        $email = array_key_exists('email', $body) && trim((string)$body['email']) !== '' ? hcp_check_email((string)$body['email']) : $user['email'];
        $emailChanged = $email !== $user['email'];
        if ($emailChanged) {
            if (!password_verify((string)($body['currentPassword'] ?? ''), (string)$user['passwordHash'])) {
                hcp_fail('VALIDATION', 'Zum Ändern der E-Mail-Adresse bitte das aktuelle Passwort eingeben.', 0, ['currentPassword' => 'Bitte das aktuelle Passwort eingeben.']);
            }
            if (hcp_find_user('email', (string)$email) !== null) {
                hcp_fail('EMAIL_TAKEN', '', 0, ['email' => 'Diese E-Mail-Adresse wird bereits verwendet.']);
            }
        }
        $old = ['firstName' => $user['firstName'], 'lastName' => $user['lastName'], 'email' => $user['email']];
        $token = null;
        $user = hcp_update_user($user['id'], function (array &$u) use ($firstName, $lastName, $email, $emailChanged, &$token) {
            $u['firstName'] = $firstName;
            $u['lastName'] = $lastName;
            if ($emailChanged) {
                if ($u['email'] === null) {
                    // Konto der Version 1 ohne E-Mail: Adresse direkt übernehmen, Bestätigung folgt
                    $u['email'] = $email;
                    $u['emailVerified'] = false;
                }
                list($plain, $hash) = hcp_new_token();
                $token = $plain;
                $u['pendingEmail'] = $u['email'] === $email ? null : $email;
                $u['verifyTokenHash'] = $hash;
                $u['verifyExpires'] = time() + 48 * 3600;
            }
        });
        if ($emailChanged && $token !== null) {
            $target = $user;
            $target['email'] = $user['pendingEmail'] ?: $user['email'];
            hcp_send_verification($config, $target, $token);
        }
        hcp_audit('USER_PROFILE_UPDATED', $user, ['userId' => $user['id'], 'entityType' => 'user', 'entityId' => $user['id'], 'oldValue' => $old, 'newValue' => ['firstName' => $firstName, 'lastName' => $lastName, 'email' => $email]]);
        hcp_cm_reindex($user['id']);
        hcp_json(['user' => hcp_session_view($config, $user), 'pendingEmail' => $user['pendingEmail'] ?? null]);
        break;

    case 'export':
        $user = hcp_require_user($config);
        $doc = hcp_load_member_doc($user['id']);
        $account = $user;
        foreach (['passwordHash', 'verifyTokenHash', 'resetTokenHash', 'verifyExpires', 'resetExpires'] as $k) {
            unset($account[$k]);
        }
        hcp_json(['format' => 'golf-hcp-rechner/datenauskunft', 'exportedAt' => hcp_now(), 'account' => $account, 'data' => $doc['data']]);
        break;

    case 'delete-account':
        $user = hcp_require_user($config);
        $body = hcp_body(2000);
        if (!password_verify((string)($body['password'] ?? ''), (string)$user['passwordHash'])) {
            hcp_fail('VALIDATION', 'Das Passwort ist falsch.', 0, ['password' => 'Das Passwort ist falsch.']);
        }
        if ((string)($body['confirm'] ?? '') !== 'LÖSCHEN') {
            hcp_fail('VALIDATION', 'Bitte zur Bestätigung LÖSCHEN eingeben.', 0, ['confirm' => 'Bitte LÖSCHEN eingeben.']);
        }
        $rounds = hcp_member_round_count($user['id']);
        hcp_with_users(function (array &$users) use ($user) {
            if ($user['role'] === 'SUPER_ADMIN') {
                $supers = array_filter($users, function ($u) {
                    return $u['role'] === 'SUPER_ADMIN' && $u['status'] === 'ACTIVE';
                });
                if (count($supers) <= 1) {
                    hcp_fail('CONFLICT', 'Das letzte Super-Admin-Konto kann nicht gelöscht werden.');
                }
            }
            $users = array_values(array_filter($users, function ($u) use ($user) {
                return $u['id'] !== $user['id'];
            }));
        });
        @unlink(hcp_member_file($user['id']));
        hcp_cm_remove_user($user['id']);
        hcp_audit('USER_DELETED', $user, ['userId' => $user['id'], 'entityType' => 'user', 'entityId' => $user['id'], 'oldValue' => ['email' => $user['email'], 'name' => trim($user['firstName'] . ' ' . $user['lastName']), 'rounds' => $rounds, 'selfService' => true]]);
        hcp_clear_session($config);
        hcp_json(['ok' => true]);
        break;

    default:
        hcp_fail('NOT_FOUND', 'Unbekannte Aktion');
}
