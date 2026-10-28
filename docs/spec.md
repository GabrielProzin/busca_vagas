# busca_vagas: spec

Radar pessoal de vagas: coleta vagas todo dia, descarta o que não serve, dá uma nota explicável
contra o seu currículo e ajuda a se candidatar (email ao recrutador pelo seu Gmail, com o currículo
anexado) e a acompanhar cada candidatura até o fim.

Cada pessoa roda a **própria cópia** (o próprio Supabase, repositório e Vercel). Não existe conta
compartilhada: os dados de uma pessoa nunca passam pela cópia de outra.

Documento vivo: toda mudança de comportamento começa aqui, depois vai para o código e para os testes.

---

## 1. Quem usa

- **Candidato (dono da cópia)**: única pessoa com acesso ao site, por senha. Usa no computador e no celular.
- **Coletor (robô)**: roda no GitHub Actions duas vezes por dia; lê fontes públicas de vagas e grava no banco.
- **Vigia (robô)**: cron da Vercel; confere se a coleta rodou e dispara uma reserva se o GitHub pular o horário.
- **Extensão do Chrome**: manda para o site os posts de vaga que o candidato está vendo (só quando ele clica).

## 2. O que cada um faz

- Como candidato, quero ver só vagas que combinam comigo (área, nível, local), **para não perder tempo filtrando**.
- Como candidato, quero entender a nota de cada vaga, **para confiar no ranking e decidir rápido**.
- Como candidato, quero mandar um email curto e específico ao recrutador, com o currículo anexado, sem sair do site,
  **porque email direto ao recrutador responde mais que formulário**.
- Como candidato, quero acompanhar cada candidatura num quadro e ser lembrado do follow-up,
  **para nenhuma candidatura morrer esquecida**.
- Como candidato, quero que o ranking aprenda com o que eu aplico e descarto, **para a lista ficar mais a minha cara**.
- Como candidato, quero um email de resumo só com o que vale a pena, **para não precisar abrir o site todo dia**.
- Como candidato, quero exportar meus dados quando quiser, **porque os dados são meus**.
- Como candidato, quero uma nota explicável do meu currículo, com histórico, **para saber se cada versão ficou melhor**.
- Como candidato, quero ver meu nível de mercado e o próximo passo mais útil, **para saber onde investir tempo**.
- Como candidato, quero respostas prontas para as perguntas de formulário de uma vaga, só com fatos do meu currículo,
  **para me candidatar mais rápido sem inventar nada**.

## 3. Telas

O menu é dividido em módulos que abrem e fecham: **Início** (Hoje), **Vagas** (Vagas, Triagem rápida, Envio em lote,
Candidaturas, Adicionar vaga), **Meu perfil** (Perfil profissional, Análise de CV, O que estudar), **Mercado**
(Tipos de vaga, Painel) e **Sistema** (Uso dos serviços, Configurações). O módulo da página aberta fica aberto.
No celular, a barra de baixo tem Hoje, Vagas, Triagem, Perfil, Quadro e Mais; a tela Mais lista o resto por módulo.

