import "server-only";
import { cache } from "react";
import { readFileSync } from "node:fs";
import { preferenciasPadrao, type Preferencias } from "./preferencias";
import { supabaseChave, supabaseUrl } from "./ambiente";
import { resolverCidade } from "./municipios";
import type { AnaliseCV, AnaliseEstudar, AnaliseTipos, Candidatura, Execucao, Status, UsoDiario, UsoServico, Vaga } from "./tipos";

// Acesso ao Supabase pela API REST (PostgREST), sempre no servidor, com a chave secreta.
// Com DEMO_ARQUIVO definido, usa um JSON local em memória (para desenvolver sem banco).

function base(): string {
  const url = supabaseUrl();
  if (!url) throw new Error("SUPABASE_URL não configurada");
  let raiz = url.trim().replace(/\/+$/, "");
  if (raiz.endsWith("/rest/v1")) raiz = raiz.slice(0, -"/rest/v1".length);
  return raiz + "/rest/v1";
}

function cabecalhos(extra: Record<string, string> = {}): Record<string, string> {
  const chave = supabaseChave();
  if (!chave) throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada");
  const h: Record<string, string> = { apikey: chave, "Content-Type": "application/json", ...extra };
  if (!chave.startsWith("sb_")) h.Authorization = `Bearer ${chave}`;
  return h;
}

async function rest<T>(caminho: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(base() + caminho, { ...init, cache: "no-store", headers: { ...cabecalhos(), ...(init.headers as Record<string, string>) } });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const texto = await r.text();
  return (texto ? JSON.parse(texto) : null) as T;
}

// ---------------------------------------------------------------- modo demo
type Demo = { vagas: Vaga[]; candidaturas: Map<string, Candidatura>; execucoes: Execucao[]; servicos: UsoServico[]; diario: Map<string, number>; analisesCv: AnaliseCV[] };
// globalThis: rotas de API e páginas podem carregar cópias separadas deste módulo.
const G = globalThis as unknown as { __demoBV?: Demo };
function emDemo(): Demo | null {
  const arq = process.env.DEMO_ARQUIVO;
  if (!arq) return null;
  if (!G.__demoBV) {
    const j = JSON.parse(readFileSync(arq, "utf-8"));
    const agora = new Date().toISOString();
    G.__demoBV = {
      vagas: (j.vagas as Vaga[]).map((v) => ({ ...v, primeira_vez_em: agora, atualizada_em: agora, candidatura: null })),
      // O arquivo de demonstração pode trazer candidaturas prontas (ex.: para ver o follow-up).
      // Datas relativas ("enviada_em_dias_atras": 16) para o arquivo não envelhecer.
      candidaturas: new Map(((j.candidaturas ?? []) as Record<string, unknown>[]).map((bruta) => {
        const c: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(bruta)) {
          if (k.endsWith("_dias_atras")) c[k.replace("_dias_atras", "")] = new Date(Date.now() - Number(v) * 864e5).toISOString();
          else c[k] = v;
        }
        return [c.vaga_id as string, c as unknown as Candidatura];
      })),
      execucoes: [{ id: 1, iniciada_em: agora, ...j.execucao }],
      // Uso dos serviços: medições prontas; contadores do dia como "dias_atras|chave" -> n.
      servicos: ((j.uso?.servicos ?? []) as UsoServico[]).map((s) => ({ ...s, atualizado_em: agora })),
      diario: new Map(((j.uso?.diario ?? []) as { dias_atras: number; chave: string; n: number }[]).map((d) => [
        // O dia no mesmo fuso que o site conta (Gemini: Pacífico; o resto: Brasília). Com o dia em UTC, o teste
        // falhava depois das 21h de Brasília.
        `${diaEm(d.chave.startsWith("gemini") ? "America/Los_Angeles" : "America/Sao_Paulo", new Date(Date.now() - d.dias_atras * 864e5))}|${d.chave}`, d.n,
      ])),
      // Análises de CV prontas para ver o histórico; "dias_atras" vira a data.
      analisesCv: ((j.analises_cv ?? []) as (Omit<AnaliseCV, "id" | "criada_em"> & { dias_atras: number })[]).map(({ dias_atras, ...a }, i) => ({
        ...a, id: i + 1, criada_em: new Date(Date.now() - dias_atras * 864e5).toISOString(),
      })),
    };
  }
  return G.__demoBV;
}

