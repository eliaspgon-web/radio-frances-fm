<?php
// Funções comuns da API
declare(strict_types=1);
header('X-Content-Type-Options: nosniff');

const DATA_DIR    = __DIR__ . '/../data';
const CONFIG_FILE = DATA_DIR . '/config.json';
const SENHA_FILE  = DATA_DIR . '/senha.php';
const SENHA_PADRAO = 'frances2026';
const SEGREDOS_FILE = DATA_DIR . '/segredos.php';

function responder($dados, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($dados, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function hashSenha(): string {
    if (!is_file(SENHA_FILE)) salvarSenha(SENHA_PADRAO);
    $h = include SENHA_FILE;
    return is_string($h) ? $h : '';
}

function salvarSenha(string $nova): void {
    $h = password_hash($nova, PASSWORD_DEFAULT);
    file_put_contents(SENHA_FILE, "<?php\n// Gerado pelo painel. Não edite.\nreturn " . var_export($h, true) . ";\n", LOCK_EX);
}

function senhaOk(?string $s): bool {
    if ($s === null || $s === '') return false;
    // atraso simples contra tentativas em massa
    usleep(300000);
    return password_verify($s, hashSenha());
}

function lerConfig(): array {
    $j = is_file(CONFIG_FILE) ? json_decode((string)file_get_contents(CONFIG_FILE), true) : null;
    return is_array($j) ? $j : ['site' => [], 'radios' => [], 'contato' => [], 'noticias' => ['limite' => 5, 'feeds' => [], 'manuais' => []]];
}

function corpoJson(): array {
    $j = json_decode((string)file_get_contents('php://input'), true);
    return is_array($j) ? $j : [];
}

// ---- segredos (tokens) ficam fora do config.json público ----
function lerSegredos(): array {
    if (!is_file(SEGREDOS_FILE)) return [];
    $s = include SEGREDOS_FILE;
    return is_array($s) ? $s : [];
}
function salvarSegredos(array $s): void {
    file_put_contents(SEGREDOS_FILE, "<?php\n// Gerado pelo painel. Não edite nem publique.\nreturn " . var_export($s, true) . ";\n", LOCK_EX);
}

// ---- download HTTP simples (cURL ou streams) ----
function baixar(string $url, int $timeout = 8): ?string {
    if (!preg_match('#^https?://#i', $url)) return null;
    $ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
    if (function_exists('curl_init')) {
        $c = curl_init($url);
        curl_setopt_array($c, [CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => 4,
            CURLOPT_TIMEOUT => $timeout, CURLOPT_USERAGENT => $ua, CURLOPT_ENCODING => '',
            CURLOPT_HTTPHEADER => ['Accept-Language: pt-BR,pt;q=0.9', 'Cookie: CONSENT=YES+1'],
            CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS]);
        $r = curl_exec($c); $code = (int)curl_getinfo($c, CURLINFO_HTTP_CODE); curl_close($c);
        return ($r === false || $code >= 400) ? null : $r;
    }
    $ctx = stream_context_create(['http' => ['timeout' => $timeout, 'user_agent' => $ua, 'header' => "Accept-Language: pt-BR\r\nCookie: CONSENT=YES+1\r\n"]]);
    $r = @file_get_contents($url, false, $ctx);
    return $r === false ? null : $r;
}

function cacheLer(string $nome, int $seg) { $f = DATA_DIR . "/cache-$nome.json"; return (is_file($f) && time() - filemtime($f) < $seg) ? json_decode((string)file_get_contents($f), true) : null; }
function cacheSalvar(string $nome, $dados): void { @file_put_contents(DATA_DIR . "/cache-$nome.json", json_encode($dados, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX); }
