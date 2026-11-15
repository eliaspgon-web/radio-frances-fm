<?php
// Geolocalização da audiência pelo IP (país, estado, cidade) e origem do acesso (rede social, site, app).
// Privacidade: o IP é usado só na hora da consulta e NUNCA é gravado. Fica guardado apenas o resultado
// (país/estado/cidade, coordenadas do centro da cidade) e um código embaralhado do IP para não repetir consultas.
//
// Provedores (grátis, sem chave), tentados nesta ordem:
//   1) ipwho.is   — até 1.000 consultas/dia, uso comercial permitido
//   2) geojs.io   — reserva
// Para usar um plano pago do ipwhois.io, grave a chave em data/segredos.php:  'geoChave' => 'SUA_CHAVE'
// Para desligar a geolocalização: em data/config.json, "site": { "geo": false }

const GEO_CACHE_DIAS   = 30;     // um mesmo IP só é consultado de novo depois de 30 dias
const GEO_LIMITE_DIA   = 950;    // consultas por dia no provedor principal (plano grátis: 1.000)
const GEO_LIMITE_TOTAL = 5000;   // teto diário somando todos os provedores
const GEO_TIMEOUT      = 3;      // segundos por consulta
const GEO_CONFIAR_PROXY = false; // true se o site estiver atrás de Cloudflare/proxy reverso (usa CF-Connecting-IP / X-Forwarded-For)

const ORIGENS = ['instagram', 'facebook', 'whatsapp', 'youtube', 'tiktok', 'x', 'telegram', 'busca', 'site', 'app', 'tv', 'direto', 'outro'];

const UF_BR = ['AC' => 'Acre', 'AL' => 'Alagoas', 'AP' => 'Amapá', 'AM' => 'Amazonas', 'BA' => 'Bahia', 'CE' => 'Ceará', 'DF' => 'Distrito Federal',
    'ES' => 'Espírito Santo', 'GO' => 'Goiás', 'MA' => 'Maranhão', 'MT' => 'Mato Grosso', 'MS' => 'Mato Grosso do Sul', 'MG' => 'Minas Gerais',
    'PA' => 'Pará', 'PB' => 'Paraíba', 'PR' => 'Paraná', 'PE' => 'Pernambuco', 'PI' => 'Piauí', 'RJ' => 'Rio de Janeiro', 'RN' => 'Rio Grande do Norte',
    'RS' => 'Rio Grande do Sul', 'RO' => 'Rondônia', 'RR' => 'Roraima', 'SC' => 'Santa Catarina', 'SP' => 'São Paulo', 'SE' => 'Sergipe', 'TO' => 'Tocantins'];

function geoSemAcento(string $s): string {
    $s = strtr($s, ['á' => 'a', 'à' => 'a', 'â' => 'a', 'ã' => 'a', 'é' => 'e', 'ê' => 'e', 'í' => 'i', 'ó' => 'o', 'ô' => 'o', 'õ' => 'o', 'ú' => 'u', 'ç' => 'c',
                    'Á' => 'a', 'À' => 'a', 'Â' => 'a', 'Ã' => 'a', 'É' => 'e', 'Ê' => 'e', 'Í' => 'i', 'Ó' => 'o', 'Ô' => 'o', 'Õ' => 'o', 'Ú' => 'u', 'Ç' => 'c']);
    return trim(preg_replace('/[^a-z]+/', ' ', strtolower($s)));
}
function geoTexto($v, int $max = 80): string {
    $v = trim(preg_replace('/[\x00-\x1f<>"]+/u', ' ', (string)$v) ?? '');
    return function_exists('mb_substr') ? mb_substr($v, 0, $max) : substr($v, 0, $max);
}

/** IP do aparelho. Só confia em cabeçalhos de proxy quando o pedido vem de um proxy local ou GEO_CONFIAR_PROXY = true. */
function geoIp(): ?string {
    $publico = fn($ip) => filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) ?: null;
    $direto = trim((string)($_SERVER['REMOTE_ADDR'] ?? ''));
    if (GEO_CONFIAR_PROXY || !$publico($direto)) {
        $cand = [(string)($_SERVER['HTTP_CF_CONNECTING_IP'] ?? '')];
        foreach (explode(',', (string)($_SERVER['HTTP_X_FORWARDED_FOR'] ?? '')) as $p) $cand[] = trim($p);
        foreach ($cand as $c) if ($c !== '' && $publico($c)) return $c;
    }
    return $publico($direto);
}

