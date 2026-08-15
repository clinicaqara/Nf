# Fase 1 e 3 — rodar no PC da clínica

Este passo tem que rodar numa máquina com tela e com o Chrome de verdade —
não roda no container remoto. São ~10 minutos de setup + o script.

## 1. Feche todas as janelas do Chrome

Necessário: o Chrome só aceita `--remote-debugging-port` na primeira janela
aberta com aquele `--user-data-dir`.

## 2. Abra o Chrome com um perfil dedicado

**Windows (PowerShell ou `Executar`):**
```
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="C:\nf-chrome-profile"
```

**macOS:**
```
open -a "Google Chrome" --args --remote-debugging-port=9222 --user-data-dir="$HOME/nf-chrome-profile"
```

**Linux:**
```
google-chrome --remote-debugging-port=9222 --user-data-dir="$HOME/nf-chrome-profile"
```

Abre uma janela do Chrome **em branco, sem seus favoritos/logins de sempre** —
é um perfil novo, só para isso. Normal na primeira vez.

## 3. Logue no gov.br, nessa janela

Vá em `https://www.nfse.gov.br/EmissorNacional/` e faça login normalmente
(o mesmo login que você já usa para emitir nota). Confirme que abre o painel
("Meus dados", "Emitente: ...").

**Depois desse dia, esse perfil fica salvo** em `nf-chrome-profile` — não
precisa logar de novo toda vez, só quando a sessão expirar. Repita o comando
do passo 2 para reabrir com o mesmo perfil (mesma porta, mesma pasta).

## 4. Clone o projeto e instale as dependências

Numa outra janela de terminal (deixe o Chrome do passo 2 aberto):
```
git clone https://github.com/clinicaqara/Nf.git
cd Nf
git checkout claude/mcp-notas-fiscais-repo-iu15o2
npm install
```

## 5. Rode o spike

Primeiro só a checagem de login:
```
npm run spike:cdp
```
Deve imprimir `"pareceLogado": true`.

Depois o teste mecânico (entra em `/DPS/Pessoas`, um rascunho — não emite
nada, pode abandonar depois):
```
npm run spike:cdp -- --testar-passo1
```

## 6. O que olhar no resultado

- `teste_fill_setter_nativo.valor` — veio `"01/01/2026"`? O setter nativo
  funciona (era esperado; é o que as skills já fazem).
- `teste_click_playwright.travou` — `false` significa que `page.click()` do
  Playwright funciona normal em "Avançar", sem precisar do clique por JS que
  as skills usam hoje. `true` significa que mantemos o clique via JS nas
  page objects da Fase 4.

Me manda o JSON completo que o script imprimir (pode cortar CPF/dado de
paciente se aparecer algum — não deveria, é só o Passo 1 sem dados reais).

## Se der errado

- **`ECONNREFUSED`**: o Chrome do passo 2 não está de pé, ou a porta é outra.
  Confirme que a janela ainda está aberta.
- **`pareceLogado: false`**: a sessão caiu ou o login não foi feito nessa
  janela específica (com aquele `--user-data-dir`). Repita o passo 3.
- **Chrome recusa abrir com o perfil**: já existe um Chrome comum rodando
  com o mesmo `--user-data-dir` default. Feche tudo (inclusive pela bandeja
  do sistema) e tente de novo.

## 7. Fase 3 — sessão (`nf auth`)

Com o Chrome do passo 2 aberto e você já logado (passo 3), o mesmo terminal
do passo 4 roda:

```
npm run nf -- auth status
```

Deve imprimir `"logado": true` e, se o CNPJ aparecer na tela, o número dele.
`exitCode` é `1` quando não está logado — dá pra usar isso como preflight
antes de um lote, mais pra frente.

Para gerar uma sessão exportável (usada pelo modo container — Fase 5 em
diante), com o Chrome do passo 2 aberto e logado:

```
npm run nf -- auth login
```

Ele não pede pra você logar (login continua 100% manual, na janela do
Chrome) — só fica checando a cada 2s até detectar que você já está logado, e
então salva a sessão em `sessions/storage-state.json` (permissão 600, fora
do git). Timeout padrão de 5 minutos (`--timeout <segundos>` para mudar).

Depois de gerado, confira que o arquivo exportado também é reconhecido como
sessão válida, sem precisar do Chrome aberto:

```
npm run nf -- auth status --storage-state sessions/storage-state.json
```

Isso abre um Chromium próprio (headless, baixado pelo Playwright) com a
sessão importada e navega até o portal — é o mesmo mecanismo que o modo
container vai usar para emitir.

### O que registrar de volta

- Quanto tempo a sessão fica válida antes do `auth status` voltar
  `"logado": false` de novo (risco #2 da seção 11 do PLANO.md) — não dá pra
  saber sem deixar passar o tempo real.
- Se a sessão exportada (usada num Chromium diferente, headless) ainda é
  aceita pelo portal, ou se ele nota a mudança de fingerprint/IP e desloga
  (risco #3 da seção 2/11 do PLANO.md) — é o que decide se o modo container
  sobrevive ou se o projeto fica só no modo local.
