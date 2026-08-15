# Plano — Emissão de NFS-e da Clínica Qara via browser harness

Projeto: automatizar a emissão de NFS-e das duas empresas da clínica no
Portal Nacional (`nfse.gov.br/EmissorNacional`) com um CLI em Playwright,
substituindo o processo manual e as skills que hoje dirigem o Chrome campo a campo.

- **QARA SERVIÇOS MÉDICOS LTDA** — CNPJ 44.697.695/0001-88 — Simples Nacional
- **CECCARELLI E GALVEZ SERVIÇOS MÉDICOS** — CNPJ 66.895.057/0001-04 — Sociedade de Profissionais

---

## 1. O que muda

Hoje a emissão passa por uma skill que faz o Claude preencher cada campo por
`javascript_tool`. Funciona, mas cada nota custa tokens, é lenta, e o resultado
depende do modelo não errar um passo. O fechamento do mês é dezenas de notas.

Depois deste projeto: os dados entram por planilha (ou por um comando
interativo), o código preenche o portal de forma determinística, e o Claude
volta a ser o que faz bem — conversar com quem está pedindo a nota, completar
o que falta, revisar o resumo antes de emitir. **O preenchimento vira código;
a decisão continua humana.**

## 2. Decisões já tomadas

| Decisão | Escolha |
|---|---|
| Onde o navegador roda | PC da clínica, anexando ao Chrome real por CDP (padrão) **e** container headless com sessão exportada — a camada de sessão é plugável |
| Entrada de dados | Planilha XLSX/CSV para lote + comando interativo para nota avulsa |
| Escopo do V1 | Emitir, baixar DANFSe/XML, cancelar/substituir, conciliar com o portal, relatório mensal |
| Stack | TypeScript + Node 22, Playwright, zod, commander, better-sqlite3, exceljs, vitest |

Rodar nos dois ambientes tem uma consequência que precisa ser dita agora: **o
login no gov.br é sempre humano e sempre presencial.** O container nunca faz
login — ele recebe uma sessão exportada de um login feito na máquina da clínica.
Como a sessão do portal expira rápido, o modo container serve para lotes curtos
iniciados logo após um login, não para rodar sozinho de madrugada. Se a
expectativa for emissão desassistida, o caminho não é browser harness — é a API
oficial com certificado A1 (seção 10).

Há um segundo limite no modo container que só o teste responde: a sessão sai de
um Chrome logado na clínica e é injetada num navegador com outro IP e outro
fingerprint. Se o gov.br amarrar a sessão a qualquer um dos dois, o modo
container cai por terra e sobra o modo local — que é o principal de qualquer
forma. Vale medir isso cedo (Fase 3) para não construir em cima de uma hipótese.

## 3. Riscos e como cada um é tratado

**Emitir é irreversível.** É o risco central; tudo no desenho gira em torno dele.
- Nenhum comando emite sem `--confirm` explícito. O padrão é dry-run.
- O dry-run preenche os 4 passos de verdade e raspa o resumo do Passo 4 —
  a mesma tela que a pessoa olharia — e para ali.
- Antes de clicar em "Emitir NFS-e", o ledger grava a intenção como
  `in_progress`. Se o processo morrer no meio, sobra rastro para conciliar,
  nunca um silêncio.
- Chave natural anti-duplicidade: `cnpj_emitente + cpf_tomador +
  data_atendimento + codigo_servico + valor_centavos`. Repetiu, o comando
  recusa e explica qual nota já existe. É `data_atendimento` (o dia do
  serviço), não competência — competência muda todo dia que a nota é retida
  e reemitida, então não pode fazer parte de uma chave que precisa ser
  estável (ver risco de competência logo abaixo).

**Competência é sempre a data de emissão, nunca a do atendimento.** As skills
atuais deixaram isso explícito e é fácil de errar: `dataAtendimento` na nota
entra *só* no texto da descrição ("Consulta realizada no dia..."); o campo
"Data de Competência" do Passo 1 é sempre o dia em que o comando roda,
preenchido pelo driver na hora, nunca lido da planilha. Retroagir competência
força reapuração do Simples Nacional e retrabalho na contabilidade — se um
lote for montado numa data e só emitido dias depois, o driver assume hoje
como competência de qualquer forma; se algum fluxo algum dia precisar de
competência diferente de hoje, isso vira uma confirmação explícita, não um
padrão silencioso. Consequência prática: `nf relatorio --competencia` filtra
pelo mês do `emitido_em` do ledger (quando a nota de fato saiu), não pelo mês
de `data_atendimento` — os dois podem cair em meses diferentes.

