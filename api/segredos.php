<?php
// Salva / consulta / testa o token do Instagram (nunca é devolvido ao navegador).
require __DIR__ . '/fontes.php';
if ($_SERVER['REQUEST_METHOD'] !== 'POST') responder(['erro' => 'Método não permitido'], 405);
$b = corpoJson();
exigir('admin');
$s = lerSegredos();
$acao = $b['acao'] ?? 'status';
if ($acao === 'salvar') {
    if (isset($b['instagram_token']) && $b['instagram_token'] !== '') $s['instagram_token'] = trim((string)$b['instagram_token']);
    if (array_key_exists('instagram_user_id', $b)) $s['instagram_user_id'] = preg_replace('/\D/', '', (string)$b['instagram_user_id']);
    if (!empty($b['remover'])) unset($s['instagram_token'], $s['instagram_user_id']);
    salvarSegredos($s);
    @array_map('unlink', glob(DATA_DIR . '/cache-*.json') ?: []);
}
if ($acao === 'testar') {
    [$itens, $erro] = postsInstagram(5);
    responder(['ok' => !$erro, 'erro' => $erro, 'posts' => count($itens), 'exemplo' => $itens[0]['titulo'] ?? null]);
}
responder(['ok' => true, 'token' => !empty($s['instagram_token']), 'user_id' => $s['instagram_user_id'] ?? '']);
