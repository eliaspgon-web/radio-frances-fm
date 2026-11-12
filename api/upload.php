<?php
require __DIR__ . '/_lib.php';
if ($_SERVER['REQUEST_METHOD'] !== 'POST') responder(['erro' => 'Método não permitido'], 405);
if (!senhaOk($_POST['senha'] ?? null)) responder(['erro' => 'Senha inválida'], 401);
$f = $_FILES['arquivo'] ?? null;
if (!$f || $f['error'] !== UPLOAD_ERR_OK) responder(['erro' => 'Falha no envio'], 400);
if ($f['size'] > 3 * 1024 * 1024) responder(['erro' => 'Imagem muito grande (máx. 3 MB)'], 413);
$tipos = ['image/png' => 'png', 'image/jpeg' => 'jpg', 'image/webp' => 'webp', 'image/gif' => 'gif'];
$info = @getimagesize($f['tmp_name']);
$mime = $info['mime'] ?? '';
if (!isset($tipos[$mime])) responder(['erro' => 'Formato não aceito (use PNG, JPG, WEBP ou GIF)'], 415);
$dir = __DIR__ . '/../uploads';
if (!is_dir($dir)) mkdir($dir, 0755, true);
$nome = date('Ymd-His') . '-' . bin2hex(random_bytes(4)) . '.' . $tipos[$mime];
if (!move_uploaded_file($f['tmp_name'], "$dir/$nome")) responder(['erro' => 'Sem permissão de escrita em uploads/'], 500);
responder(['url' => 'uploads/' . $nome]);