**IBS/CBS (Reforma Tributária) — obrigatório desde 01/08/2026.** O Passo 2
ganhou um bloco novo de campos fixos (preencher IBS/CBS = Sim, não é compra
governamental, destinatário é o próprio adquirente, NBS 123012100 - Serviços
de clínica médica, código indicador 030101, CST 000, classificação 000001;
alíquotas de 0,01%/0,09% o próprio portal calcula). Hoje é idêntico nas duas
empresas, por isso virou dado no `passo2.ibsCbs` do perfil de cada uma
(seção 5) em vez de constante espalhada pelo driver. As próprias skills
avisam que os `id`s desses campos **ainda não foram confirmados em produção**
— é a primeira coisa a checar na Fase 4, e alguns são dropdown/radio
estilizados que historicamente não respondem a `page.fill()`/JS puro (ver
risco de seletores, abaixo — mesmo padrão de Município/Código/PIS-COFINS/Regime).

**A sessão do gov.br expira rápido e o login não pode ser automatizado.**
- O código nunca digita senha, nunca guarda senha. Isso é regra, não preferência.
- `nf auth login` abre uma janela visível, a pessoa loga, o script espera a URL
  pós-login e exporta o `storageState`.
- Preflight antes de todo lote: se a sessão caiu, o comando falha imediatamente
  com "faça login de novo" em vez de emitir metade das notas.

**Captcha no download do DANFSe.** Não vai ser resolvido por código, e não
deveria. Emissão e download viram etapas separadas: o lote emite N notas sem
captcha; `nf baixar` abre a janela e pausa para a pessoa digitar cada um.
No container, download fica fora de escopo — o comando avisa em vez de travar.

**Os seletores do portal mudam entre versões.** As skills atuais já documentam
isso. O mapa de seletores fica versionado num único arquivo, e `nf doctor` abre
cada passo do wizard e verifica se todos ainda resolvem, imprimindo o que
quebrou. Roda antes de cada lote — 30 segundos que evitam um lote pela metade.

**Dados de paciente (LGPD).** CPF, nome, endereço. Nada disso entra no
repositório: `data/`, `input/`, `downloads/` e `sessions/` no `.gitignore`
desde o primeiro commit. CPF sai mascarado nos logs. Nenhum dado de paciente
em mensagem de commit, em CI ou em issue.

**Detecção de automação — resolvido por desenho, não por teste.** O portal em
si não resiste a automação: as skills injetam JS, clicam por código e preenchem
campos com setter nativo todo dia, e funciona. Isso está provado em produção.

O que *não* está provado é um Chromium lançado pelo Playwright passar pelo
login do gov.br — porque nesse fluxo o login nunca foi automatizado (a pessoa
loga na mão, no próprio Chrome) e porque um navegador lançado pelo script sobe
com `navigator.webdriver = true` e perfil zerado, fingerprint diferente do que
hoje funciona.

Em vez de testar essa incógnita, o desenho a elimina: **o padrão é conectar por
CDP ao Chrome que a pessoa já usa** (`chromium.connectOverCDP`), sem lançar
navegador nenhum. Mesmo perfil, mesma sessão, mesmo fingerprint que já emite
nota hoje — o login continua exatamente como é hoje, humano e no navegador de
sempre. Só o preenchimento vira código.

Detalhe que morde na hora de montar: desde o Chrome 136, `--remote-debugging-port`
é recusado sobre o diretório de perfil padrão. Então o setup usa um
`--user-data-dir` dedicado, onde a pessoa loga no gov.br uma vez; esse perfil
persiste e vira dispositivo conhecido. É configuração de uma vez, num atalho.

Alternativas, se o CDP não servir em alguma máquina: (b) contexto persistente
com `channel: 'chrome'`; (c) login pela skill do Chrome MCP e só o
preenchimento em código.

## 4. Arquitetura

Três camadas, com uma fronteira que importa:

```
cli/          comandos, entrada interativa, leitura de planilha, saída em tabela
  │
core/         domínio puro, zero navegador
  ├── empresas/       perfis fiscais (JSON validado por zod)
  ├── catalogo/       tabela de serviços por empresa
  ├── nota.ts         montagem e validação da nota
  └── ledger/         SQLite: estado e anti-duplicidade
  │
driver/       ─── interface EmissorDriver ───
  └── portal/         implementação Playwright (page objects dos 4 passos)
      └── (futuro)    implementação API/ADN com certificado A1
```

