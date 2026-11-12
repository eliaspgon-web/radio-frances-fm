<?php
// Descobre se o canal do YouTube está com transmissão AO VIVO agora.
// Usa a página pública /live do canal (sem chave de API). Cache de 2 minutos.
require __DIR__ . '/_lib.php';

function idCanal(string $yt): array {
    // aceita: UC..., link /channel/UC..., link /@usuario, @usuario
    if (preg_match('#(UC[\w-]{22})#', $yt, $m)) return ['canal', $m[1]];
    if (preg_match('#@([\w.\-]+)#', $yt, $m)) return ['handle', $m[1]];
    return ['', ''];
}

function analisarLive(string $html): array {
    $vid = null;
    if (preg_match('#<link rel="canonical" href="https://www\.youtube\.com/watch\?v=([\w-]{11})"#', $html, $m)) $vid = $m[1];
    $aoVivo = $vid && (str_contains($html, '"isLiveNow":true') || str_contains($html, '"isLive":true') || str_contains($html, '\"isLiveNow\":true'));
    $titulo = null;
    if (preg_match('#<meta name="title" content="([^"]*)"#', $html, $t)) $titulo = html_entity_decode($t[1], ENT_QUOTES, 'UTF-8');
    return ['aoVivo' => (bool)$aoVivo, 'videoId' => $aoVivo ? $vid : null, 'titulo' => $aoVivo ? $titulo : null];
}

if (PHP_SAPI === 'cli' && isset($argv[1])) { echo json_encode(analisarLive((string)file_get_contents($argv[1]))); exit; }

$cfg = lerConfig();
$yt = (string)($cfg['site']['youtube'] ?? '');
[$tipo, $id] = idCanal($yt);
if (!$id) responder(['aoVivo' => false, 'erro' => 'Canal do YouTube não configurado']);
$base = $tipo === 'canal' ? "https://www.youtube.com/channel/$id" : "https://www.youtube.com/@$id";
if (($c = cacheLer('aovivo-' . md5($base), 120)) !== null) responder($c);
$html = baixar("$base/live", 10);
$r = $html ? analisarLive($html) : ['aoVivo' => false, 'erro' => 'YouTube indisponível'];
$r['canal'] = $base;
cacheSalvar('aovivo-' . md5($base), $r);
responder($r);