| Tela | O que mostra | Ações |
|---|---|---|
| Login | Campo de senha | Entrar |
| Hoje (`/`, início) | O que pede ação agora: vagas novas com email, quantas faltam triar, follow-ups pendentes, candidaturas que avançaram; aviso se faltar algum passo da configuração | Ir direto para cada item, começar a triagem |
| Triagem (`/triagem`) | As vagas novas uma por vez (nota, motivos, requisitos, trecho da descrição), em ordem de nota | Descartar (D), Já apliquei (A), Abrir/Escrever email (Enter), Pular (→), Voltar (←), Desfazer (Z); no celular, botões grandes |
| Vagas (`/vagas`) | Lista principal / vale tentar, nota com composição, busca, filtro de cargo, "Com email", "Remoto" | Abrir, "Já apliquei", Descartar |
| Vaga (`/vaga/[id]`) | Follow-up (quando houver candidatura aberta), resumo da IA, por que essa nota, email ao recrutador já preenchido com o modelo pronto (ou "como se candidatar" se não há email), descrição | Melhorar com IA, enviar pelo Gmail, mudar situação, anotações |
| Envio em lote (`/lote`) | Vagas novas com email acima de uma nota, cada uma com o email pronto; a fila (esperando, com erro); emails enviados hoje / limite | Marcar/desmarcar, ver e editar o email, colocar na fila, tirar da fila |
| Candidaturas | Quadro (kanban) por etapa, avisos de follow-up | Arrastar cartão, menu "Mover para" |
| Adicionar vaga | Colar texto de um post; buscas prontas de posts no LinkedIn | Enviar para a IA ler |
| Tipos de vaga (`/tipos`) | Vagas abertas no seu nível e local agrupadas por semelhança (embeddings + k-means), do tipo com maior nota média ao menor: barra = quantas vagas, cor = o quanto combina | Abrir um tipo: o que você tem, o que falta (% das vagas do tipo), melhores vagas da lista |
| O que estudar (`/estudar`) | Habilidades do catálogo pedidas nas vagas: % das vagas, quantas destravaria (única que falta), variação desde a análise anterior; top 3 para estudar; pontos fortes | — |
| Uso dos serviços (`/uso`) | Cada serviço grátis contra o limite: GitHub Actions (minutos no mês), Supabase (banco e arquivos), Apify (crédito do mês), Gemini (pedidos do dia), Gmail (emails do dia), Vercel (só os limites) | Abrir o painel de cada serviço |
| Painel | Números da última coleta, por que as vagas ficaram de fora, vagas novas por coleta, aprendizado do ranking | — |
| Perfil profissional (`/perfil`) | Nível de mercado (estágio, júnior, pleno, sênior) com o motivo e o que falta para o próximo; "seu próximo passo"; evolução das notas do CV; números do perfil (nota do CV, vagas que combinam, habilidade que mais abriria vagas) | Fazer o próximo passo, nova análise de CV |
| Análise de CV (`/perfil/cv`) | Nota atual, variação e critério mais fraco; gráfico da evolução; histórico de análises (nota, tipo, conexão com a vaga, respostas, variação, data) com filtro Todas / Geral / Para vaga | Nova análise geral ou para uma vaga (escolher da lista ou colar o texto), com perguntas do formulário opcionais |
| Análise (`/perfil/cv/[id]`) | Nota e os 4 critérios com o motivo de cada um, pontos fortes, melhorias (com o trecho do currículo), nível; para vaga: conexão, o que destacar, lacunas e as respostas do formulário | Copiar cada resposta, excluir a análise |
| Configurações | Primeiros passos (o que está pronto e o que falta, com o link do passo no README), currículo em PDF, seus dados e backup, extensão | Enviar PDF, Exportar meus dados |

## 4. Dados (Supabase / Postgres, `supabase/schema.sql`)

- **vagas**: uma linha por vaga (`id` = `<fonte>:<id na origem>`; posts do LinkedIn usam o número do post).
  Título, empresa, link, descrição, local, modalidade, emails, nota, lista, motivos, habilidades, componentes da nota,
  resumo da IA, origem do email, `primeira_vez_em`.
- **candidaturas**: o que o candidato fez com a vaga (1 para 1 com `vagas`, separada para a coleta nunca apagar).
  Situação, email (para, assunto, corpo, Message-ID), data de envio, follow-ups (quantos e o último), anotações.
- **execucoes**: uma linha por coleta (contagens por fonte, descartes por motivo, aprendizado do ranking).
- **analises_cv**: uma linha por análise do currículo (tipo `geral` ou `vaga`, título, nota, conexão com a vaga,
  vaga analisada, nome da versão, e em `dados` os critérios, comentários, respostas e o texto analisado).
- **Storage `privado/curriculo.pdf`**: o currículo anexado nos emails.
- RLS ligado e nenhuma policy: só o servidor, com a chave secreta, lê e escreve.

