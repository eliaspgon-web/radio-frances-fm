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
  let sessao = null; // { token, usuario, nome, papel, papelNome }
  const LS_SES = "radioapp.sessao";
  const ehAdmin = () => !!sessao && sessao.papel === "admin";
  const authH = (extra) => Object.assign({ "X-Admin-Token": sessao ? sessao.token : "" }, extra || {});
  let atual = null;
  const audio = new Audio();
  audio.preload = "none";

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
        if (r.ok) { const j = await r.json(); if (j && j.radios) return j; }
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
    audio.pause();
    if (!r.stream) { setEstado("error", "Endereço de streaming não cadastrado"); return; }
    if (PREVIEW) { setEstado("paused", "Prévia do layout"); if (tocarJa) ouvirNaPrevia(r); return; }
    audio.src = r.stream;
    if (tocarJa) tocar(); else setEstado("paused", "Pronto para tocar");
    mediaSession();
  }

  function tocar() {
    if (!atual) { const p = radiosAtivas()[0]; if (p) selecionar(p, true); return; }
    if (PREVIEW) { ouvirNaPrevia(atual); return; }
    if (!atual.stream) { selecionar(atual, false); return; }
    // reconecta ao vivo (evita tocar áudio "atrasado" do buffer)
    audio.src = atual.stream;
    setEstado("loading", "Conectando…");
    audio.play().catch(() => setEstado("error", "Não foi possível conectar ao streaming"));
  }
  function pausar() { audio.pause(); setEstado("paused", "Pausado"); }
  function alternar() { (document.body.dataset.player === "playing" || document.body.dataset.player === "loading") ? pausar() : tocar(); }

  audio.addEventListener("playing", () => setEstado("playing", "AO VIVO"));
  audio.addEventListener("waiting", () => setEstado("loading", "Carregando…"));
  audio.addEventListener("error", () => { if (audio.src) setEstado("error", "Streaming indisponível no momento"); });

  function mediaSession() {
    if (!("mediaSession" in navigator) || !atual) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: atual.nome, artist: atual.frequencia || "", album: config.site.nome || "" });
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

  function ligarControles() {
    $$("[data-np=play]").forEach((b) => b.addEventListener("click", alternar));
    $$("[data-np=next]").forEach((b) => b.addEventListener("click", () => pular(1)));
    $$("[data-np=prev]").forEach((b) => b.addEventListener("click", () => pular(-1)));
    const vol = parseFloat(lsGet(LS_VOL) ?? "0.8");
    audio.volume = isNaN(vol) ? 0.8 : vol;
    $$("[data-np=vol]").forEach((v) => {
      v.value = audio.volume;
      v.addEventListener("input", () => { audio.volume = +v.value; lsSet(LS_VOL, v.value); $$("[data-np=vol]").forEach((o) => o !== v && (o.value = v.value)); });
    });
    $$("[data-watch]").forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); abrirVideo(); }));
    $$("[data-np=mute]").forEach((b) => b.addEventListener("click", () => { audio.muted = !audio.muted; b.classList.toggle("muted", audio.muted); }));
    $$("[data-open-admin]").forEach((b) => b.addEventListener("click", () => { $$(".sheet.open").forEach((x) => x.classList.remove("open")); abrirAdmin(); }));
    $$("[data-toggle]").forEach((b) => b.addEventListener("click", () => { const t = $(b.dataset.toggle); if (t) t.classList.toggle("open"); }));
    $$(".sheet").forEach((sh) => sh.addEventListener("click", (e) => { if (e.target === sh || e.target.closest("[data-close-sheet]")) sh.classList.remove("open"); }));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") $$(".sheet.open").forEach((x) => x.classList.remove("open")); });
    document.addEventListener("keydown", (e) => { if (e.code === "Space" && !/INPUT|TEXTAREA|SELECT|BUTTON/.test(e.target.tagName)) { e.preventDefault(); alternar(); } });
  }

  // ---------- "Tocando agora" (música atual) ----------
  const mountDe = (r) => { const m = String((r && r.stream) || "").split("?")[0].split("/").pop().replace(/\.(aac|mp3|m3u8?|ogg)$/i, ""); return /^[A-Za-z0-9_]+$/.test(m) ? m : ""; };
  async function atualizarTocando() {
    const el = $$("[data-np=song]"); if (!el.length) return;
    const r = atual, mount = mountDe(r);
    let txt = "";
    if (r && r.tocandoTexto) txt = r.tocandoTexto;
    else if (!PREVIEW && mount) {
      for (const url of [API + "tocando.php?mount=" + mount, "/playing/" + mount]) {
        try { const x = await fetch(url, { cache: "no-store" }); if (x.ok) { const j = await x.json(); txt = String(j.text || "").replace(/\uFFFD|ï¿½/g, "").trim(); if (txt) break; } } catch (e) {}
      }
    }
    el.forEach((e) => (e.textContent = txt || (r ? r.slogan || config.site.slogan || "" : "")));
    document.body.classList.toggle("has-song", !!txt);
    if (txt && "mediaSession" in navigator && navigator.mediaSession.metadata) { try { navigator.mediaSession.metadata.title = txt; navigator.mediaSession.metadata.artist = r.nome; } catch (e) {} }
  }
  setInterval(() => { if (!document.hidden) atualizarTocando(); }, 15000);

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
    if (PREVIEW) { marcarVideo({ aoVivo: false }); return; }
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

  function modal(html, cls = "") {
    let m = $("#ra-modal");
    if (!m) { m = document.createElement("div"); m.id = "ra-modal"; document.body.appendChild(m); }
    m.className = "open " + cls;
    m.innerHTML = `<div class="rm-box"><button class="rm-x" aria-label="Fechar">×</button>${html}</div>`;
    const fechar = () => { m.className = ""; m.innerHTML = ""; };
    $(".rm-x", m).onclick = fechar;
    m.onclick = (e) => { if (e.target === m) fechar(); };
    return m;
  }

  async function abrirVideo() {
    const canal = urlCanal();
    if (!canal) return toast("Canal do YouTube não cadastrado no painel");
    if (PREVIEW) {
      modal(`<div class="rm-msg"><span class="rm-ico">📺</span><h3>Transmissão ao vivo</h3><p>Com o app hospedado, o VEJA verifica se o canal está ao vivo e abre o vídeo aqui dentro, pausando a rádio.</p><a class="btn primary" href="${esc(canal)}/live" target="_blank" rel="noopener">Abrir canal no YouTube</a></div>`);
      return;
    }
    modal(`<div class="rm-msg"><span class="rm-ico spin">⟳</span><p>Procurando transmissão ao vivo…</p></div>`);
    if (!estadoVideo || Date.now() - (estadoVideo._t || 0) > 60000) {
      try { const r = await fetch(API + "aovivo.php?t=" + Date.now()); estadoVideo = await r.json(); estadoVideo._t = Date.now(); marcarVideo(estadoVideo); } catch (e) { estadoVideo = null; }
    }
    if (estadoVideo && estadoVideo.aoVivo && estadoVideo.videoId) {
      if (document.body.dataset.player === "playing") pausar();
      modal(`<div class="rm-video"><iframe src="https://www.youtube.com/embed/${esc(estadoVideo.videoId)}?autoplay=1&rel=0&playsinline=1" title="Transmissão ao vivo" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>
        <div class="rm-info"><span class="live-pill">● AO VIVO</span><strong>${esc(estadoVideo.titulo || "Transmissão ao vivo")}</strong><a href="https://www.youtube.com/watch?v=${esc(estadoVideo.videoId)}" target="_blank" rel="noopener">Abrir no YouTube ↗</a></div>`, "video");
    } else if (estadoVideo && !estadoVideo.erro) {
      modal(`<div class="rm-msg"><span class="rm-ico">📺</span><h3>Nenhuma transmissão ao vivo agora</h3><p>Assim que entrarmos ao vivo, o vídeo aparece aqui. Enquanto isso, veja os vídeos do canal.</p><a class="btn primary" href="${esc(canal)}/videos" target="_blank" rel="noopener">Ver vídeos do canal</a></div>`);
    } else {
      modal(`<div class="rm-msg"><span class="rm-ico">📺</span><h3>Abrir o canal</h3><p>Não foi possível verificar a transmissão agora.</p><a class="btn primary" href="${esc(canal)}/live" target="_blank" rel="noopener">Abrir no YouTube</a></div>`);
    }
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
      try {
        const r = await fetch(API + "noticias.php?t=" + Date.now(), { cache: "no-store" });
        if (r.ok) { const j = await r.json(); if (Array.isArray(j) && j.length) return j.slice(0, lim); }
      } catch (e) {}
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
        <span class="contact-ico">${esc(iconeDe(c))}</span>
        <span class="contact-txt"><strong>${esc(c.tipo)}</strong><small>${esc(c.descricao || "Fale pelo WhatsApp")}</small></span>
        <span class="contact-wa">${ICON_WA}</span></a>`;
    };
    const normais = lista.filter((c) => !c.atalho), atalhos = lista.filter((c) => c.atalho);
    $$("[data-contact]").forEach((box) => (box.innerHTML = normais.length ? normais.map(item).join("") : `<p class="empty">Nenhum canal de contato ativo.</p>`));
    $$("[data-shortcuts]").forEach((box) => {
      box.innerHTML = atalhos.map((c) => { const h = linkWA(c); return `<a class="shortcut" ${h ? `href="${esc(h)}" target="_blank" rel="noopener"` : `href="#" data-sem-numero`}><span>${esc(iconeDe(c))}</span>${esc(c.tipo)}</a>`; }).join("");
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
        <div class="nk-img">${safeUrl(n.imagem) ? `<img src="${esc(safeUrl(n.imagem))}" alt="" loading="lazy" onerror="this.remove()">` : ""}<span>${String(i + 1).padStart(2, "0")}</span>${n.destaque ? `<b>Destaque</b>` : ""}${n.video ? `<em class="nk-play">▶</em>` : ""}</div>
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
    if (!sessao) { try { sessao = JSON.parse(sessionStorage.getItem(LS_SES) || "null"); } catch (e) { sessao = null; } }
    if (sessao && !PREVIEW) {   // confere se a sessão ainda vale
      try { const r = await fetch(API + "auth.php", { method: "POST", headers: authH({ "Content-Type": "application/json" }), body: JSON.stringify({ acao: "eu" }) }); if (r.ok) Object.assign(sessao, (await r.json()).usuario); else sessao = null; } catch (e) {}
    }
    if (!sessao) return telaLogin(ov);
    rascunho = clone(config);
    telaPainel(ov);
  }
  function fecharAdmin() { const ov = $("#ra-admin"); if (ov) ov.className = ""; }
  function guardarSessao() { try { sessao ? sessionStorage.setItem(LS_SES, JSON.stringify(sessao)) : sessionStorage.removeItem(LS_SES); } catch (e) {} }
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
      const r = await entrar($("#adm-user", ov).value.trim().toLowerCase(), $("#adm-senha", ov).value);
      btn.disabled = false; btn.textContent = "Entrar";
      if (r.erro) { $("#adm-err", ov).textContent = r.erro; $("#adm-senha", ov).select(); return; }
      sessao = r; guardarSessao(); rascunho = clone(config); aba = "radios"; telaPainel(ov);
      toast(`Olá, ${sessao.nome}!`, "ok");
    };
  }
  function olhinho(root) { $$(".pw-eye", root).forEach((b) => (b.onclick = () => { const i = b.previousElementSibling; i.type = i.type === "password" ? "text" : "password"; })); }

  async function entrar(usuario, senha) {
    if (PREVIEW) {
      const u = (await usuariosPrevia()).find((x) => x.usuario === usuario);
      if (!u || u.hash !== (await sha(senha))) return { erro: "Usuário ou senha incorretos." };
      return { token: "previa", usuario: u.usuario, nome: u.nome, papel: u.papel, papelNome: PAPEIS[u.papel] };
    }
    try {
      const r = await fetch(API + "auth.php", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "login", usuario, senha }) });
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
          ${[["radios", "📻 Rádios / Streaming"], ["noticias", "📰 Notícias"], ["contato", "💬 WhatsApp"], ["aparencia", "🎨 Aparência"], ...(ehAdmin() ? [["usuarios", "👥 Usuários"]] : []), ["conta", "🔒 Minha senha"]].map(([k, t]) => `<button data-tab="${k}" class="${aba === k ? "on" : ""}">${t}</button>`).join("")}
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
    ({ radios: abaRadios, noticias: abaNoticias, contato: abaContato, aparencia: abaAparencia, usuarios: abaUsuarios, conta: abaConta }[aba] || abaRadios)($(".adm-body", ov));
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
            </div>
          </article>`).join("") || `<p class="empty">Nenhuma rádio. Clique em “Adicionar rádio”.</p>`}
      </div>`;
    $("[data-add]", body).onclick = () => { rs.push({ id: uid(), nome: "Nova rádio", cidade: "", frequencia: "", stream: "", logo: rascunho.site.logo || "", ativo: true }); abaRadios(body); };
    $$(".adm-card", body).forEach((card) => {
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

  // ---------- início ----------
  async function iniciar() {
    config = await carregarConfig();
    config.site = config.site || {};
    aplicarTema();
    ligarControles();
    renderRadios();
    const ult = lsGet(LS_LAST);
    const ini = radiosAtivas().find((r) => r.id === ult) || radiosAtivas()[0];
    if (ini) selecionar(ini, false); else { renderAgora(); setEstado("idle", ""); }
    if (PREVIEW) { setEstado("paused", "Prévia do layout"); barraPrevia(); }
    renderContato();
    renderNoticias();
    checarAoVivo();
    if (!PREVIEW && "serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) navigator.serviceWorker.register("sw.js").catch(() => {});
    if (location.hash === "#admin") abrirAdmin();
  }
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", iniciar) : iniciar();
})();
