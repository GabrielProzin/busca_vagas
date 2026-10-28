# busca_vagas

Radar pessoal de vagas. Todo dia ele busca vagas em várias fontes, descarta o que não combina com você
(área, nível, local), dá uma **nota explicável** contra o **seu currículo** e ajuda a se candidatar:
escreve o email para o recrutador, manda pelo **seu Gmail** com o currículo anexado e acompanha cada
candidatura até o fim, com lembrete de follow-up.

Tudo roda em planos grátis, e cada pessoa tem a **própria cópia**: o seu banco, o seu site, os seus dados.

- **Vagas**: lista ordenada pela nota, com o porquê da nota, busca e filtros (com email, remoto, cargo).
- **Vaga**: resumo feito pela IA, email ao recrutador pronto para revisar e enviar, situação e anotações.
- **Candidaturas**: quadro (kanban) de arrastar, com aviso quando passa da hora do follow-up.
- **Envio em lote**: escolha várias vagas com email de uma vez, confira os emails prontos e coloque na fila; o
  GitHub envia em segundo plano, no horário e com pausa entre um e outro, até o limite do dia.
- **Respostas lidas do Gmail**: quando o recrutador responde, a candidatura vai sozinha para "Respondeu" (e o
  follow-up para); email que voltou (endereço não existe) fica marcado.
- **Email de resumo**: duas vezes por dia, as vagas novas com nota alta e os follow-ups do dia.
- **Posts do LinkedIn com email do recrutador**: busca automática (sem usar a sua conta) e uma extensão do
  Chrome que manda os posts que você está vendo.
- **Tipos de vaga**: as vagas abertas agrupadas por semelhança do texto (embeddings e k-means), num ranking do tipo
  que mais combina com você para o que menos, com quantas vagas há, o que você já tem e o que falta em cada tipo.
- **O que estudar**: as habilidades que as vagas pedem e não estão no seu currículo, com quantas vagas cada uma
  destravaria (as em que é a única coisa que falta) e os seus pontos fortes no mercado.
- **Perfil profissional**: o seu nível de mercado (estágio, júnior, pleno, sênior) com o motivo, o próximo passo
  mais útil e a evolução das notas.
- **Análise de CV**: nota de 0 a 100 do currículo em 4 critérios explicados (habilidades que o mercado pede,
  resultados com números, estrutura e clareza da escrita), com histórico e variação. Para uma vaga, mostra a conexão,
  o que destacar, as lacunas e responde às perguntas do formulário só com fatos do seu currículo.
- **Uso dos serviços**: quanto de cada plano grátis já foi usado (GitHub, Supabase, Apify, Gemini, Gmail), com
  aviso por email ao passar de 80%.
- **Ranking que aprende**: vagas parecidas com as que você aplica sobem; com as que descarta, descem.

> Como o sistema funciona por dentro, com as regras: [`docs/spec.md`](docs/spec.md).

---

## Quanto custa

Nada, se você ficar nos planos grátis. Nenhum serviço abaixo pede cartão para o que usamos.

| Serviço | Para quê | Plano grátis |
|---|---|---|
| GitHub | Código, a coleta (5x por dia) e o envio da fila | Repositório privado: 2.000 min/mês de Actions (veja abaixo). Público: ilimitado |
| Supabase | Banco de dados e o PDF do currículo | 500 MB; pausa se ficar 7 dias sem uso (a coleta evita isso) |
| Vercel | O site | Hobby |
| Google AI Studio (Gemini) | Escrever emails e resumir vagas | Cota diária grátis; acabou, o site usa um modelo pronto |
| Gmail | Enviar os emails | Senha de app |
| Apify (opcional) | Posts do LinkedIn com email | US$ 5/mês de crédito grátis, sem cartão |

A página **Uso dos serviços** do site mostra o consumo de cada um contra o limite grátis e manda um email se algum
passar de 80%. A Vercel não dá para medir sem dar ao site um token da sua conta; para uma pessoa, o plano Hobby sobra.

