<?php
// Gerenciamento de usuários do painel (somente administradores).
require __DIR__ . '/_lib.php';
if ($_SERVER['REQUEST_METHOD'] !== 'POST') responder(['erro' => 'Método não permitido'], 405);
$eu = exigir('admin');
$b = corpoJson();
$acao = $b['acao'] ?? 'listar';
$lista = lerUsuarios();
$admins = fn($l) => count(array_filter($l, fn($u) => $u['papel'] === 'admin'));

if ($acao === 'salvar') {
    $novo = !empty($b['novo']);
    $login = strtolower(trim((string)($b['usuario'] ?? '')));
    if (!nomeValido($login)) responder(['erro' => 'Usuário inválido: use 3 a 30 letras minúsculas, números, ponto, hífen ou _.'], 400);
    if ($novo && isset($lista[$login])) responder(['erro' => 'Já existe um usuário com esse nome.'], 409);
    if (!$novo && !isset($lista[$login])) responder(['erro' => 'Usuário não encontrado.'], 404);
    $papel = (string)($b['papel'] ?? 'editor');
    if (!isset(PAPEIS[$papel])) responder(['erro' => 'Nível de acesso inválido.'], 400);
    $nome = trim(mb_substr(strip_tags((string)($b['nome'] ?? '')), 0, 60)) ?: $login;
    $senha = (string)($b['senha'] ?? '');
    if ($novo && strlen($senha) < 8) responder(['erro' => 'Defina uma senha com pelo menos 8 caracteres.'], 400);
    if ($senha !== '' && strlen($senha) < 8) responder(['erro' => 'A senha precisa ter pelo menos 8 caracteres.'], 400);
    $u = $lista[$login] ?? ['usuario' => $login, 'criado' => date('c'), 'ultimoAcesso' => null];
    $antes = $u['papel'] ?? null;
    $u['nome'] = $nome; $u['papel'] = $papel;
    if ($senha !== '') $u['hash'] = password_hash($senha, PASSWORD_DEFAULT);
    $lista[$login] = $u;
    if ($admins($lista) < 1) responder(['erro' => 'É preciso manter pelo menos um administrador.'], 400);
    salvarUsuarios($lista);
    if (!$novo && ($senha !== '' || $antes !== $papel) && $login !== $eu['usuario']) encerrarSessao($login); // força novo login
}

if ($acao === 'excluir') {
    $login = strtolower((string)($b['usuario'] ?? ''));
    if ($login === $eu['usuario']) responder(['erro' => 'Você não pode excluir o próprio usuário.'], 400);
    if (!isset($lista[$login])) responder(['erro' => 'Usuário não encontrado.'], 404);
    unset($lista[$login]);
    if ($admins($lista) < 1) responder(['erro' => 'É preciso manter pelo menos um administrador.'], 400);
    salvarUsuarios($lista);
    encerrarSessao($login);
}

responder(['usuarios' => array_values(array_map('publico', $lista)), 'papeis' => PAPEIS]);