## 5. Regras

**Coleta e filtros** (valores em `config/preferencias.yaml`)
- Fontes: Gupy, Remotar, Sólides, issues de repositórios de vagas no GitHub, posts do LinkedIn (via Apify, sem login).
- Fica de fora: título fora das trilhas de dados, senioridade bloqueada (pleno, sênior, estágio, trainee…), palavras
  bloqueadas, publicada há mais de `max_dias_publicacao`, presencial/híbrido fora das cidades aceitas, descrição em
  inglês, mais anos de experiência que `max_anos_experiencia`.
- Post do LinkedIn só vira vaga se for de quem contrata (não de candidato), tiver email e cargo de dados.
  Post sem local entra com aviso.

**Nota** (`coletor/ranking.py`)
- 45% texto parecido com o currículo + 40% habilidades + 15% tipo de cargo, +5 se o título diz júnior.
- Ajuste do histórico: de −8 a +8 conforme a vaga se parece com as aplicadas ou descartadas; liga com 3 de cada lado.
- Corte: `nota_minima` (posts do LinkedIn têm corte próprio, menor, porque o texto é curto).
- "Vale tentar" quando exige algo central que não está no currículo.

**Email ao recrutador**
- Só sai com o candidato marcando "Revisei", com o currículo em PDF anexado, pelo Gmail dele (senha de app).
- Limite diário de envios (`envio.limite_diario`, padrão 40), somando o site e a fila, para proteger a conta do Gmail.
- Mesmo destinatário: no máximo um email por dia pela fila (o segundo fica para o dia seguinte).
- Nunca sai duas vezes para a mesma vaga (trava no banco, vale entre abas).
- A IA só usa fatos do currículo; texto da vaga é dado, nunca instrução.

**Uso no dia a dia**
- Ao abrir uma vaga com email e sem rascunho salvo, o email já vem preenchido com o modelo pronto (sem gastar IA);
  "Melhorar com IA" reescreve. Nada é salvo até enviar.
- Toda ação que tira uma vaga da lista ou muda a etapa (descartar, já apliquei, mover no quadro, mudar a situação)
  mostra um aviso com **Desfazer**, que volta ao estado anterior.
- O menu mostra quantas vagas novas há e, em laranja, quantos follow-ups estão pendentes.
- A tela Hoje mostra emails enviados hoje / limite, quantos estão na fila e as respostas e devoluções recentes.
- O Painel mostra a taxa de resposta (geral, por email x pelo link e por fonte).

**Follow-up**
- Vale para "Aplicada" e "Email enviado". 15 dias sem resposta → pede follow-up.
- Por email: vai como resposta ao primeiro email, sem anexo. Pelo link: mensagem pronta para o LinkedIn.
- Depois de 2 follow-ups e mais 15 dias sem resposta → sugere mover para "Não seguiu".

**Envio em lote e fila** (valores em `config/preferencias.yaml`, seção `envio`)
- Na tela Envio em lote, a pessoa escolhe as vagas e coloca na fila; o texto vem do rascunho salvo ou do modelo pronto.
  Vaga na fila sai das listas de vagas novas.
- Quem envia é o GitHub Actions (`coletor/envio.py`), em segundo plano: só no horário configurado, com intervalo
  aleatório entre emails, até o limite diário (`envio.limite_diario`) e no máximo `envio.max_por_execucao` por rodada.
  O site dispara o envio na hora; sem isso, ele roda de hora em hora.
- Cada email da fila é reservado no banco antes de sair (nunca sai duas vezes). Se o Gmail recusar, a vaga sai da fila
  com o erro anotado e volta a ser nova.
- Modo automático (`envio.automatico`, desligado por padrão): vagas novas da coleta com email, nota ≥ a nota do modo
  automático e na lista principal entram sozinhas na fila, com o modelo pronto.
- Domínios em `dominios_email_excluidos` nunca recebem email (o endereço é descartado na coleta e na captura).