function comCandidatura(v: Vaga & { candidatura?: Candidatura | Candidatura[] | null }): Vaga {
  const c = Array.isArray(v.candidatura) ? v.candidatura[0] ?? null : v.candidatura ?? null;
  return { ...v, candidatura: c };
}

// ---------------------------------------------------------------- leitura
// "*" em vez de colunas fixas: colunas novas (email_origem, resumo) aparecem quando existirem no banco,
// sem quebrar enquanto o ALTER não foi rodado. A descrição vem junto; o volume é pequeno.
const CAMPOS_LISTA = "*";

/** Vagas vistas pela coleta nos últimos `dias` dias (as outras provavelmente fecharam). */
export const listarVagas = cache(async function listarVagas(dias = 3): Promise<Vaga[]> {
  const d = emDemo();
  if (d) return d.vagas.map((v) => ({ ...v, candidatura: d.candidaturas.get(v.id) ?? null }));
  const desde = new Date(Date.now() - dias * 864e5).toISOString();
  const linhas = await rest<Vaga[]>(
    `/vagas?select=${CAMPOS_LISTA},candidatura:candidaturas(*)&atualizada_em=gte.${encodeURIComponent(desde)}&order=nota.desc`,
  );
  return linhas.map(comCandidatura);
});

export async function buscarVaga(id: string): Promise<Vaga | null> {
  const d = emDemo();
  if (d) {
    const v = d.vagas.find((x) => x.id === id);
    return v ? { ...v, candidatura: d.candidaturas.get(id) ?? null } : null;
  }
  const linhas = await rest<Vaga[]>(`/vagas?select=*,candidatura:candidaturas(*)&id=eq.${encodeURIComponent(id)}`);
  return linhas[0] ? comCandidatura(linhas[0]) : null;
}

/** Vagas com alguma ação sua (aplicada, enviada, entrevista...), de qualquer data. */
export const listarCandidaturas = cache(async function listarCandidaturas(): Promise<Vaga[]> {
  const d = emDemo();
  if (d) {
    return d.vagas
      .filter((v) => !["nova", "descartada", undefined].includes(d.candidaturas.get(v.id)?.status))
      .map((v) => ({ ...v, candidatura: d.candidaturas.get(v.id)! }));
  }
  const linhas = await rest<Vaga[]>(
    `/vagas?select=${CAMPOS_LISTA},candidatura:candidaturas!inner(*)&candidatura.status=not.in.(nova,descartada)&order=atualizada_em.desc`,
  );
  return linhas.map(comCandidatura);
});

export type Chegada = { fonte: string; nota: number | null; lista: string | null; primeira_vez_em: string };

/** Quando cada vaga apareceu pela primeira vez (para contar as novas de cada coleta). */
export const listarChegadas = cache(async function listarChegadas(dias = 30): Promise<Chegada[]> {
  const d = emDemo();
  const manual = (f: string) => f === "linkedin" || f === "manual";
  if (d) return d.vagas.filter((v) => !manual(v.fonte)).map(({ fonte, nota, lista, primeira_vez_em }) => ({ fonte, nota, lista, primeira_vez_em }));
  const desde = new Date(Date.now() - dias * 864e5).toISOString();
  const linhas = await rest<Chegada[]>(
    `/vagas?select=fonte,nota,lista,primeira_vez_em&primeira_vez_em=gte.${encodeURIComponent(desde)}&order=primeira_vez_em.desc&limit=5000`,
  );
  return linhas.filter((v) => !manual(v.fonte));
});

export const listarExecucoes = cache(async function listarExecucoes(limite = 30): Promise<Execucao[]> {
  const d = emDemo();
  if (d) return d.execucoes;
  return rest<Execucao[]>(`/execucoes?select=*&order=iniciada_em.desc&limit=${limite}`);
});