**Minutos do GitHub num repositório privado (estimativa):** coletas e rodadas de envio usam uns 1.300 min/mês. Cada
email enviado pela fila soma ~1,5 min, porque a pausa entre emails conta como tempo de Actions: uns 15 emails por dia
pela fila cabem no plano grátis. Para mais, diminua `envio.intervalo_segundos` ou `envio.limite_diario` em
`config/preferencias.yaml`. Se passar, o GitHub só para os workflows até o mês virar (não cobra sem cartão cadastrado).

---

## Como montar a sua cópia (uns 40 minutos)

> **Mais fácil:** abra a sua IA (Claude, ChatGPT, Codex…), cole o [prompt de configuração](#prompt-para-a-sua-ia)
> do fim desta página e siga com ela, um passo por vez. Os passos abaixo são os mesmos que ela vai guiar.

### 1. Copie o repositório

Na página deste repositório no GitHub, clique em **Use this template → Create a new repository**.
Escolha um nome e marque **Private** (o seu currículo vai ficar nele).

### 2. Coloque o seu perfil

Três arquivos dizem quem você é e o que procura. Edite direto no GitHub (ícone de lápis) ou peça para a sua IA gerar
a partir do seu currículo:

| Arquivo | O que é |
|---|---|
| `perfil/curriculo.md` | Seu currículo em texto (sem telefone nem email). É a base da nota e dos emails. |
| `perfil/perfil.yaml` | Nome, cargo, links, suas habilidades (com sinônimos e peso) e 4 a 6 destaques do currículo em primeira pessoa. |
| `config/preferencias.yaml` | O que buscar e o que descartar: termos de busca, tipos de cargo, senioridade, cidades aceitas para presencial/híbrido, nota mínima. |

Os arquivos que vêm no modelo são de um perfil real de dados: use como exemplo do formato e troque tudo pelo seu.

### 3. Crie o banco no Supabase

1. Em [supabase.com](https://supabase.com), crie um projeto (região São Paulo). Guarde a senha do banco no seu gerenciador de senhas.
2. Em **SQL Editor**, cole todo o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**.
   Quando o sistema ganhar colunas novas, rode o arquivo inteiro de novo: ele não apaga nada.
3. Em **Project Settings → API Keys**, copie a **Project URL** e a **secret key** (`sb_secret_…`). A secret key
   dá acesso total ao banco: ela só vai para a Vercel e para os Secrets do GitHub, nunca para o código.

### 4. Prepare o Gmail e o Gemini

- **Gmail:** ative a verificação em duas etapas na sua conta Google e crie uma **senha de app** em
  [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) (16 letras). A mesma senha envia
  (SMTP) e lê só os cabeçalhos da caixa de entrada para achar respostas (IMAP, que o Gmail deixa ligado).
- **Gemini:** crie uma chave em [aistudio.google.com/apikey](https://aistudio.google.com/apikey). Não ative
  faturamento no projeto: assim nunca há cobrança.

### 5. Publique o site na Vercel

1. Em [vercel.com](https://vercel.com), **Add New → Project** e escolha o seu repositório.
2. Em **Root Directory**, escolha a pasta **`site`**.
3. Em **Environment Variables**, cadastre as variáveis da tabela [Variáveis da Vercel](#variáveis-da-vercel).
4. **Deploy.** Abra o endereço que a Vercel der e entre com a senha que você escolheu.

### 6. Ligue a coleta no GitHub

1. No seu repositório: **Settings → Secrets and variables → Actions → New repository secret**, e cadastre os
   [Secrets do GitHub](#secrets-do-github).
2. **Actions → Coleta de vagas → Run workflow.** Em uns 5 minutos as vagas aparecem no site.
   Daí em diante ela roda sozinha: completa por volta das 11:00 e das 18:30 (com LinkedIn e email de resumo) e
   rápida às 8:00, 14:00 e 22:00 (só as plataformas). O workflow **Envio da fila de emails** roda de hora em hora,
   das 7h às 21h.
3. **Teste o envio (opcional):** Actions → Envio da fila de emails → Run workflow, marcando **teste**. Ele manda um
   email para você mesmo, provoca uma devolução num endereço que não existe e confere se o sistema percebeu as duas
   coisas. Nenhum recrutador recebe nada.

### 7. Últimos ajustes no site

- **Configurações → Currículo anexado:** envie o PDF que vai junto dos emails.
- **Extensão do Chrome (opcional, recomendada):** veja [A extensão do Chrome](#a-extensão-do-chrome), logo abaixo.
- **Monitor externo (opcional):** no [UptimeRobot](https://uptimerobot.com), cadastre
  `https://SEU-SITE.vercel.app/api/saude` para receber um email se o site cair.

---

## A extensão do Chrome

### Por que ela existe

**O problema.** A maior vantagem deste sistema é mandar o currículo **direto para o email de quem está contratando**,
em vez de cair na mesma fila de centenas de candidatos de um formulário. Só que:

- As plataformas de vagas (Gupy, Sólides, Remotar…) quase nunca mostram email: a candidatura é pelo formulário delas.
- Os emails de recrutador aparecem quase só em **posts do LinkedIn** ("estamos contratando… envie o CV para
  fulana@empresa.com").
- O LinkedIn não tem uma forma oficial de buscar posts, e automatizar a sua própria conta (um robô logado rolando o
  feed) é proibido pelas regras dele e pode **restringir ou bloquear a sua conta**. Não fazemos isso.
- Os buscadores (Google etc.) quase não mostram esses posts, e a busca automática que usamos (um serviço que lê
  posts públicos sem login, pelo Apify) tem cota no plano grátis: rende algumas vagas com email por dia, não todas.
  Numa medição real, só cerca de 1 em cada 10 posts de vaga tinha email.

**Como a extensão resolve (em parte).** Ela usa o que você **já está vendo**, do jeito que qualquer pessoa vê: você
abre uma busca de posts no LinkedIn, rola a página e clica no ícone. A extensão lê os posts que estão na tela, separa
os que têm email e cara de vaga (deixa de fora quem está procurando emprego) e manda para o seu site, onde a IA tira
cargo, empresa e local, dá a nota e guarda só o que combina com você, já com o email do recrutador pronto para usar.
Ela não navega, não rola, não clica e não faz nenhum acesso extra ao LinkedIn.

**Por que "em parte".**

- Não é automática: depende de você abrir a busca e rolar (uns 2 minutos por dia rendem bem).
- Só pega o que carregou na tela. Posts muito longos podem chegar cortados no "…ver mais".
- O LinkedIn muda a página de vez em quando; a extensão tem um plano B, mas pode precisar de ajuste.
- Ler a própria tela é bem diferente de um robô, mas as regras do LinkedIn não aprovam nenhum tipo de coleta.
  Use com moderação, como usaria o site normalmente.

Juntas, a busca automática (duas vezes por dia) e a extensão (quando você quiser mais) trazem bem mais vagas com email
do que qualquer uma sozinha, sem nenhum robô usando a sua conta.

### Instalar (uma vez)

1. No seu repositório no GitHub: **Code → Download ZIP** e descompacte. A extensão é a pasta `extensao`.
2. No Chrome, abra `chrome://extensions`, ligue o **Modo do desenvolvedor** (canto superior direito) e clique em
   **Carregar sem compactação**. Escolha a pasta `extensao`.
3. Clique no ícone da extensão (fixe-a na barra pelo ícone de quebra-cabeça). Nas opções, informe o endereço do seu site e o
   mesmo valor do `CAPTURA_TOKEN` que está na Vercel. Salvar.

### Usar

- **Vários posts de uma vez (LinkedIn):** no site, em **Adicionar vaga**, abra uma das buscas prontas de posts
  (últimas 24h). Role a página por alguns segundos para carregar e **clique no ícone da extensão**. Ela manda os posts da
  tela que têm email e cara de vaga; o site lê cada um com a IA e guarda só os do seu perfil (área, nível, local).
  Um aviso mostra quantas vagas entraram. Pode rolar mais e clicar de novo: o que já foi enviado não repete.
- **Um texto de qualquer site:** selecione o texto da vaga, clique com o botão direito e escolha
  **Enviar para o busca_vagas**.

Quando atualizar o repositório com uma versão nova da extensão, baixe o ZIP de novo e clique em **Atualizar** em
`chrome://extensions` (ou remova e carregue a pasta outra vez).

---

## Envio em lote e respostas

Na tela **Envio em lote**, aparecem as vagas novas com email, cada uma com o email pronto (o seu rascunho, se você já
mexeu nele, ou o modelo pronto). Marque as que quer, abra e ajuste o texto se quiser, e clique em **Colocar na fila**.
Quem envia é o GitHub, em segundo plano, com o currículo em anexo e saindo do seu Gmail (fica em Enviados).

Tudo se ajusta na seção `envio` de `config/preferencias.yaml`:

| Opção | Padrão | O que faz |
|---|---|---|
| `limite_diario` | 40 | Máximo de emails por dia, somando o site e a fila |
| `max_por_execucao` | 10 | Máximo por rodada (as rodadas são de hora em hora) |
| `intervalo_segundos` | [60, 120] | Pausa sorteada entre um email e outro |
| `horario` | [7, 21] | Só envia entre 7h e 21h (Brasília) |
| `automatico.ligado` | false | Se `true`, vagas novas da lista principal com email e nota ≥ `automatico.nota_minima` (90) entram na fila sozinhas, com o modelo pronto, sem você revisar. Ligue só se confiar nos filtros |

E em `dominios_email_excluidos`, os domínios que nunca devem receber email seu (por exemplo, a empresa onde você trabalha).

**Respostas:** a cada rodada, o sistema lê só os cabeçalhos dos emails dos últimos 21 dias da sua caixa de entrada
(sem marcar como lido e sem guardar o conteúdo). Se alguém respondeu a um email de candidatura, a candidatura vai para
"Respondeu"; se o Gmail avisou que o endereço não existe, ela fica marcada como devolvida. Hoje e o Painel (taxa de
resposta) mostram isso.

---

## Variáveis e segredos

Para gerar um segredo aleatório (senha do site, tokens), no PowerShell:

```powershell
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); -join ($b | ForEach-Object { $_.ToString("x2") })
```

No Mac/Linux: `openssl rand -hex 32`. Use um diferente para cada segredo.

### Variáveis da Vercel

| Nome | Obrigatória | O que colocar |
|---|---|---|
| `SITE_PASSWORD` | sim | A senha para entrar no seu site |
| `SESSION_SECRET` | sim | Segredo aleatório (64 caracteres) |
| `SUPABASE_URL` | sim | Project URL do Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | sim | Secret key do Supabase (`sb_secret_…`) |
| `GEMINI_API_KEY` | sim | Chave do Google AI Studio |
| `GMAIL_USER` | sim | Seu endereço do Gmail |
| `GMAIL_APP_PASSWORD` | sim | Senha de app do Gmail |
| `CAPTURA_TOKEN` | para a extensão | Segredo aleatório; o mesmo vai nas opções da extensão |
| `CONTATO_TELEFONE` | não | Telefone na assinatura dos emails |
| `CRON_SECRET` | para o vigia | Segredo aleatório (a Vercel usa sozinha no cron) |
| `GITHUB_DISPATCH_TOKEN` | para o vigia e o envio na hora | Token *fine-grained* do GitHub, só deste repositório, permissão **Actions: Read and write** |

O **vigia** confere duas vezes por dia se a coleta rodou e, se o GitHub pular o horário, dispara a coleta
e avisa por email. Com o mesmo token, o site começa o envio da fila assim que você coloca vagas nela
(sem ele, a fila sai na rodada de hora em hora).

### Secrets do GitHub

| Nome | Obrigatório | O que colocar |
|---|---|---|
| `SUPABASE_URL` | sim | Project URL do Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | sim | Secret key do Supabase |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | sim | Os mesmos da Vercel (envio da fila, respostas, resumo e alertas) |
| `CONTATO_TELEFONE` | não | O mesmo da Vercel: telefone na assinatura dos emails do modo automático |
| `SITE_URL` | recomendado | Endereço do seu site (para os links do email de resumo) |
| `RESUMO_PARA` | não | Para onde mandar o resumo (padrão: o próprio Gmail) |
| `BACKUP_SENHA` | recomendado | Senha longa do backup cifrado. **Guarde no seu gerenciador de senhas**: sem ela o backup não abre |
| `APIFY_TOKEN` | para posts do LinkedIn | Token do [Apify](https://console.apify.com) (Settings → API & Integrations) |

---

## Prompt para a sua IA

Cole o texto abaixo na IA que você usa. Se ela tiver acesso ao repositório (Claude Code, Codex), ela edita os
arquivos; se for um chat, ela te entrega o conteúdo para colar no GitHub.

```text
Vou montar a minha cópia do busca_vagas, um radar pessoal de vagas que roda grátis em
GitHub Actions + Supabase + Vercel. O README e o docs/spec.md do repositório explicam tudo.

Objetivo: terminar com o site no ar, a coleta rodando e o sistema configurado para o MEU perfil.

Me guie um passo por vez, na ordem do README (copiar o repositório, perfil, Supabase, Gmail e
Gemini, Vercel, secrets do GitHub, primeira coleta, ajustes finais). Em cada passo, diga
exatamente onde clicar, espere eu confirmar que terminei e só então siga. Se eu travar,
peça a mensagem de erro inteira e descubra a causa antes de sugerir a correção.

No passo do perfil, vou te mandar o meu currículo. A partir dele:
1. Me faça perguntas, uma por vez, sobre o que procuro: área e cargos, nível (júnior, pleno…),
   se aceito remoto, quais cidades aceito para presencial/híbrido, o que quero evitar.
2. Gere perfil/curriculo.md (sem telefone nem email), perfil/perfil.yaml e
   config/preferencias.yaml no MESMO formato dos arquivos que já estão no repositório,
   trocando todo o conteúdo pelo meu. Em perfil.yaml: habilidades que eu realmente tenho, com
   sinônimos como aparecem em vagas e peso de 1 a 3; destaques com "frase" em primeira pessoa,
   só com fatos do meu currículo.
3. Me mostre os arquivos para eu conferir antes de salvar.

Regras: nunca me peça para colar senhas, chaves ou tokens na conversa. Diga onde cada um vai
(Vercel ou Secrets do GitHub) e eu mesmo colo lá. Não invente experiência que não está no meu
currículo. Prefira o plano grátis de tudo e me avise antes de qualquer coisa que possa cobrar.

No fim, confira comigo esta lista: entrei no site com a senha; a coleta rodou e as vagas
apareceram; a página Configurações mostra todos os primeiros passos essenciais prontos; ao
abrir uma vaga com email, o email já vem com o meu nome e a minha assinatura; instalei a
extensão do Chrome e uma captura no LinkedIn trouxe vagas para o site.
```

---

## Para quem programa

```
config/preferencias.yaml   o que buscar e filtrar
perfil/                    currículo e perfil (base da nota e dos emails)
coletor/                   Python: fontes, filtros, ranking, aprendizado, resumo, alertas, follow-up, backup,
                           envio da fila (envio.py) e leitura de respostas no Gmail (respostas.py)
site/                      Next.js na Vercel: páginas, Server Functions, API, testes de ponta a ponta (e2e/)
extensao/                  extensão do Chrome (Manifest V3)
supabase/schema.sql        tabelas (RLS ligado, só o servidor acessa)
.github/workflows/         coleta (5x/dia) com backup cifrado; envio da fila (de hora em hora); testes do site
docs/spec.md               a planta do sistema · AGENTS.md: regras para agentes de IA
```

**Rodar localmente**

```bash
# coletor
pip install -r requirements.txt && python -m pytest -q
python -m coletor.pipeline --tfidf          # sem Supabase grava só em saida/

# site em modo demonstração (dados fictícios, Gemini falso, Gmail simulado)
cd site && npm install && npm run build && npx playwright test
```

**A nota de compatibilidade:** 45% texto parecido com o currículo (embeddings multilíngues rodando no próprio
Actions) + 40% habilidades + 15% tipo de cargo, +5 para júnior, e um ajuste de −8 a +8 pelo seu histórico de
aplicadas e descartadas. Detalhes em [`docs/spec.md`](docs/spec.md).

**Segurança:** tudo atrás de login (cookie assinado), segredos só nas variáveis, o navegador nunca fala com o
banco, backup cifrado a cada coleta, testes de ponta a ponta a cada mudança. A conta do LinkedIn de ninguém é
automatizada: os posts vêm de um serviço que busca sem login, ou da extensão quando você clica.