/** Código embaralhado do IP (IPv6: só a rede /64). Serve de chave do cache; não dá para voltar ao IP. */
function geoChave(string $ip): string {
    $s = lerSegredos();
    if (empty($s['geoSal'])) { $s['geoSal'] = bin2hex(random_bytes(16)); salvarSegredos($s); }
    $bin = @inet_pton($ip);
    if ($bin !== false && strlen($bin) === 16) $bin = substr($bin, 0, 8);
    return hash('sha256', $s['geoSal'] . '|' . ($bin === false ? $ip : bin2hex($bin)));
}

/** Padroniza a resposta de qualquer provedor. */
function geoNormalizar(array $g): ?array {
    $pais = strtoupper(substr(preg_replace('/[^a-z]/i', '', (string)($g['pais'] ?? '')), 0, 2));
    if (strlen($pais) !== 2) return null;
    $uf = strtoupper(substr(preg_replace('/[^a-z0-9]/i', '', (string)($g['uf'] ?? '')), 0, 6));
    $regiao = geoTexto($g['regiao'] ?? ''); $cidade = geoTexto($g['cidade'] ?? '');
    if ($pais === 'BR') {                                   // Brasil: sigla e nome oficiais do estado
        if (!isset(UF_BR[$uf])) {
            $n = geoSemAcento($regiao); $uf = '';
            if ($n === 'federal district') $uf = 'DF';
            else foreach (UF_BR as $sig => $nome) if (geoSemAcento($nome) === $n || geoSemAcento('state of ' . $nome) === $n) { $uf = $sig; break; }
        }
        if ($uf !== '') $regiao = UF_BR[$uf];
    }
    $lat = is_numeric($g['lat'] ?? null) ? round((float)$g['lat'], 2) : null;     // 2 casas ≈ 1 km: nível de cidade, não de endereço
    $lon = is_numeric($g['lon'] ?? null) ? round((float)$g['lon'], 2) : null;
    if ($lat !== null && ($lat < -90 || $lat > 90 || $lon === null || $lon < -180 || $lon > 180)) { $lat = $lon = null; }
    if ($lat == 0.0 && $lon == 0.0) { $lat = $lon = null; }
    return ['pais' => $pais, 'uf' => $uf, 'regiao' => $regiao, 'cidade' => $cidade, 'lat' => $lat, 'lon' => $lon];
}

function geoConsultar(string $ip, string $provedor): ?array {
    $e = rawurlencode($ip);
    if ($provedor === 'ipwho') {
        $chave = (string)(lerSegredos()['geoChave'] ?? '');
        $url = $chave !== '' ? "https://ipwhois.pro/$e?key=" . rawurlencode($chave) . '&fields=success,country_code,region,region_code,city,latitude,longitude'
                             : "https://ipwho.is/$e?fields=success,country_code,region,region_code,city,latitude,longitude";
        $j = json_decode((string)baixar($url, GEO_TIMEOUT), true);
        if (!is_array($j) || empty($j['success'])) return null;
        return geoNormalizar(['pais' => $j['country_code'] ?? '', 'uf' => $j['region_code'] ?? '', 'regiao' => $j['region'] ?? '', 'cidade' => $j['city'] ?? '', 'lat' => $j['latitude'] ?? null, 'lon' => $j['longitude'] ?? null]);
    }
    $j = json_decode((string)baixar("https://get.geojs.io/v1/ip/geo/$e.json", GEO_TIMEOUT), true);
    if (!is_array($j) || empty($j['country_code'])) return null;
    return geoNormalizar(['pais' => $j['country_code'], 'uf' => '', 'regiao' => $j['region'] ?? '', 'cidade' => $j['city'] ?? '', 'lat' => $j['latitude'] ?? null, 'lon' => $j['longitude'] ?? null]);
}

