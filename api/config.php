<?php
require __DIR__ . '/_lib.php';

if ($_SERVER['REQUEST_METHOD'] === 'GET') responder(lerConfig());

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!senhaOk($_SERVER['HTTP_X_ADMIN_SENHA'] ?? null)) responder(['erro' => 'Senha inválida'], 401);
    $cfg = corpoJson();
    if (!isset($cfg['site'], $cfg['radios']) || !is_array($cfg['radios'])) responder(['erro' => 'Configuração inválida'], 400);
    $json = json_encode($cfg, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if (strlen($json) > 8 * 1024 * 1024) responder(['erro' => 'Configuração grande demais'], 413);
    if (is_file(CONFIG_FILE)) @copy(CONFIG_FILE, DATA_DIR . '/config.backup.json');
    if (file_put_contents(CONFIG_FILE, $json, LOCK_EX) === false) responder(['erro' => 'Sem permissão de escrita na pasta data/'], 500);
    @array_map('unlink', glob(DATA_DIR . '/cache-*.json') ?: []);
    responder(['ok' => true]);
}
responder(['erro' => 'Método não permitido'], 405);
