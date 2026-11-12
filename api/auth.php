<?php
// Login, sessão e troca da própria senha.
require __DIR__ . '/_lib.php';
if ($_SERVER['REQUEST_METHOD'] !== 'POST') responder(['erro' => 'Método não permitido'], 405);
$b = corpoJson();
$acao = $b['acao'] ?? 'login';

if ($acao === 'login') {
    $u = login((string)($b['usuario'] ?? ''), (string)($b['senha'] ?? ''));
    if (!$u) responder(['erro' => 'Usuário ou senha incorretos.'], 401);
    responder(['token' => criarSessao($u['usuario']), 'usuario' => publico($u)]);
}
if ($acao === 'eu') responder(['usuario' => publico(exigir())]);
if ($acao === 'sair') { encerrarSessao(); responder(['ok' => true]); }
if ($acao === 'trocarSenha') {
    $eu = exigir();
    if (!password_verify((string)($b['atual'] ?? ''), $eu['hash'])) { registrarFalha(); responder(['erro' => 'Senha atual incorreta.'], 400); }
    $nova = (string)($b['nova'] ?? '');
    if (strlen($nova) < 8) responder(['erro' => 'A nova senha precisa ter pelo menos 8 caracteres.'], 400);
    $lista = lerUsuarios();
    $lista[$eu['usuario']]['hash'] = password_hash($nova, PASSWORD_DEFAULT);
    salvarUsuarios($lista);
    responder(['ok' => true]);
}
responder(['erro' => 'Ação desconhecida'], 400);
