# Francês FM na TV

A versão para TV fica em **https://eliaspgon-web.github.io/radio-frances-fm/tv.html**.
Ela funciona com o controle remoto: as setas escolhem a rádio e o **OK** toca. Os botões Play/Pause e Voltar do controle também funcionam.

Toda mudança feita no painel (rádios, logos, banners) aparece na TV automaticamente, sem reinstalar nada.

## Abrir agora, sem instalar
Abra o navegador da TV (Samsung Internet, LG Web Browser ou Chrome da Android TV) e digite o endereço acima.
Na Android TV / Google TV / Fire TV também dá para fixar o site na tela inicial.

## Instalar como app

### Android TV / Google TV (TCL, Philips, Sony, Xiaomi, TV Box)
Pasta `android-tv`: tem o `twa-manifest.json` e o banner 320×180 da tela inicial.
1. No computador, instale o Node.js e o Bubblewrap: `npm i -g @bubblewrap/cli`.
2. Dentro da pasta `android-tv`, rode `bubblewrap build`. Ele gera o `.apk` e o `.aab`.
3. Para testar: instale o `.apk` na TV (pelo app "Send Files to TV" ou por um pen drive).
4. Para publicar: envie o `.aab` na Google Play Console com a categoria **TV**. A conta de desenvolvedor custa US$ 25, pagos uma única vez.

### Samsung (Tizen)
Pasta `samsung-tizen`: tem o `config.xml` (já aponta para a versão TV), o ícone e a página inicial.
1. Instale o **Tizen Studio** com a extensão **TV**.
2. Crie um certificado Samsung em Tools › Certificate Manager.
3. Importe a pasta como projeto "Web Application" e gere o `.wgt` em Build Signed Package.
4. Para testar: com a TV em modo desenvolvedor, use Device Manager › Install.
5. Para publicar: envie o pacote no **Samsung Apps TV Seller Office**.

### LG (webOS)
Pasta `lg-webos`: tem o `appinfo.json`, os ícones e a página inicial.
1. Instale o **webOS TV CLI** (`ares`).
2. Rode `ares-package lg-webos`. Ele gera o `.ipk`.
3. Para testar: instale com o app **Developer Mode** na TV e o comando `ares-install`.
4. Para publicar: envie o `.ipk` no **LG Seller Lounge**.