A fronteira `EmissorDriver` existe por um motivo concreto: o destino natural
deste projeto é a API oficial (seção 10). Se o domínio estiver misturado com
`page.fill()`, a migração é reescrita. Separado, é um adaptador novo.

`core` não importa Playwright. Isso é testável — e vai ser testado.

## 5. Modelo de dados

**Perfil da empresa** (`config/empresas/qara.json`) — o Passo 3 é o que difere
entre as duas, e vira dado, não `if`:

```jsonc
{
  "cnpj": "44697695000188",
  "razaoSocial": "QARA SERVICOS MEDICOS LTDA",
  "regime": "simples-nacional",
  "passo1": { "regimeApuracaoSN": "1" },
  "passo2": {
    "municipioPrestacao": "Rio de Janeiro/RJ",
    "codigoTributacaoNacional": "04.01.01",
    "codigoTributacaoComplementar": "04.01.01.001",
    "ibsCbs": {
      "preencher": true,
      "compraGovernamental": false,
      "destinatarioProprioAdquirente": true,
      "itemNbs": "123012100",           // Serviços de clínica médica
      "codigoIndicadorOperacao": "030101",
      "codigoSituacaoTributaria": "000", // Tributação integral
      "codigoClassificacaoTributaria": "000001"
    }
  },
  "passo3": {
    "pisCofinsSituacaoTributaria": "7",   // 07 Isenta
    "pisCofinsTipoRetencao": "0",         // Não retidos
    "tipoValorTributos": "4"              // alíquota do Simples Nacional
  }
}
```

Ceccarelli difere em: sem regime SN no Passo 1, `issqnRegimeEspecial: "6"`
(Sociedade de Profissionais), PIS/COFINS `"1"` (alíquota básica),
`tipoValorTributos: "2"` com percentuais `11,33 / 0 / 0`. O bloco `passo2`
(município, código de tributação, IBS/CBS) é hoje idêntico ao da QARA.

Empresa nova = um JSON. Nenhuma linha de código.

**Catálogo de serviços** (`config/catalogo/qara.json`) — código, valor em
centavos, template de descrição com `{{data}}`. As descrições carregam CRM e
RQE de cada médico: uma errada é defeito em documento fiscal, então a
renderização do template é função pura com teste unitário e os catálogos das
duas empresas são conferidos contra as tabelas atuais antes de irem para o repo.

**Nota** (a unidade de trabalho): empresa, data de atendimento (só entra na
descrição do serviço — não é a competência), tomador (CPF, nome, CEP,
número — ou um dos casos sem CPF: estrangeiro residente, turista, não
informado), serviço (código do catálogo ou avulso), valor. Competência não é
campo da nota: é sempre "hoje", calculada pelo driver na hora de preencher o
Passo 1.

**Ledger** (`data/ledger.db`, fora do git): `id`, `hash_natural`, `empresa`,
`data_atendimento`, `tomador_identificador`, `codigo_servico`,
`valor_centavos`, `status`, `chave_acesso`, `numero_nota`, `emitido_em`,
`arquivos`, `erro`. A competência de cada nota, para fins de relatório, é o
mês de `emitido_em` — não existe coluna própria porque seria sempre igual à
data de emissão, redundante por definição.
Estados: `pending → in_progress → emitted → downloaded`, mais `failed`,
`cancelled`, `substituted`.

## 6. Comandos

```
nf auth login [--empresa qara]      abre janela, humano loga, exporta sessão
nf auth status                      sessão válida? de qual CNPJ? expira quando?
nf doctor                           todos os seletores dos 4 passos resolvem?

nf emitir --interativo              pergunta campo a campo, dry-run, confirma
nf emitir --planilha notas.xlsx     lote: valida tudo, dry-run de todas,
                                    mostra tabela, uma confirmação, emite
  --confirm                         sem isso, nunca clica em "Emitir NFS-e"
  --storage-state session.json      modo container

nf baixar [--competencia 2026-08]   DANFSe/XML das notas emitidas (pausa no captcha)
nf cancelar --chave <chave> --motivo "..."
nf substituir --chave <chave> --planilha corrigida.xlsx
nf conciliar --competencia 2026-08  compara ledger × portal, aponta divergências
nf relatorio --competencia 2026-08  XLSX por empresa para a contabilidade
```

