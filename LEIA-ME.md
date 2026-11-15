# Rede Francês FM — App de rádio

App web instalável (PWA) para iPhone e Android, com o visual do francesfm.com.br.

## O que tem
- **Player ao vivo** — Maceió 106.1 e Caruaru 105.5 (streams StreamTheWorld), com "Tocando agora".
- **VEJA** — verifica se o canal do YouTube está **ao vivo** e abre a transmissão dentro do app (pausa a rádio).
- **Notícias** — carrossel com as **5 últimas do Francês News** (RSS `https://francesnews.com.br/feed`), atualizado a cada 10 min. A capa de cada matéria é importada para o servidor (`uploads/noticias/`). Também aceita Instagram, outros RSS ou os dois juntos (painel → Notícias).
- **WhatsApp** — Peça sua música, Mande seu alô, Comercial, Promocional e Jornalismo.
- **Painel gerencial** (⚙ no topo ou no menu ☰) — rádios/streams/logos, notícias e Instagram, WhatsApp, cores/paletas, fundo.
- **📊 Audiência** — no painel: conectados e ouvintes **ao vivo** (atualiza a cada 10 s), pico simultâneo, ouvintes únicos, horas ouvidas, tempo médio, rádio e aparelho; relatórios por dia, 7 e 30 dias ou datas livres, **de todas as rádios ou de cada rádio separada**, com gráficos; **imprimir / salvar em PDF** e **CSV**. Medição anônima (código aleatório por aparelho, sem dado pessoal; o IP não é gravado). Requer o app no servidor com PHP.
- **🗺 Mapa da audiência** — no painel, em Audiência › Mapa: país, estado e cidade dos ouvintes (pelo IP) e origem do acesso (Instagram, WhatsApp, site, app instalado…). Veja a seção **Mapa da audiência** abaixo.
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

## Versão rápida: GitHub Pages (toca a rádio dentro do app, sem servidor)
1. No GitHub: **Settings → General → Danger Zone → Change visibility → Public** (o Pages gratuito exige repositório público; senhas e tokens não estão no repositório).
2. **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / `(root)` → Save**.
3. Em 1–2 minutos o app fica em **https://eliaspgon-web.github.io/radio-frances-fm/** — o ▶ toca dentro do app, no computador e no celular (dá para instalar na tela inicial).
4. As notícias do Francês News e as capas são atualizadas sozinhas **a cada 30 min** pela rotina `.github/workflows/noticias.yml` (aba **Actions → Atualizar notícias → Run workflow** roda na hora).

No Pages não há PHP: o painel, usuários, Instagram, “VEJA” com detecção de live e “Tocando agora” completos funcionam só no servidor com PHP. Para mudar rádios/cores no Pages, edite `data/config.json` no GitHub.

## Volume
A barra de volume controla o som do app (curva de áudio: metade da barra = metade do volume percebido). O som final é o volume do celular × a barra. Páginas web não podem ler nem mudar o volume do sistema; por isso a barra não acompanha os botões físicos, e no iPhone (que não permite volume pela página) ela é substituída pelo aviso “Volume nos botões do celular”.

## Instalar no celular
- **Android (Chrome):** abra o site → menu ⋮ → **Instalar app** (ou "Adicionar à tela inicial").
- **iPhone (Safari):** abra o site → botão Compartilhar → **Adicionar à Tela de Início**.

O app abre em tela cheia, com ícone próprio, e o áudio continua tocando com a tela bloqueada (controles na tela de bloqueio).

## Painel gerencial (escondido do ouvinte)
O ouvinte não vê o acesso ao painel. Para entrar:
- abra o endereço do app com **#admin** no final (ex.: `.../radio-frances-fm/#admin`); ou
- toque **5 vezes seguidas na logo**.

Depois do primeiro acesso, a engrenagem volta a aparecer naquele aparelho.

## Banners
No painel, a aba **🖼 Banners** controla o carrossel. Dá para escolher:
- **Carrossel:** posição na página, largura, formato (computador/TV e celular), tempo de exibição, transição e velocidade, ajuste da imagem, cantos, quantidade, ordem aleatória, setas e pontinhos.
- **Cada banner:** imagem para computador e para celular, legenda, ação ao tocar (link, WhatsApp ou tocar uma rádio), tempo próprio, prioridade, cor de fundo, data e hora de início e fim, dias da semana, faixa de horário, rádios em que aparece e aparelhos (celular, computador, TV).
- **Métricas** (com servidor PHP): exibições, cliques e taxa de cliques dos últimos 30 dias.

## TV
A versão para TV fica em `tv.html`. Os arquivos para instalar em Samsung, LG e Android TV estão em `tv-apps/` (veja `tv-apps/LEIA-ME.md`).

## CarPlay e Android Auto
Com o app tocando, o CarPlay e o Android Auto mostram a tela "Tocando agora" com a música, o artista e a capa.
- Play e pause do volante funcionam.
- Avançar e voltar trocam de rádio.

Um ícone próprio na tela do carro, abrindo sozinho quando o celular conecta, só existe em app nativo publicado na App Store e na Google Play: a Apple exige a permissão de áudio para CarPlay.

## VEJA AO VIVO
Quando o ouvinte toca em VEJA AO VIVO, o app pergunta ao player oficial do YouTube, no próprio celular, se o canal está transmitindo:
- se estiver, a transmissão abre dentro do app;
- se não estiver, aparece o aviso "O canal não está ao vivo agora". O app confere de novo a cada minuto e abre a live sozinho quando ela começar.

