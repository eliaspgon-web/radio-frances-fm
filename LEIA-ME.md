# Rede Francês FM — App de rádio

App web instalável (PWA) para iPhone e Android, com o visual do francesfm.com.br.

## O que tem
- **Player ao vivo** — Maceió 106.1 e Caruaru 105.5 (streams StreamTheWorld), com "Tocando agora".
- **VEJA** — verifica se o canal do YouTube está **ao vivo** e abre a transmissão dentro do app (pausa a rádio).
- **Notícias** — carrossel com as **5 últimas do Francês News** (RSS `https://francesnews.com.br/feed`), atualizado a cada 10 min. A capa de cada matéria é importada para o servidor (`uploads/noticias/`). Também aceita Instagram, outros RSS ou os dois juntos (painel → Notícias).
- **WhatsApp** — Peça sua música, Mande seu alô, Comercial, Promocional e Jornalismo.
- **Painel gerencial** (⚙ no topo ou no menu ☰) — rádios/streams/logos, notícias e Instagram, WhatsApp, cores/paletas, fundo.
- **Usuários e senhas** — login por usuário; níveis **Administrador** (tudo, inclusive usuários e Instagram) e **Editor** (conteúdo); cada um troca a própria senha; bloqueio de 15 min após 5 tentativas erradas; sessão de 12 h.

## Arquivos
| Arquivo | Para quê |
|---|---|
| `index.html` | ★ App principal, no visual do site |
| `layout-praia.html` | Versão com paletas caribenhas |
| `layouts.html` | Página para comparar todos os layouts |
| `app.js`, `base.css` | Motor comum |
| `manifest.webmanifest`, `sw.js`, `assets/icons/` | Instalação como aplicativo |
| `api/` | Backend PHP: config, senha, upload, notícias (Instagram/RSS), live do YouTube, tocando agora |
| `data/config.json` | Rádios, contatos, notícias e aparência |

## Publicar no servidor do francesfm.com.br (recomendado)
Requisitos: PHP 7.4+ (com cURL e GD) e HTTPS — o mesmo servidor do site atende.

1. Baixe o projeto: **Code → Download ZIP** neste repositório.
2. No painel da hospedagem (cPanel, Plesk ou FTP), crie a pasta **`/app`** no site e envie todo o conteúdo do repositório para ela.
3. Dê permissão de escrita (755) às pastas **`data/`** e **`uploads/`**.
4. Abra **https://francesfm.com.br/app** e toque no ▶ — o streaming toca dentro do app.
5. Clique em ⚙ (ou menu ☰ → **Painel gerencial**), entre com **`admin`** / **`frances2026`**, vá em **🔒 Minha senha** e troque a senha. Em **👥 Usuários**, crie um login para cada pessoa da equipe.
6. Em **💬 WhatsApp**, cadastre os números. (Opcional) Em **Notícias → Instagram**, cole o token da API oficial do Instagram.

Para atualizar depois: baixe o ZIP novo e envie por cima, **sem apagar** `data/` e `uploads/` (lá ficam usuários, senhas, configurações e capas).

> **Por que não toca na prévia do claude.ai?** A prévia bloqueia áudio e imagens de outros sites; lá o ▶ abre o stream em nova aba. Hospedado, toca dentro do app.
>
> GitHub Pages / Netlify (sem PHP) tocam a rádio, mas o painel não salva e as notícias não carregam (o feed do Francês News não pode ser lido direto pelo navegador).

## Instalar no celular
- **Android (Chrome):** abra o site → menu ⋮ → **Instalar app** (ou "Adicionar à tela inicial").
- **iPhone (Safari):** abra o site → botão Compartilhar → **Adicionar à Tela de Início**.

O app abre em tela cheia, com ícone próprio, e o áudio continua tocando com a tela bloqueada (controles na tela de bloqueio).
