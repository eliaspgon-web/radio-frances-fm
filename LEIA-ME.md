# Rede Francês FM — App de rádio

App web instalável (PWA) para iPhone e Android, com o visual do francesfm.com.br.

## O que tem
- **Player ao vivo** — Maceió 106.1 e Caruaru 105.5 (streams StreamTheWorld), com "Tocando agora".
- **VEJA** — verifica se o canal do YouTube está **ao vivo** e abre a transmissão dentro do app (pausa a rádio).
- **Notícias** — carrossel com os **5 últimos posts do Instagram**, feeds **RSS** de sites, ou os dois juntos.
- **WhatsApp** — Peça sua música, Mande seu alô, Comercial, Promocional e Jornalismo.
- **Painel gerencial** (⚙ no menu, senha inicial `frances2026`) — rádios/streams/logos, notícias e Instagram, WhatsApp, cores/paletas, fundo, senha.

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

## Publicar (precisa de PHP 7.4+ e HTTPS)
1. Envie a pasta para uma hospedagem com PHP (ex.: o próprio servidor do francesfm.com.br em `/app`, Hostinger, Locaweb, cPanel).
2. Permissão de escrita em `data/` e `uploads/`.
3. Abra o endereço, menu ☰ → **Painel gerencial**, entre com `frances2026` e **troque a senha**.
4. Em **Notícias → Instagram**, cole o token da API oficial do Instagram (conta Profissional) e clique em *Testar conexão*.
5. Em **WhatsApp**, cadastre os números.

> GitHub Pages / Netlify estáticos abrem o app e tocam a rádio, mas **não** rodam o PHP (painel não salva, sem Instagram/live). Para tudo funcionar, use hospedagem com PHP.

## Instalar no celular
- **Android (Chrome):** abra o site → menu ⋮ → **Instalar app** (ou "Adicionar à tela inicial").
- **iPhone (Safari):** abra o site → botão Compartilhar → **Adicionar à Tela de Início**.

O app abre em tela cheia, com ícone próprio, e o áudio continua tocando com a tela bloqueada (controles na tela de bloqueio).