**Respostas e devoluções** (`coletor/respostas.py`)
- A cada rodada de envio e de coleta, o sistema lê só os cabeçalhos dos emails dos últimos 21 dias da caixa de entrada
  do Gmail (sem marcar como lido e sem guardar o conteúdo).
- Resposta (responde ao nosso email ou vem do endereço para quem enviamos, depois do envio) → a candidatura vai para
  "Respondeu" e o follow-up para.
- Devolução (aviso de "endereço não existe" do Gmail) → a candidatura fica marcada como devolvida, sem follow-up, com
  aviso na vaga e na tela Hoje.

**Coleta e resumo**
- Coleta completa por volta das 11:00 e das 18:30 (com posts do LinkedIn, resumo por email e follow-ups na da manhã).
- Coletas rápidas entre elas (por volta das 8:00, 14:00 e 22:00): só as plataformas, sem LinkedIn e sem email.
- O resumo lista as vagas com nota ≥ `resumo.nota_minima` que chegaram desde a coleta completa anterior.

**Análises do mercado** (`coletor/analises.py`, tabela `analises`)
- Na coleta completa, sobre as vagas que passaram pelos filtros de área, nível e local (da lista e abaixo da nota
  mínima) mais as da lista dos últimos 14 dias.
- Tipos de vaga: k-means (3 a 6 grupos, o de melhor silhueta) sobre os embeddings; nome = trilha mais comum + 2
  habilidades com maior lift no grupo; ordem pela nota média (≥70 combina muito, ≥60 bem, ≥50 em parte, abaixo, pouco).
- O que estudar: catálogo em `catalogo_habilidades`; citação só como "diferencial" não conta; "tenho" = aparece no
  currículo; prioridade = 3 × destravaria + vagas.

**Uso dos serviços** (`coletor/uso.py`, `site/lib/uso.ts`)
- A cada coleta: minutos de Actions no mês (privado: 2.000; público: sem limite), tamanho do banco e dos arquivos do
  Supabase, crédito usado no Apify. Gemini (por dia do Pacífico, quando a cota zera) e Gmail (por dia de Brasília) são
  contados a cada uso, em `uso_diario`.
- 60% = atenção, 80% = perto do limite. Ao cruzar 80%, um email de alerta (uma vez) e um aviso na tela Hoje.

**Análise de CV** (`site/lib/cv.ts`, `site/lib/ia.ts`)
- Texto analisado: o currículo do perfil (`perfil/curriculo.md`) ou uma versão colada (até 15.000 caracteres).
- Nota de 0 a 100 = média ponderada de 4 critérios, cada um de 0 a 100:
  - **Habilidades que o mercado pede** (30%): soma do % de vagas das 25 habilidades mais pedidas (O que estudar) que
    aparecem no texto, sobre a soma de todas. Sem a análise do mercado, o critério fica de fora.
  - **Resultados com números** (25%): % dos tópicos de experiência e projetos com número; 60% ou mais vale 100.
  - **Estrutura e tamanho** (20%): resumo no topo, seções de experiência, formação e habilidades, 300 a 800 palavras,
    2 a 6 tópicos por experiência (20 pontos cada).
  - **Clareza da escrita** (25%): nota da IA. Sem IA (sem chave ou sem cota), o critério fica de fora.
  - Critério fora: os pesos dos outros são redistribuídos.
- A IA também devolve nível de mercado, pontos fortes, melhorias e o que falta para o próximo nível. Uma melhoria só
  mostra o trecho do currículo se ele existir de verdade no texto (senão, o trecho é descartado).
- Para vaga: escolhida da lista, a conexão é a nota da própria vaga; colada, a IA dá a conexão. A IA lista o que
  destacar e as lacunas (só habilidades que a vaga pede e o texto não mostra).
- Perguntas do formulário (até 10, até 500 caracteres cada): respostas curtas, em primeira pessoa, só com fatos do
  texto; quando a pergunta pede algo que o texto não tem (pretensão salarial, disponibilidade...), a resposta vem
  marcada "Confira" com o que a pessoa precisa completar.
