-- Schema do busca_vagas (Supabase / Postgres).
-- Rode uma vez no SQL Editor do Supabase.
--
-- Segurança: RLS ligado e NENHUMA policy para anon/authenticated.
-- Só o servidor (coletor no Actions e as rotas do site, com a service role key) lê e escreve.

-- Vagas coletadas e ranqueadas. Reescrita a cada coleta (upsert por id).
create table if not exists vagas (
  id                  text primary key,          -- "<fonte>:<id na origem>"
  fonte               text not null,             -- gupy | remotar | github
  titulo              text not null,
  empresa             text,
  url                 text,
  descricao           text,
  cidade              text,
  estado              text,
  modalidade          text,                      -- remoto | hibrido | presencial
  publicada_em        timestamptz,
  email_contato       text,
  emails              text[] default '{}',
  trilha              text,
  nivel               text,
  nota                numeric(5,1),
  lista               text,                      -- principal | vale_tentar
  motivos             text[] default '{}',
  habilidades_ok      text[] default '{}',
  habilidades_faltando text[] default '{}',
  componentes         jsonb default '{}',
  termo_busca         text,
  primeira_vez_em     timestamptz not null default now(),
  atualizada_em       timestamptz not null default now()
);
create index if not exists vagas_lista_nota on vagas (lista, nota desc);
create index if not exists vagas_primeira_vez on vagas (primeira_vez_em desc);

-- O que VOCÊ fez com cada vaga. Separado de "vagas" para a coleta nunca apagar suas ações.
create table if not exists candidaturas (
  vaga_id        text primary key references vagas(id) on delete cascade,
  status         text not null default 'nova',   -- nova | descartada | rascunho | enviada | respondeu | entrevista | recusada | proposta
  email_assunto  text,
  email_corpo    text,
  email_para     text,
  enviada_em     timestamptz,
  notas          text,
  atualizada_em  timestamptz not null default now()
);

-- Log de cada execução do coletor (vira gráfico de "vagas por dia" no site).
create table if not exists execucoes (
  id             bigint generated always as identity primary key,
  iniciada_em    timestamptz not null default now(),
  duracao_s      numeric,
  coletadas      jsonb,     -- por fonte
  descartes      jsonb,     -- por motivo
  principal      int,
  vale_tentar    int,
  backend        text
);

alter table vagas        enable row level security;
alter table candidaturas enable row level security;
alter table execucoes    enable row level security;

-- Permissões explícitas: funciona mesmo com "Automatically expose new tables" desligado.
-- Só o service_role (servidor) acessa; anon/authenticated (navegador) não enxergam nada.
grant usage on schema public to service_role;
grant select, insert, update, delete on vagas, candidaturas, execucoes to service_role;
grant usage, select on all sequences in schema public to service_role;
revoke all on vagas, candidaturas, execucoes from anon, authenticated;

-- 21/10/2026: resumo direto da vaga gerado pela IA (o site guarda aqui para não gerar de novo).
alter table vagas add column if not exists resumo jsonb;

-- 21/10/2026: de onde veio o email do recrutador: vaga (estava no texto) | site_rh | site_contato
alter table vagas add column if not exists email_origem text;

-- 21/10/2026: follow-up das candidaturas e aprendizado do ranking.
alter table candidaturas add column if not exists followup_em      timestamptz;          -- último follow-up feito
alter table candidaturas add column if not exists followups        int not null default 0; -- quantos já foram feitos
alter table candidaturas add column if not exists email_message_id text;                 -- para o follow-up ir na mesma conversa
alter table execucoes    add column if not exists aprendizado      jsonb;                -- quantos sinais o ranking usou

-- 21/10/2026 (noite): envio em lote e respostas lidas do Gmail.
alter table candidaturas add column if not exists fila_em      timestamptz;  -- na fila de envio desde
alter table candidaturas add column if not exists fila_erro    text;         -- por que o envio da fila falhou
alter table candidaturas add column if not exists resposta_em  timestamptz;  -- quando o recrutador respondeu (lido do Gmail)
alter table candidaturas add column if not exists devolvido_em timestamptz;  -- quando o email voltou (endereço não existe)
create index if not exists candidaturas_fila on candidaturas (fila_em) where fila_em is not null;
alter table execucoes    add column if not exists tipo         text;         -- completa | rapida