// ---------------------------------------------------------------- escrita
export async function salvarCandidatura(vagaId: string, campos: Partial<Omit<Candidatura, "vaga_id">>): Promise<void> {
  const agora = new Date().toISOString();
  const d = emDemo();
  if (d) {
    const atual = d.candidaturas.get(vagaId);
    d.candidaturas.set(vagaId, {
      vaga_id: vagaId, status: "nova", email_assunto: null, email_corpo: null, email_para: null,
      enviada_em: null, notas: null, ...atual, ...campos, atualizada_em: agora,
    } as Candidatura);
    return;
  }
  await rest(`/candidaturas?on_conflict=vaga_id`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ vaga_id: vagaId, ...campos, atualizada_em: agora }),
  });
}

/** Guarda o resumo da IA para não gerar de novo. Sem a coluna "resumo" no banco, só não guarda. */
export async function salvarResumo(id: string, resumo: unknown): Promise<boolean> {
  const d = emDemo();
  if (d) {
    d.vagas = d.vagas.map((v) => (v.id === id ? { ...v, resumo: resumo as Vaga["resumo"] } : v));
    return true;
  }
  try {
    await rest(`/vagas?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ resumo }),
    });
    return true;
  } catch {
    return false;
  }
}

/** Emails de candidatura enviados hoje (horário de Brasília), pelo site ou pela fila, para o limite diário.
 *  Conta também os que já avançaram (ex.: enviada hoje e já respondeu). Mesma regra de coletor/envio.py. */
export async function enviadosHoje(): Promise<number> {
  const inicio = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) + "T00:00:00-03:00").toISOString();
  const d = emDemo();
  if (d) {
    return [...d.candidaturas.values()].filter(
      (c) => c.email_para && !["nova", "aplicada", "descartada"].includes(c.status) && (c.enviada_em ?? "") >= inicio,
    ).length;
  }
  const linhas = await rest<{ vaga_id: string }[]>(
    `/candidaturas?select=vaga_id&enviada_em=gte.${encodeURIComponent(inicio)}&email_para=not.is.null&status=not.in.(nova,aplicada,descartada)`,
  );
  return linhas.length;
}

// ---------------------------------------------------------------- fila de envio
export type ItemFila = { vagaId: string; para: string; assunto: string; corpo: string };
export type NaFila = Candidatura & { vaga: Pick<Vaga, "id" | "titulo" | "empresa" | "nota" | "fonte"> | null };

/** Coloca na fila. Só mexe em vagas sem decisão (sem candidatura ou "nova"): nunca reenvia nem desfaz uma escolha sua. */
export async function enfileirarVagas(itens: ItemFila[]): Promise<string[]> {
  const agora = new Date().toISOString();
  const d = emDemo();
  const aceitas: string[] = [];
  for (const it of itens) {
    const campos = { status: "nova" as const, email_para: it.para, email_assunto: it.assunto, email_corpo: it.corpo, fila_em: agora, fila_erro: null };
    if (d) {
      const atual = d.candidaturas.get(it.vagaId);
      if (atual && atual.status !== "nova") continue;
      await salvarCandidatura(it.vagaId, campos);
      aceitas.push(it.vagaId);
      continue;
    }
    const id = encodeURIComponent(it.vagaId);
    const mudou = await rest<Candidatura[]>(`/candidaturas?vaga_id=eq.${id}&status=eq.nova`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ ...campos, atualizada_em: agora }),
    });
    if (mudou.length) {
      aceitas.push(it.vagaId);
      continue;
    }
    const criada = await rest<Candidatura[]>(`/candidaturas?on_conflict=vaga_id`, {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify({ vaga_id: it.vagaId, ...campos, atualizada_em: agora }),
    });
    if (criada.length) aceitas.push(it.vagaId);
  }
  return aceitas;
}

/** Tira da fila (se ainda não saiu). A vaga volta para as novas. */
export async function tirarVagaDaFila(vagaId: string): Promise<boolean> {
  const d = emDemo();
  if (d) {
    const c = d.candidaturas.get(vagaId);
    if (!c?.fila_em || c.status !== "nova") return false;
    d.candidaturas.set(vagaId, { ...c, fila_em: null, atualizada_em: new Date().toISOString() });
    return true;
  }
  const linhas = await rest<Candidatura[]>(`/candidaturas?vaga_id=eq.${encodeURIComponent(vagaId)}&status=eq.nova&fila_em=not.is.null`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ fila_em: null, atualizada_em: new Date().toISOString() }),
  });
  return linhas.length === 1;
}

/** O que está esperando na fila e o que falhou nela (para a tela Envio em lote). */
export async function listarFila(): Promise<{ esperando: NaFila[]; falharam: NaFila[] }> {
  const d = emDemo();
  let linhas: NaFila[];
  if (d) {
    linhas = [...d.candidaturas.values()]
      .filter((c) => c.status === "nova" && (c.fila_em || c.fila_erro))
      .map((c) => {
        const v = d.vagas.find((x) => x.id === c.vaga_id);
        return { ...c, vaga: v ? { id: v.id, titulo: v.titulo, empresa: v.empresa, nota: v.nota, fonte: v.fonte } : null };
      });
  } else {
    if (!(await filaPronta())) return { esperando: [], falharam: [] };
    linhas = await rest<NaFila[]>(
      `/candidaturas?select=*,vaga:vagas(id,titulo,empresa,nota,fonte)&status=eq.nova&or=(fila_em.not.is.null,fila_erro.not.is.null)&order=fila_em.asc.nullslast`,
    );
  }
  const semana = Date.now() - 7 * 864e5; // falhas antigas saem da tela
  return {
    esperando: linhas.filter((c) => c.fila_em),
    falharam: linhas.filter((c) => !c.fila_em && c.fila_erro && Date.parse(c.atualizada_em) > semana),
  };
}

// O banco só tem as colunas da fila depois do SQL de 21/10 (noite). Confere uma vez por processo.
let filaOk = false;
export async function filaPronta(): Promise<boolean> {
  if (filaOk || emDemo()) return true;
  try {
    await rest(`/candidaturas?select=fila_em,fila_erro,resposta_em,devolvido_em&limit=1`);
    filaOk = true;
  } catch {
    return false;
  }
  return true;
}

/** Grava uma vaga vinda da extensão ou do "Adicionar vaga" (fonte linkedin/manual). */
export async function gravarVaga(v: Omit<Vaga, "candidatura" | "primeira_vez_em" | "atualizada_em"> & { descricao: string }): Promise<void> {
  const agora = new Date().toISOString();
  const d = emDemo();
  if (d) {
    d.vagas = [{ ...v, primeira_vez_em: agora, atualizada_em: agora, candidatura: null }, ...d.vagas.filter((x) => x.id !== v.id)];
    return;
  }
  await rest(`/vagas?on_conflict=id`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ ...v, atualizada_em: agora }),
  });
}

async function candidaturaAtual(vagaId: string): Promise<Candidatura | null> {
  const d = emDemo();
  if (d) return d.candidaturas.get(vagaId) ?? null;
  const linhas = await rest<Candidatura[]>(`/candidaturas?select=*&vaga_id=eq.${encodeURIComponent(vagaId)}`);
  return linhas[0] ?? null;
}

export async function mudarStatus(vagaId: string, status: Status): Promise<void> {
  const campos: Partial<Candidatura> = { status };
  if (status === "aplicada" || status === "enviada") {
    // A data do envio só muda quando a candidatura nasce ou passa de "pelo link" para "por email".
    // Arrastar de volta no kanban (ex.: de Entrevista para Aplicada) não reinicia a contagem do follow-up.
    const atual = await candidaturaAtual(vagaId);
    if (!atual?.enviada_em || (atual.status === "aplicada" && status === "enviada")) campos.enviada_em = new Date().toISOString();
  }
  await salvarCandidatura(vagaId, campos);
}

// O Supabase guarda as colunas do follow-up só depois do ALTER de 21/10. Confere uma vez por processo.
let followupOk = false;
export async function followupPronto(): Promise<boolean> {
  if (followupOk || emDemo()) return true;
  try {
    await rest(`/candidaturas?select=followup_em,followups,email_message_id&limit=1`);
    followupOk = true;
  } catch {
    return false;
  }
  return true;
}

/** Guarda o Message-ID do email enviado (para o follow-up ir na mesma conversa). Sem a coluna, só não guarda. */
export async function salvarMessageId(vagaId: string, messageId: string): Promise<void> {
  if (!(await followupPronto())) return;
  await salvarCandidatura(vagaId, { email_message_id: messageId }).catch(() => undefined);
}


/** Tudo o que é seu: candidaturas (inclusive descartes) com a vaga de cada uma. Para "Exportar meus dados". */
export async function exportarDados(): Promise<{ candidaturas: Candidatura[]; vagas: Vaga[] }> {
  const d = emDemo();
  if (d) {
    const candidaturas = [...d.candidaturas.values()];
    const ids = new Set(candidaturas.map((c) => c.vaga_id));
    return { candidaturas, vagas: d.vagas.filter((v) => ids.has(v.id)).map((v) => ({ ...v, candidatura: null })) };
  }
  const linhas = await rest<(Candidatura & { vaga: Vaga | null })[]>(`/candidaturas?select=*,vaga:vagas(*)&order=atualizada_em.desc`);
  return {
    candidaturas: linhas.map(({ vaga: _v, ...c }) => c as Candidatura),
    vagas: linhas.map((l) => l.vaga).filter((v): v is Vaga => Boolean(v)),
  };
}


// ---------------------------------------------------------------- trava contra envio duplo
// Duas abas clicando "Enviar" ao mesmo tempo: só uma consegue reservar o envio, numa única
// atualização condicional no banco. Se o Gmail falhar, a reserva é desfeita.

/** Reserva o envio da candidatura. false = já foi enviada (ou outra aba está enviando agora). */
export async function reservarEnvio(vagaId: string): Promise<{ ok: boolean; anterior: Pick<Candidatura, "status" | "enviada_em"> | null }> {
  const agora = new Date().toISOString();
  const d = emDemo();
  if (d) {
    const c = d.candidaturas.get(vagaId);
    if (!c || c.status === "enviada") return { ok: false, anterior: null };
    d.candidaturas.set(vagaId, { ...c, status: "enviada", enviada_em: agora, atualizada_em: agora });
    return { ok: true, anterior: { status: c.status, enviada_em: c.enviada_em } };
  }
  const antes = await rest<Candidatura[]>(`/candidaturas?select=status,enviada_em&vaga_id=eq.${encodeURIComponent(vagaId)}`);
  const linhas = await rest<Candidatura[]>(`/candidaturas?vaga_id=eq.${encodeURIComponent(vagaId)}&status=neq.enviada`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ status: "enviada", enviada_em: agora, atualizada_em: agora }),
  });
  return { ok: linhas.length === 1, anterior: antes[0] ? { status: antes[0].status, enviada_em: antes[0].enviada_em } : null };
}

/** Reserva um follow-up: só passa se ninguém registrou outro follow-up desde que a página foi aberta. */
export async function reservarFollowup(vagaId: string, feitos: number): Promise<{ ok: boolean; anterior: string | null }> {
  const agora = new Date().toISOString();
  const d = emDemo();
  if (d) {
    const c = d.candidaturas.get(vagaId);
    if (!c || (c.followups ?? 0) !== feitos) return { ok: false, anterior: null };
    d.candidaturas.set(vagaId, { ...c, followups: feitos + 1, followup_em: agora, atualizada_em: agora });
    return { ok: true, anterior: c.followup_em ?? null };
  }
  const antes = await rest<Candidatura[]>(`/candidaturas?select=followup_em&vaga_id=eq.${encodeURIComponent(vagaId)}`);
  const linhas = await rest<Candidatura[]>(`/candidaturas?vaga_id=eq.${encodeURIComponent(vagaId)}&followups=eq.${feitos}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ followups: feitos + 1, followup_em: agora, atualizada_em: agora }),
  });
  return { ok: linhas.length === 1, anterior: antes[0]?.followup_em ?? null };
}