/** País/estado/cidade do aparelho que fez o pedido (ou null). Usa o cache; consulta o provedor só para IP novo. */
function geoLocalizar(PDO $db): ?array {
    if ((lerConfig()['site']['geo'] ?? true) === false) return null;
    $ip = geoIp(); if (!$ip) return null;
    $h = geoChave($ip); $t = time(); $dia = date('Y-m-d', $t);
    $q = $db->prepare('SELECT pais, uf, regiao, cidade, lat, lon, t FROM geo_cache WHERE h = ?'); $q->execute([$h]); $c = $q->fetch();
    if ($c && $c['pais'] !== '' && $t - (int)$c['t'] < GEO_CACHE_DIAS * 86400) { unset($c['t']); return $c; }
    if ($c && $c['pais'] === '' && $t - (int)$c['t'] < 3600) return geoPaisCabecalho();        // falhou há pouco: não insiste por 1 h

    $u = $db->prepare('SELECT n FROM geo_uso WHERE dia = ?'); $u->execute([$dia]); $n = (int)($u->fetchColumn() ?: 0);
    $g = null;
    if ($n < GEO_LIMITE_TOTAL) {
        $db->prepare('INSERT INTO geo_uso (dia, n) VALUES (?, 1) ON CONFLICT(dia) DO UPDATE SET n = n + 1')->execute([$dia]);
        if ($n < GEO_LIMITE_DIA || !empty(lerSegredos()['geoChave'])) $g = geoConsultar($ip, 'ipwho');
        if (!$g) $g = geoConsultar($ip, 'geojs');
    }
    $g = $g ?: geoPaisCabecalho();
    $db->prepare('INSERT OR REPLACE INTO geo_cache (h, pais, uf, regiao, cidade, lat, lon, t) VALUES (?,?,?,?,?,?,?,?)')
       ->execute([$h, $g['pais'] ?? '', $g['uf'] ?? '', $g['regiao'] ?? '', $g['cidade'] ?? '', $g['lat'] ?? null, $g['lon'] ?? null, $t]);
    if (mt_rand(1, 200) === 1) $db->prepare('DELETE FROM geo_cache WHERE t < ?')->execute([$t - GEO_CACHE_DIAS * 86400]);
    return $g;
}
/** Reserva: quando o site está atrás do Cloudflare, o país vem no cabeçalho CF-IPCountry. */
function geoPaisCabecalho(): ?array {
    $p = strtoupper((string)($_SERVER['HTTP_CF_IPCOUNTRY'] ?? ''));
    return (preg_match('/^[A-Z]{2}$/', $p) && !in_array($p, ['XX', 'T1'], true)) ? geoNormalizar(['pais' => $p]) : null;
}

function geoOrigem($v): string { return in_array($v, ORIGENS, true) ? $v : 'direto'; }

/**
 * Relatório geográfico do período.
 * Filtros: radio, origem, pais (ISO-2), uf (sigla ou nome do estado). Países e origens ignoram o próprio filtro
 * para o painel poder comparar; estados e cidades respeitam o recorte escolhido.
 */
