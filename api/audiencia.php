<?php
// Medição de audiência do app (anônima: código aleatório por aparelho; nenhum IP ou dado pessoal é gravado).
//  POST (público)            -> sinal do app a cada 30 s: { did, sid, radio, tocando, plataforma, app, fim }
//  GET ?acao=agora           -> conectados/ouvindo agora + últimos 60 min        (painel: login)
//  GET ?acao=relatorio&de=AAAA-MM-DD&ate=AAAA-MM-DD -> relatório do período    (painel: login)
require __DIR__ . '/_lib.php';
const ONLINE_SEG = 120;   // considerado conectado se mandou sinal nos últimos 2 min

function db(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    $pdo = new PDO('sqlite:' . DATA_DIR . '/audiencia.sqlite', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
    $pdo->exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;
      CREATE TABLE IF NOT EXISTS sessoes (sid TEXT PRIMARY KEY, did TEXT, dia TEXT, radio TEXT, tocando INT, plataforma TEXT, app INT, inicio INT, visto INT, ouviu INT DEFAULT 0);
      CREATE INDEX IF NOT EXISTS ix_s_dia ON sessoes(dia); CREATE INDEX IF NOT EXISTS ix_s_visto ON sessoes(visto);
      CREATE TABLE IF NOT EXISTS minutos (minuto INT PRIMARY KEY, dia TEXT, conectados INT, ouvintes INT, por_radio TEXT);
      CREATE INDEX IF NOT EXISTS ix_m_dia ON minutos(dia);
      CREATE TABLE IF NOT EXISTS ouvido (dia TEXT, radio TEXT, segundos INT, PRIMARY KEY (dia, radio));
      CREATE TABLE IF NOT EXISTS sessao_radio (sid TEXT, radio TEXT, did TEXT, dia TEXT, ouviu INT DEFAULT 0, PRIMARY KEY (sid, radio));
      CREATE INDEX IF NOT EXISTS ix_sr ON sessao_radio(radio, dia);
      CREATE TABLE IF NOT EXISTS banner_ev (dia TEXT, banner TEXT, exibicoes INT DEFAULT 0, cliques INT DEFAULT 0, PRIMARY KEY (dia, banner));');
    return $pdo;
}
function agoraContagem(PDO $db, int $t): array {
    $q = $db->prepare('SELECT radio, tocando, plataforma, app FROM sessoes WHERE visto >= ?');
    $q->execute([$t - ONLINE_SEG]);
    $c = ['conectados' => 0, 'ouvintes' => 0, 'porRadio' => [], 'porPlataforma' => [], 'noApp' => 0];
    foreach ($q as $r) {
        $c['conectados']++;
        if ($r['tocando']) { $c['ouvintes']++; $c['porRadio'][$r['radio']] = ($c['porRadio'][$r['radio']] ?? 0) + 1; }
        $c['porPlataforma'][$r['plataforma']] = ($c['porPlataforma'][$r['plataforma']] ?? 0) + 1;
        if ($r['app']) $c['noApp']++;
    }
    return $c;
}
$id = fn($v) => preg_match('/^[a-z0-9]{8,40}$/', (string)$v) ? (string)$v : null;

// ---------- sinal do app ----------
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $b = corpoJson() ?: json_decode((string)($_POST['d'] ?? ''), true) ?: [];
    $did = $id($b['did'] ?? ''); $sid = $id($b['sid'] ?? '');
    if (!$did || !$sid) responder(['ok' => false], 400);
    // exibição/clique de banner
    if (isset($b['banner'])) {
        $bid = preg_replace('/[^a-z0-9_-]/i', '', (string)$b['banner']);
        $col = ($b['evento'] ?? '') === 'clique' ? 'cliques' : 'exibicoes';
        if ($bid !== '') {
            $db = db(); $dia = date('Y-m-d');
            $db->prepare("INSERT INTO banner_ev (dia, banner, $col) VALUES (?, ?, 1) ON CONFLICT(dia, banner) DO UPDATE SET $col = $col + 1")->execute([$dia, $bid]);
        }
        responder(['ok' => true]);
    }
    $radio = preg_replace('/[^a-z0-9_-]/i', '', (string)($b['radio'] ?? '')) ?: '-';
    $plat = in_array($b['plataforma'] ?? '', ['iphone', 'android', 'computador', 'outro'], true) ? $b['plataforma'] : 'outro';
    $toca = !empty($b['tocando']) ? 1 : 0; $app = !empty($b['app']) ? 1 : 0;
    $t = time(); $dia = date('Y-m-d', $t);
    $db = db();
    $db->beginTransaction();
    $s = $db->prepare('SELECT visto, tocando, radio FROM sessoes WHERE sid = ?'); $s->execute([$sid]); $ant = $s->fetch();
    if ($ant && $t - (int)$ant['visto'] < 8 && empty($b['fim'])) { $db->commit(); responder(['ok' => true]); }   // sinais repetidos
    if ($ant && $ant['tocando']) {                                    // soma o tempo ouvido desde o último sinal (máx. 3 min)
        $seg = max(0, min(180, $t - (int)$ant['visto']));
        $db->prepare('INSERT INTO ouvido (dia, radio, segundos) VALUES (?,?,?) ON CONFLICT(dia, radio) DO UPDATE SET segundos = segundos + excluded.segundos')->execute([$dia, $ant['radio'], $seg]);
        $db->prepare('UPDATE sessoes SET ouviu = ouviu + ? WHERE sid = ?')->execute([$seg, $sid]);
        $db->prepare('INSERT INTO sessao_radio (sid, radio, did, dia, ouviu) VALUES (?,?,?,?,?) ON CONFLICT(sid, radio) DO UPDATE SET ouviu = ouviu + excluded.ouviu')->execute([$sid, $ant['radio'], $did, $dia, $seg]);
    }
    if ($toca) $db->prepare('INSERT OR IGNORE INTO sessao_radio (sid, radio, did, dia, ouviu) VALUES (?,?,?,?,0)')->execute([$sid, $radio, $did, $dia]);   // conta o ouvinte em cada rádio que ouviu
    $visto = !empty($b['fim']) ? $t - ONLINE_SEG - 1 : $t;          // ao fechar o app sai na hora da lista de conectados
    if ($ant) $db->prepare('UPDATE sessoes SET radio=?, tocando=?, plataforma=?, app=?, visto=? WHERE sid=?')->execute([$radio, $toca, $plat, $app, $visto, $sid]);
    else $db->prepare('INSERT INTO sessoes (sid, did, dia, radio, tocando, plataforma, app, inicio, visto) VALUES (?,?,?,?,?,?,?,?,?)')->execute([$sid, $did, $dia, $radio, $toca, $plat, $app, $t, $visto]);
    $min = intdiv($t, 60);                                            // simultâneos: guarda o MÁXIMO de cada minuto
    $c = agoraContagem($db, $t);
    $db->prepare('INSERT INTO minutos VALUES (?,?,?,?,?) ON CONFLICT(minuto) DO UPDATE SET
        conectados = MAX(conectados, excluded.conectados),
        por_radio  = CASE WHEN excluded.ouvintes >= ouvintes THEN excluded.por_radio ELSE por_radio END,
        ouvintes   = MAX(ouvintes, excluded.ouvintes)')->execute([$min, $dia, $c['conectados'], $c['ouvintes'], json_encode($c['porRadio'])]);
    if (mt_rand(1, 500) === 1) $db->prepare('DELETE FROM minutos WHERE minuto < ?')->execute([intdiv($t - 400 * 86400, 60)]);
    $db->commit();
    responder(['ok' => true]);
}

// ---------- painel ----------
exigir();
$db = db(); $t = time();
$acao = $_GET['acao'] ?? 'agora';

if ($acao === 'banners') {
    exigir();
    $de = date('Y-m-d', time() - 29 * 86400);
    $q = db()->prepare('SELECT banner, SUM(exibicoes) e, SUM(cliques) c FROM banner_ev WHERE dia >= ? GROUP BY banner');
    $q->execute([$de]); $out = [];
    foreach ($q as $r) $out[$r['banner']] = ['exibicoes' => (int)$r['e'], 'cliques' => (int)$r['c']];
    responder(['banners' => $out]);
}
if ($acao === 'agora') {
    $c = agoraContagem($db, $t);
    $q = $db->prepare('SELECT minuto, conectados, ouvintes FROM minutos WHERE minuto >= ? ORDER BY minuto');
    $q->execute([intdiv($t, 60) - 60]);
    $porMin = []; foreach ($q as $r) $porMin[(int)$r['minuto']] = $r;
    $serie = [];
    for ($m = intdiv($t, 60) - 59; $m <= intdiv($t, 60); $m++) $serie[] = ['hora' => date('H:i', $m * 60), 'ouvintes' => (int)($porMin[$m]['ouvintes'] ?? 0), 'conectados' => (int)($porMin[$m]['conectados'] ?? 0)];
    $c['ultimos60'] = $serie; $c['atualizado'] = date('c', $t);
    responder($c);
}

if ($acao === 'relatorio') {
    $hoje = date('Y-m-d');
    $de = preg_match('/^\d{4}-\d{2}-\d{2}$/', $_GET['de'] ?? '') ? $_GET['de'] : $hoje;
    $ate = preg_match('/^\d{4}-\d{2}-\d{2}$/', $_GET['ate'] ?? '') ? $_GET['ate'] : $de;
    if ($ate < $de) [$de, $ate] = [$ate, $de];
    $radio = preg_replace('/[^a-z0-9_-]/i', '', (string)($_GET['radio'] ?? ''));   // vazio = todas as rádios
    $um = function ($sql, $p) use ($db) { $q = $db->prepare($sql); $q->execute($p); return $q->fetch() ?: []; };
    $todos = function ($sql, $p) use ($db) { $q = $db->prepare($sql); $q->execute($p); return $q->fetchAll(); };
    // simultâneos: total ou só da rádio escolhida (guardado por minuto em por_radio)
    $col = $radio === '' ? 'ouvintes' : "COALESCE(CAST(json_extract(por_radio, '$.\"$radio\"') AS INTEGER), 0)";
    $P = [$de, $ate];
    if ($radio === '') {
        $k = $um('SELECT COUNT(DISTINCT did) unicos, COUNT(*) sessoes, SUM(CASE WHEN ouviu > 0 THEN 1 ELSE 0 END) com_audio,
                         AVG(CASE WHEN ouviu > 0 THEN ouviu END) media_ouvida, SUM(app) no_app FROM sessoes WHERE dia BETWEEN ? AND ?', $P);
        $porPlat = $todos('SELECT plataforma, COUNT(DISTINCT did) aparelhos FROM sessoes WHERE dia BETWEEN ? AND ? GROUP BY plataforma ORDER BY aparelhos DESC', $P);
    } else {
        $k = $um('SELECT COUNT(DISTINCT sr.did) unicos, COUNT(*) sessoes, SUM(CASE WHEN sr.ouviu > 0 THEN 1 ELSE 0 END) com_audio,
                         AVG(CASE WHEN sr.ouviu > 0 THEN sr.ouviu END) media_ouvida, SUM(s.app) no_app
                  FROM sessao_radio sr JOIN sessoes s ON s.sid = sr.sid WHERE sr.dia BETWEEN ? AND ? AND sr.radio = ?', [$de, $ate, $radio]);
        $porPlat = $todos('SELECT s.plataforma, COUNT(DISTINCT sr.did) aparelhos FROM sessao_radio sr JOIN sessoes s ON s.sid = sr.sid
                           WHERE sr.dia BETWEEN ? AND ? AND sr.radio = ? GROUP BY s.plataforma ORDER BY aparelhos DESC', [$de, $ate, $radio]);
    }
    $seg = $radio === '' ? $um('SELECT COALESCE(SUM(segundos),0) s FROM ouvido WHERE dia BETWEEN ? AND ?', $P)
                         : $um('SELECT COALESCE(SUM(segundos),0) s FROM ouvido WHERE dia BETWEEN ? AND ? AND radio = ?', [$de, $ate, $radio]);
    $pico = $um("SELECT $col v, minuto FROM minutos WHERE dia BETWEEN ? AND ? ORDER BY v DESC, minuto LIMIT 1", $P);
    $porRadio = $todos('SELECT radio, SUM(segundos) segundos FROM ouvido WHERE dia BETWEEN ? AND ? GROUP BY radio ORDER BY segundos DESC', $P);
    $porHora = array_fill(0, 24, 0);
    foreach ($todos("SELECT minuto, $col v FROM minutos WHERE dia BETWEEN ? AND ?", $P) as $r) {
        $h = (int)date('G', $r['minuto'] * 60); $porHora[$h] = max($porHora[$h], (int)$r['v']);
    }
    $out = ['de' => $de, 'ate' => $ate, 'radio' => $radio, 'gerado' => date('c'),
        'kpi' => ['ouvintesUnicos' => (int)($k['unicos'] ?? 0), 'sessoes' => (int)($k['sessoes'] ?? 0), 'sessoesComAudio' => (int)($k['com_audio'] ?? 0),
                  'horasOuvidas' => round(($seg['s'] ?? 0) / 3600, 1), 'mediaMinutos' => round(($k['media_ouvida'] ?? 0) / 60, 1),
                  'picoSimultaneo' => (int)($pico['v'] ?? 0), 'picoQuando' => !empty($pico['v']) ? date('c', $pico['minuto'] * 60) : null,
                  'aberturasNoApp' => (int)($k['no_app'] ?? 0)],
        'porRadio' => array_map(fn($r) => ['radio' => $r['radio'], 'horas' => round($r['segundos'] / 3600, 2)], $porRadio),
        'porPlataforma' => array_map(fn($r) => ['plataforma' => $r['plataforma'], 'aparelhos' => (int)$r['aparelhos']], $porPlat),
        'picoPorHora' => $porHora];
    if ($de === $ate) {   // um dia: simultâneos a cada 5 min
        $mins = []; foreach ($todos("SELECT minuto, $col v FROM minutos WHERE dia = ?", [$de]) as $r) $mins[(int)$r['minuto']] = (int)$r['v'];
        $ini = intdiv(strtotime($de . ' 00:00:00'), 60); $serie = [];
        for ($i = 0; $i < 288; $i++) { $mx = 0; for ($j = 0; $j < 5; $j++) $mx = max($mx, $mins[$ini + $i * 5 + $j] ?? 0); $serie[] = ['hora' => date('H:i', ($ini + $i * 5) * 60), 'ouvintes' => $mx]; }
        $out['simultaneos5min'] = $serie;
    } else {              // período: um ponto por dia
        $dias = [];
        $sqlDia = $radio === '' ? 'SELECT dia, COUNT(DISTINCT did) unicos, COUNT(*) sessoes FROM sessoes WHERE dia BETWEEN ? AND ? GROUP BY dia'
                                : 'SELECT dia, COUNT(DISTINCT did) unicos, COUNT(*) sessoes FROM sessao_radio WHERE dia BETWEEN ? AND ? AND radio = ? GROUP BY dia';
        foreach ($todos($sqlDia, $radio === '' ? $P : [$de, $ate, $radio]) as $r) $dias[$r['dia']] = $r;
        $picos = []; foreach ($todos("SELECT dia, MAX($col) p FROM minutos WHERE dia BETWEEN ? AND ? GROUP BY dia", $P) as $r) $picos[$r['dia']] = (int)$r['p'];
        $horas = []; foreach ($todos('SELECT dia, SUM(segundos) s FROM ouvido WHERE dia BETWEEN ? AND ?' . ($radio === '' ? '' : ' AND radio = ?') . ' GROUP BY dia', $radio === '' ? $P : [$de, $ate, $radio]) as $r) $horas[$r['dia']] = round($r['s'] / 3600, 1);
        $serie = [];
        for ($d = strtotime($de); $d <= strtotime($ate); $d += 86400) { $k2 = date('Y-m-d', $d);
            $serie[] = ['dia' => $k2, 'ouvintesUnicos' => (int)($dias[$k2]['unicos'] ?? 0), 'sessoes' => (int)($dias[$k2]['sessoes'] ?? 0), 'pico' => $picos[$k2] ?? 0, 'horas' => $horas[$k2] ?? 0]; }
        $out['porDia'] = $serie;
    }
    responder($out);
}
responder(['erro' => 'Ação desconhecida'], 400);