/** O SQL inteiro do supabase/schema.sql foi rodado? (as colunas mais novas existem) */
export async function schemaCompleto(): Promise<boolean> {
  if (emDemo()) return true;
  try {
    await Promise.all([
      rest(`/vagas?select=resumo,email_origem&limit=1`),
      rest(`/candidaturas?select=followup_em,followups,email_message_id&limit=1`),
      rest(`/execucoes?select=aprendizado,tipo&limit=1`),
      rest(`/candidaturas?select=fila_em,fila_erro,resposta_em,devolvido_em&limit=1`),
      rest(`/analises_cv?select=id&limit=1`),
      rest(`/preferencias?select=id&limit=1`),
      rest(`/configuracao?select=chave&limit=1`),
    ]);
    return true;
  } catch {
    return false;
  }
}


// ---------------------------------------------------------------- uso dos serviços
// Medições da coleta (GitHub, Supabase, Apify) e contadores do dia (Gemini, Gmail). Tudo opcional:
// sem as tabelas do SQL novo, o site funciona igual e a página Uso só avisa que falta rodar o SQL.

/** Dia de hoje (AAAA-MM-DD) num fuso. O Gemini zera a cota à meia-noite do Pacífico; o resto, no horário de Brasília. */
export function diaEm(fuso: string, quando = new Date()): string {
  return quando.toLocaleDateString("en-CA", { timeZone: fuso });
}