function geoRelatorio(PDO $db, string $de, string $ate, string $radio = '', string $origem = '', string $pais = '', string $uf = '', int $limite = 500): array {
    $todos = function ($sql, $p) use ($db) { $q = $db->prepare($sql); $q->execute($p); return $q->fetchAll(); };
    if ($radio === '') { $from = 'sessoes s'; $w = ['s.dia BETWEEN ? AND ?']; $p = [$de, $ate]; $did = 's.did'; $seg = 's.ouviu'; }
    else { $from = 'sessao_radio sr JOIN sessoes s ON s.sid = sr.sid'; $w = ['sr.dia BETWEEN ? AND ?', 'sr.radio = ?']; $p = [$de, $ate, $radio]; $did = 'sr.did'; $seg = 'sr.ouviu'; }
    $m = "COUNT(DISTINCT $did) ouvintes, COUNT(*) sessoes, COALESCE(SUM($seg), 0) seg";
    $ESTADO = "COALESCE(NULLIF(s.uf, ''), s.regiao, '')";
    $filtro = function (bool $comOrigem, bool $comLocal) use ($w, $p, $origem, $pais, $uf, $ESTADO) {
        if ($comOrigem && $origem !== '') { $w[] = "COALESCE(s.origem, 'direto') = ?"; $p[] = $origem; }
        if ($comLocal && $pais !== '') { $w[] = 's.pais = ?'; $p[] = $pais; if ($uf !== '') { $w[] = "$ESTADO = ?"; $p[] = $uf; } }
        return [implode(' AND ', $w), $p];
    };
    $num = fn($r) => ['ouvintes' => (int)$r['ouvintes'], 'sessoes' => (int)$r['sessoes'], 'horas' => round($r['seg'] / 3600, 1)];

    [$wt, $pt] = $filtro(true, true);
    $tot = $todos("SELECT $m, SUM(CASE WHEN s.pais IS NOT NULL AND s.pais <> '' THEN 1 ELSE 0 END) loc FROM $from WHERE $wt", $pt)[0] ?? [];
    [$wp, $pp] = $filtro(true, false);
    $paises = $todos("SELECT s.pais, $m FROM $from WHERE $wp AND s.pais IS NOT NULL AND s.pais <> '' GROUP BY s.pais ORDER BY ouvintes DESC, sessoes DESC", $pp);
    $loc = "s.pais IS NOT NULL AND s.pais <> ''";
    $estados = $todos("SELECT s.pais, $ESTADO uf, MAX(s.regiao) nome, $m FROM $from WHERE $wt AND $loc AND $ESTADO <> '' GROUP BY s.pais, $ESTADO ORDER BY ouvintes DESC, sessoes DESC LIMIT $limite", $pt);
    $cidades = $todos("SELECT s.pais, $ESTADO uf, s.cidade, AVG(s.lat) lat, AVG(s.lon) lon, $m FROM $from WHERE $wt AND $loc AND s.cidade <> '' GROUP BY s.pais, $ESTADO, s.cidade ORDER BY ouvintes DESC, sessoes DESC LIMIT $limite", $pt);
    [$wo, $po] = $filtro(false, true);
    $origens = $todos("SELECT COALESCE(s.origem, 'direto') origem, $m FROM $from WHERE $wo GROUP BY 1 ORDER BY ouvintes DESC, sessoes DESC", $po);

    return ['de' => $de, 'ate' => $ate, 'radio' => $radio, 'origem' => $origem, 'pais' => $pais, 'uf' => $uf, 'gerado' => date('c'),
        'total' => $num($tot + ['ouvintes' => 0, 'sessoes' => 0, 'seg' => 0]) + ['sessoesLocalizadas' => (int)($tot['loc'] ?? 0)],
        'paises'  => array_map(fn($r) => ['pais' => $r['pais']] + $num($r), $paises),
        'estados' => array_map(fn($r) => ['pais' => $r['pais'], 'uf' => $r['uf'], 'nome' => $r['nome'] ?: $r['uf']] + $num($r), $estados),
        'cidades' => array_map(fn($r) => ['pais' => $r['pais'], 'uf' => $r['uf'], 'cidade' => $r['cidade'], 'lat' => $r['lat'] !== null ? round((float)$r['lat'], 2) : null, 'lon' => $r['lon'] !== null ? round((float)$r['lon'], 2) : null] + $num($r), $cidades),
        'origens' => array_map(fn($r) => ['origem' => $r['origem']] + $num($r), $origens)];
}

/** Quem está conectado agora, por cidade (mapa ao vivo). */
function geoAgora(PDO $db, int $desde): array {
    $q = $db->prepare("SELECT pais, COALESCE(NULLIF(uf, ''), regiao, '') uf, cidade, AVG(lat) lat, AVG(lon) lon, COUNT(*) conectados, SUM(tocando) ouvintes
                       FROM sessoes WHERE visto >= ? AND pais IS NOT NULL AND pais <> '' GROUP BY 1, 2, 3 ORDER BY conectados DESC LIMIT 500");
    $q->execute([$desde]);
    return array_map(fn($r) => ['pais' => $r['pais'], 'uf' => $r['uf'], 'cidade' => $r['cidade'], 'lat' => $r['lat'] !== null ? round((float)$r['lat'], 2) : null,
        'lon' => $r['lon'] !== null ? round((float)$r['lon'], 2) : null, 'conectados' => (int)$r['conectados'], 'ouvintes' => (int)$r['ouvintes']], $q->fetchAll());
}
