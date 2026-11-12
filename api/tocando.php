<?php
// "Tocando agora": busca a música atual da emissora (mesma fonte usada pelo site francesfm.com.br).
// Uso: api/tocando.php?mount=FRANCESFM_MACAAC   (cache de 15 s)
require __DIR__ . '/_lib.php';
$mount = preg_replace('/[^A-Za-z0-9_]/', '', (string)($_GET['mount'] ?? ''));
if ($mount === '') responder(['text' => '']);
if (($c = cacheLer('tocando-' . $mount, 15)) !== null) responder($c);
$cfg = lerConfig();
$base = rtrim((string)($cfg['site']['tocandoBase'] ?? 'https://francesfm.com.br/playing/'), '/') . '/';
$r = baixar($base . $mount, 6);
$j = $r ? json_decode($r, true) : null;
$txt = is_array($j) ? (string)($j['text'] ?? '') : '';
$txt = trim(preg_replace('/\s+/u', ' ', str_replace(["\u{FFFD}", 'ï¿½'], '', $txt)));
$out = ['text' => $txt];
cacheSalvar('tocando-' . $mount, $out);
responder($out);