/** Soma 1 (ou n) no contador do dia. Nunca falha para quem chamou: o monitor é um extra. */
export async function contarUso(chave: string, n = 1, fuso = "America/Sao_Paulo"): Promise<void> {
  const dia = diaEm(fuso);
  const d = emDemo();
  if (d) {
    const k = `${dia}|${chave}`;
    d.diario.set(k, (d.diario.get(k) ?? 0) + n);
    return;
  }
  try {
    await rest(`/rpc/somar_uso`, { method: "POST", body: JSON.stringify({ p_dia: dia, p_chave: chave, p_n: n }) });
  } catch (e) {
    console.info("uso: contador não somado:", chave, String(e).slice(0, 120));
  }
}

/** Últimas medições e os contadores dos últimos 8 dias. null = tabelas ainda não criadas. */
export async function lerUso(): Promise<{ servicos: UsoServico[]; diario: UsoDiario[] } | null> {
  const d = emDemo();
  if (d) {
    return {
      servicos: d.servicos,
      diario: [...d.diario.entries()].map(([k, n]) => {
        const [dia, chave] = k.split("|");
        return { dia, chave, n };
      }),
    };
  }
  try {
    const desde = new Date(Date.now() - 8 * 864e5).toISOString().slice(0, 10);
    const [servicos, diario] = await Promise.all([
      rest<UsoServico[]>(`/uso_servicos?select=*`),
      rest<UsoDiario[]>(`/uso_diario?select=*&dia=gte.${desde}&order=dia.asc`),
    ]);
    return { servicos, diario };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- análises do mercado
/** Tipos de vaga ou O que estudar (gerados pela coleta completa). null = ainda não gerado ou tabela ausente. */
export async function lerAnalise(nome: "tipos"): Promise<AnaliseTipos | null>;
export async function lerAnalise(nome: "estudar"): Promise<AnaliseEstudar | null>;
export async function lerAnalise(nome: "tipos" | "estudar"): Promise<AnaliseTipos | AnaliseEstudar | null> {
  if (process.env.DEMO_ARQUIVO) {
    const j = JSON.parse(readFileSync(process.env.DEMO_ARQUIVO, "utf-8"));
    const a = j.analises?.[nome];
    return a ? { ...a, gerado_em: new Date().toISOString() } : null;
  }
  try {
    const linhas = await rest<{ dados: AnaliseTipos | AnaliseEstudar }[]>(`/analises?select=dados&nome=eq.${nome}`);
    return linhas[0]?.dados ?? null;
  } catch {
    return null;
  }
}


// ---------------------------------------------------------------- análises do currículo
// Histórico de Meu perfil > Análise de CV. Sem a tabela (SQL antigo), a lista vem vazia e salvar avisa.

export async function listarAnalisesCV(limite = 100): Promise<AnaliseCV[]> {
  const d = emDemo();
  if (d) return [...d.analisesCv].sort((a, b) => b.criada_em.localeCompare(a.criada_em)).slice(0, limite);
  try {
    return await rest<AnaliseCV[]>(`/analises_cv?select=*&order=criada_em.desc&limit=${limite}`);
  } catch (e) {
    console.error("analises_cv:", e);
    return [];
  }
}

export async function buscarAnaliseCV(id: number): Promise<AnaliseCV | null> {
  const d = emDemo();
  if (d) return d.analisesCv.find((a) => a.id === id) ?? null;
  const linhas = await rest<AnaliseCV[]>(`/analises_cv?select=*&id=eq.${id}`);
  return linhas[0] ?? null;
}

export async function salvarAnaliseCV(a: Omit<AnaliseCV, "id" | "criada_em">): Promise<number> {
  const d = emDemo();
  if (d) {
    const id = Math.max(0, ...d.analisesCv.map((x) => x.id)) + 1;
    d.analisesCv.push({ ...a, id, criada_em: new Date().toISOString() });
    return id;
  }
  const linhas = await rest<{ id: number }[]>(`/analises_cv?select=id`, {
    method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(a),
  });
  return linhas[0].id;
}

export async function excluirAnaliseCV(id: number): Promise<void> {
  const d = emDemo();
  if (d) {
    d.analisesCv = d.analisesCv.filter((a) => a.id !== id);
    return;
  }
  await rest(`/analises_cv?id=eq.${id}`, { method: "DELETE" });
}


// ---------------------------------------------------------------- preferências da busca
// Uma linha (id = 1) com o que a pessoa salvou na tela Preferências. Sem linha (ou sem a tabela), vale o YAML.
const GP = globalThis as unknown as { __prefsBV?: { prefs: Preferencias; salvas_em: string } | null };

/** Preferências salvas antes de existirem campos novos (contrato, empresas) ou com cidade sem estado ("Goiânia"). */
function completarPreferencias(salvas: Partial<Preferencias>): Preferencias {
  const p = { ...preferenciasPadrao(), ...salvas };
  p.cidades = p.cidades.map((c) => resolverCidade(c, p.estado));
  return p;
}

export async function lerPreferencias(): Promise<{ prefs: Preferencias; salvas_em: string | null }> {
  if (process.env.DEMO_ARQUIVO) {
    const p = GP.__prefsBV;
    return p ? { prefs: completarPreferencias(p.prefs), salvas_em: p.salvas_em } : { prefs: preferenciasPadrao(), salvas_em: null };
  }
  try {
    const linhas = await rest<{ dados: Preferencias; atualizado_em: string }[]>(`/preferencias?select=dados,atualizado_em&id=eq.1`);
    if (linhas[0]) return { prefs: completarPreferencias(linhas[0].dados), salvas_em: linhas[0].atualizado_em };
  } catch (e) {
    console.error("preferencias:", e);
  }
  return { prefs: preferenciasPadrao(), salvas_em: null };
}

export async function salvarPreferencias(prefs: Preferencias | null): Promise<void> {
  if (process.env.DEMO_ARQUIVO) {
    GP.__prefsBV = prefs ? { prefs, salvas_em: new Date().toISOString() } : null;
    return;
  }
  if (!prefs) {
    await rest(`/preferencias?id=eq.1`, { method: "DELETE" });
    return;
  }
  await rest(`/preferencias?on_conflict=id`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ id: 1, dados: prefs, atualizado_em: new Date().toISOString() }),
  });
}


