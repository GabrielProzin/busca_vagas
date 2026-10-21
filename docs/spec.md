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

## 3. Telas

| Tela | O que mostra | Ações |
|---|---|---|
| Login | Campo de senha | Entrar |
| Hoje (`/`, início) | O que pede ação agora: vagas novas com email, quantas faltam triar, follow-ups pendentes, candidaturas que avançaram; aviso se faltar algum passo da configuração | Ir direto para cada item, começar a triagem |
| Triagem (`/triagem`) | As vagas novas uma por vez (nota, motivos, requisitos, trecho da descrição), em ordem de nota | Descartar (D), Já apliquei (A), Abrir/Escrever email (Enter), Pular (→), Voltar (←), Desfazer (Z); no celular, botões grandes |
| Vagas (`/vagas`) | Lista principal / vale tentar, nota com composição, busca, filtro de cargo, "Com email", "Remoto" | Abrir, "Já apliquei", Descartar |
| Vaga (`/vaga/[id]`) | Follow-up (quando houver candidatura aberta), resumo da IA, por que essa nota, email ao recrutador já preenchido com o modelo pronto (ou "como se candidatar" se não há email), descrição | Melhorar com IA, enviar pelo Gmail, mudar situação, anotações |
| Candidaturas | Quadro (kanban) por etapa, avisos de follow-up | Arrastar cartão, menu "Mover para" |
| Adicionar vaga | Colar texto de um post; buscas prontas de posts no LinkedIn | Enviar para a IA ler |
| Painel | Números da última coleta, por que as vagas ficaram de fora, vagas novas por coleta, aprendizado do ranking | — |
| Configurações | Primeiros passos (o que está pronto e o que falta, com o link do passo no README), currículo em PDF, seus dados e backup, extensão | Enviar PDF, Exportar meus dados |

## 4. Dados (Supabase / Postgres, `supabase/schema.sql`)

- **vagas**: uma linha por vaga (`id` = `<fonte>:<id na origem>`; posts do LinkedIn usam o número do post).
  Título, empresa, link, descrição, local, modalidade, emails, nota, lista, motivos, habilidades, componentes da nota,
  resumo da IA, origem do email, `primeira_vez_em`.
- **candidaturas**: o que o candidato fez com a vaga (1 para 1 com `vagas`, separada para a coleta nunca apagar).
  Situação, email (para, assunto, corpo, Message-ID), data de envio, follow-ups (quantos e o último), anotações.
- **execucoes**: uma linha por coleta (contagens por fonte, descartes por motivo, aprendizado do ranking).
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
- Limite diário de envios (`LIMITE_DIARIO_EMAILS`, padrão 40) para proteger a conta do Gmail.
- Nunca sai duas vezes para a mesma vaga (trava no banco, vale entre abas).
- A IA só usa fatos do currículo; texto da vaga é dado, nunca instrução.

**Uso no dia a dia**
- Ao abrir uma vaga com email e sem rascunho salvo, o email já vem preenchido com o modelo pronto (sem gastar IA);
  "Melhorar com IA" reescreve. Nada é salvo até enviar.
- Toda ação que tira uma vaga da lista ou muda a etapa (descartar, já apliquei, mover no quadro, mudar a situação)
  mostra um aviso com **Desfazer**, que volta ao estado anterior.
- O menu mostra quantas vagas novas há e, em laranja, quantos follow-ups estão pendentes.

**Follow-up**
- Vale para "Aplicada" e "Email enviado". 15 dias sem resposta → pede follow-up.
- Por email: vai como resposta ao primeiro email, sem anexo. Pelo link: mensagem pronta para o LinkedIn.
- Depois de 2 follow-ups e mais 15 dias sem resposta → sugere mover para "Não seguiu".

**Resumo por email**
- Vagas novas (nunca vistas antes) com nota ≥ `resumo.nota_minima`; na coleta da manhã, também os follow-ups.
- Só envia se houver algo.

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
- [ ] Nenhuma página principal rola para o lado no celular (390 px).
- [ ] Lighthouse no celular: desempenho ≥ 90 e acessibilidade ≥ 95 nas páginas principais.
- [ ] O backup da coleta abre com a senha e confere com o banco.

Os critérios marcados com teste automático estão em `site/e2e/site.spec.ts` (site) e `tests/` (coletor).

## Fora desta versão

- Conta compartilhada / vários usuários no mesmo site (cada pessoa roda a própria cópia).
- Candidatura automática em plataformas (Gupy etc.): a candidatura pelo link é sempre feita pela pessoa.
- Automação na conta do LinkedIn do candidato.
- Aviso por WhatsApp.