- Texto da vaga e perguntas são dados, nunca instrução. Cada análise usa 1 pedido do Flash-Lite (mais 1 do Flash
  quando há perguntas).
- Nível e próximo passo do Perfil profissional vêm da análise geral mais recente; o próximo passo é a melhoria do
  critério mais fraco, ou, se a nota do CV for 85 ou mais, a habilidade que mais destravaria vagas.

**Segurança e dados**
- Tudo exige login, menos: `/login`, `/api/capturar` e `/api/capturar/lote` (token da extensão), `/api/vigia`
  (segredo do cron) e `/api/saude` (pública, sem dados).
- Segredos só nas variáveis da Vercel e nos Secrets do GitHub. Nada de segredo no código nem no navegador.
- O repositório é público: nada de dado pessoal em arquivo versionado, artefato ou log aberto.
- Backup cifrado a cada coleta (14 dias); "Exportar meus dados" a qualquer hora.
- A conta do LinkedIn do candidato nunca é usada por automação.

## 6. Critérios de pronto (sim ou não)

- [ ] Sem login, nenhuma página ou dado abre (só a tela de login).
- [ ] Senha errada não entra; certa entra.
- [ ] O filtro "Com email" mostra só vagas com email.
- [ ] O email sai com o currículo anexado e, com duas abas, sai uma vez só.
- [ ] Arrastar um cartão no quadro muda a etapa e continua lá depois de recarregar.
- [ ] Uma candidatura com 15+ dias sem resposta aparece no quadro e o follow-up sai como resposta.
- [ ] A captura em lote recusa sem token e não repete o mesmo post.
- [ ] `/api/saude` não mostra dados; `/api/vigia` exige o segredo do cron.
- [ ] "Exportar meus dados" baixa todas as candidaturas.
- [ ] A página inicial (Hoje) mostra vagas com email, triagem, follow-ups e andamento.
- [ ] Na triagem, D descarta e Z desfaz (a vaga volta para a lista).
- [ ] Descartar uma vaga na lista mostra "Desfazer", e desfazer devolve a vaga.
- [ ] Ao abrir uma vaga com email, o email já está preenchido.
- [ ] O menu mostra o número de follow-ups pendentes.
- [ ] Configurações mostra os primeiros passos, com o que falta.
- [ ] Uma análise geral do CV aparece no histórico com nota, variação e os 4 critérios.
- [ ] Uma análise para vaga com perguntas mostra a conexão e uma resposta para cada pergunta.
- [ ] O Perfil profissional mostra o nível, o próximo passo e a evolução das notas.
- [ ] O menu abre o módulo da página atual; no celular, Perfil está na barra de baixo.
- [ ] Envio em lote: as vagas com email aparecem com o email pronto; as marcadas entram na fila e saem das listas de novas.
- [ ] O envio da fila respeita horário, intervalo, limite diário e nunca envia duas vezes.
- [ ] Uma resposta no Gmail move a candidatura para "Respondeu"; um email devolvido marca a candidatura.
- [ ] A coleta rápida não usa o LinkedIn nem manda resumo.
- [ ] Hoje mostra "enviados hoje / limite"; o Painel mostra a taxa de resposta.
- [ ] Nenhuma página principal rola para o lado no celular (390 px).
- [ ] Lighthouse no celular: desempenho ≥ 90 e acessibilidade ≥ 95 nas páginas principais.
- [ ] O backup da coleta abre com a senha e confere com o banco.

Os critérios marcados com teste automático estão em `site/e2e/site.spec.ts` (site) e `tests/` (coletor).

## Fora desta versão

- Conta compartilhada / vários usuários no mesmo site (cada pessoa roda a própria cópia).
- Candidatura automática em plataformas (Gupy etc.): a candidatura pelo link é sempre feita pela pessoa.
- Automação na conta do LinkedIn do candidato.
- Aviso por WhatsApp.