// ---------------------------------------------------------------- configuração (segredos cifrados)
// Chave -> valor cifrado (lib/cripto.ts). Só o servidor lê; quem chama é lib/segredos.ts.
const GC = globalThis as unknown as { __configBV?: Map<string, string> };

export async function lerConfiguracao(): Promise<Record<string, string>> {
  if (process.env.DEMO_ARQUIVO) return Object.fromEntries(GC.__configBV ?? new Map());
  const linhas = await rest<{ chave: string; valor: string | null }[]>(`/configuracao?select=chave,valor`);
  return Object.fromEntries(linhas.filter((l) => l.valor).map((l) => [l.chave, l.valor as string]));
}

export async function gravarConfiguracao(linhas: { chave: string; valor: string | null }[]): Promise<void> {
  if (process.env.DEMO_ARQUIVO) {
    GC.__configBV ??= new Map();
    for (const l of linhas) (l.valor ? GC.__configBV.set(l.chave, l.valor) : GC.__configBV.delete(l.chave));
    return;
  }
  const agora = new Date().toISOString();
  const salvar = linhas.filter((l) => l.valor);
  if (salvar.length) {
    await rest(`/configuracao?on_conflict=chave`, {
      method: "POST", headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify(salvar.map((l) => ({ ...l, atualizado_em: agora }))),
    });
  }
  for (const l of linhas.filter((x) => !x.valor)) await rest(`/configuracao?chave=eq.${encodeURIComponent(l.chave)}`, { method: "DELETE" });
}