`--competencia` sempre filtra pelo mês de `emitido_em` no ledger — o dia em
que a nota realmente saiu no portal, que é diferente de `data_atendimento`
sempre que o lote é montado num dia e emitido depois.

Formato da planilha (uma linha por nota, cabeçalho fixo — implementado na
Fase 2 em `src/cli/planilha.ts`):
`empresa | data_atendimento | tipo_tomador | cpf | nome | nif | pais | cep | numero | codigo_servico | valor_centavos | observacao`

`tipo_tomador` é opcional e assume `cpf` quando a coluna `cpf` vem
preenchida; senão é obrigatório (`estrangeiro-residente` | `turista` |
`nao-informado`) — é o que resolve os "Casos especiais — sem CPF" do
Passo 1. `nome`/`nif`/`pais` só valem para os tipos sem CPF. `valor_centavos`
e a descrição em `observacao` só são exigidos quando `codigo_servico =
OUTROS`. `nf validar`/`nf emitir` validam a planilha inteira **antes** de
abrir o navegador e apontam a lista de erros por linha (número da linha =
o mesmo que aparece no Excel).

## 7. Fases

Cada fase termina em algo que roda. Nada de "infraestrutura" por três semanas.

**Fase 1 — Spike de conexão (1 hora).** Encolheu: como o padrão é atacar o
Chrome que já funciona, não há viabilidade a descobrir, só a conexão a montar.
Chrome sobe com `--remote-debugging-port` e `--user-data-dir` dedicado, a
pessoa loga no gov.br nesse perfil, `connectOverCDP` anexa e lê "Meus dados".
Testa de passagem as duas dúvidas mecânicas: `page.click()` em "Avançar"
funciona ou trava (as skills relatam travamento e usam clique por JS), e se
`page.fill()` basta ou se o portal precisa do setter nativo + eventos
`input`/`change`. *Pronto quando:* o script enxerga a sessão logada e sabemos
qual API de clique/preenchimento usar nas page objects.

**Fase 2 — Esqueleto e domínio (1 dia).** Repo TS, lint, vitest, CI. `core`
completo: perfis das duas empresas, catálogos, validação de nota, ledger
SQLite. Zero navegador. *Pronto quando:* `nf validar --planilha exemplo.xlsx`
aponta erros linha a linha e os testes de catálogo/validação passam.

**Fase 3 — Sessão (meio dia).** `auth login`, `auth status`, export/import de
`storageState`, preflight (`garantirSessaoAtiva`). Escrita e testada aqui
(mock de página para a detecção de login; round-trip real de cookies com o
Chromium empacotado do Playwright, sem tocar o portal). O que só a máquina da
clínica responde: quanto tempo a sessão dura de verdade, e se a sessão
exportada sobrevive a rodar num Chromium diferente do que gerou (headless,
outro fingerprint) — ver `docs/FASE1-SETUP.md` seção 7 e riscos #2/#3 da
seção 11. *Pronto quando:* logo na máquina da clínica, exporto a sessão, e um
processo separado usa ela sem novo login.

**Fase 4 — Passos 1 a 4 e a primeira nota (2 dias).** Page objects dos quatro
passos, mapa de seletores, `nf doctor`, dry-run com raspagem do resumo.
*Pronto quando:* uma nota real de cada empresa é emitida ponta a ponta, com
confirmação, e a chave de acesso vai para o ledger. É o marco que prova o
projeto.

**Fase 5 — Lote (1 dia).** Planilha → fila → dry-run de todas → tabela →
confirmação única → emissão sequencial com retomada. Um erro na nota 7 não
perde as 6 anteriores nem reemite nenhuma. *Pronto quando:* um fechamento de
mês real roda do começo ao fim.

**Fase 6 — Download e conciliação (1 dia).** `nf baixar` com pausa para
captcha, arquivos nomeados por chave, `nf conciliar` comparando ledger com as
notas do portal no período. *Pronto quando:* conciliar um mês fechado retorna
zero divergências.

**Fase 7 — Cancelamento, substituição e relatório (1–2 dias).** Antes de
codificar: verificar ao vivo as regras e a UI de cancelamento (prazo, se exige
motivo, se substituição gera nota referenciando a original) — não vou assumir.
Relatório mensal em XLSX por empresa. *Pronto quando:* cancelo uma nota de
teste e o relatório do mês bate com o portal.

