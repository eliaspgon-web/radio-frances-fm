<?php
// Monta as N principais notícias conforme a origem escolhida no painel:
//  instagram = últimos posts do Instagram | rss = feeds de sites | misto = Instagram + RSS por data | manual
// Notícias manuais marcadas como "Destaque" sempre entram na frente. Cache de 10 min.
require __DIR__ . '/fontes.php';
$cfg = lerConfig();
$n = $cfg['noticias'] ?? [];
$limite = max(1, min(10, (int)($n['limite'] ?? 5)));
$modo = $n['modo'] ?? 'instagram';
$chave = 'noticias-' . md5(json_encode($n) . $modo);
if (($c = cacheLer($chave, 600)) !== null) responder($c);

$fixas = array_values(array_filter($n['manuais'] ?? [], fn($m) => !empty($m['titulo']) && !empty($m['destaque'])));
$auto = [];
if ($modo === 'instagram' || $modo === 'misto') { [$ig] = postsInstagram($limite); $auto = array_merge($auto, $ig); }
if ($modo === 'rss' || $modo === 'misto') foreach (($n['feeds'] ?? []) as $f) if (trim((string)$f) !== '') $auto = array_merge($auto, itensRss((string)$f));
if ($modo === 'manual' || !$auto) $auto = array_merge($auto, array_filter($n['manuais'] ?? [], fn($m) => !empty($m['titulo']) && empty($m['destaque'])));

usort($auto, fn($a, $b) => strcmp((string)($b['data'] ?? ''), (string)($a['data'] ?? '')));
$saida = array_slice(array_merge($fixas, $auto), 0, $limite);
foreach ($saida as &$s) $s['modo'] = $modo;
cacheSalvar($chave, $saida);
responder($saida);
