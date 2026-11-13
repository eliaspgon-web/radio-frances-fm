#!/usr/bin/env python3
"""Descobre se o canal do YouTube está AO VIVO e grava data/aovivo.json
(usado pela versão sem PHP do app, no GitHub Pages). Roda a cada 5 min pelo GitHub Actions.
Só reescreve o arquivo quando o estado muda, para não gerar commits à toa."""
import json, re, sys, html, urllib.request, datetime, pathlib

RAIZ = pathlib.Path(__file__).resolve().parent.parent
CFG = json.loads((RAIZ / "data/config.json").read_text(encoding="utf-8"))
SAIDA = RAIZ / "data/aovivo.json"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"

def baixar(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "pt-BR,pt;q=0.9", "Cookie": "SOCS=CAI; CONSENT=YES+1"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read().decode("utf-8", "replace")

def analisar(pagina):
    """Analisa a página de um vídeo (watch) ou a /live do canal."""
    vid = None
    m = re.search(r'<link rel="canonical" href="https://www\.youtube\.com/watch\?v=([\w-]{11})"', pagina)
    if m: vid = m.group(1)
    ao_vivo = bool(vid) and ('"isLiveNow":true' in pagina or '"isLive":true' in pagina)
    titulo = None
    t = re.search(r'<meta name="title" content="([^"]*)"', pagina)
    if t: titulo = html.unescape(t.group(1))
    embed = '"playableInEmbed":false' not in pagina   # o canal pode proibir assistir fora do YouTube
    return {"aoVivo": ao_vivo, "videoId": vid if ao_vivo else None, "titulo": titulo if ao_vivo else None, "embed": embed if ao_vivo else None}

def candidatos(base):
    """IDs de vídeo que podem ser a transmissão: a /live do canal e os marcados AO VIVO na aba de transmissões."""
    ids = []
    try:
        pg = baixar(base + "/live")
        r = analisar(pg)
        if r["aoVivo"]: return [r["videoId"]], r
        m = re.search(r'<link rel="canonical" href="https://www\.youtube\.com/watch\?v=([\w-]{11})"', pg)
        if m: ids.append(m.group(1))
        ids += re.findall(r'"videoId":"([\w-]{11})"', pg)[:2]
    except Exception as e:
        print("Aviso /live:", e)
    try:
        pg = baixar(base + "/streams")
        for bloco in pg.split('"videoRenderer":{')[1:]:
            bloco = bloco[:6000]
            if "BADGE_STYLE_TYPE_LIVE_NOW" in bloco or '"style":"LIVE"' in bloco or '"iconType":"LIVE"' in bloco:
                m = re.search(r'"videoId":"([\w-]{11})"', bloco)
                if m: ids.append(m.group(1))
    except Exception as e:
        print("Aviso /streams:", e)
    vistos = []
    for v in ids:
        if v not in vistos: vistos.append(v)
    return vistos[:5], None

def detectar(base):
    ids, pronto = candidatos(base)
    if pronto: return pronto
    for v in ids:   # confirma na página do vídeo: está ao vivo agora? pode embutir?
        try:
            r = analisar(baixar(f"https://www.youtube.com/watch?v={v}"))
            if r["aoVivo"]: return r
        except Exception as e:
            print("Aviso watch:", e)
    return {"aoVivo": False, "videoId": None, "titulo": None, "embed": None}

def main():
    import os
    teste = os.environ.get("CANAL_TESTE", "").strip()   # só para testar a detecção em outro canal (não grava nada)
    if teste:
        print("TESTE", teste, "→", detectar(f"https://www.youtube.com/channel/{teste}")); return
    yt = str(CFG.get("site", {}).get("youtube", ""))
    m = re.search(r"(UC[\w-]{22})", yt); h = re.search(r"@([\w.\-]+)", yt)
    base = f"https://www.youtube.com/channel/{m.group(1)}" if m else (f"https://www.youtube.com/@{h.group(1)}" if h else None)
    if not base:
        print("Canal do YouTube não configurado."); return
    try:
        r = detectar(base)
    except Exception as e:
        print("Falha ao consultar o YouTube:", e); return   # mantém o último estado conhecido
    r["canal"] = base
    antigo = {}
    if SAIDA.exists():
        try: antigo = json.loads(SAIDA.read_text(encoding="utf-8"))
        except Exception: pass
    chave = lambda d: (d.get("aoVivo"), d.get("videoId"), d.get("embed"), d.get("titulo"))
    if chave(antigo) == chave(r):
        print("Sem mudança:", r); return
    r["desde"] = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    SAIDA.write_text(json.dumps(r, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Atualizado:", r)

if __name__ == "__main__":
    if len(sys.argv) > 1:   # teste com um HTML salvo
        print(json.dumps(analisar(open(sys.argv[1], encoding="utf-8").read()), ensure_ascii=False))
    else:
        main()