Opcional, para o botão já mostrar "Ao vivo agora" antes do toque: crie uma chave gratuita da **YouTube Data API v3** no Google Cloud Console e cadastre no GitHub em Settings › Secrets and variables › Actions, com o nome **YT_API_KEY**. Com a chave, o GitHub confere o canal a cada 5 minutos. Sem a chave, o YouTube bloqueia essa verificação a partir dos servidores do GitHub.

## Programação (programas por horário)
No painel, a aba **📅 Programação** organiza os programas de cada rádio. Para cada programa, preencha:
- nome, tipo (jornalismo, futebol, esporte, humor, entrevista, variedades, religioso, musical) e apresentador;
- descrição e imagem;
- dias da semana, com atalhos Seg–Sex, Fim de semana e Todos;
- horário de início e fim. Pode atravessar a meia-noite, por exemplo das 22:00 às 02:00.

Também dá para duplicar um programa ou copiá-lo para outra rádio.

No horário do programa, o "Tocando agora" (e a tela de bloqueio do celular) mostra a imagem, o nome e a descrição do programa sempre que a rádio não estiver mandando o nome de uma música. Para o programa aparecer mesmo durante as músicas, marque **Mostrar o programa mesmo se a rádio mandar nome de música**. Quando dois programas coincidem, vale o mais curto (ex.: um boletim dentro de um programa longo).

O RDS também ignora textos que não são música, como o nome da rádio, vinhetas, comerciais e hora certa.

## Painel → GitHub (publicar sem servidor)
Na versão do GitHub Pages, o painel publica direto no repositório:
1. Abra o app com **#admin** no final do endereço, ou toque 5 vezes na logo.
2. Entre com o usuário e a senha. No primeiro acesso use admin / frances2026 e depois troque a senha em 🔒 Minha senha.
3. Na aba **🔗 Publicar no GitHub**, cole um token do GitHub que tenha só a permissão **Contents: Read and write** neste repositório (o passo a passo está na própria aba) e clique em **Salvar e testar conexão**.
4. A partir daí, **Salvar alterações** grava o `data/config.json` e as imagens enviadas (`assets/uploads/`) no repositório. O app no ar atualiza para todos em cerca de 1 minuto.

O token fica salvo só no navegador onde foi colado. Ele nunca vai para o `config.json` nem aparece no site.

### Sem o painel, direto no GitHub
1. Abra `data/config.json` no repositório e clique no lápis (Edit).
2. Edite o texto e clique em **Commit changes**.
3. Ou, no painel, use **Exportar**, copie o conteúdo e cole no lugar do arquivo.

## Mapa da audiência (geolocalização pelo IP)
No painel, **📊 Audiência › 🗺 Mapa** mostra de onde o app é ouvido, no mundo todo:
- **Mapa com destaque em cores**: países no mapa-múndi; ao tocar num país, o recorte passa para os **estados** (Brasil, EUA, Canadá, Austrália, China, Índia, Indonésia, Rússia e África do Sul têm o desenho dos estados); ao tocar num estado, aparecem as **cidades** em bolhas proporcionais. Nos demais países as cidades aparecem direto sobre o país.
- **Ferramentas**: zoom (botões, roda do mouse, pinça no celular), arrastar, enquadrar, trilha Mundo › País › Estado, dica ao passar o dedo/mouse, listas de Países / Estados / Cidades / Origem (tocar numa linha abre o recorte), troca de métrica (ouvintes, sessões, horas).
- **Filtros**: período (hoje, ontem, 7 e 30 dias ou datas livres), rádio, origem do acesso e **● Agora** (quem está conectado neste momento, atualizado a cada 10 s).
- **Relatórios**: o mapa tem **CSV** e **Imprimir / PDF** próprios, e o relatório de audiência que já existia ganhou os gráficos e as tabelas de estado, cidade, país e origem.

**Origem do acesso** — o app reconhece sozinho o navegador interno do Instagram, Facebook e TikTok, o site de onde a pessoa veio e o app instalado. Para as outras redes, divulgue o link com a marca: `https://francesfm.com.br/app/?o=whatsapp` (aceita `instagram`, `facebook`, `whatsapp`, `youtube`, `tiktok`, `x`, `telegram`, `site`; `utm_source=` também vale).

**Como funciona** (`api/geo.php`) — na primeira abertura de cada sessão, o servidor consulta o IP em um serviço de geolocalização (ipwho.is, grátis até 1.000 consultas/dia; geojs.io como reserva), guarda **só** país, estado, cidade e a coordenada da cidade e descarta o IP. O resultado fica em cache por 30 dias por meio de um código embaralhado do IP, então um mesmo aparelho quase nunca gera nova consulta.
- Precisa do servidor com PHP e saída HTTPS liberada (cURL). Não há nada para instalar: o banco se atualiza sozinho e o desenho do mapa está em `assets/geo/` (Natural Earth, domínio público).
- A localização é **aproximada**: é a cidade do provedor de internet; em 4G/5G e VPN pode apontar outra cidade. Acessos anteriores a esta atualização aparecem como "não localizados".
- Mais de ~1.000 IPs novos por dia: contrate o plano do ipwhois.io e grave a chave em `data/segredos.php` (`'geoChave' => '...'`).
- Site atrás do Cloudflare ou de outro proxy: mude `GEO_CONFIAR_PROXY` para `true` em `api/geo.php`.
- Para desligar: em `data/config.json`, dentro de `"site"`, coloque `"geo": false`.
- **LGPD**: como o IP é enviado a um serviço externo para a consulta, inclua na política de privacidade do site que o app usa o IP para estimar a cidade do ouvinte, sem guardá-lo.
