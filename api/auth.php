<?php
require __DIR__ . '/_lib.php';
if ($_SERVER['REQUEST_METHOD'] !== 'POST') responder(['erro' => 'Método não permitido'], 405);
$b = corpoJson();
if (!senhaOk($b['senha'] ?? null)) responder(['erro' => 'Senha inválida'], 401);
if (isset($b['nova'])) {
    if (strlen((string)$b['nova']) < 6) responder(['erro' => 'A nova senha precisa ter 6+ caracteres'], 400);
    salvarSenha((string)$b['nova']);
}
responder(['ok' => true]);
