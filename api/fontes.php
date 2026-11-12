<?php
// Leitura de fontes de notícias: Instagram (API oficial) e feeds RSS/Atom.
require_once __DIR__ . '/_lib.php';

/** Converte a legenda do post em título + resumo. */
function legendaParaTitulo(string $cap): array {
    $cap = trim(preg_replace('/\s+/u', ' ', $cap));
    $semTags = trim(preg_replace('/(#[\p{L}\p{N}_]+\s*)+$/u', '', $cap)) ?: $cap;
    $titulo = preg_split('/(?<=[.!?])\s|\s[|•–—]\s/u', $semTags)[0] ?? $semTags;
    if (mb_strlen($titulo) > 95) $titulo = rtrim(mb_substr($titulo, 0, 92)) . '…';
    $resumo = mb_strlen($semTags) > 160 ? rtrim(mb_substr($semTags, 0, 157)) . '…' : $semTags;
    return [$titulo !== '' ? $titulo : 'Post no Instagram', $resumo];
}

/** Últimos posts do Instagram. Retorna [itens, erro]. */
function postsInstagram(int $qtd = 5): array {
    $seg = lerSegredos();
    $token = trim((string)($seg['instagram_token'] ?? ''));
    if ($token === '') return [[], 'Token do Instagram não configurado'];
    $id = trim((string)($seg['instagram_user_id'] ?? ''));
    $campos = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp';
    // Com ID numérico: API do Instagram via Facebook (Graph). Sem ID: API do Instagram com login do Instagram.
    $url = $id !== ''
        ? "https://graph.facebook.com/v21.0/" . rawurlencode($id) . "/media?fields=$campos&limit=$qtd&access_token=" . rawurlencode($token)
        : "https://graph.instagram.com/me/media?fields=$campos&limit=$qtd&access_token=" . rawurlencode($token);
    $r = baixar($url, 10);
    if (!$r) return [[], 'Não foi possível acessar a API do Instagram (verifique o token)'];
    $j = json_decode($r, true);
    if (isset($j['error'])) return [[], 'Instagram: ' . ($j['error']['message'] ?? 'erro')];
    $itens = [];
    foreach (($j['data'] ?? []) as $p) {
        [$t, $res] = legendaParaTitulo((string)($p['caption'] ?? ''));
        $img = ($p['media_type'] ?? '') === 'VIDEO' ? ($p['thumbnail_url'] ?? '') : ($p['media_url'] ?? '');
        $itens[] = ['titulo' => $t, 'resumo' => $res, 'imagem' => $img, 'link' => $p['permalink'] ?? '',
            'data' => date('Y-m-d\TH:i:s', strtotime((string)($p['timestamp'] ?? 'now'))), 'fonte' => 'Instagram',
            'video' => ($p['media_type'] ?? '') === 'VIDEO', 'destaque' => false];
    }
    return [$itens, null];
}

/** Itens de um feed RSS/Atom. */
function itensRss(string $url, int $max = 15): array {
    $xml = baixar(trim($url));
    if (!$xml) return [];
    libxml_use_internal_errors(true);
    $x = simplexml_load_string($xml, 'SimpleXMLElement', LIBXML_NOCDATA | LIBXML_NONET);
    if (!$x) return [];
    $fonte = trim((string)($x->channel->title ?? $x->title ?? '')) ?: (string)parse_url($url, PHP_URL_HOST);
    $entradas = isset($x->channel->item) ? $x->channel->item : ($x->item ?? $x->entry ?? []);
    $out = []; $k = 0;
    foreach ($entradas as $e) {
        if ($k++ >= $max) break;
        $link = (string)($e->link['href'] ?? '') ?: (string)$e->link;
        $desc = (string)($e->description ?? '') ?: (string)($e->summary ?? '');
        $conteudo = (string)$e->children('http://purl.org/rss/1.0/modules/content/')->encoded;
        $img = '';
        $media = $e->children('http://search.yahoo.com/mrss/');
        if (isset($media->content) && $media->content->attributes()) $img = (string)$media->content->attributes()->url;
        if (!$img && isset($media->thumbnail) && $media->thumbnail->attributes()) $img = (string)$media->thumbnail->attributes()->url;
        if (!$img && isset($media->group->content)) $img = (string)$media->group->content->attributes()->url;
        if (!$img && isset($e->enclosure) && str_starts_with((string)$e->enclosure['type'], 'image')) $img = (string)$e->enclosure['url'];
        if (!$img && preg_match('/<img[^>]+src=["\']([^"\']+)/i', $desc . $conteudo, $mm)) $img = html_entity_decode($mm[1]);
        $quando = strtotime((string)($e->pubDate ?? '') ?: (string)($e->updated ?? '') ?: (string)($e->published ?? '')) ?: time();
        $resumo = trim(preg_replace('/\s+/u', ' ', html_entity_decode(strip_tags($desc), ENT_QUOTES, 'UTF-8')));
        if (mb_strlen($resumo) > 170) $resumo = rtrim(mb_substr($resumo, 0, 167)) . '…';
        $out[] = ['titulo' => trim(html_entity_decode(strip_tags((string)$e->title), ENT_QUOTES, 'UTF-8')), 'resumo' => $resumo,
            'link' => $link, 'imagem' => $img, 'fonte' => $fonte, 'data' => date('Y-m-d\TH:i:s', $quando), 'destaque' => false];
    }
    return $out;
}
