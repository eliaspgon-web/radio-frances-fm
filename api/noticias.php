<?php
// Monta as N principais notícias conforme a origem escolhida no painel:
//  rss = feeds de sites (ex.: Francês News) | instagram = últimos posts | misto = Instagram + RSS por data | manual
// Notícias manuais marcadas como "Destaque" entram na frente. Cache de 10 min.
// Se a fonte falhar, devolve a última lista que funcionou (não deixa o carrossel vazio).
require __DIR__ . '/fontes.php';
$cfg = lerConfig();
$n = $cfg['noticias'] ?? [];
$limite = max(1, min(10, (int)($n['limite'] ?? 5)));
$modo = $n['modo'] ?? 'rss';
$chave = 'noticias-' . md5(json_encode($n) . $modo);
if (empty($_GET['atualizar']) && ($c = cacheLer($chave, 600)) !== null) responder($c);

$manuais = array_values(array_filter($n['manuais'] ?? [], fn($m) => !empty($m['titulo'])));
$fixas = array_values(array_filter($manuais, fn($m) => !empty($m['destaque'])));
$auto = [];
if ($modo === 'instagram' || $modo === 'misto') { [$ig] = postsInstagram($limite); $auto = array_merge($auto, $ig); }
if ($modo === 'rss' || $modo === 'misto') foreach (($n['feeds'] ?? []) as $f) if (trim((string)$f) !== '') $auto = array_merge($auto, itensRss((string)$f));
if ($modo === 'manual') $auto = array_values(array_filter($manuais, fn($m) => empty($m['destaque'])));

// mesma notícia em dois feeds: fica uma só
$vistos = []; $auto = array_values(array_filter($auto, function ($i) use (&$vistos) { $k = strtolower(trim((string)($i['link'] ?: $i['titulo']))); if (isset($vistos[$k])) return false; $vistos[$k] = 1; return true; }));
usort($auto, fn($a, $b) => strcmp((string)($b['data'] ?? ''), (string)($a['data'] ?? '')));
$saida = array_slice(array_merge($fixas, $auto), 0, $limite);

if (!$auto && $modo !== 'manual') {                       // fonte fora do ar
    $ultimo = cacheLer('noticias-ultimo-' . $modo, 86400 * 30);
    if ($ultimo) responder($ultimo);
}
foreach ($saida as &$s) {
    if (empty($s['imagem']) && !empty($s['link'])) $s['imagem'] = ogImagem((string)$s['link']); // capa da matéria
    $s['modo'] = $modo;
}
unset($s);
cacheSalvar($chave, $saida);
if ($auto) cacheSalvar('noticias-ultimo-' . $modo, $saida);
responder($saida);
