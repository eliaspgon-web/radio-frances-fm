/* =========================================================
   Rede Francês FM — motor comum dos layouts
   Player de rádios + carrossel das 5 principais notícias
   + painel gerencial (rádios, logos, notícias, aparência)
   ========================================================= */
(function () {
  "use strict";

  const PREVIEW = !!window.RADIO_EMBED;           // versão de demonstração (sem servidor)
  const LS_CFG = "radioapp.config.v1";
  const LS_LAST = "radioapp.ultimaRadio";
  const LS_VOL = "radioapp.volume";
  const API = "api/";

  let config = null;
  let ESTATICO = false; // hospedado sem PHP (ex.: GitHub Pages): só arquivos estáticos
  let sessao = null; // { token, usuario, nome, papel, papelNome }
  const LS_SES = "radioapp.sessao";
  const ehAdmin = () => !!sessao && sessao.papel === "admin";
  const authH = (extra) => Object.assign({ "X-Admin-Token": sessao ? sessao.token : "" }, extra || {});
  let atual = null;
  const audio = new Audio();
  audio.preload = "none";
  // iPhone/iPad ignoram audio.volume. Lá o volume passa por um controle de ganho (Web Audio),
  // que precisa do stream com CORS liberado (os streams da StreamTheWorld liberam).
  // Detecta pelo aparelho (alguns iOS "aceitam" o valor do volume mas não mudam o som) e também pela leitura do volume.
  const EH_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const VOL_IOS = EH_IOS || (() => { const t = new Audio(); try { t.volume = 0.5; } catch (e) {} return t.volume === 1; })();
  if (VOL_IOS) audio.crossOrigin = "anonymous";
  let ctxAudio = null, ganho = null, semCors = false;
  function ligarGanho() {   // só dentro de um toque do usuário (regra do iOS para áudio)
    if (ganho) return true;
    if (semCors || !VOL_IOS) return false;
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
      ctxAudio = new AC();
      ganho = ctxAudio.createGain();
      ctxAudio.createMediaElementSource(audio).connect(ganho).connect(ctxAudio.destination);
    } catch (e) { ganho = null; return false; }
    return true;
  }
  const acordarGanho = () => { if (ctxAudio && ctxAudio.state !== "running") ctxAudio.resume().catch(() => {}); };

  // ---------- utilidades ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const uid = () => Math.random().toString(36).slice(2, 9);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const iniciais = (t) => String(t || "?").replace(/FM|Rádio|Radio/gi, "").trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "FM";
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const safeUrl = (u) => { const s = String(u || "").trim(); return /^(https?:|data:image\/|uploads\/|assets\/|\.\/|\/(?!\/))/i.test(s) && !/^javascript:/i.test(s) ? s : ""; };

  function imgHTML(src, alt, cls = "") {
    const s = safeUrl(src);
    const ini = esc(iniciais(alt));
    if (!s) return `<span class="img-fallback ${cls}">${ini}</span>`;
    return `<img class="${cls}" src="${esc(s)}" alt="${esc(alt)}" loading="lazy" onerror="this.outerHTML='<span class=&quot;img-fallback ${cls}&quot;>${ini}</span>'">`;
  }

  function toast(msg, tipo = "") {
    let t = $("#ra-toast");
    if (!t) { t = document.createElement("div"); t.id = "ra-toast"; document.body.appendChild(t); }
    t.className = "show " + tipo; t.textContent = msg;
    clearTimeout(t._h); t._h = setTimeout(() => (t.className = ""), 3200);
  }

  // ---------- configuração ----------
  async function carregarConfig() {
    if (PREVIEW) {
      const salvo = lsGet(LS_CFG);
      try { return salvo ? JSON.parse(salvo) : clone(window.RADIO_EMBED); } catch (e) { return clone(window.RADIO_EMBED); }
    }
    for (const url of [API + "config.php", "data/config.json"]) {
      try {
        const r = await fetch(url + "?t=" + Date.now(), { cache: "no-store" });
        if (r.ok) { const j = await r.json(); if (j && j.radios) { ESTATICO = !url.startsWith(API); return j; } }
      } catch (e) {}
    }
    return { site: { nome: "Rádio" }, radios: [], noticias: { limite: 5, feeds: [], manuais: [] } };
  }

  // ---------- paletas caribenhas ----------
  const PALETAS = {
    frances:  { nome: "Francês FM (site)",   desc: "Preto, vermelho e o degradê do logo", corPrimaria: "#e6231d", corDestaque: "#ff632a", corSol: "#fcb91d", corEscura: "#000000", corAreia: "#13110f" },
    caribe:   { nome: "Mar do Caribe",       desc: "Azul oceano, turquesa e coral", corPrimaria: "#0a7ea4", corDestaque: "#ff6f61", corSol: "#2ec4b6", corEscura: "#053b50", corAreia: "#eefafa" },
    porDoSol: { nome: "Pôr do Sol Tropical", desc: "Papaia, hibisco e manga",       corPrimaria: "#f2613f", corDestaque: "#d63a6a", corSol: "#ffc94d", corEscura: "#2d1e4a", corAreia: "#fff5ea" },
    coqueiro: { nome: "Coqueiro & Areia",    desc: "Verde palmeira, areia e sol",   corPrimaria: "#1f8a7d", corDestaque: "#e76f51", corSol: "#e9c46a", corEscura: "#1e3d4a", corAreia: "#faf3e6" },
  };
  const VARS = { corPrimaria: "--primary", corDestaque: "--accent", corSol: "--sun", corEscura: "--deep", corAreia: "--sand" };

  function aplicarCores(s) {
    const root = document.documentElement.style;
    const base = PALETAS[s.paleta] || PALETAS.frances;
    Object.entries(VARS).forEach(([k, v]) => root.setProperty(v, s[k] || base[k]));
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = s.corPrimaria || base.corPrimaria;
  }

  function aplicarTema() {
    const s = config.site || {};
    aplicarCores(s);
    const fundo = safeUrl(s.fundo);
    document.documentElement.style.setProperty("--bg-photo", fundo ? `url("${fundo.replace(/"/g, "%22")}")` : "none");
    document.title = (s.nome || "Rádio") + " — Ao vivo";
    $$("[data-site]").forEach((el) => {
      const k = el.dataset.site;
      if (k === "logo") el.innerHTML = imgHTML(s.logo, s.nome, "site-logo");
      else if (["instagram", "youtube", "facebook", "portal"].includes(k)) {
        if (s[k]) { el.href = s[k]; el.hidden = false; } else el.hidden = true;
      } else el.textContent = s[k] || "";
    });
  }

  // ---------- rádios ----------
  const radiosAtivas = () => (config.radios || []).filter((r) => r.ativo !== false);

  function renderRadios() {
    const lista = radiosAtivas();
    $$("[data-stations]").forEach((box) => {
      box.innerHTML = lista.length ? lista.map((r) => `
        <button class="station ${atual && atual.id === r.id ? "active" : ""}" data-id="${esc(r.id)}" aria-label="Ouvir ${esc(r.nome)}">
          <span class="station-logo">${imgHTML(r.logo, r.nome)}</span>
          <span class="station-info">
            <strong>${esc(r.nome)}</strong>
            <small>${esc([r.frequencia, r.cidade].filter(Boolean).join(" · "))}</small>
          </span>
          <span class="station-state"><span class="station-eq" aria-hidden="true"><i></i><i></i><i></i></span><em class="st-play">▶</em><em class="st-on">No ar</em></span>
        </button>`).join("") : `<p class="empty">Nenhuma rádio cadastrada. Abra o painel para adicionar.</p>`;
    });
    $$("[data-stations] .station").forEach((b) => b.addEventListener("click", () => {
      const r = radiosAtivas().find((x) => x.id === b.dataset.id);
      if (!r) return;
      $$(".sheet.open").forEach((x) => x.classList.remove("open"));
      if (atual && atual.id === r.id) alternar(); else selecionar(r, true);
    }));
    $$("[data-count]").forEach((el) => (el.textContent = lista.length));
  }

  function renderAgora() {
    const r = atual;
    $$("[data-np=logo]").forEach((el) => (el.innerHTML = r ? imgHTML(r.logo, r.nome, "np-img") : `<span class="img-fallback np-img">FM</span>`));
    $$("[data-np=name]").forEach((el) => (el.textContent = r ? r.nome : "Escolha uma rádio"));
    $$("[data-np=sub]").forEach((el) => (el.textContent = r ? [r.frequencia, r.cidade].filter(Boolean).join(" · ") : "Toque em uma emissora para ouvir"));
    $$("[data-np=city]").forEach((el) => (el.textContent = r ? String(r.cidade || r.nome).split(/\s+-\s+|,/)[0] : "Rádios"));
    $$("[data-np=freq]").forEach((el) => (el.textContent = r ? r.frequencia || "" : ""));
    $$(".station").forEach((b) => b.classList.toggle("active", !!r && b.dataset.id === r.id));
  }

  function setEstado(estado, texto) {
    document.body.dataset.player = estado; // idle | loading | playing | paused | error
    $$("[data-np=status]").forEach((el) => (el.textContent = texto));
    $$("[data-np=play]").forEach((b) => b.setAttribute("aria-label", estado === "playing" || estado === "loading" ? "Pausar" : "Tocar"));
  }

  function selecionar(r, tocarJa) {
    atual = r;
    lsSet(LS_LAST, r.id);
    renderAgora();
    renderContato(); // a mensagem do WhatsApp cita a rádio atual
    atualizarTocando();
    querTocar = false; clearTimeout(vigia);
    audio.pause();
    if (!r.stream) { setEstado("error", "Endereço de streaming não cadastrado"); return; }
    if (PREVIEW) { setEstado("paused", "Prévia do layout"); if (tocarJa) ouvirNaPrevia(r); return; }
    audio.src = r.stream;
    if (tocarJa) tocar(); else setEstado("paused", "Pronto para tocar");
    mediaSession();
  }

  let querTocar = false, tentativas = 0, vigia = null;
  function reconectar(motivo) {
    if (!querTocar || !atual || !atual.stream || PREVIEW) return;
    clearTimeout(vigia);
    const espera = Math.min(15000, 1500 * Math.pow(2, Math.min(tentativas, 4)));   // 1,5s · 3s · 6s · 12s · 15s
    tentativas++;
    setEstado("loading", "Reconectando…");
    vigia = setTimeout(() => { if (!querTocar) return; audio.src = atual.stream; audio.play().catch(() => {}); }, tentativas === 1 ? 300 : espera);
  }
  function tocar() {
    querTocar = true; tentativas = 0;
    if (!atual) { const p = radiosAtivas()[0]; if (p) selecionar(p, true); return; }
    if (PREVIEW) { ouvirNaPrevia(atual); return; }
    if (!atual.stream) { selecionar(atual, false); return; }
    // reconecta ao vivo (evita tocar áudio "atrasado" do buffer)
    audio.src = atual.stream;
    setEstado("loading", "Conectando…");
    audio.play().catch(() => setEstado("error", "Não foi possível conectar ao streaming"));
  }
  // Toca sozinho ao abrir. Se o navegador bloquear som automático (regra do iPhone/Android),
  // o primeiro toque em qualquer lugar da tela começa a rádio.
  function autoTocar() {
    const comecar = (e) => {
      soltar();
      if (e && e.target && e.target.closest && e.target.closest("[data-np=play],[data-np=loud],[data-np=mute],[data-np=next],[data-np=prev],[data-np=vol],.station,[data-stations] button,[data-watch]")) return;   // o próprio botão toca
      if (document.body.dataset.player !== "playing" && document.body.dataset.player !== "loading") tocar();
    };
    const soltar = () => { ["pointerdown", "keydown", "touchend"].forEach((ev) => document.removeEventListener(ev, comecar, true)); const d = $("#toque-ouvir"); if (d) d.remove(); };
    if (!atual || !atual.stream) return;
    querTocar = true; tentativas = 0;
    audio.src = atual.stream;
    setEstado("loading", "Conectando…");
    audio.play().then(soltar).catch(() => {
      querTocar = false;
      setEstado("paused", "Toque para ouvir");
      const d = document.createElement("div"); d.id = "toque-ouvir"; d.setAttribute("role", "button");
      d.innerHTML = `<span>▶</span><b>Toque em qualquer lugar para ouvir</b><small>${esc(atual.nome)}${atual.frequencia ? " · " + esc(atual.frequencia) : ""}</small>`;
      document.body.appendChild(d);
      ["pointerdown", "keydown", "touchend"].forEach((ev) => document.addEventListener(ev, comecar, { capture: true, once: false }));
    });
  }

  function pausar() { querTocar = false; clearTimeout(vigia); audio.pause(); setEstado("paused", "Pausado"); }
  function alternar() { (document.body.dataset.player === "playing" || document.body.dataset.player === "loading") ? pausar() : tocar(); }

  audio.addEventListener("playing", () => { tentativas = 0; clearTimeout(vigia); setEstado("playing", "AO VIVO"); });
  // Stream ao vivo caiu (sinal fraco, troca de wi-fi/4G, servidor): volta sozinho
  audio.addEventListener("ended", () => reconectar("fim"));
  audio.addEventListener("stalled", () => { clearTimeout(vigia); vigia = setTimeout(() => { if (audio.readyState < 3) reconectar("travou"); }, 8000); });
  audio.addEventListener("waiting", () => { clearTimeout(vigia); vigia = setTimeout(() => { if (audio.readyState < 3) reconectar("esperando"); }, 10000); });
  // Pausa que não veio do app (ligação, outro app tocando, fone desconectado): respeita e mostra pausado
  audio.addEventListener("pause", () => { if (querTocar && !audio.ended && audio.error == null && document.body.dataset.player === "playing") { querTocar = false; setEstado("paused", "Pausado"); } });
  window.addEventListener("online", () => { if (querTocar && audio.readyState < 3) reconectar("online"); });
  audio.addEventListener("waiting", () => setEstado("loading", "Carregando…"));
  let testeSemCors = false;
  audio.addEventListener("error", () => {
    if (!audio.src) return;
    if (audio.crossOrigin && !ganho && !testeSemCors) {   // pode ser stream sem CORS: tenta tocar sem ele
      testeSemCors = true; audio.removeAttribute("crossorigin");
      audio.src = audio.src; audio.play().catch(() => {}); return;
    }
    if (testeSemCors) { testeSemCors = false; if (VOL_IOS && !semCors) audio.crossOrigin = "anonymous"; }   // falha de rede, não de CORS
    if (querTocar && tentativas < 8) { reconectar("erro"); return; }
    setEstado("error", "Streaming indisponível no momento");
  });
  audio.addEventListener("playing", () => {
    if (testeSemCors) { testeSemCors = false; semCors = true; document.body.classList.add("vol-fixo"); }   // só tocou sem CORS: volume nos botões
  });
  audio.addEventListener("play", acordarGanho);
  ["touchend", "click"].forEach((ev) => document.addEventListener(ev, acordarGanho, true));   // iOS só libera o áudio em toques
  document.addEventListener("visibilitychange", acordarGanho);

  function mediaSession() {
    if (!("mediaSession" in navigator) || !atual) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: atual.nome, artist: atual.frequencia || "", album: config.site.nome || "" });
      npChave = ""; // a música atual é aplicada de novo pelo "Tocando agora"
      navigator.mediaSession.setActionHandler("play", tocar);
      navigator.mediaSession.setActionHandler("pause", pausar);
      navigator.mediaSession.setActionHandler("nexttrack", () => pular(1));
      navigator.mediaSession.setActionHandler("previoustrack", () => pular(-1));
    } catch (e) {}
  }
  function pular(d) {
    const l = radiosAtivas(); if (!l.length) return;
    const i = atual ? l.findIndex((r) => r.id === atual.id) : -1;
    selecionar(l[(i + d + l.length) % l.length], true);
  }

  function definirMudo(m) { audio.muted = m; pintarMudo(); toast(m ? "Som desligado" : "Som ligado"); }
  function pintarMudo() {
    document.body.classList.toggle("mudo", audio.muted);
    $$("[data-np=mute]").forEach((b) => { b.textContent = audio.muted ? "🔇" : "🔈"; b.setAttribute("aria-label", audio.muted ? "Ativar o som" : "Silenciar"); b.setAttribute("aria-pressed", audio.muted ? "true" : "false"); });
  }

  function ligarControles() {
    $$("[data-np=play]").forEach((b) => b.addEventListener("click", alternar));
    $$("[data-np=next]").forEach((b) => b.addEventListener("click", () => pular(1)));
    $$("[data-np=prev]").forEach((b) => b.addEventListener("click", () => pular(-1)));
    // iPhone/iPad não deixam a página mudar o volume (só os botões do aparelho): detecta e avisa
    if (VOL_IOS && !(window.AudioContext || window.webkitAudioContext)) document.body.classList.add("vol-fixo");
    // Barra de volume com curva de áudio (como num aparelho de som): metade da barra ≈ metade do volume que se ouve.
    // O som final = volume do celular × volume da barra. (Páginas web não podem ler/mudar o volume do sistema.)
    const aplicarVolume = (pos, origem) => {
      pos = Math.min(1, Math.max(0, +pos || 0));
      if (pos < 0.04) pos = 0; else if (pos > 0.97) pos = 1;   // encaixa nas pontas (fácil zerar ou ir ao máximo no dedo)
      if (VOL_IOS) {
        // no iPhone, 100% toca direto; abaixo disso liga o ganho (precisa ser num toque — a barra é um toque)
        if (ganho) { ganho.gain.setValueAtTime(pos * pos, ctxAudio.currentTime); ganho.gain.value = pos * pos; acordarGanho(); }
      } else audio.volume = pos * pos;
      lsSet(LS_VOL, String(pos));
      $$("[data-np=vol]").forEach((o) => { if (o !== origem) o.value = pos; o.style.setProperty("--pos", pos * 100 + "%"); o.setAttribute("aria-valuetext", Math.round(pos * 100) + "%"); });
      if (pos > 0 && audio.muted) definirMudo(false);
      document.body.classList.toggle("vol-zero", pos === 0);
    };
    const salvo = VOL_IOS ? 1 : parseFloat(lsGet(LS_VOL) ?? "0.8");   // iPhone: abre sempre em 100% (toca direto, sem desvio)
    $$("[data-np=vol]").forEach((v) => {
      v.value = isNaN(salvo) ? 0.8 : salvo;
      v.addEventListener("input", () => aplicarVolume(v.value, v));
      v.addEventListener("change", () => aplicarVolume(v.value, v));
      if (VOL_IOS) {   // liga o controle de volume no próprio toque da barra (regra do iPhone) e reaplica ao soltar
        ["touchend", "pointerup", "click"].forEach((ev) => v.addEventListener(ev, () => { if (+v.value < 1 && ligarGanho()) acordarGanho(); aplicarVolume(v.value, v); }, { passive: true }));
      }
    });
    aplicarVolume(isNaN(salvo) ? 0.8 : salvo);
    window.__volumeApp = { aplicarVolume, audio, get ganho() { return ganho; } };
    if (location.hash === "#diag") {
      const d = document.createElement("pre"); d.style.cssText = "position:fixed;left:6px;bottom:6px;z-index:99999;background:#000c;color:#0f0;font:11px monospace;padding:6px;border-radius:6px;max-width:95vw;white-space:pre-wrap;pointer-events:none";
      document.body.appendChild(d);
      setInterval(() => { d.textContent = `iOS:${EH_IOS} volIOS:${VOL_IOS} semCors:${semCors} cross:${audio.crossOrigin}\nbarra:${($("[data-np=vol]") || {}).value} audio.volume:${audio.volume.toFixed(2)} mudo:${audio.muted}\nganho:${ganho ? ganho.gain.value.toFixed(2) : "-"} ctx:${ctxAudio ? ctxAudio.state : "-"} player:${document.body.dataset.player}`; }, 500);
    }   // usado nos testes automáticos
    $$("[data-watch]").forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); abrirVideo(); }));
    // 🔈 silencia / ativa · 🔊 ativa o som (e começa a tocar se estiver parado)
    $$("[data-np=mute]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); definirMudo(!audio.muted); }));
    $$("[data-np=loud]").forEach((b) => b.addEventListener("click", (e) => {
      e.stopPropagation();
      definirMudo(false);
      const nivel = ganho ? ganho.gain.value : audio.volume;
      if (nivel < 0.05 && !document.body.classList.contains("vol-fixo")) window.__volumeApp.aplicarVolume(0.8, b);
      if (document.body.dataset.player !== "playing" && document.body.dataset.player !== "loading") tocar();
    }));
    pintarMudo();
    $$("[data-open-admin]").forEach((b) => b.addEventListener("click", () => { $$(".sheet.open").forEach((x) => x.classList.remove("open")); abrirAdmin(); }));
    $$("[data-toggle]").forEach((b) => b.addEventListener("click", () => { const t = $(b.dataset.toggle); if (t) t.classList.toggle("open"); }));
    $$(".sheet").forEach((sh) => sh.addEventListener("click", (e) => { if (e.target === sh || e.target.closest("[data-close-sheet]")) sh.classList.remove("open"); }));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") { $$(".sheet.open").forEach((x) => x.classList.remove("open")); const m = $("#ra-modal.open"); if (m && m._fechar) m._fechar(); } });
    document.addEventListener("keydown", (e) => { if (e.code === "Space" && !/INPUT|TEXTAREA|SELECT|BUTTON/.test(e.target.tagName)) { e.preventDefault(); alternar(); } });
  }

  // ---------- "Tocando agora" (música atual) ----------
  const mountDe = (r) => { if (r && r.mount) return String(r.mount).replace(/[^A-Za-z0-9_]/g, ""); const m = String((r && r.stream) || "").split("?")[0].split("/").pop().replace(/\.(aac|mp3|m3u8?|ogg)$/i, ""); return /^[A-Za-z0-9_]+$/.test(m) ? m : ""; };
  // ---------- "Tocando agora": metadados do stream (RDS) ----------
  // Fonte principal: serviço público da Triton/StreamTheWorld (o mesmo provedor do stream), lido direto pelo app.
  // Os nomes vêm em maiúsculas e às vezes com acento quebrado; o catálogo do iTunes corrige a grafia e traz a capa.
  const npCache = {};
  let npChave = "";
  // O stream manda acentos em outra codificação: cada letra acentuada vira "\uFFFD". Conserta as palavras mais comuns.
  const PALAVRAS = ["VOCÊ", "VOCÊS", "NÃO", "SÃO", "MÃE", "MÃO", "MÃOS", "IRMÃO", "CORAÇÃO", "PAIXÃO", "SOLIDÃO", "ILUSÃO", "TRAIÇÃO", "EMOÇÃO", "CANÇÃO", "SERTÃO", "SAFADÃO", "PISEIRO", "ATÉ", "É", "JÁ", "LÁ", "SÓ", "TÁ", "AÍ", "DÁ", "NÓS", "VÓS", "ALÔ", "CAMBORIÚ", "SAÚDE", "MÚSICA", "ÚLTIMA", "ÚNICA", "PRÓXIMA", "SÁBADO", "PÔR", "ESTÁ", "ESTÃO", "VIDA", "FÉ", "BEBÊ", "NENÊ", "CAFÉ", "PORQUÊ", "TAMBÉM", "NINGUÉM", "ALGUÉM", "ALÉM", "PARABÉNS", "MÊS", "TRÊS", "FORRÓ", "XOTE", "MAIARA", "SIMONE", "MARÍLIA", "MENDONÇA", "HENRIQUE", "JULIANO", "ZÉ", "NETO", "CRISTIANO", "JOÃO", "GUSTAVO", "LÉO", "SANTANA", "CALCINHA", "DEVINHO", "VITINHO", "KAUAN", "SÃO", "LOUCO", "MALOKA", "VAQUEIRO", "VAQUEJADA", "CORAÇÕES", "PAIXÕES", "AVIÕES", "MILHÕES", "LIGAÇÃO", "SEPARAÇÃO", "RECAÍDA", "SAUDADE", "BÊBADO", "BÊBADA", "CACHAÇA", "MOÇA", "MOÇO", "PRAÇA", "DANÇA", "DANÇAR", "BALANÇA", "ESPERANÇA", "CONFIANÇA", "LEMBRANÇA", "ABRAÇO", "ABRAÇA", "COMEÇO", "COMEÇAR", "PEÇO", "PREÇO", "CABEÇA", "AGORA"];
  const consertarPalavra = (w) => {
    if (!w.includes("\uFFFD")) return w;
    const re = new RegExp("^" + w.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\uFFFD/g, ".") + "$");
    const achou = PALAVRAS.find((p) => p.length === w.length && re.test(p));
    if (achou) return w === w.toUpperCase() ? achou : achou.toLowerCase();
    return w.replace(/\uFFFD\uFFFDO$/i, "ÇÃO").replace(/\uFFFD\uFFFDES$/i, "ÇÕES").replace(/\uFFFDO(S?)$/i, "ÃO$1").replace(/\uFFFDES$/i, "ÕES").replace(/\uFFFD/g, "");
  };
  const limparNp = (t) => String(t || "").replace(/^["'\s]+|["'\s]+$/g, "").split(/(\s+)/).map(consertarPalavra).join("").replace(/\s+/g, " ").trim();
  const norm = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\(.*?\)|\[.*?\]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  // Padrão do RDS: primeira letra de cada palavra maiúscula ("FALTA VOCÊ" / "falta você" → "Falta Você")
  const titleCase = (t) => String(t || "").toLocaleLowerCase("pt-BR").replace(/(^|[\s(\[\-\/"“&+.,])(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase("pt-BR"));

  async function metaTriton(mount) {
    const r = await fetch("https://np.tritondigital.com/public/nowplaying?mountName=" + encodeURIComponent(mount) + "&numberToFetch=1&eventType=track", { cache: "no-store" });
    if (!r.ok) return null;
    const d = new DOMParser().parseFromString(await r.text(), "application/xml");
    const info = d.querySelector("nowplaying-info"); if (!info) return null;
    const p = {}; info.querySelectorAll("property").forEach((x) => (p[x.getAttribute("name")] = x.textContent));
    const titulo = limparNp(p.cue_title), artista = limparNp(p.track_artist_name);
    return titulo || artista ? { titulo, artista } : null;
  }

  async function enriquecer(m) {   // grafia correta + capa do álbum (iTunes Search, com cache)
    const k = norm(m.titulo) + "|" + norm(m.artista);
    if (k in npCache) return npCache[k] || m;
    npCache[k] = null;
    const art = norm(m.artista).split(" ").filter((w) => w.length > 2).slice(0, 2).join(" ");
    for (const termo of [m.titulo + " " + art, m.titulo]) {
      try {
        const r = await fetch("https://itunes.apple.com/search?entity=song&limit=8&country=BR&term=" + encodeURIComponent(termo));
        const j = await r.json();
        const alvoT = norm(m.titulo), alvoA = norm(m.artista).slice(0, 5);
        const ok = (j.results || []).find((x) => { const t = norm(x.trackName); return (t === alvoT || t.startsWith(alvoT) || alvoT.startsWith(t)) && (!alvoA || norm(x.artistName).startsWith(alvoA) || norm(x.artistName).includes(alvoA)); });
        if (ok) { npCache[k] = { titulo: ok.trackName.replace(/\s*\((Ao Vivo|Live)\)\s*$/i, ""), artista: ok.artistName, capa: (ok.artworkUrl100 || "").replace("100x100bb", "300x300bb") }; return npCache[k]; }
      } catch (e) { break; }
    }
    npCache[k] = { titulo: titleCase(m.titulo), artista: titleCase(m.artista), capa: "" };
    return npCache[k];
  }

  async function atualizarTocando() {
    const r = atual, mount = mountDe(r);
    let m = null;
    if (r && r.tocandoTexto) m = { titulo: r.tocandoTexto, artista: "" };
    else if (!PREVIEW && mount) {
      try { m = await metaTriton(mount); } catch (e) {}
      if (!m) {   // reserva: proxy PHP do app ou endpoint do site
        const base = (config.site && config.site.tocandoBase) || "https://francesfm.com.br/playing/";
        for (const url of ESTATICO ? [base + mount] : [API + "tocando.php?mount=" + mount, "/playing/" + mount]) {
          try { const x = await fetch(url, { cache: "no-store" }); if (x.ok) { const j = await x.json(); const t = limparNp(j.text); if (t) { const [ti, ...ar] = t.split(/,\s*/); m = { titulo: ti, artista: ar.join(", ") }; break; } } } catch (e) {}
        }
      }
      if (m && m.titulo) m = await enriquecer(m);
      if (m) m = { ...m, titulo: titleCase(m.titulo), artista: titleCase(m.artista) };
    }
    if (atual !== r) return;                       // trocou de rádio durante a busca
    const chave = m ? m.titulo + "|" + m.artista : "";
    const texto = m ? [m.titulo, m.artista].filter(Boolean).join(" — ") : "";
    $$("[data-np=song]").forEach((e) => (e.textContent = texto || (r ? r.slogan || config.site.slogan || "" : "")));
    $$("[data-np=track]").forEach((e) => (e.textContent = m ? m.titulo : ((r && r.slogan) || config.site.slogan || "")));
    $$("[data-np=artist]").forEach((e) => (e.textContent = m ? m.artista : ""));
    // Música no RDS sem imagem: a bola da logo da rádio. Sem informação de música: sem capa.
    const bola = safeUrl((r && r.logo) || (config.site && config.site.icone) || "") || "assets/site/icone.svg";
    $$("[data-np=cover]").forEach((e) => {
      const temCapa = !!(m && m.capa);
      e.innerHTML = m ? `<img src="${esc(temCapa ? m.capa : bola)}" alt="${esc(temCapa ? "Capa: " + m.titulo : ((r && r.nome) || "Logo da rádio"))}" ${temCapa ? `onerror="this.onerror=null;this.src='${esc(bola)}';this.parentNode.classList.add('bola')"` : ""}>` : "";
      e.classList.toggle("on", !!m); e.classList.toggle("bola", !!m && !temCapa);
    });
    document.body.classList.toggle("has-song", !!texto);
    if (chave !== npChave && "mediaSession" in navigator && r) {   // tela de bloqueio / central de controle
      npChave = chave;
      try {
        navigator.mediaSession.metadata = new MediaMetadata({ title: m ? m.titulo : r.nome, artist: m ? m.artista || r.nome : (r.frequencia || ""), album: r.nome,
          artwork: m && m.capa ? [{ src: m.capa, sizes: "300x300", type: "image/jpeg" }] : [{ src: new URL("assets/icons/icon-512.png", location.href).href, sizes: "512x512", type: "image/png" }] });
      } catch (e) {}
    }
  }
  setInterval(() => { if (!document.hidden) atualizarTocando(); }, 20000);

  // ---------- prévia: o visualizador do claude.ai bloqueia áudio externo ----------
  // Em vez de um botão que "não faz nada", oferece links reais para ouvir cada rádio.
  function ouvirNaPrevia(r) {
    const lista = radiosAtivas().filter((x) => x.stream);
    modal(`<div class="rm-msg"><span class="rm-ico">📻</span><h3>Ouvir ao vivo</h3>
      <p>Nesta prévia o navegador bloqueia o áudio. Toque abaixo para ouvir agora em uma nova aba. No app publicado, o som toca aqui mesmo, sem sair da página.</p>
      <div class="rm-links">${lista.map((x) => `<a class="btn ${r && x.id === r.id ? "primary" : "ghost"}" href="${esc(x.stream)}" target="_blank" rel="noopener">▶ ${esc(x.nome)}${x.frequencia ? " · " + esc(x.frequencia) : ""}</a>`).join("")}</div></div>`);
  }

  // ---------- VEJA: transmissão ao vivo do YouTube ----------
  const urlCanal = () => { const y = (config.site && config.site.youtube) || ""; return /^https?:/i.test(y) ? y.replace(/\/+$/, "") : ""; };
  let estadoVideo = null;

  async function checarAoVivo() {
    if (PREVIEW || ESTATICO) { marcarVideo({ aoVivo: false }); return; }
    try {
      const r = await fetch(API + "aovivo.php?t=" + Date.now(), { cache: "no-store" });
      if (r.ok) { estadoVideo = await r.json(); marcarVideo(estadoVideo); return; }
    } catch (e) {}
    marcarVideo({ aoVivo: false });
  }
  function marcarVideo(v) {
    document.body.dataset.video = v.aoVivo ? "live" : "off";
    $$("[data-watch-sub]").forEach((el) => (el.textContent = v.aoVivo ? "Ao vivo agora" : "Canal no YouTube"));
    $$("[data-watch]").forEach((el) => (el.hidden = !urlCanal()));
  }
  setInterval(() => { if (!document.hidden) checarAoVivo(); }, 120000);

  let retomarAposVideo = false;   // a rádio estava tocando quando o VEJA abriu
  function modal(html, cls = "") {
    let m = $("#ra-modal");
    if (!m) { m = document.createElement("div"); m.id = "ra-modal"; document.body.appendChild(m); }
    m.className = "open " + cls;
    m.innerHTML = `<div class="rm-box"><button class="rm-x" aria-label="Fechar">×</button>${html}</div>`;
    const fechar = () => {
      const eraVideo = m.classList.contains("video");
      m.className = ""; m.innerHTML = "";                       // remove o vídeo (para o som dele)
      if (eraVideo && retomarAposVideo) { retomarAposVideo = false; tocar(); toast("Voltando para " + (atual ? atual.nome : "a rádio")); }
    };
    $(".rm-x", m).onclick = fechar;
    m.onclick = (e) => { if (e.target === m) fechar(); };
    m._fechar = fechar;
    return m;
  }

  const idCanalYT = () => { const m = String((config.site && config.site.youtube) || "").match(/UC[\w-]{22}/); return m ? m[0] : ""; };

  function telaVideo(ativa, vivo) {
    const id = idCanalYT(), canal = urlCanal();
    const src = {
      vivo: vivo && vivo.videoId ? `https://www.youtube.com/embed/${encodeURIComponent(vivo.videoId)}?autoplay=1&rel=0&playsinline=1` : `https://www.youtube.com/embed/live_stream?channel=${id}&autoplay=1&rel=0&playsinline=1`,
      videos: `https://www.youtube.com/embed/videoseries?list=UU${id.slice(2)}&rel=0&playsinline=1`,
    };
    const m = modal(`
      <div class="rm-tabs"><button data-v="vivo" class="${ativa === "vivo" ? "on" : ""}">🔴 Ao vivo</button><button data-v="videos" class="${ativa === "videos" ? "on" : ""}">▶ Últimos vídeos</button></div>
      <div class="rm-video"><iframe src="${src[ativa]}" title="YouTube" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>
      <div class="rm-info">${ativa === "vivo" ? `<span class="live-pill">● AO VIVO</span><strong>${esc((vivo && vivo.titulo) || "Transmissão ao vivo")}</strong>` : `<strong>Vídeos do canal</strong>`}
        <small class="rm-dica">${ativa === "vivo" && !(vivo && vivo.aoVivo) ? "Se aparecer “vídeo indisponível”, o canal não está ao vivo agora — veja os últimos vídeos." : ""}</small>
        <a href="${esc(canal)}${ativa === "vivo" ? "/live" : "/videos"}" target="_blank" rel="noopener">Abrir no YouTube ↗</a></div>`, "video");
    $$("[data-v]", m).forEach((b) => (b.onclick = () => telaVideo(b.dataset.v, vivo)));
  }

  async function abrirVideo() {
    const canal = urlCanal();
    if (!canal) return toast("Canal do YouTube não cadastrado no painel");
    if (PREVIEW) {
      modal(`<div class="rm-msg"><span class="rm-ico">📺</span><h3>Transmissão ao vivo</h3><p>Nesta prévia o claude.ai bloqueia vídeos de outros sites. No app publicado, o vídeo ao vivo e os últimos vídeos abrem aqui dentro, sem sair do app.</p><a class="btn primary" href="${esc(canal)}/live" target="_blank" rel="noopener">Abrir canal no YouTube</a></div>`);
      return;
    }
    if (document.body.dataset.player === "playing" || document.body.dataset.player === "loading") { retomarAposVideo = true; pausar(); }   // não tocar rádio e vídeo juntos
    if (!idCanalYT()) {   // canal cadastrado como @nome: sem ID não dá para embutir
      if (!ESTATICO && (!estadoVideo || Date.now() - (estadoVideo._t || 0) > 60000)) { try { const r = await fetch(API + "aovivo.php?t=" + Date.now()); estadoVideo = await r.json(); estadoVideo._t = Date.now(); } catch (e) {} }
      if (estadoVideo && estadoVideo.videoId) return telaVideo("vivo", estadoVideo);
      return modal(`<div class="rm-msg"><span class="rm-ico">📺</span><h3>Abrir o canal</h3><p>Para abrir o vídeo dentro do app, cadastre no painel o link do canal com o ID (youtube.com/channel/UC…).</p><a class="btn primary" href="${esc(canal)}/live" target="_blank" rel="noopener">Abrir no YouTube</a></div>`);
    }
    if (!ESTATICO && (!estadoVideo || Date.now() - (estadoVideo._t || 0) > 60000)) {
      try { const r = await fetch(API + "aovivo.php?t=" + Date.now()); estadoVideo = await r.json(); estadoVideo._t = Date.now(); marcarVideo(estadoVideo); } catch (e) {}
    }
    // com servidor sabemos se está ao vivo; sem servidor (GitHub Pages) abre a aba "Ao vivo" e o próprio YouTube informa
    const sabeQueNaoEsta = estadoVideo && !estadoVideo.erro && estadoVideo.aoVivo === false;
    telaVideo(sabeQueNaoEsta ? "videos" : "vivo", estadoVideo);
  }

  // ---------- notícias ----------
  function top5(itens, limite) {
    return itens
      .filter((n) => n && n.titulo)
      .sort((a, b) => (b.destaque ? 1 : 0) - (a.destaque ? 1 : 0) || String(b.data || "").localeCompare(String(a.data || "")))
      .slice(0, limite || 5);
  }

  async function carregarNoticias() {
    const lim = (config.noticias && config.noticias.limite) || 5;
    const manuais = (config.noticias && config.noticias.manuais) || [];
    if (PREVIEW && Array.isArray(config.noticias && config.noticias.previa)) return config.noticias.previa.slice(0, lim);
    if (!PREVIEW) {
      // com PHP: api/noticias.php · sem PHP (GitHub Pages): data/noticias.json, gerado pela rotina do GitHub
      for (const url of ESTATICO ? ["data/noticias.json"] : [API + "noticias.php", "data/noticias.json"]) {
        try {
          const r = await fetch(url + "?t=" + Date.now(), { cache: "no-store" });
          if (r.ok) { const j = await r.json(); const l = Array.isArray(j) ? j : j && j.itens; if (Array.isArray(l) && l.length) return l.slice(0, lim); }
        } catch (e) {}
      }
    }
    return top5(manuais.slice(), lim);
  }

  const fmtData = (d) => { if (!d) return ""; const x = new Date(d.length === 10 ? d + "T12:00:00" : d); return isNaN(x) ? "" : x.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }); };

  const TITULOS = { instagram: "Últimas do Instagram", rss: "Últimas notícias", misto: "Destaques", manual: "Destaques" };
  async function renderNoticias() {
    const itens = await carregarNoticias();
    const modo = (config.noticias && config.noticias.modo) || "instagram";
    const fonte = itens[0] && itens[0].fonte;
    $$("[data-news-title]").forEach((el) => (el.textContent = modo === "rss" && fonte ? "Últimas do " + fonte : TITULOS[modo] || "Destaques"));
    $$(".sec-h h2 .ig, .sec-h h2 .tag-ig").forEach((el) => {      // ícone: Instagram ou jornal
      const ig = modo === "instagram";
      el.classList.toggle("ic-news", !ig);
      if (!ig) el.innerHTML = `<svg viewBox="0 0 24 24"><path fill="#fff" d="M4 4h13v15a1 1 0 0 0 2 0V8h2v11a3 3 0 0 1-3 3H6a2 2 0 0 1-2-2zm3 4v3h7V8zm0 5v2h7v-2zm0 4v2h7v-2z"/></svg>`;
    });
    $$("[data-news-more]").forEach((el) => { const ig = config.site.instagram; el.href = modo === "instagram" && ig ? ig : (config.site.portal || ig || "#"); });
    $$("[data-news]").forEach((box) => montarCarrossel(box, itens));
  }

  function montarCarrossel(box, itens) {
    clearInterval(box._timer);
    if (!itens.length) { box.innerHTML = `<p class="empty">Nenhuma notícia cadastrada.</p>`; return; }
    if (box.dataset.variant === "cards") return montarCards(box, itens);
    box.innerHTML = `
      <div class="nc-viewport"><div class="nc-track">
        ${itens.map((n, i) => `
          <a class="nc-slide" href="${esc(safeUrl(n.link) || "#")}" target="_blank" rel="noopener" data-i="${i}">
            <div class="nc-media">${safeUrl(n.imagem) ? `<img src="${esc(safeUrl(n.imagem))}" alt="" loading="lazy" onerror="this.remove()">` : ""}<span class="nc-num">${String(i + 1).padStart(2, "0")}</span></div>
            <div class="nc-body">
              <span class="nc-meta">${n.destaque ? `<b class="nc-badge">Destaque</b>` : ""}${esc(n.categoria || n.fonte || "Notícias")}${n.data ? " · " + esc(fmtData(n.data)) : ""}</span>
              <h3>${esc(n.titulo)}</h3>
              ${n.resumo ? `<p>${esc(n.resumo)}</p>` : ""}
            </div>
          </a>`).join("")}
      </div></div>
      <button class="nc-nav prev" aria-label="Anterior">‹</button>
      <button class="nc-nav next" aria-label="Próxima">›</button>
      <div class="nc-dots">${itens.map((_, i) => `<button aria-label="Notícia ${i + 1}" data-go="${i}"></button>`).join("")}</div>`;
    const track = $(".nc-track", box);
    let idx = 0;
    const ir = (i) => {
      idx = (i + itens.length) % itens.length;
      track.style.transform = `translateX(-${idx * 100}%)`;
      $$(".nc-dots button", box).forEach((d, k) => d.classList.toggle("on", k === idx));
      $$(".nc-slide", box).forEach((s, k) => s.classList.toggle("on", k === idx));
    };
    const auto = () => { clearInterval(box._timer); box._timer = setInterval(() => ir(idx + 1), 6000); };
    $(".prev", box).onclick = () => { ir(idx - 1); auto(); };
    $(".next", box).onclick = () => { ir(idx + 1); auto(); };
    $$(".nc-dots button", box).forEach((d) => (d.onclick = () => { ir(+d.dataset.go); auto(); }));
    box.onmouseenter = () => clearInterval(box._timer);
    box.onmouseleave = auto;
    let x0 = null, moved = false;
    track.addEventListener("pointerdown", (e) => { x0 = e.clientX; moved = false; });
    track.addEventListener("pointerup", (e) => { if (x0 == null) return; const dx = e.clientX - x0; if (Math.abs(dx) > 40) { moved = true; ir(idx + (dx < 0 ? 1 : -1)); auto(); } x0 = null; });
    track.addEventListener("click", (e) => { if (moved) { e.preventDefault(); moved = false; } });
    ir(0); auto();
  }

  // ---------- contato via WhatsApp ----------
  const ICON_WA = `<svg viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M16 3C9 3 3.3 8.6 3.3 15.6c0 2.4.7 4.7 1.9 6.7L3 29l6.9-2.2a12.7 12.7 0 0 0 6.1 1.5c7 0 12.7-5.6 12.7-12.6S23 3 16 3Zm0 23.1c-2 0-3.9-.6-5.5-1.6l-.4-.2-4.1 1.3 1.3-4-.3-.4a10.4 10.4 0 0 1-1.6-5.6C5.4 9.8 10.2 5.1 16 5.1s10.6 4.7 10.6 10.5S21.8 26.1 16 26.1Zm5.8-7.8c-.3-.2-1.9-.9-2.2-1-.3-.1-.5-.2-.7.2l-1 1.2c-.2.2-.4.2-.7.1a8.6 8.6 0 0 1-4.3-3.7c-.3-.6.3-.5.9-1.7.1-.2 0-.4 0-.5l-1-2.4c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4-.3.3-1.2 1.1-1.2 2.8s1.2 3.2 1.4 3.5c.2.2 2.4 3.6 5.8 5 2.1.9 3 1 4 .8.7-.1 1.9-.8 2.2-1.5.3-.7.3-1.4.2-1.5-.1-.1-.3-.2-.6-.3Z"/></svg>`;
  const contatos = () => (config.contato || []).filter((c) => c.ativo !== false);
  const linkWA = (c) => {
    const num = String(c.numero || "").replace(/\D/g, "");
    if (!num) return "";
    const msg = String(c.mensagem || "").replace(/\{radio\}/g, atual ? atual.nome : (config.site.nome || ""));
    return `https://wa.me/${num.length <= 11 ? "55" + num : num}${msg ? "?text=" + encodeURIComponent(msg) : ""}`;
  };
  const ICON_CAT = { comercial: "💼", promocional: "🎁", jornalismo: "🎙️", "peça sua música": "🎵", "mande seu alô": "📣" };
  const iconeDe = (c) => c.icone || ICON_CAT[(c.tipo || "").toLowerCase()] || "💬";

  function renderContato() {
    const lista = contatos();
    const item = (c) => {
      const href = linkWA(c);
      return `<a class="contact-btn ${href ? "" : "disabled"}" ${href ? `href="${esc(href)}" target="_blank" rel="noopener"` : `href="#" data-sem-numero`}>
        <span class="contact-ico ${safeUrl(c.iconeImg) ? "com-fig" : ""}">${safeUrl(c.iconeImg) ? `<img src="${esc(safeUrl(c.iconeImg))}" alt="">` : esc(iconeDe(c))}</span>
        <span class="contact-txt"><strong>${esc(c.tipo)}</strong><small>${esc(c.descricao || "Fale pelo WhatsApp")}</small></span>
        <span class="contact-wa">${ICON_WA}</span></a>`;
    };
    const normais = lista.filter((c) => !c.atalho), atalhos = lista.filter((c) => c.atalho);
    $$("[data-contact]").forEach((box) => (box.innerHTML = normais.length ? normais.map(item).join("") : `<p class="empty">Nenhum canal de contato ativo.</p>`));
    $$("[data-shortcuts]").forEach((box) => {
      box.innerHTML = atalhos.map((c) => { const h = linkWA(c); const img = safeUrl(c.iconeImg);
        return `<a class="shortcut ${img ? "com-fig" : ""}" ${h ? `href="${esc(h)}" target="_blank" rel="noopener"` : `href="#" data-sem-numero`}>${img ? `<span class="sc-fig"><img src="${esc(img)}" alt="" loading="lazy"></span>` : `<span>${esc(iconeDe(c))}</span>`}<b class="sc-txt">${esc(c.tipo)}</b></a>`; }).join("");
      box.hidden = !atalhos.length;
    });
    // botão flutuante + seletor
    let fab = $("#wa-fab");
    if (!lista.length) { if (fab) fab.remove(); return; }
    if (!fab) {
      fab = document.createElement("div"); fab.id = "wa-fab";
      document.body.appendChild(fab);
    }
    fab.innerHTML = `<div class="wa-pop" role="dialog" aria-label="Fale conosco"><header><strong>Fale conosco</strong><small>Escolha o assunto</small></header>${lista.map(item).join("")}</div>
      <button class="wa-btn" aria-label="Contato pelo WhatsApp">${ICON_WA}</button>`;
    $(".wa-btn", fab).onclick = () => fab.classList.toggle("open");
    $$("[data-sem-numero]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); toast("Número de WhatsApp ainda não cadastrado no painel"); }));
  }
  document.addEventListener("click", (e) => { const f = $("#wa-fab"); if (f && !f.contains(e.target)) f.classList.remove("open"); });

  function montarCards(box, itens) {
    box.innerHTML = `<div class="nk-row">${itens.map((n, i) => `
      <a class="nk-card" href="${esc(safeUrl(n.link) || "#")}" target="_blank" rel="noopener">
        <div class="nk-img"><i class="nk-brand" aria-hidden="true">${esc(n.fonte || n.categoria || (config.site && config.site.nome) || "Notícias")}</i>${safeUrl(n.imagem) ? `<img src="${esc(safeUrl(n.imagem))}" alt="" loading="lazy" onerror="this.remove()">` : ""}<span>${String(i + 1).padStart(2, "0")}</span>${n.destaque ? `<b>Destaque</b>` : ""}${n.video ? `<em class="nk-play">▶</em>` : ""}</div>
        <div class="nk-txt"><small>${n.fonte === "Instagram" ? `<i class="ig-dot"></i>` : ""}${esc([n.fonte || n.categoria, fmtData(n.data)].filter(Boolean).join(" · "))}</small>
        <h3>${esc(n.titulo)}</h3></div>
      </a>`).join("")}</div>
      <div class="nc-dots">${itens.map((_, i) => `<button aria-label="Notícia ${i + 1}" data-go="${i}"></button>`).join("")}</div>`;
    const row = $(".nk-row", box), cards = $$(".nk-card", box), dots = $$(".nc-dots button", box);
    const ir = (i) => { const c = cards[(i + cards.length) % cards.length]; row.scrollTo({ left: c.offsetLeft - row.offsetLeft, behavior: "smooth" }); };
    const atualDot = () => { let k = 0, best = 1e9; cards.forEach((c, i) => { const d = Math.abs(c.offsetLeft - row.offsetLeft - row.scrollLeft); if (d < best) { best = d; k = i; } }); dots.forEach((d, i) => d.classList.toggle("on", i === k)); return k; };
    row.addEventListener("scroll", () => { clearTimeout(row._t); row._t = setTimeout(atualDot, 80); }, { passive: true });
    dots.forEach((d) => (d.onclick = () => ir(+d.dataset.go)));
    const auto = () => { clearInterval(box._timer); box._timer = setInterval(() => { const k = atualDot(); const fim = row.scrollLeft + row.clientWidth >= row.scrollWidth - 4; ir(fim ? 0 : k + 1); }, 5000); };
    ["pointerdown", "touchstart", "mouseenter"].forEach((ev) => row.addEventListener(ev, () => clearInterval(box._timer), { passive: true }));
    ["mouseleave", "touchend"].forEach((ev) => row.addEventListener(ev, auto, { passive: true }));
    atualDot(); auto();
  }

  // =========================================================
  //  PAINEL GERENCIAL
  // =========================================================
  let rascunho = null;
  let aba = "radios";

  async function abrirAdmin() {
    let ov = $("#ra-admin");
    if (!ov) { ov = document.createElement("div"); ov.id = "ra-admin"; document.body.appendChild(ov); }
    ov.className = "open";
    if (!sessao) { try { sessao = JSON.parse(sessionStorage.getItem(LS_SES) || localStorage.getItem(LS_SES) || "null"); } catch (e) { sessao = null; } }
    if (sessao && !PREVIEW) {   // confere se a sessão ainda vale
      try { const r = await fetch(API + "auth.php", { method: "POST", headers: authH({ "Content-Type": "application/json" }), body: JSON.stringify({ acao: "eu" }) }); if (r.ok) Object.assign(sessao, (await r.json()).usuario); else sessao = null; } catch (e) {}
    }
    if (!sessao) return telaLogin(ov);
    rascunho = clone(config);
    telaPainel(ov);
  }
  function fecharAdmin() { pararAudiencia(); limparImpressao(); const ov = $("#ra-admin"); if (ov) ov.className = ""; }
  function guardarSessao() {
    try {
      sessionStorage.removeItem(LS_SES); localStorage.removeItem(LS_SES);
      if (sessao) (sessao.lembrar ? localStorage : sessionStorage).setItem(LS_SES, JSON.stringify(sessao));
    } catch (e) {}
  }
  function sessaoExpirou() { sessao = null; guardarSessao(); toast("Sua sessão expirou. Entre novamente.", "err"); telaLogin($("#ra-admin")); }

  function telaLogin(ov, msg = "") {
    ov.innerHTML = `
      <div class="adm-login">
        <button class="adm-x" data-close aria-label="Fechar">×</button>
        <div class="adm-lock">⚙</div>
        <h2>Painel gerencial</h2>
        <p>${PREVIEW ? "Prévia: usuário <b>admin</b> e senha <b>frances2026</b>. As alterações ficam salvas só neste navegador." : "Entre com seu usuário e senha."}</p>
        <form id="adm-form" class="adm-login-form" autocomplete="on">
          <label class="f"><span>Usuário</span><input id="adm-user" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required></label>
          <label class="f"><span>Senha</span><span class="pw"><input type="password" id="adm-senha" name="password" autocomplete="current-password" required><button type="button" class="pw-eye" aria-label="Mostrar senha">👁</button></span></label>
          <label class="lembrar"><input type="checkbox" id="adm-lembrar" checked> <span>Manter conectado neste aparelho (30 dias)</span></label>
          <button class="btn primary">Entrar</button>
        </form>
        <small id="adm-err">${esc(msg)}</small>
      </div>`;
    $("[data-close]", ov).onclick = fecharAdmin;
    olhinho(ov);
    $("#adm-user", ov).focus();
    $("#adm-form", ov).onsubmit = async (e) => {
      e.preventDefault();
      const btn = $("#adm-form button.primary", ov); btn.disabled = true; btn.textContent = "Entrando…";
      const lembrar = $("#adm-lembrar", ov).checked;
      const r = await entrar($("#adm-user", ov).value.trim().toLowerCase(), $("#adm-senha", ov).value, lembrar);
      btn.disabled = false; btn.textContent = "Entrar";
      if (r.erro) { $("#adm-err", ov).textContent = r.erro; $("#adm-senha", ov).select(); return; }
      sessao = Object.assign(r, { lembrar }); guardarSessao(); rascunho = clone(config); aba = "radios"; telaPainel(ov);
      toast(`Olá, ${sessao.nome}!`, "ok");
    };
  }
  function olhinho(root) { $$(".pw-eye", root).forEach((b) => (b.onclick = () => { const i = b.previousElementSibling; i.type = i.type === "password" ? "text" : "password"; })); }

  async function entrar(usuario, senha, lembrar) {
    if (PREVIEW) {
      const u = (await usuariosPrevia()).find((x) => x.usuario === usuario);
      if (!u || u.hash !== (await sha(senha))) return { erro: "Usuário ou senha incorretos." };
      return { token: "previa", usuario: u.usuario, nome: u.nome, papel: u.papel, papelNome: PAPEIS[u.papel] };
    }
    if (ESTATICO) return { erro: "Este endereço é a versão sem servidor (GitHub Pages): o painel não salva aqui. Use o app publicado no servidor com PHP (ex.: francesfm.com.br/app)." };
    try {
      const r = await fetch(API + "auth.php", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "login", usuario, senha, lembrar: !!lembrar }) });
      const j = await r.json();
      if (!r.ok) return { erro: j.erro || "Não foi possível entrar." };
      return Object.assign({ token: j.token }, j.usuario);
    } catch (e) { return { erro: "Servidor indisponível." }; }
  }
  async function sair() {
    if (!PREVIEW && sessao) { try { await fetch(API + "auth.php", { method: "POST", headers: authH({ "Content-Type": "application/json" }), body: JSON.stringify({ acao: "sair" }) }); } catch (e) {} }
    sessao = null; guardarSessao(); telaLogin($("#ra-admin")); toast("Você saiu do painel.");
  }

  // ---- usuários na prévia (sem servidor): ficam neste navegador, com senha em hash ----
  const PAPEIS = { admin: "Administrador", editor: "Editor" };
  const LS_USERS = "radioapp.usuarios.previa";
  async function sha(t) { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)); return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join(""); }
  async function usuariosPrevia() {
    try { const l = JSON.parse(lsGet(LS_USERS) || "null"); if (Array.isArray(l) && l.length) return l; } catch (e) {}
    const l = [{ usuario: "admin", nome: "Administrador", papel: "admin", hash: await sha("frances2026"), ultimoAcesso: null }];
    lsSet(LS_USERS, JSON.stringify(l)); return l;
  }

  function telaPainel(ov) {
    pararAudiencia();
    ov.innerHTML = `
      <div class="adm">
        <header class="adm-top">
          <div><strong>Painel gerencial</strong><small>${esc(rascunho.site.nome || "")}</small></div>
          <div class="adm-user" title="${esc(sessao.usuario)}"><span class="av">${esc(iniciais(sessao.nome))}</span><span><b>${esc(sessao.nome)}</b><small>${esc(sessao.papelNome || PAPEIS[sessao.papel] || "")}</small></span><button class="btn ghost sm" data-act="sair">Sair</button></div>
          <div class="adm-actions">
            <button class="btn ghost" data-act="export">Exportar</button>
            <button class="btn ghost" data-act="import">Importar</button>
            <button class="btn primary" data-act="save">Salvar alterações</button>
            <button class="adm-x" data-close aria-label="Fechar">×</button>
          </div>
        </header>
        <nav class="adm-tabs">
          ${[["radios", "📻 Rádios / Streaming"], ["noticias", "📰 Notícias"], ["contato", "💬 WhatsApp"], ["aparencia", "🎨 Aparência"], ["audiencia", "📊 Audiência"], ...(ehAdmin() ? [["usuarios", "👥 Usuários"]] : []), ["conta", "🔒 Minha senha"]].map(([k, t]) => `<button data-tab="${k}" class="${aba === k ? "on" : ""}">${t}</button>`).join("")}
        </nav>
        <section class="adm-body"></section>
      </div>`;
    $("[data-close]", ov).onclick = fecharAdmin;
    $$("[data-tab]", ov).forEach((b) => (b.onclick = () => { aba = b.dataset.tab; telaPainel(ov); }));
    $("[data-act=save]", ov).onclick = salvar;
    $("[data-act=export]", ov).onclick = exportar;
    $("[data-act=import]", ov).onclick = importar;
    $("[data-act=sair]", ov).onclick = sair;
    if (aba === "usuarios" && !ehAdmin()) aba = "radios";
    ({ radios: abaRadios, noticias: abaNoticias, contato: abaContato, aparencia: abaAparencia, audiencia: abaAudiencia, usuarios: abaUsuarios, conta: abaConta }[aba] || abaRadios)($(".adm-body", ov));
  }

  // ----- aba Contato / WhatsApp -----
  function abaContato(body) {
    const cs = rascunho.contato = rascunho.contato || [];
    body.innerHTML = `
      <div class="adm-head"><h3>Contato pelo WhatsApp</h3><button class="btn primary sm" data-add>+ Novo canal</button></div>
      <p class="hint">Canais marcados como <b>Atalho</b> viram os botões grandes da faixa (ex.: “Peça sua música”, “Mande seu alô”). Cada canal abre uma conversa no WhatsApp com o número e a mensagem definidos. Use <b>{radio}</b> na mensagem para inserir a rádio que o ouvinte está escutando. Número com DDD (ex.: 82 99999-0000); o código 55 é adicionado automaticamente.</p>
      <div class="adm-list">
        ${cs.map((c, i) => `
          <article class="adm-card ${c.ativo === false ? "off" : ""}" data-i="${i}">
            <div class="adm-card-top">
              <span class="drag">${esc(iconeDe(c))}</span>
              <strong>${esc(c.tipo || "Canal")}</strong>
              <label class="switch" title="Mostrar como botão grande na faixa de atalhos (ex.: Peça sua música)"><input type="checkbox" data-k="atalho" ${c.atalho ? "checked" : ""}><i></i><span>Atalho</span></label>
              <label class="switch"><input type="checkbox" data-k="ativo" ${c.ativo !== false ? "checked" : ""}><i></i><span>Ativo</span></label>
              <button class="icon" data-move="-1" ${i === 0 ? "disabled" : ""}>↑</button>
              <button class="icon" data-move="1" ${i === cs.length - 1 ? "disabled" : ""}>↓</button>
              <button class="icon danger" data-del title="Excluir">🗑</button>
            </div>
            <div class="grid">
              <label class="f"><span>Assunto</span><input data-k="tipo" value="${esc(c.tipo)}" placeholder="Comercial"></label>
              <label class="f"><span>Ícone (emoji)</span><input data-k="icone" value="${esc(c.icone || "")}" placeholder="${esc(iconeDe(c))}" maxlength="4"></label>
              ${campoImagem("Imagem do ícone (PNG transparente, opcional)", c.iconeImg, "iconeImg")}
              <label class="f"><span>Número do WhatsApp</span><input data-k="numero" value="${esc(c.numero)}" inputmode="tel" placeholder="82 99999-0000"></label>
              <label class="f"><span>Descrição curta</span><input data-k="descricao" value="${esc(c.descricao)}" placeholder="Anuncie na rádio"></label>
              <label class="f full"><span>Mensagem inicial</span><textarea data-k="mensagem" rows="2">${esc(c.mensagem)}</textarea></label>
            </div>
          </article>`).join("") || `<p class="empty">Nenhum canal cadastrado.</p>`}
      </div>`;
    $("[data-add]", body).onclick = () => { cs.push({ id: uid(), tipo: "Novo canal", numero: "", descricao: "", mensagem: "Olá! Vim pelo app da {radio}.", ativo: true }); abaContato(body); };
    $$(".adm-card", body).forEach((card) => {
      const i = +card.dataset.i, c = cs[i];
      $$("[data-k]", card).forEach((inp) => inp.addEventListener(inp.type === "checkbox" ? "change" : "input", () => {
        c[inp.dataset.k] = inp.type === "checkbox" ? inp.checked : inp.value.trim();
        if (inp.dataset.k === "tipo") $(".adm-card-top strong", card).textContent = inp.value || "Canal";
        if (inp.dataset.k === "ativo") card.classList.toggle("off", !inp.checked);
      }));
      $$("[data-move]", card).forEach((b) => (b.onclick = () => { const j = i + +b.dataset.move; [cs[i], cs[j]] = [cs[j], cs[i]]; abaContato(body); }));
      $("[data-del]", card).onclick = () => { if (card.dataset.confirm) { cs.splice(i, 1); abaContato(body); } else { card.dataset.confirm = 1; toast("Clique na lixeira de novo para confirmar"); setTimeout(() => delete card.dataset.confirm, 3000); } };
      ligarImagens(card);
    });
  }

  // campo de imagem: URL + envio de arquivo + prévia
  function campoImagem(label, valor, key) {
    return `
      <label class="f full img-field" data-imgkey="${key}">
        <span>${label}</span>
        <div class="img-row">
          <span class="img-prev">${imgHTML(valor, "Logo")}</span>
          <input type="text" data-k="${key}" value="${esc(valor || "")}" placeholder="https://… ou envie um arquivo">
          <button type="button" class="btn ghost sm" data-upload="${key}">Enviar</button>
        </div>
      </label>`;
  }

  function ligarImagens(root, onChange) {
    $$("[data-upload]", root).forEach((b) => (b.onclick = () => {
      const inp = document.createElement("input");
      inp.type = "file"; inp.accept = "image/png,image/jpeg,image/webp,image/gif";
      inp.onchange = async () => {
        const f = inp.files[0]; if (!f) return;
        b.textContent = "…";
        try {
          const url = await enviarImagem(f);
          const field = $(`input[data-k="${b.dataset.upload}"]`, root);
          field.value = url; field.dispatchEvent(new Event("input", { bubbles: true }));
        } catch (e) { toast(e.message || "Falha no envio", "err"); }
        b.textContent = "Enviar";
      };
      inp.click();
    }));
    $$(".img-field input[data-k]", root).forEach((i) => i.addEventListener("input", () => {
      $(".img-prev", i.closest(".img-field")).innerHTML = imgHTML(i.value, "Logo");
      onChange && onChange();
    }));
  }

  async function enviarImagem(file) {
    if (file.size > 3 * 1024 * 1024) throw new Error("Imagem muito grande (máx. 3 MB)");
    if (!PREVIEW) {
      const fd = new FormData(); fd.append("arquivo", file); fd.append("token", sessao ? sessao.token : "");
      try {
        const r = await fetch(API + "upload.php", { method: "POST", body: fd });
        const j = await r.json();
        if (r.ok && j.url) return j.url;
        if (j && j.erro) throw new Error(j.erro);
      } catch (e) { if (e.message && !/fetch|JSON/i.test(e.message)) throw e; }
    }
    return reduzirImagem(file, 800); // sem servidor: guarda a imagem embutida
  }

  function reduzirImagem(file, max) {
    return new Promise((ok, ko) => {
      const fr = new FileReader();
      fr.onload = () => {
        const im = new Image();
        im.onload = () => {
          const k = Math.min(1, max / Math.max(im.width, im.height));
          const c = document.createElement("canvas");
          c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
          c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
          ok(c.toDataURL(file.type === "image/png" ? "image/png" : "image/jpeg", 0.85));
        };
        im.onerror = () => ko(new Error("Arquivo de imagem inválido"));
        im.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  // ----- aba Rádios -----
  function abaRadios(body) {
    const rs = rascunho.radios;
    body.innerHTML = `
      <div class="adm-head"><h3>Rádios e endereços de streaming</h3><button class="btn primary sm" data-add>+ Adicionar rádio</button></div>
      <div class="adm-card"><div class="grid">
        <label class="f"><span>Rádio que toca ao abrir o app</span><select data-ini>${rs.filter((r) => r.ativo !== false).map((r) => `<option value="${esc(r.id)}" ${(rascunho.site.radioInicial || "maceio") === r.id ? "selected" : ""}>${esc(r.nome)}${r.frequencia ? " · " + esc(r.frequencia) : ""}</option>`).join("")}</select></label>
        <label class="f"><span>Tocar sozinho ao abrir</span><label class="switch" style="margin-top:8px"><input type="checkbox" data-auto ${rascunho.site.autoplay !== false ? "checked" : ""}><i></i><span>${"Ligado"}</span></label></label>
      </div><p class="hint" style="margin:10px 0 0">iPhone e Android podem bloquear som automático; nesse caso o primeiro toque na tela já começa a rádio.</p></div>
      <p class="hint">Aceita links diretos de áudio (MP3/AAC/OGG, Icecast, Shoutcast, Zeno, StreamTheWorld). Use <b>Testar</b> para conferir se o stream responde.</p>
      <div class="adm-list">
        ${rs.map((r, i) => `
          <article class="adm-card ${r.ativo === false ? "off" : ""}" data-i="${i}">
            <div class="adm-card-top">
              <span class="drag">${i + 1}</span>
              <strong>${esc(r.nome || "Nova rádio")}</strong>
              <label class="switch"><input type="checkbox" data-k="ativo" ${r.ativo !== false ? "checked" : ""}><i></i><span>Ativa</span></label>
              <button class="icon" data-move="-1" title="Subir" ${i === 0 ? "disabled" : ""}>↑</button>
              <button class="icon" data-move="1" title="Descer" ${i === rs.length - 1 ? "disabled" : ""}>↓</button>
              <button class="icon danger" data-del title="Excluir">🗑</button>
            </div>
            <div class="grid">
              <label class="f"><span>Nome</span><input data-k="nome" value="${esc(r.nome)}"></label>
              <label class="f"><span>Frequência</span><input data-k="frequencia" value="${esc(r.frequencia)}" placeholder="106.1 FM"></label>
              <label class="f"><span>Cidade</span><input data-k="cidade" value="${esc(r.cidade)}" placeholder="Maceió - AL"></label>
              <label class="f full"><span>Endereço do streaming</span>
                <div class="img-row"><input data-k="stream" value="${esc(r.stream)}" placeholder="https://…/stream.mp3"><button type="button" class="btn ghost sm" data-test>▶ Testar</button></div>
                <small class="test-out"></small>
              </label>
              ${campoImagem("Logo / ícone", r.logo, "logo")}
              <label class="f"><span>Slogan da rádio</span><input data-k="slogan" value="${esc(r.slogan || "")}" placeholder="Ex.: A voz do Rancho do Maia"></label>
              <label class="f"><span>ID do “Tocando agora” (RDS)</span><input data-k="mount" value="${esc(r.mount || "")}" placeholder="${esc(mountDe(Object.assign({}, r, { mount: "" })) || "ex.: FRANCESFM_MACAAC")}"><small class="f-dica">Vazio = descobre pelo endereço do streaming.</small></label>
              <label class="f full"><span>Texto fixo no “Tocando agora” (opcional)</span><input data-k="tocandoTexto" value="${esc(r.tocandoTexto || "")}" placeholder="Use quando a rádio não envia o nome das músicas"></label>
            </div>
          </article>`).join("") || `<p class="empty">Nenhuma rádio. Clique em “Adicionar rádio”.</p>`}
      </div>`;
    $("[data-ini]", body).onchange = (e) => (rascunho.site.radioInicial = e.target.value);
    $("[data-auto]", body).onchange = (e) => (rascunho.site.autoplay = e.target.checked);
    $("[data-add]", body).onclick = () => { rs.push({ id: uid(), nome: "Nova rádio", cidade: "", frequencia: "", stream: "", logo: rascunho.site.logo || "", ativo: true }); abaRadios(body); };
    $$(".adm-card[data-i]", body).forEach((card) => {
      const i = +card.dataset.i, r = rs[i];
      $$("[data-k]", card).forEach((inp) => inp.addEventListener("input", () => {
        r[inp.dataset.k] = inp.type === "checkbox" ? inp.checked : inp.value.trim();
        if (inp.dataset.k === "nome") $(".adm-card-top strong", card).textContent = inp.value || "Nova rádio";
        if (inp.dataset.k === "ativo") card.classList.toggle("off", !inp.checked);
      }));
      $$("[data-k=ativo]", card).forEach((c) => c.addEventListener("change", () => c.dispatchEvent(new Event("input"))));
      $("[data-del]", card).onclick = () => { if (card.dataset.confirm) { rs.splice(i, 1); abaRadios(body); } else { card.dataset.confirm = 1; toast("Clique na lixeira de novo para confirmar a exclusão"); setTimeout(() => delete card.dataset.confirm, 3000); } };
      $$("[data-move]", card).forEach((b) => (b.onclick = () => { const j = i + +b.dataset.move; [rs[i], rs[j]] = [rs[j], rs[i]]; abaRadios(body); }));
      $("[data-test]", card).onclick = () => testarStream(r.stream, $(".test-out", card));
      ligarImagens(card);
      $$(".img-field input[data-k]", card).forEach((inp) => inp.addEventListener("input", () => (r[inp.dataset.k] = inp.value.trim())));
    });
  }

  function testarStream(url, out) {
    if (!url) { out.textContent = "Informe o endereço."; out.className = "test-out err"; return; }
    if (PREVIEW) { out.textContent = "Na prévia o teste não roda. Funciona com o app hospedado."; out.className = "test-out"; return; }
    const a = new Audio(); a.volume = 0.4; out.textContent = "Testando…"; out.className = "test-out";
    const fim = (ok, msg) => { clearTimeout(t); a.pause(); a.src = ""; out.textContent = msg; out.className = "test-out " + (ok ? "ok" : "err"); };
    const t = setTimeout(() => fim(false, "✗ Sem resposta em 10 s"), 10000);
    a.addEventListener("playing", () => setTimeout(() => fim(true, "✓ Stream funcionando"), 1500), { once: true });
    a.addEventListener("error", () => fim(false, "✗ Não foi possível tocar este endereço"), { once: true });
    a.src = url; a.play().catch(() => {});
  }

  // ----- aba Notícias -----
  const MODOS = [
    ["instagram", "📸", "Instagram", "Os últimos posts do perfil"],
    ["rss", "🌐", "Sites (RSS)", "Notícias de portais por RSS"],
    ["misto", "🔀", "Instagram + Sites", "Os mais recentes de todos"],
    ["manual", "✍️", "Manual", "Só as cadastradas aqui"],
  ];
  function abaNoticias(body) {
    const n = rascunho.noticias = rascunho.noticias || { limite: 5, feeds: [], manuais: [] };
    n.feeds = n.feeds || []; n.manuais = n.manuais || []; n.modo = n.modo || "instagram";
    const usaIG = n.modo === "instagram" || n.modo === "misto", usaRSS = n.modo === "rss" || n.modo === "misto";
    body.innerHTML = `
      <div class="adm-head"><h3>De onde vêm as notícias do carrossel?</h3>
        <label class="f inline"><span>Quantidade</span><input type="number" min="1" max="10" data-lim value="${n.limite || 5}"></label></div>
      <div class="pal-grid modos">${MODOS.map(([k, ic, t, d]) => `<button type="button" class="pal-card ${n.modo === k ? "on" : ""}" data-modo="${k}"><span class="modo-ic">${ic}</span><strong>${t}</strong><small>${d}</small></button>`).join("")}</div>
      <p class="hint">Atualização automática a cada 10 minutos. Notícias manuais marcadas como <b>Destaque</b> sempre entram na frente.</p>

      ${usaIG && !ehAdmin() ? `<p class="hint">📸 A conexão com o Instagram é configurada por um <b>administrador</b>.</p>` : ""}
      ${usaIG && ehAdmin() ? `<div class="adm-card ig-box">
        <div class="adm-card-top"><span class="drag ig">📸</span><strong>Conexão com o Instagram</strong><span class="ig-status" data-igstatus>${PREVIEW ? "prévia" : "verificando…"}</span></div>
        <p class="hint">Use o <b>token de acesso</b> da API oficial do Instagram (conta Profissional: Comercial ou Criador de conteúdo). O token fica guardado só no servidor e nunca aparece no site.
        <br>• Login com Instagram: deixe o ID em branco. • Login pelo Facebook (Graph API): informe o ID numérico da conta do Instagram.</p>
        <div class="grid">
          <label class="f full"><span>Token de acesso</span><input type="password" data-igtoken placeholder="Cole o token aqui (deixe vazio para manter o atual)" autocomplete="off"></label>
          <label class="f"><span>ID da conta (opcional)</span><input data-igid inputmode="numeric" placeholder="17841400000000000"></label>
          <label class="f"><span>Link do perfil (botão “+”)</span><input data-iglink value="${esc(rascunho.site.instagram || "")}" placeholder="https://instagram.com/seuperfil"></label>
        </div>
        <div class="adm-actions" style="margin-top:10px"><button class="btn primary sm" data-igsave ${PREVIEW ? "disabled" : ""}>Salvar token</button><button class="btn ghost sm" data-igtest ${PREVIEW ? "disabled" : ""}>Testar conexão</button><button class="btn ghost sm" data-igdel ${PREVIEW ? "disabled" : ""}>Desconectar</button></div>
        <small class="test-out" data-igout></small>
      </div>` : ""}

      ${usaRSS ? `<h4>Feeds RSS de sites</h4>
      <div class="feeds">
        ${n.feeds.map((f, i) => `<div class="img-row"><input data-feed="${i}" value="${esc(f)}" placeholder="https://seuportal.com.br/feed/"><button class="icon danger" data-delfeed="${i}">🗑</button></div>`).join("")}
        <button class="btn ghost sm" data-addfeed>+ Adicionar feed RSS</button>
        <small class="hint" style="margin:0">Dica: sites WordPress costumam ter o feed em <b>/feed/</b>. Exemplo: https://francesnews.com.br/feed/</small>
      </div>` : ""}

      <div class="adm-head"><h4>Notícias manuais ${n.modo === "manual" ? "" : "<small style='font-weight:400;color:#6b7180'>(use “Destaque” para fixar no topo)</small>"}</h4><button class="btn primary sm" data-addnews>+ Nova notícia</button></div>
      <div class="adm-list">
        ${n.manuais.map((x, i) => `
          <article class="adm-card" data-i="${i}">
            <div class="adm-card-top">
              <span class="drag ${x.destaque ? "top" : ""}">${x.destaque ? "★" : "·"}</span>
              <strong>${esc(x.titulo || "Sem título")}</strong>
              <label class="switch"><input type="checkbox" data-k="destaque" ${x.destaque ? "checked" : ""}><i></i><span>Destaque</span></label>
              <button class="icon danger" data-del title="Excluir">🗑</button>
            </div>
            <div class="grid">
              <label class="f full"><span>Título</span><input data-k="titulo" value="${esc(x.titulo)}"></label>
              <label class="f full"><span>Resumo</span><textarea data-k="resumo" rows="2">${esc(x.resumo)}</textarea></label>
              <label class="f"><span>Categoria</span><input data-k="categoria" value="${esc(x.categoria)}"></label>
              <label class="f"><span>Data</span><input type="date" data-k="data" value="${esc(x.data)}"></label>
              <label class="f"><span>Link da matéria</span><input data-k="link" value="${esc(x.link)}" placeholder="https://…"></label>
              ${campoImagem("Imagem", x.imagem, "imagem")}
            </div>
          </article>`).join("")}
      </div>`;
    $("[data-lim]", body).oninput = (e) => (n.limite = Math.max(1, Math.min(10, +e.target.value || 5)));
    $$("[data-modo]", body).forEach((b) => (b.onclick = () => { n.modo = b.dataset.modo; abaNoticias(body); }));
    const fa = $("[data-addfeed]", body); if (fa) fa.onclick = () => { n.feeds.push(""); abaNoticias(body); };
    $$("[data-feed]", body).forEach((i) => (i.oninput = () => (n.feeds[+i.dataset.feed] = i.value.trim())));
    $$("[data-delfeed]", body).forEach((b) => (b.onclick = () => { n.feeds.splice(+b.dataset.delfeed, 1); abaNoticias(body); }));
    $("[data-addnews]", body).onclick = () => { n.manuais.unshift({ id: uid(), titulo: "", resumo: "", imagem: "", link: "", categoria: "", data: new Date().toISOString().slice(0, 10), destaque: false }); abaNoticias(body); };
    $$(".adm-card[data-i]", body).forEach((card) => {
      const x = n.manuais[+card.dataset.i];
      $$("[data-k]", card).forEach((inp) => inp.addEventListener(inp.type === "checkbox" ? "change" : "input", () => {
        x[inp.dataset.k] = inp.type === "checkbox" ? inp.checked : inp.value.trim();
        if (inp.dataset.k === "titulo") $(".adm-card-top strong", card).textContent = inp.value || "Sem título";
      }));
      $("[data-del]", card).onclick = () => { if (card.dataset.confirm) { n.manuais.splice(+card.dataset.i, 1); abaNoticias(body); } else { card.dataset.confirm = 1; toast("Clique na lixeira de novo para confirmar"); setTimeout(() => delete card.dataset.confirm, 3000); } };
      ligarImagens(card);
    });
    // Instagram
    const il = $("[data-iglink]", body); if (il) il.oninput = () => (rascunho.site.instagram = il.value.trim());
    if (usaIG && ehAdmin() && !PREVIEW) {
      const st = $("[data-igstatus]", body), out = $("[data-igout]", body);
      const api = async (dados) => { const r = await fetch(API + "segredos.php", { method: "POST", headers: authH({ "Content-Type": "application/json" }), body: JSON.stringify(dados) }); if (r.status === 401) sessaoExpirou(); return r.json(); };
      const pintar = (j) => { st.textContent = j.token ? "● conectado" : "○ sem token"; st.className = "ig-status " + (j.token ? "ok" : ""); if (j.user_id !== undefined) $("[data-igid]", body).value = j.user_id || ""; };
      api({ acao: "status" }).then(pintar).catch(() => (st.textContent = "servidor indisponível"));
      $("[data-igsave]", body).onclick = async () => { const j = await api({ acao: "salvar", instagram_token: $("[data-igtoken]", body).value.trim(), instagram_user_id: $("[data-igid]", body).value.trim() }); pintar(j); $("[data-igtoken]", body).value = ""; toast("Token salvo no servidor", "ok"); };
      $("[data-igtest]", body).onclick = async () => { out.textContent = "Testando…"; out.className = "test-out"; const j = await api({ acao: "testar" }); out.textContent = j.ok ? `✓ ${j.posts} posts encontrados. Último: “${j.exemplo || ""}”` : "✗ " + (j.erro || "falhou"); out.className = "test-out " + (j.ok ? "ok" : "err"); };
      $("[data-igdel]", body).onclick = async () => { pintar(await api({ acao: "salvar", remover: true })); toast("Instagram desconectado"); };
    }
  }

  // ----- aba Aparência -----
  function abaAparencia(body) {
    const s = rascunho.site;
    const cards = Object.entries(PALETAS).map(([k, p]) => `
      <button type="button" class="pal-card ${s.paleta === k ? "on" : ""}" data-pal="${k}">
        <span class="pal-sw">${["corPrimaria", "corDestaque", "corSol", "corEscura", "corAreia"].map((c) => `<i style="background:${p[c]}"></i>`).join("")}</span>
        <strong>${esc(p.nome)}</strong><small>${esc(p.desc)}</small>
      </button>`).join("");
    const cor = (k, label) => `<label class="f"><span>${label}</span><input type="color" data-k="${k}" value="${esc(s[k] || (PALETAS[s.paleta] || PALETAS.frances)[k])}"></label>`;
    body.innerHTML = `
      <div class="adm-head"><h3>Paleta de cores</h3></div>
      <p class="hint">Escolha uma paleta pronta ou ajuste cada cor. A mudança aparece na hora; clique em <b>Salvar alterações</b> para publicar.</p>
      <div class="pal-grid">${cards}</div>
      <div class="adm-card"><div class="grid">
        ${cor("corPrimaria", "Principal")}${cor("corDestaque", "Destaque (botões e selos)")}${cor("corSol", "Detalhes")}${cor("corEscura", "Tom escuro")}${cor("corAreia", "Fundo claro")}
      </div></div>
      <div class="adm-head"><h3>Identidade</h3></div>
      <div class="adm-card"><div class="grid">
        <label class="f"><span>Nome da rede</span><input data-k="nome" value="${esc(s.nome)}"></label>
        <label class="f"><span>Slogan</span><input data-k="slogan" value="${esc(s.slogan)}"></label>
        ${campoImagem("Logo principal", s.logo, "logo")}
        ${campoImagem("Imagem de fundo (foto à direita)", s.fundo, "fundo")}
        <label class="f"><span>Instagram</span><input data-k="instagram" value="${esc(s.instagram)}"></label>
        <label class="f"><span>Canal do YouTube (usado no VEJA)</span><input data-k="youtube" value="${esc(s.youtube)}" placeholder="https://www.youtube.com/@seucanal"></label>
        <label class="f"><span>Portal de notícias</span><input data-k="portal" value="${esc(s.portal || "")}" placeholder="https://francesnews.com.br"></label>
        <label class="f"><span>Facebook</span><input data-k="facebook" value="${esc(s.facebook)}"></label>
      </div></div>`;
    $$("[data-pal]", body).forEach((b) => (b.onclick = () => {
      const p = PALETAS[b.dataset.pal]; s.paleta = b.dataset.pal; Object.keys(VARS).forEach((k) => (s[k] = p[k])); aplicarCores(s); abaAparencia(body);
    }));
    $$("[data-k]", body).forEach((i) => i.addEventListener("input", () => {
      s[i.dataset.k] = i.value.trim();
      if (i.type === "color") aplicarCores(s);
    }));
    ligarImagens(body);
  }

  // ----- aba Audiência: ao vivo + relatórios com gráficos, impressão/PDF e CSV -----
  let audSub = "vivo", audTimer = null, audPeriodo = null, graficos = [];
  const COR_SERIE = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"]; // ordem fixa (paleta validada)
  const NOME_PLAT = { android: "Android", iphone: "iPhone / iPad", computador: "Computador", outro: "Outros" };
  function pararAudiencia() { clearInterval(audTimer); audTimer = null; graficos.forEach((g) => g.destroy()); graficos = []; }
  function limparImpressao() { const p = $("#relatorio-print"); if (p) p.remove(); }
  const nomeRadio = (id) => { const r = (config.radios || []).find((x) => x.id === id); return r ? r.nome + (r.frequencia ? " · " + r.frequencia : "") : id; };
  const nomeCurto = (id) => { const r = (config.radios || []).find((x) => x.id === id); if (!r) return id; const f = String(r.frequencia || "").replace(/\s*FM$/i, ""); const c = String(r.cidade || r.nome || "").split(/\s+-\s+|,/)[0].replace(/^Francês FM\s*/i, ""); return [f, c].filter(Boolean).join(" ") || r.nome; };
  const corRadio = (id) => { const i = (config.radios || []).findIndex((x) => x.id === id); return COR_SERIE[(i < 0 ? 7 : i) % 8]; };
  const n0 = (v) => Number(v || 0).toLocaleString("pt-BR");
  const hojeISO = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const somaDias = (iso, n) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return hojeISO(d); };
  const fmtDia = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

  function carregarChart() {
    if (window.Chart) return Promise.resolve(window.Chart);
    return new Promise((ok, ko) => { const sc = document.createElement("script"); sc.src = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"; sc.onload = () => { try { window.Chart.defaults.locale = "pt-BR"; window.Chart.defaults.font.family = "Inter, system-ui, sans-serif"; } catch (e) {} ok(window.Chart); }; sc.onerror = () => ko(new Error("Não foi possível carregar os gráficos")); document.head.appendChild(sc); });
  }

  // dados de demonstração (prévia e versão sem servidor) — sempre identificados como tal
  function demoAud(acao, de, ate) {
    const rnd = (k) => { let x = Math.sin(k * 9301 + 49297) * 233280; return x - Math.floor(x); };
    const curva = (h) => Math.max(0.05, Math.exp(-((h - 8.5) ** 2) / 6) * 0.95 + Math.exp(-((h - 17.5) ** 2) / 5) * 0.8 + 0.12);
    const ids = (config.radios || []).map((r) => r.id);
    if (acao === "agora") {
      const ag = new Date(), h = ag.getHours() + ag.getMinutes() / 60, base = Math.round(140 * curva(h));
      const serie = Array.from({ length: 60 }, (_, i) => { const t = new Date(ag - (59 - i) * 60000); const o = Math.round(140 * curva(t.getHours() + t.getMinutes() / 60) * (0.9 + rnd(t.getMinutes()) * 0.2)); return { hora: t.toTimeString().slice(0, 5), ouvintes: o, conectados: Math.round(o * 1.25) }; });
      const ouv = serie[59].ouvintes, porRadio = {}; ids.forEach((id, i) => (porRadio[id] = i === 0 ? Math.round(ouv * 0.72) : Math.round(ouv * 0.28 / Math.max(1, ids.length - 1))));
      return { demo: true, conectados: Math.round(ouv * 1.25), ouvintes: ouv, porRadio, porPlataforma: { android: Math.round(ouv * 0.62), iphone: Math.round(ouv * 0.28), computador: Math.round(ouv * 0.1) }, noApp: Math.round(ouv * 0.35), ultimos60: serie, atualizado: ag.toISOString(), base };
    }
    const dias = []; for (let d = de; d <= ate; d = somaDias(d, 1)) dias.push(d);
    const porDia = dias.map((d, i) => { const k = rnd(d.split("-").join("") * 1); const fim = [0, 6].includes(new Date(d + "T12:00:00").getDay()) ? 0.8 : 1; const u = Math.round((900 + k * 400) * fim); return { dia: d, ouvintesUnicos: u, sessoes: Math.round(u * 1.7), pico: Math.round((120 + k * 60) * fim), horas: Math.round(u * 0.62) }; });
    const tot = porDia.reduce((a, x) => ({ u: a.u + x.ouvintesUnicos, s: a.s + x.sessoes, h: a.h + x.horas, p: Math.max(a.p, x.pico) }), { u: 0, s: 0, h: 0, p: 0 });
    const out = { demo: true, de, ate, gerado: new Date().toISOString(),
      kpi: { ouvintesUnicos: dias.length > 1 ? Math.round(tot.u * 0.55) : tot.u, sessoes: tot.s, sessoesComAudio: Math.round(tot.s * 0.82), horasOuvidas: tot.h, mediaMinutos: 31.4, picoSimultaneo: tot.p, picoQuando: de + "T08:35:00", aberturasNoApp: Math.round(tot.s * 0.34) },
      porRadio: ids.map((id, i) => ({ radio: id, horas: Math.round(tot.h * (i === 0 ? 0.72 : 0.28 / Math.max(1, ids.length - 1))) })),
      porPlataforma: [{ plataforma: "android", aparelhos: Math.round(tot.u * 0.6) }, { plataforma: "iphone", aparelhos: Math.round(tot.u * 0.29) }, { plataforma: "computador", aparelhos: Math.round(tot.u * 0.11) }],
      picoPorHora: Array.from({ length: 24 }, (_, h) => Math.round(150 * curva(h + 0.5))) };
    if (de === ate) out.simultaneos5min = Array.from({ length: 288 }, (_, i) => { const h = i / 12; return { hora: String(Math.floor(h)).padStart(2, "0") + ":" + String((i % 12) * 5).padStart(2, "0"), ouvintes: Math.round(150 * curva(h) * (0.92 + rnd(i) * 0.16)) }; });
    else out.porDia = porDia;
    return out;
  }

  function demoRadio(j, radio) {   // demonstração: recorta a parte da rádio escolhida
    if (!radio || !j.kpi) return j;
    const ids = (config.radios || []).map((r) => r.id), f = ids.indexOf(radio) === 0 ? 0.72 : 0.28 / Math.max(1, ids.length - 1);
    const esc2 = (v) => Math.round(v * f), k = j.kpi;
    Object.assign(k, { ouvintesUnicos: esc2(k.ouvintesUnicos), sessoes: esc2(k.sessoes), sessoesComAudio: esc2(k.sessoesComAudio), horasOuvidas: esc2(k.horasOuvidas), picoSimultaneo: esc2(k.picoSimultaneo), aberturasNoApp: esc2(k.aberturasNoApp) });
    j.porPlataforma = j.porPlataforma.map((p) => ({ ...p, aparelhos: esc2(p.aparelhos) }));
    j.picoPorHora = j.picoPorHora.map(esc2);
    if (j.simultaneos5min) j.simultaneos5min = j.simultaneos5min.map((x) => ({ ...x, ouvintes: esc2(x.ouvintes) }));
    if (j.porDia) j.porDia = j.porDia.map((d) => ({ ...d, ouvintesUnicos: esc2(d.ouvintesUnicos), sessoes: esc2(d.sessoes), pico: esc2(d.pico), horas: esc2(d.horas) }));
    j.radio = radio; return j;
  }

  async function apiAud(acao, de, ate, radio = "") {
    if (PREVIEW || ESTATICO) return demoRadio(demoAud(acao, de, ate), radio);
    const q = acao === "agora" ? "acao=agora" : `acao=relatorio&de=${de}&ate=${ate}&radio=${encodeURIComponent(radio)}`;
    const r = await fetch(API + "audiencia.php?" + q + "&t=" + Date.now(), { headers: authH(), cache: "no-store" });
    if (r.status === 401) { sessaoExpirou(); throw new Error("Sessão expirada"); }
    const j = await r.json(); if (!r.ok) throw new Error(j.erro || "Erro ao carregar"); return j;
  }

  // estilo comum dos gráficos: linhas 2 px, barras com cantos de 4 px, grade discreta, 1 eixo
  function opcoesGrafico(extra = {}) {
    return Object.assign({ responsive: true, maintainAspectRatio: false, animation: { duration: 250 }, interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: false }, tooltip: { backgroundColor: "#14181f", padding: 10, cornerRadius: 8, titleFont: { weight: "700" }, displayColors: true, boxPadding: 4 } },
      scales: { x: { grid: { display: false }, ticks: { color: "#6b7180", maxRotation: 0, autoSkip: true, maxTicksLimit: 8 }, border: { color: "#d9dce4" } },
                y: { beginAtZero: true, grid: { color: "#eef0f4" }, ticks: { color: "#6b7180", precision: 0 }, border: { display: false } } } }, extra);
  }
  function grafico(canvas, cfg) { const g = new window.Chart(canvas, cfg); graficos.push(g); return g; }
  const linha = (rotulos, dados, nome, cor = COR_SERIE[0]) => ({ type: "line", data: { labels: rotulos, datasets: [{ label: nome, data: dados, borderColor: cor, backgroundColor: cor + "22", fill: true, borderWidth: 2, tension: 0.3, pointRadius: 0, pointHoverRadius: 5, pointHoverBorderWidth: 2, pointHoverBorderColor: "#fff" }] }, options: opcoesGrafico() });
  const barras = (rotulos, dados, nome, cores, horizontal) => ({ type: "bar", data: { labels: rotulos, datasets: [{ label: nome, data: dados, backgroundColor: cores, borderRadius: 4, borderSkipped: false, maxBarThickness: horizontal ? 26 : 34, categoryPercentage: 0.8, barPercentage: 0.9 }] },
    options: opcoesGrafico(horizontal ? { indexAxis: "y", interaction: { mode: "nearest", intersect: true }, scales: { x: { beginAtZero: true, grid: { color: "#eef0f4" }, ticks: { color: "#6b7180", precision: 0 }, border: { display: false } }, y: { grid: { display: false }, afterFit: (sc) => { sc.width = Math.max(sc.width, 96); }, ticks: { color: "#2b3040", font: { weight: "600" }, callback: function (v) { const t = this.getLabelForValue(v); return t.length > 18 ? t.slice(0, 17) + "…" : t; } }, border: { color: "#d9dce4" } } } } : {}) });

  async function abaAudiencia(body) {
    pararAudiencia();
    body.innerHTML = `
      <div class="adm-head"><h3>Audiência do app</h3>
        <div class="seg"><button data-sub="vivo" class="${audSub === "vivo" ? "on" : ""}">● Ao vivo</button><button data-sub="relatorio" class="${audSub === "relatorio" ? "on" : ""}">📈 Relatórios</button></div></div>
      ${PREVIEW || ESTATICO ? `<p class="hint demo">🧪 <b>Dados de demonstração.</b> A medição real funciona com o app no servidor com PHP (ex.: francesfm.com.br/app): cada aparelho envia um sinal anônimo a cada 30 s.</p>` : ""}
      <div data-aud></div>`;
    $$("[data-sub]", body).forEach((b) => (b.onclick = () => { audSub = b.dataset.sub; abaAudiencia(body); }));
    const alvo = $("[data-aud]", body);
    try { await carregarChart(); } catch (e) { alvo.innerHTML = `<p class="hint">${esc(e.message)}</p>`; return; }
    if (audSub === "vivo") return audVivo(alvo);
    return audRelatorio(alvo);
  }

  async function audVivo(alvo) {
    alvo.innerHTML = `
      <div class="kpis" data-k></div>
      <div class="viz-card"><div class="viz-h"><h4>Ouvintes simultâneos — últimos 60 minutos</h4><small data-upd></small></div><div class="viz-box"><canvas data-c1></canvas></div></div>
      <div class="viz-2">
        <div class="viz-card"><div class="viz-h"><h4>Ouvindo agora, por rádio</h4></div><div class="viz-box sm"><canvas data-c2></canvas></div></div>
        <div class="viz-card"><div class="viz-h"><h4>Conectados agora, por aparelho</h4></div><div class="viz-box sm"><canvas data-c3></canvas></div></div>
      </div>`;
    let g1, g2, g3;
    const pintar = async () => {
      let j; try { j = await apiAud("agora"); } catch (e) { $("[data-upd]", alvo).textContent = e.message; return; }
      const radios = Object.keys(j.porRadio || {}).sort((a, b) => (config.radios || []).findIndex((r) => r.id === a) - (config.radios || []).findIndex((r) => r.id === b));
      const plats = Object.entries(j.porPlataforma || {}).sort((a, b) => b[1] - a[1]);
      $("[data-k]", alvo).innerHTML = [
        ["Conectados agora", n0(j.conectados), "app aberto nos últimos 2 min"],
        ["Ouvindo agora", n0(j.ouvintes), "com a rádio tocando", true],
        ...radios.map((id) => [nomeRadio(id), n0(j.porRadio[id]), "ouvintes", false, corRadio(id)]),
        ["No app instalado", n0(j.noApp), "abriram pela tela inicial"],
      ].map(([t, v, d, dest, cor]) => `<div class="kpi ${dest ? "dest" : ""}">${cor ? `<i style="background:${cor}"></i>` : ""}<span>${esc(t)}</span><b>${v}</b><small>${esc(d)}</small></div>`).join("");
      $("[data-upd]", alvo).innerHTML = `<span class="pulse"></span> atualizado às ${new Date(j.atualizado).toLocaleTimeString("pt-BR")} · a cada 10 s`;
      const rot = j.ultimos60.map((x) => x.hora), dad = j.ultimos60.map((x) => x.ouvintes);
      if (!g1) g1 = grafico($("[data-c1]", alvo), linha(rot, dad, "Ouvintes")); else { g1.data.labels = rot; g1.data.datasets[0].data = dad; g1.update("none"); }
      const r2 = radios.map(nomeCurto), d2 = radios.map((id) => j.porRadio[id]), c2 = radios.map(corRadio);
      if (!g2) g2 = grafico($("[data-c2]", alvo), barras(r2, d2, "Ouvintes", c2, true)); else { g2.data.labels = r2; g2.data.datasets[0].data = d2; g2.data.datasets[0].backgroundColor = c2; g2.update("none"); }
      const r3 = plats.map(([p]) => NOME_PLAT[p] || p), d3 = plats.map(([, v]) => v);
      if (!g3) g3 = grafico($("[data-c3]", alvo), barras(r3, d3, "Conectados", COR_SERIE[0], true)); else { g3.data.labels = r3; g3.data.datasets[0].data = d3; g3.update("none"); }
    };
    await pintar();
    audTimer = setInterval(pintar, 10000);
  }

  async function audRelatorio(alvo) {
    const hoje = hojeISO();
    audPeriodo = audPeriodo || { de: hoje, ate: hoje, rotulo: "hoje", radio: "" };
    const radioSel = audPeriodo.radio || "";
    const atalho = (r, de, ate) => `<button data-p="${r}" data-de="${de}" data-ate="${ate}" class="${audPeriodo.rotulo === r ? "on" : ""}">${{ hoje: "Hoje", ontem: "Ontem", d7: "7 dias", d30: "30 dias" }[r]}</button>`;
    alvo.innerHTML = `
      <div class="rel-ctrl">
        <div class="seg">${atalho("hoje", hoje, hoje)}${atalho("ontem", somaDias(hoje, -1), somaDias(hoje, -1))}${atalho("d7", somaDias(hoje, -6), hoje)}${atalho("d30", somaDias(hoje, -29), hoje)}</div>
        <label class="f inline"><span>Rádio</span><select data-radio><option value="">Todas as rádios</option>${(config.radios || []).map((r) => `<option value="${esc(r.id)}" ${radioSel === r.id ? "selected" : ""}>${esc(nomeRadio(r.id))}</option>`).join("")}</select></label>
        <label class="f inline"><span>De</span><input type="date" data-de value="${audPeriodo.de}" max="${hoje}"></label>
        <label class="f inline"><span>Até</span><input type="date" data-ate value="${audPeriodo.ate}" max="${hoje}"></label>
        <span class="grow"></span>
        <button class="btn ghost sm" data-csv>⬇ CSV</button>
        <button class="btn primary sm" data-print>🖨 Imprimir / PDF</button>
      </div>
      <div data-rel><p class="hint">Carregando relatório…</p></div>`;
    const recarregar = () => audRelatorio(alvo);
    $$("[data-p]", alvo).forEach((b) => (b.onclick = () => { audPeriodo = { de: b.dataset.de, ate: b.dataset.ate, rotulo: b.dataset.p, radio: radioSel }; recarregar(); }));
    const mudouData = () => { const de = $("[data-de]", alvo).value, ate = $("[data-ate]", alvo).value; if (de && ate) { audPeriodo = { de: de <= ate ? de : ate, ate: de <= ate ? ate : de, rotulo: "", radio: radioSel }; recarregar(); } };
    $("[data-radio]", alvo).onchange = (e) => { audPeriodo = Object.assign({}, audPeriodo, { radio: e.target.value }); recarregar(); };
    $("[data-de]", alvo).onchange = mudouData; $("[data-ate]", alvo).onchange = mudouData;
    let j; try { j = await apiAud("relatorio", audPeriodo.de, audPeriodo.ate, radioSel); } catch (e) { $("[data-rel]", alvo).innerHTML = `<p class="hint">${esc(e.message)}</p>`; return; }
    graficos.forEach((g) => g.destroy()); graficos = [];
    const umDia = j.de === j.ate, k = j.kpi;
    const periodoTxt = (umDia ? fmtDia(j.de) : `${fmtDia(j.de)} a ${fmtDia(j.ate)}`) + (radioSel ? " · " + nomeRadio(radioSel) : " · todas as rádios");
    const corPrincipal = radioSel ? corRadio(radioSel) : COR_SERIE[0];
    const picoTxt = k.picoQuando ? new Date(k.picoQuando).toLocaleString("pt-BR", umDia ? { hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
    const kpis = [
      ["Ouvintes únicos", n0(k.ouvintesUnicos), "aparelhos diferentes", true],
      ["Pico simultâneo", n0(k.picoSimultaneo), "às " + picoTxt, true],
      ["Horas ouvidas", n0(k.horasOuvidas), "soma de todos os ouvintes"],
      ["Tempo médio", n0(k.mediaMinutos) + " min", "por sessão com áudio"],
      ["Sessões", n0(k.sessoes), n0(k.sessoesComAudio) + " com áudio"],
      ["Pelo app instalado", n0(k.aberturasNoApp), k.sessoes ? Math.round((k.aberturasNoApp / k.sessoes) * 100) + "% das sessões" : "—"],
    ];
    const linhasTabela = umDia
      ? j.picoPorHora.map((v, h) => [String(h).padStart(2, "0") + ":00", v])
      : j.porDia.map((d) => [fmtDia(d.dia), d.ouvintesUnicos, d.pico, d.horas, d.sessoes]);
    const cab = umDia ? ["Hora", "Pico de ouvintes simultâneos"] : ["Dia", "Ouvintes únicos", "Pico simultâneo", "Horas ouvidas", "Sessões"];
    $("[data-rel]", alvo).innerHTML = `
      <div class="rel" id="rel-atual">
        <div class="rel-tit"><h4>Relatório de audiência — ${esc(periodoTxt)}</h4>${j.demo ? `<em class="tag">demonstração</em>` : ""}</div>
        <div class="kpis">${kpis.map(([t, v, d, dest]) => `<div class="kpi ${dest ? "dest" : ""}"><span>${esc(t)}</span><b>${v}</b><small>${esc(d)}</small></div>`).join("")}</div>
        ${umDia ? `<div class="viz-card"><div class="viz-h"><h4>Ouvintes simultâneos ao longo do dia</h4><small>máximo a cada 5 min</small></div><div class="viz-box"><canvas data-g="dia"></canvas></div></div>`
                : `<div class="viz-2"><div class="viz-card"><div class="viz-h"><h4>Ouvintes únicos por dia</h4></div><div class="viz-box"><canvas data-g="unicos"></canvas></div></div>
                   <div class="viz-card"><div class="viz-h"><h4>Pico simultâneo por dia</h4></div><div class="viz-box"><canvas data-g="picos"></canvas></div></div></div>`}
        <div class="viz-2">
          <div class="viz-card"><div class="viz-h"><h4>${radioSel ? "Horas ouvidas: comparação entre as rádios" : "Horas ouvidas por rádio"}</h4></div><div class="viz-box sm"><canvas data-g="radio"></canvas></div></div>
          <div class="viz-card"><div class="viz-h"><h4>Aparelhos por plataforma</h4></div><div class="viz-box sm"><canvas data-g="plat"></canvas></div></div>
        </div>
        ${umDia ? `<div class="viz-card"><div class="viz-h"><h4>Pico de ouvintes por hora</h4></div><div class="viz-box"><canvas data-g="hora"></canvas></div></div>` : ""}
        <details class="viz-card tabela" ${umDia ? "" : "open"}><summary>Tabela de dados</summary>
          <table><thead><tr>${cab.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>${linhasTabela.map((l) => `<tr>${l.map((c, i) => `<td>${i ? n0(c) : esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>
        </details>
      </div>`;
    const G = (n) => $(`[data-g="${n}"]`, alvo);
    if (umDia) {
      grafico(G("dia"), linha(j.simultaneos5min.map((x) => x.hora), j.simultaneos5min.map((x) => x.ouvintes), "Ouvintes simultâneos", corPrincipal));
      grafico(G("hora"), barras(j.picoPorHora.map((_, h) => String(h).padStart(2, "0") + "h"), j.picoPorHora, "Pico de ouvintes", corPrincipal));
    } else {
      const rot = j.porDia.map((d) => d.dia.slice(8, 10) + "/" + d.dia.slice(5, 7));
      grafico(G("unicos"), barras(rot, j.porDia.map((d) => d.ouvintesUnicos), "Ouvintes únicos", corPrincipal));
      grafico(G("picos"), barras(rot, j.porDia.map((d) => d.pico), "Pico simultâneo", corPrincipal));
    }
    grafico(G("radio"), barras(j.porRadio.map((r) => nomeCurto(r.radio)), j.porRadio.map((r) => r.horas), "Horas ouvidas", j.porRadio.map((r) => (!radioSel || r.radio === radioSel ? corRadio(r.radio) : "#c9cdd6")), true));
    grafico(G("plat"), barras(j.porPlataforma.map((p) => NOME_PLAT[p.plataforma] || p.plataforma), j.porPlataforma.map((p) => p.aparelhos), "Aparelhos", corPrincipal, true));

    $("[data-print]", alvo).onclick = () => imprimirRelatorio(j, periodoTxt, kpis, cab, linhasTabela);
    $("[data-csv]", alvo).onclick = () => {
      const csv = [["Relatório de audiência", periodoTxt], [], ["Indicador", "Valor"], ...kpis.map(([t, v]) => [t, v]), [], cab, ...linhasTabela]
        .map((l) => l.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
      a.download = `audiencia_${radioSel || "todas"}_${j.de}${umDia ? "" : "_a_" + j.ate}.csv`; document.body.appendChild(a); a.click(); a.remove();
      if (PREVIEW) toast("Na prévia o download é bloqueado; no app publicado o CSV é baixado.");
    };
  }

  // versão para impressão: abre o diálogo do navegador (escolha "Salvar como PDF" para gerar o arquivo)
  function imprimirRelatorio(j, periodoTxt, kpis, cab, linhas) {
    const imgs = graficos.map((g) => ({ titulo: g.canvas.closest(".viz-card").querySelector("h4").textContent, src: g.toBase64Image("image/png", 1) }));
    let p = $("#relatorio-print"); if (p) p.remove();
    p = document.createElement("div"); p.id = "relatorio-print";
    p.innerHTML = `
      <header><div>${imgHTML(config.site.logo, config.site.nome, "rp-logo")}</div><div><h1>Relatório de audiência</h1><p>${esc(config.site.nome || "")} · ${esc(periodoTxt)}</p></div></header>
      ${j.demo ? `<p class="rp-demo">Dados de demonstração</p>` : ""}
      <section class="rp-kpis">${kpis.map(([t, v, d]) => `<div><span>${esc(t)}</span><b>${v}</b><small>${esc(d)}</small></div>`).join("")}</section>
      <section class="rp-graficos">${imgs.map((i) => `<figure><figcaption>${esc(i.titulo)}</figcaption><img src="${i.src}" alt="${esc(i.titulo)}"></figure>`).join("")}</section>
      <section class="rp-tabela"><h2>Dados</h2><table><thead><tr>${cab.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>${linhas.map((l) => `<tr>${l.map((c, i) => `<td>${i ? n0(c) : esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></section>
      <footer>Gerado em ${new Date().toLocaleString("pt-BR")} por ${esc(sessao ? sessao.nome : "")} · Medição anônima: cada aparelho é contado por um código aleatório, sem dados pessoais.</footer>`;
    document.body.appendChild(p);   // fica oculto na tela; só aparece na impressão (removido ao fechar o painel)
    setTimeout(() => { try { window.print(); } catch (e) {} if (PREVIEW) toast("Na prévia a impressão é bloqueada; no app publicado abre o diálogo de impressão/PDF."); }, 300);
  }

  // ----- aba Usuários (só administradores) -----
  async function apiUsuarios(dados) {
    if (PREVIEW) {
      let l = await usuariosPrevia();
      if (dados.acao === "salvar") {
        const login = String(dados.usuario || "").trim().toLowerCase();
        if (!/^[a-z0-9._-]{3,30}$/.test(login)) return { erro: "Usuário inválido: use 3 a 30 letras minúsculas, números, ponto, hífen ou _." };
        const ex = l.find((u) => u.usuario === login);
        if (dados.novo && ex) return { erro: "Já existe um usuário com esse nome." };
        if (dados.novo && (dados.senha || "").length < 8) return { erro: "Defina uma senha com pelo menos 8 caracteres." };
        if (dados.senha && dados.senha.length < 8) return { erro: "A senha precisa ter pelo menos 8 caracteres." };
        const u = ex || { usuario: login, ultimoAcesso: null };
        u.nome = (dados.nome || login).slice(0, 60); u.papel = dados.papel;
        if (dados.senha) u.hash = await sha(dados.senha);
        if (!ex) l.push(u);
        if (!l.some((x) => x.papel === "admin")) return { erro: "É preciso manter pelo menos um administrador." };
      }
      if (dados.acao === "excluir") {
        if (dados.usuario === sessao.usuario) return { erro: "Você não pode excluir o próprio usuário." };
        l = l.filter((u) => u.usuario !== dados.usuario);
        if (!l.some((x) => x.papel === "admin")) return { erro: "É preciso manter pelo menos um administrador." };
      }
      lsSet(LS_USERS, JSON.stringify(l));
      return { usuarios: l.map((u) => ({ usuario: u.usuario, nome: u.nome, papel: u.papel, papelNome: PAPEIS[u.papel], ultimoAcesso: u.ultimoAcesso })), papeis: PAPEIS };
    }
    try {
      const r = await fetch(API + "usuarios.php", { method: "POST", headers: authH({ "Content-Type": "application/json" }), body: JSON.stringify(dados) });
      if (r.status === 401) { sessaoExpirou(); return { erro: "Sessão expirada." }; }
      const j = await r.json(); return r.ok ? j : { erro: j.erro || "Erro" };
    } catch (e) { return { erro: "Servidor indisponível." }; }
  }

  async function abaUsuarios(body, editar = null) {
    body.innerHTML = `<p class="hint">Carregando usuários…</p>`;
    const j = await apiUsuarios({ acao: "listar" });
    if (j.erro) { body.innerHTML = `<p class="hint">${esc(j.erro)}</p>`; return; }
    const fmt = (d) => d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "nunca entrou";
    const form = (u) => `
      <form class="adm-card user-form" data-form>
        <div class="adm-card-top"><span class="drag">${u ? "✎" : "+"}</span><strong>${u ? "Editar " + esc(u.nome) : "Novo usuário"}</strong></div>
        <div class="grid">
          <label class="f"><span>Nome</span><input name="nome" value="${esc(u ? u.nome : "")}" placeholder="Ex.: Maria Souza" required maxlength="60"></label>
          <label class="f"><span>Usuário (login)</span><input name="usuario" value="${esc(u ? u.usuario : "")}" ${u ? "readonly" : ""} placeholder="ex.: maria" autocapitalize="none" spellcheck="false" pattern="[a-z0-9._\-]{3,30}" required></label>
          <label class="f"><span>Nível de acesso</span><select name="papel">${Object.entries(PAPEIS).map(([k, v]) => `<option value="${k}" ${u && u.papel === k ? "selected" : !u && k === "editor" ? "selected" : ""}>${v}</option>`).join("")}</select></label>
          <label class="f"><span>${u ? "Nova senha (deixe vazio para manter)" : "Senha"}</span><span class="pw"><input type="password" name="senha" minlength="8" autocomplete="new-password" ${u ? "" : "required"} placeholder="mínimo 8 caracteres"><button type="button" class="pw-eye" aria-label="Mostrar senha">👁</button></span></label>
        </div>
        <p class="hint" style="margin:10px 0 0"><b>Administrador:</b> tudo, inclusive usuários e conexão do Instagram. <b>Editor:</b> rádios, notícias, WhatsApp e aparência.</p>
        <div class="adm-actions" style="margin-top:10px"><button class="btn primary sm">${u ? "Salvar usuário" : "Criar usuário"}</button>${u ? `<button type="button" class="btn ghost sm" data-cancel>Cancelar</button>` : ""}</div>
        <small class="test-out" data-out></small>
      </form>`;
    body.innerHTML = `
      <div class="adm-head"><h3>Usuários do painel</h3><small style="color:#6b7180">${j.usuarios.length} cadastrado(s)</small></div>
      <div class="adm-list users">
        ${j.usuarios.map((u) => `
          <article class="adm-card user-row" data-u="${esc(u.usuario)}">
            <span class="av">${esc(iniciais(u.nome))}</span>
            <div class="user-info"><strong>${esc(u.nome)} ${u.usuario === sessao.usuario ? `<em class="tag">você</em>` : ""}</strong><small>@${esc(u.usuario)} · último acesso: ${esc(fmt(u.ultimoAcesso))}</small></div>
            <span class="role ${u.papel}">${esc(u.papelNome || PAPEIS[u.papel])}</span>
            <button class="icon" data-edit title="Editar">✎</button>
            <button class="icon danger" data-del title="Excluir" ${u.usuario === sessao.usuario ? "disabled" : ""}>🗑</button>
          </article>`).join("")}
      </div>
      ${form(editar ? j.usuarios.find((u) => u.usuario === editar) : null)}`;
    olhinho(body);
    $$("[data-edit]", body).forEach((b) => (b.onclick = () => abaUsuarios(body, b.closest("[data-u]").dataset.u)));
    $$("[data-del]", body).forEach((b) => (b.onclick = async () => {
      const row = b.closest("[data-u]");
      if (!row.dataset.confirm) { row.dataset.confirm = 1; toast("Clique na lixeira de novo para excluir @" + row.dataset.u); setTimeout(() => delete row.dataset.confirm, 3000); return; }
      const r = await apiUsuarios({ acao: "excluir", usuario: row.dataset.u });
      if (r.erro) return toast(r.erro, "err");
      toast("Usuário excluído", "ok"); abaUsuarios(body);
    }));
    const c = $("[data-cancel]", body); if (c) c.onclick = () => abaUsuarios(body);
    $("[data-form]", body).onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target, out = $("[data-out]", f);
      const dados = { acao: "salvar", novo: !editar, nome: f.nome.value.trim(), usuario: f.usuario.value.trim().toLowerCase(), papel: f.papel.value, senha: f.senha.value };
      if (editar === sessao.usuario && dados.papel !== "admin") { out.textContent = "Você não pode tirar o seu próprio acesso de administrador."; out.className = "test-out err"; return; }
      const r = await apiUsuarios(dados);
      if (r.erro) { out.textContent = r.erro; out.className = "test-out err"; return; }
      toast(editar ? "Usuário atualizado" : `Usuário @${dados.usuario} criado`, "ok");
      if (editar === sessao.usuario) { sessao.nome = dados.nome; guardarSessao(); }
      abaUsuarios(body);
    };
  }

  // ----- aba Minha senha -----
  function abaConta(body) {
    body.innerHTML = `
      <div class="adm-head"><h3>Minha conta</h3></div>
      <div class="adm-card user-row me"><span class="av">${esc(iniciais(sessao.nome))}</span><div class="user-info"><strong>${esc(sessao.nome)}</strong><small>@${esc(sessao.usuario)}</small></div><span class="role ${sessao.papel}">${esc(sessao.papelNome || PAPEIS[sessao.papel])}</span></div>
      <form class="adm-card" id="f-senha" style="margin-top:12px">
        <div class="adm-card-top"><span class="drag">🔒</span><strong>Trocar minha senha</strong></div>
        <div class="grid">
          <label class="f"><span>Senha atual</span><span class="pw"><input type="password" id="s0" autocomplete="current-password" required><button type="button" class="pw-eye" aria-label="Mostrar senha">👁</button></span></label>
          <label class="f"><span>Nova senha</span><span class="pw"><input type="password" id="s1" minlength="8" autocomplete="new-password" required placeholder="mínimo 8 caracteres"><button type="button" class="pw-eye" aria-label="Mostrar senha">👁</button></span></label>
          <label class="f"><span>Repita a nova senha</span><span class="pw"><input type="password" id="s2" minlength="8" autocomplete="new-password" required><button type="button" class="pw-eye" aria-label="Mostrar senha">👁</button></span></label>
        </div>
        <div class="adm-actions" style="margin-top:10px"><button class="btn primary">Trocar senha</button></div>
        <small class="test-out" data-out></small>
      </form>`;
    olhinho(body);
    $("#f-senha", body).onsubmit = async (e) => {
      e.preventDefault();
      const out = $("[data-out]", body), atual = $("#s0", body).value, a = $("#s1", body).value, b = $("#s2", body).value;
      const erro = (m) => { out.textContent = m; out.className = "test-out err"; };
      if (a !== b) return erro("As novas senhas não conferem.");
      if (a.length < 8) return erro("A nova senha precisa ter pelo menos 8 caracteres.");
      if (PREVIEW) {
        const l = await usuariosPrevia(), u = l.find((x) => x.usuario === sessao.usuario);
        if (!u || u.hash !== (await sha(atual))) return erro("Senha atual incorreta.");
        u.hash = await sha(a); lsSet(LS_USERS, JSON.stringify(l));
      } else {
        try {
          const r = await fetch(API + "auth.php", { method: "POST", headers: authH({ "Content-Type": "application/json" }), body: JSON.stringify({ acao: "trocarSenha", atual, nova: a }) });
          if (r.status === 401) return sessaoExpirou();
          const j = await r.json(); if (!r.ok) return erro(j.erro || "Não foi possível trocar a senha.");
        } catch (er) { return erro("Servidor indisponível."); }
      }
      e.target.reset(); out.textContent = "✓ Senha alterada."; out.className = "test-out ok"; toast("Senha alterada", "ok");
    };
  }

  // ----- salvar / exportar / importar -----
  async function salvar() {
    rascunho.radios.forEach((r) => (r.id = r.id || uid()));
    if (PREVIEW) {
      lsSet(LS_CFG, JSON.stringify(rascunho));
      aplicarNovaConfig(); toast("Salvo neste navegador (prévia)", "ok"); return;
    }
    try {
      const r = await fetch(API + "config.php", { method: "POST", headers: authH({ "Content-Type": "application/json" }), body: JSON.stringify(rascunho) });
      if (r.status === 401) return sessaoExpirou();
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erro || "Erro ao salvar");
      aplicarNovaConfig(); toast("Alterações publicadas para todos os ouvintes", "ok");
    } catch (e) { toast(e.message + ". Use Exportar para baixar o config.json.", "err"); }
  }

  function aplicarNovaConfig() {
    config = clone(rascunho);
    aplicarTema(); renderRadios(); renderContato(); marcarVideo(estadoVideo || { aoVivo: false });
    if (atual) { const n = config.radios.find((r) => r.id === atual.id); if (n) { const mudouStream = n.stream !== atual.stream; atual = n; renderAgora(); if (mudouStream && document.body.dataset.player === "playing") tocar(); } }
    renderNoticias();
  }

  function exportar() {
    const ov = $("#ra-admin"), json = JSON.stringify(rascunho, null, 2);
    const box = document.createElement("div"); box.className = "adm-modal";
    box.innerHTML = `<div><h3>Exportar configuração</h3><p class="hint">Copie o conteúdo e salve como <code>data/config.json</code> no servidor (ou guarde como backup).</p><textarea readonly rows="14">${esc(json)}</textarea><div class="adm-actions">${PREVIEW ? "" : `<button class="btn ghost" data-dl>Baixar arquivo</button>`}<button class="btn primary" data-copy>Copiar</button><button class="btn ghost" data-x>Fechar</button></div></div>`;
    ov.appendChild(box);
    $("[data-x]", box).onclick = () => box.remove();
    $("[data-copy]", box).onclick = () => { navigator.clipboard.writeText(json).then(() => toast("Copiado", "ok"), () => { $("textarea", box).select(); toast("Selecione e copie com Ctrl+C"); }); };
    if ($("[data-dl]", box)) $("[data-dl]", box).onclick = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([json], { type: "application/json" })); a.download = "config.json"; a.click(); };
  }

  function importar() {
    const ov = $("#ra-admin");
    const box = document.createElement("div"); box.className = "adm-modal";
    box.innerHTML = `<div><h3>Importar configuração</h3><p class="hint">Cole um config.json exportado ou escolha o arquivo.</p><textarea rows="12" placeholder='{ "site": …, "radios": [ … ] }'></textarea><div class="adm-actions"><input type="file" accept=".json,application/json"><button class="btn primary" data-ok>Aplicar</button><button class="btn ghost" data-x>Cancelar</button></div></div>`;
    ov.appendChild(box);
    const ta = $("textarea", box);
    $("input[type=file]", box).onchange = (e) => { const f = e.target.files[0]; if (f) f.text().then((t) => (ta.value = t)); };
    $("[data-x]", box).onclick = () => box.remove();
    $("[data-ok]", box).onclick = () => {
      try { const j = JSON.parse(ta.value); if (!j.radios || !j.site) throw 0; rascunho = j; box.remove(); telaPainel(ov); toast("Importado. Clique em Salvar para aplicar.", "ok"); }
      catch (e) { toast("JSON inválido", "err"); }
    };
  }

  // ---------- faixa da prévia (troca de paleta ao vivo) ----------
  function barraPrevia() {
    const bar = document.createElement("div");
    bar.id = "prev-bar";
    const pintar = () => {
      bar.innerHTML = `<span class="pv-tag">PRÉVIA</span><span class="pv-lbl">Paleta:</span>
        ${Object.entries(PALETAS).map(([k, p]) => `<button data-pv="${k}" class="${(config.site.paleta || "frances") === k ? "on" : ""}" title="${esc(p.desc)}"><span>${["corPrimaria", "corDestaque", "corSol"].map((c) => `<i style="background:${p[c]}"></i>`).join("")}</span>${esc(p.nome)}</button>`).join("")}
        <span class="pv-note">Senha do painel ⚙: <b>frances2026</b> · áudio, foto de fundo, live e Instagram funcionam com o app hospedado</span>`;
      $$("[data-pv]", bar).forEach((b) => (b.onclick = () => {
        const p = PALETAS[b.dataset.pv]; config.site.paleta = b.dataset.pv;
        Object.keys(VARS).forEach((k) => (config.site[k] = p[k]));
        aplicarCores(config.site); lsSet(LS_CFG, JSON.stringify(config)); pintar();
      }));
    };
    pintar();
    document.body.prepend(bar);
  }

  // ---------- medição de audiência (anônima) ----------
  // Um código aleatório por aparelho (sem nome, e-mail ou IP). Sinal a cada 30 s e ao tocar/pausar/fechar.
  const novoId = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "") : Math.random().toString(36).slice(2) + Date.now().toString(36) + Math.random().toString(36).slice(2)).slice(0, 32);
  let DID = lsGet("radioapp.did"); if (!/^[a-z0-9]{8,40}$/.test(DID || "")) { DID = novoId(); lsSet("radioapp.did", DID); }
  const SID = novoId();
  const UA = navigator.userAgent;
  const PLATAFORMA = /iphone|ipad|ipod/i.test(UA) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) ? "iphone" : /android/i.test(UA) ? "android" : /windows|macintosh|linux|cros/i.test(UA) ? "computador" : "outro";
  const NO_APP = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
  let ultimoSinal = "";
  function sinal(fim) {
    if (PREVIEW || ESTATICO || !config || config.site.medicao === false) return;
    const tocando = document.body.dataset.player === "playing";
    const d = JSON.stringify({ did: DID, sid: SID, radio: atual ? atual.id : "", tocando, plataforma: PLATAFORMA, app: NO_APP, fim: !!fim });
    try {
      if (fim && navigator.sendBeacon) { navigator.sendBeacon(API + "audiencia.php", new Blob([d], { type: "application/json" })); return; }
      fetch(API + "audiencia.php", { method: "POST", headers: { "Content-Type": "application/json" }, body: d, keepalive: true }).catch(() => {});
    } catch (e) {}
  }
  function iniciarMedicao() {
    sinal();
    setInterval(() => sinal(), 30000);
    new MutationObserver(() => { const e = document.body.dataset.player; if ((e === "playing" || e === "paused") && e !== ultimoSinal) { ultimoSinal = e; sinal(); } }).observe(document.body, { attributes: true, attributeFilter: ["data-player"] });
    addEventListener("pagehide", () => sinal(true));
    document.addEventListener("visibilitychange", () => { if (!document.hidden) sinal(); });
  }

  // ---------- início ----------
  async function iniciar() {
    config = await carregarConfig();
    config.site = config.site || {};
    aplicarTema();
    ligarControles();
    renderRadios();
    // rádio de abertura: a definida no painel ("radioInicial", padrão 106.1 Maceió); sem ela, a última ouvida
    const lista = radiosAtivas(), cfgIni = config.site.radioInicial || "maceio";
    const ini = lista.find((r) => r.id === cfgIni) || lista.find((r) => r.id === lsGet(LS_LAST)) || lista[0];
    if (ini) selecionar(ini, false); else { renderAgora(); setEstado("idle", ""); }
    if (ini && !PREVIEW && config.site.autoplay !== false) autoTocar();
    if (PREVIEW) { setEstado("paused", "Prévia do layout"); barraPrevia(); }
    renderContato();
    renderNoticias();
    checarAoVivo();
    iniciarMedicao();
    if (!PREVIEW && "serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) navigator.serviceWorker.register("sw.js").catch(() => {});
    if (location.hash === "#admin") abrirAdmin();
  }
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", iniciar) : iniciar();
})();
