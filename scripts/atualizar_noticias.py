#!/usr/bin/env python3
"""
Gera data/noticias.json para a versão sem PHP (GitHub Pages).
Lê os feeds RSS configurados em data/config.json (padrão: Francês News), pega as N mais
recentes, busca a capa (og:image) de cada matéria e salva uma cópia em assets/noticias/.
Roda sozinho pelo GitHub Actions a cada 30 minutos (.github/workflows/noticias.yml).
"""
import json, re, hashlib, html, os, sys, time, urllib.request
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = {"User-Agent": "Mozilla/5.0 (RadioApp; +https://francesfm.com.br)"}
PASTA = os.path.join(RAIZ, "assets", "noticias")

def baixar(url, timeout=15):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()

def limpar(t, n=None):
    t = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", t or ""))).strip()
    return (t[: n - 1].rstrip() + "…") if n and len(t) > n else t

def itens_rss(url):
    raiz = ET.fromstring(baixar(url))
    canal = raiz.find("channel")
    fonte = (canal.findtext("title") if canal is not None else "") or url
    out = []
    for it in raiz.iter("item"):
        quando = it.findtext("pubDate") or ""
        try: iso = parsedate_to_datetime(quando).isoformat(timespec="seconds")
        except Exception: iso = ""
        out.append({"titulo": limpar(it.findtext("title")), "resumo": limpar(it.findtext("description"), 170),
                    "link": (it.findtext("link") or "").strip(), "data": iso, "fonte": fonte.strip(), "imagem": ""})
    return out

def og_imagem(link):
    try: pag = baixar(link, 12)[:300000].decode("utf-8", "ignore")
    except Exception: return ""
    for p in ("og:image", "twitter:image"):
        m = re.search(r'<meta[^>]+(?:property|name)=["\']%s["\'][^>]+content=["\']([^"\']+)' % p, pag, re.I) \
            or re.search(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\']%s["\']' % p, pag, re.I)
        if m: return html.unescape(m.group(1))
    return ""

def importar(url):
    """Salva a capa em assets/noticias/ (só se for imagem de verdade) e devolve o caminho local."""
    if not url: return ""
    nome = hashlib.sha1(url.encode()).hexdigest()[:20] + ".jpg"
    destino = os.path.join(PASTA, nome)
    if not os.path.exists(destino):
        try: dados = baixar(url, 20)
        except Exception: return url
        if not (dados[:3] == b"\xff\xd8\xff" or dados[:8] == b"\x89PNG\r\n\x1a\n" or dados[8:12] == b"WEBP") or len(dados) > 5_000_000:
            return url
        try:
            from PIL import Image; import io                      # reduz para 800 px, se o Pillow estiver disponível
            im = Image.open(io.BytesIO(dados)).convert("RGB"); im.thumbnail((800, 800))
            im.save(destino, "JPEG", quality=80, optimize=True)
        except Exception:
            open(destino, "wb").write(dados)
    return "assets/noticias/" + nome

def main():
    cfg = json.load(open(os.path.join(RAIZ, "data", "config.json"), encoding="utf-8"))
    n = cfg.get("noticias", {})
    limite = max(1, min(10, int(n.get("limite", 5))))
    feeds = [f for f in n.get("feeds", []) if f.strip()] or ["https://francesnews.com.br/feed"]
    itens, vistos = [], set()
    for f in feeds:
        try:
            for i in itens_rss(f):
                k = (i["link"] or i["titulo"]).lower()
                if k not in vistos: vistos.add(k); itens.append(i)
        except Exception as e:
            print("feed falhou:", f, e, file=sys.stderr)
    if not itens:
        print("nenhuma notícia obtida; mantendo o arquivo anterior"); return
    itens.sort(key=lambda i: i["data"], reverse=True)
    itens = [m for m in n.get("manuais", []) if m.get("titulo") and m.get("destaque")] + itens
    itens = itens[:limite]
    os.makedirs(PASTA, exist_ok=True)
    for i in itens:
        if not i.get("imagem") and i.get("link"): i["imagem"] = og_imagem(i["link"])
        i["imagem"] = importar(i.get("imagem", ""))
    usados = {os.path.basename(i["imagem"]) for i in itens if i["imagem"].startswith("assets/noticias/")}
    for f in os.listdir(PASTA):                                   # remove capas que saíram do carrossel
        if f.endswith(".jpg") and f not in usados: os.remove(os.path.join(PASTA, f))
    saida = os.path.join(RAIZ, "data", "noticias.json")
    json.dump({"atualizado": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "itens": itens}, open(saida, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(len(itens), "notícias salvas em data/noticias.json")

if __name__ == "__main__":
    main()