**Fase 8 — Skills viram casca fina.** `qara` e `cg` param de preencher campos
e passam a: conversar para completar os dados que faltam, montar a linha,
chamar o CLI, mostrar o resumo, pedir o "sim". O texto de cada skill encolhe de
~150 linhas para ~30, e o custo por nota despenca. *Pronto quando:* emitir uma
nota pelo Claude não faz nenhuma chamada de `javascript_tool`.

## 8. Testes

O portal de produção não entra na suíte automatizada — emitir é irreversível.
- **Unitário:** catálogo, renderização de descrição, validação de CPF/CEP,
  chave natural do ledger, máquina de estados. É onde mora a maior parte do risco de erro silencioso.
- **Page objects contra fixtures:** HTML dos quatro passos salvo e
  higienizado (sem dado de paciente), servido localmente. Pega quebra de
  seletor sem tocar no portal.
- **E2E real:** manual, com `--dry-run`, nunca em CI, nunca com `--confirm`.
- **CI:** lint + unit + fixtures. Sem segredos, sem navegador contra produção.

## 9. Segurança

- Senha do gov.br: o código não vê, não pede, não guarda. Login é humano.
- `sessions/` com permissão 600, no `.gitignore`, com aviso claro de que o
  arquivo equivale a estar logado.
- `data/`, `input/`, `downloads/` no `.gitignore`.
- CPF mascarado em log (`***.***.789-01`); nome completo só na tela, na hora da confirmação.
- Nenhum dado de paciente em commit, PR, issue ou CI.

## 10. Fora do V1 — e o destino natural

O Portal Nacional tem **API oficial** (ADN/SEFIN): a nota vai como XML de DPS
assinado com certificado digital e-CNPJ A1. Isso elimina de uma vez navegador,
sessão que expira, captcha e seletor que muda — os quatro riscos da seção 3.

Não é o V1 porque exige certificado A1 (custo anual), credenciamento, e
assinatura XMLDSig, e porque o processo precisa funcionar já. Mas é o destino:
por isso a fronteira `EmissorDriver` existe desde a Fase 2. Quando a API entrar,
o `core`, o ledger, a planilha, os relatórios e as skills continuam iguais — só
o adaptador muda. Vale reavaliar assim que o V1 estiver rodando estável.

Também fora do V1: integração com o Kommo, emissão agendada desassistida
(depende da API), e portal de município que não seja o Emissor Nacional.

## 11. A verificar ao vivo antes de codificar

Coisas que eu não sei e não vou chutar:

1. `page.click()` em "Avançar" trava a aba no Playwright, como trava no Chrome MCP?
2. Quanto tempo a sessão do portal dura de fato? (define se o modo container é útil)
3. A sessão exportada sobrevive a outro IP e outro fingerprint no container?
   (2 e 3: ferramenta pronta — `nf auth status`/`nf auth login`, roteiro em
   `docs/FASE1-SETUP.md` seção 7. Só falta rodar na máquina da clínica.)
4. Os IDs dos campos do Passo 2 são incertos por dois motivos empilhados:
   Município/Código de tributação/PIS-COFINS/Regime já são dropdowns
   filtráveis que historicamente não respondem a `setSel`/JS puro (as skills
   caem para um fallback de UI — clicar, digitar, clicar); e os campos novos
   de IBS/CBS (seção 3) são tão recentes que as próprias skills admitem não
   ter os `id`s confirmados em produção ainda. A Fase 4 deve assumir que vai
   precisar do fallback de UI nesses campos por padrão, não como exceção —
   e o `nf doctor` (seção 3, risco de seletores) precisa cobrir especificamente
   esse bloco.
5. Regras atuais de cancelamento e substituição: prazo, motivo obrigatório,
   se substituição referencia a nota original.

Resolvido: os catálogos de serviço (seção 5) foram conferidos contra a versão
mais recente das skills `qara`/`cg` — valores, CRM e RQE batem, sem mudança.

Saiu da lista: "o gov.br detecta automação?". O desenho por CDP no Chrome real
torna a pergunta sem objeto — é o mesmo navegador que já emite nota hoje.

A 1 sai da Fase 1; a 2 e a 3 saem da Fase 3 e decidem se o modo container fica
de pé. A 4 e a 5 são para checar na Fase 4/7 (a 5 junto com a contabilidade).
