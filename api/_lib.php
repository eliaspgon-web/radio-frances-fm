<?php
// Funções comuns da API
declare(strict_types=1);
date_default_timezone_set('America/Maceio');
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

// =========================================================
//  USUÁRIOS, SESSÕES E PROTEÇÃO CONTRA TENTATIVAS
// =========================================================
const USUARIOS_FILE = DATA_DIR . '/usuarios.php';
const SESSOES_FILE  = DATA_DIR . '/sessoes.php';
const TENTATIVAS_FILE = DATA_DIR . '/tentativas.json';
const PAPEIS = ['admin' => 'Administrador', 'editor' => 'Editor'];
const SESSAO_HORAS = 12;

function gravarPhp(string $arq, $dados): void {
    $tmp = $arq . '.' . bin2hex(random_bytes(4)) . '.tmp';
    file_put_contents($tmp, "<?php\n// Gerado pelo painel. Não edite nem publique.\nreturn " . var_export($dados, true) . ";\n", LOCK_EX);
    rename($tmp, $arq);                                   // gravação atômica
    if (function_exists('opcache_invalidate')) @opcache_invalidate($arq, true); // evita ler versão antiga do cache do PHP
}
function lerPhp(string $arq): array { if (!is_file($arq)) return []; $d = include $arq; return is_array($d) ? $d : []; }

/** Lista de usuários. Na primeira vez cria "admin" (aproveita a senha antiga, se existir). */
function lerUsuarios(): array {
    $u = lerPhp(USUARIOS_FILE);
    if ($u) return $u;
    $hash = is_file(SENHA_FILE) ? (string)(include SENHA_FILE) : password_hash(SENHA_PADRAO, PASSWORD_DEFAULT);
    $u = ['admin' => ['usuario' => 'admin', 'nome' => 'Administrador', 'papel' => 'admin', 'hash' => $hash, 'criado' => date('c'), 'ultimoAcesso' => null]];
    salvarUsuarios($u);
    return $u;
}
function salvarUsuarios(array $u): void { gravarPhp(USUARIOS_FILE, $u); }
function publico(array $u): array { return ['usuario' => $u['usuario'], 'nome' => $u['nome'], 'papel' => $u['papel'], 'papelNome' => PAPEIS[$u['papel']] ?? $u['papel'], 'ultimoAcesso' => $u['ultimoAcesso'] ?? null]; }
function nomeValido(string $u): bool { return (bool)preg_match('/^[a-z0-9._-]{3,30}$/', $u); }

// --- limite de tentativas: 5 erros em 15 min bloqueiam o IP por 15 min ---
function ipCliente(): string { return substr((string)($_SERVER['REMOTE_ADDR'] ?? '?'), 0, 64); }
function tentativas(): array { $t = is_file(TENTATIVAS_FILE) ? json_decode((string)file_get_contents(TENTATIVAS_FILE), true) : []; return is_array($t) ? $t : []; }
function bloqueado(): int {
    $t = tentativas()[ipCliente()] ?? null;
    if (!$t || $t['n'] < 5) return 0;
    $resta = 900 - (time() - $t['ult']);
    return $resta > 0 ? $resta : 0;
}
function registrarFalha(): void {
    $t = tentativas(); $ip = ipCliente(); $agora = time();
    foreach ($t as $k => $v) if ($agora - $v['ult'] > 900) unset($t[$k]);
    $t[$ip] = ['n' => (($t[$ip]['n'] ?? 0) + 1), 'ult' => $agora];
    file_put_contents(TENTATIVAS_FILE, json_encode($t), LOCK_EX);
}
function limparFalhas(): void { $t = tentativas(); unset($t[ipCliente()]); file_put_contents(TENTATIVAS_FILE, json_encode($t), LOCK_EX); }

/** Confere usuário + senha. Retorna o usuário ou null. */
function login(string $usuario, string $senha): ?array {
    if ($r = bloqueado()) responder(['erro' => 'Muitas tentativas. Tente de novo em ' . ceil($r / 60) . ' min.'], 429);
    $usuario = strtolower(trim($usuario));
    $lista = lerUsuarios();
    $u = $lista[$usuario] ?? null;
    if (!$u || !password_verify($senha, $u['hash'])) { usleep(400000); registrarFalha(); return null; }
    limparFalhas();
    if (password_needs_rehash($u['hash'], PASSWORD_DEFAULT)) $lista[$usuario]['hash'] = password_hash($senha, PASSWORD_DEFAULT);
    $lista[$usuario]['ultimoAcesso'] = date('c');
    salvarUsuarios($lista);
    return $lista[$usuario];
}

function criarSessao(string $usuario): string {
    $token = bin2hex(random_bytes(32));
    $s = array_filter(lerPhp(SESSOES_FILE), fn($x) => $x['expira'] > time());
    $s[hash('sha256', $token)] = ['usuario' => $usuario, 'expira' => time() + SESSAO_HORAS * 3600];
    gravarPhp(SESSOES_FILE, $s);
    return $token;
}
function tokenRecebido(): string { return (string)($_SERVER['HTTP_X_ADMIN_TOKEN'] ?? $_POST['token'] ?? ''); }
function encerrarSessao(?string $soDoUsuario = null): void {
    $s = lerPhp(SESSOES_FILE);
    if ($soDoUsuario !== null) $s = array_filter($s, fn($x) => $x['usuario'] !== $soDoUsuario);
    else unset($s[hash('sha256', tokenRecebido())]);
    gravarPhp(SESSOES_FILE, $s);
}
/** Usuário da sessão atual (ou null). Usuário excluído perde o acesso na hora. */
function sessaoAtual(): ?array {
    $t = tokenRecebido();
    if (strlen($t) !== 64) return null;
    $s = lerPhp(SESSOES_FILE); $k = hash('sha256', $t);
    if (empty($s[$k]) || $s[$k]['expira'] < time()) return null;
    return lerUsuarios()[$s[$k]['usuario']] ?? null;
}
/** Exige login (e, se informado, o papel "admin"). */
function exigir(?string $papel = null): array {
    $u = sessaoAtual();
    if (!$u) responder(['erro' => 'Sessão expirada. Entre novamente.'], 401);
    if ($papel === 'admin' && $u['papel'] !== 'admin') responder(['erro' => 'Apenas administradores podem fazer isso.'], 403);
    return $u;
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
function salvarSegredos(array $s): void { gravarPhp(SEGREDOS_FILE, $s); }

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
