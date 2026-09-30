<?php
/**
 * Installs ProcessWire's blank profile without the web installer.
 *
 * Does what install.php does: copies site-blank to site/, writes the database
 * settings and salts to site/config.php, imports the core and profile SQL, and
 * creates the superuser. Run as www-data from docker-compose (see install.sh).
 */

$root = '/var/www/html';
chdir($root);

if (is_file("$root/site/assets/installed.php")) {
    echo "Already installed\n";
    exit(0);
}

// site-blank -> site (site/modules/InputfieldJodit is already mounted there)
passthru("cp -rn $root/site-blank/. $root/site/", $status);
if ($status) exit(1);
rename("$root/site/htaccess.txt", "$root/site/.htaccess");
foreach (['files', 'cache', 'logs', 'backups', 'sessions'] as $dir) {
    if (!is_dir("$root/site/assets/$dir")) mkdir("$root/site/assets/$dir", 0775, true);
}
if (is_dir("$root/site/install/files")) passthru("cp -rn $root/site/install/files/. $root/site/assets/files/");

$db = [
    'host' => getenv('DB_HOST'),
    'name' => getenv('DB_NAME'),
    'user' => getenv('DB_USER'),
    'pass' => getenv('DB_PASS'),
];

file_put_contents("$root/site/config.php", "\n" . implode("\n", [
    "\$config->dbHost = " . var_export($db['host'], true) . ";",
    "\$config->dbName = " . var_export($db['name'], true) . ";",
    "\$config->dbUser = " . var_export($db['user'], true) . ";",
    "\$config->dbPass = " . var_export($db['pass'], true) . ";",
    "\$config->dbPort = '3306';",
    "\$config->dbCharset = 'utf8mb4';",
    "\$config->dbEngine = 'InnoDB';",
    "\$config->userAuthSalt = " . var_export(bin2hex(random_bytes(20)), true) . ";",
    "\$config->tableSalt = " . var_export(bin2hex(random_bytes(20)), true) . ";",
    "\$config->chmodDir = '0755';",
    "\$config->chmodFile = '0644';",
    "\$config->timezone = 'UTC';",
    "\$config->defaultAdminTheme = 'AdminThemeUikit';",
    "\$config->installed = " . time() . ";",
    "\$config->httpHosts = ['localhost', '127.0.0.1', 'web'];",
    "\$config->debug = true;",
]) . "\n", FILE_APPEND);

// Core and profile SQL, with the same replacements the installer makes for utf8mb4/InnoDB
$pdo = new PDO("mysql:host={$db['host']};dbname={$db['name']};charset=utf8mb4", $db['user'], $db['pass']);
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
require "$root/wire/core/WireDatabaseBackup.php";
$backup = new ProcessWire\WireDatabaseBackup();
$backup->setDatabase($pdo);
$ok = $backup->restoreMerge("$root/wire/core/install.sql", "$root/site/install/install.sql", [
    'findReplaceCreateTable' => ['(255)' => '(191)', '(250)' => '(191)', 'ENGINE=MyISAM' => 'ENGINE=InnoDB', 'CHARSET=utf8;' => 'CHARSET=utf8mb4;'],
]);
if (!$ok) {
    fwrite(STDERR, "SQL import failed:\n" . implode("\n", $backup->errors()) . "\n");
    exit(1);
}

// Superuser, as the installer's adminAccountSave() does
include "$root/index.php";
/** @var ProcessWire\ProcessWire $wire */
$users = $wire->users;
$user = $users->get($wire->config->superUserPageID);
if (!$user->id) {
    $user = new ProcessWire\User();
    $user->id = $wire->config->superUserPageID;
}
$user->name = getenv('E2E_USER');
$user->pass = getenv('E2E_PASS');
$user->email = 'e2e@example.invalid';
if (!$user->roles->has('superuser')) $user->roles->add($wire->roles->get('name=superuser'));
$users->save($user);

file_put_contents("$root/site/assets/installed.php", "<?php // installed by tests/e2e/docker/install.php\n");
echo "ProcessWire {$wire->config->version} installed; superuser " . getenv('E2E_USER') . "\n";
