import "server-only";
import { cache } from "react";
import { readFileSync } from "node:fs";
import type { Candidatura, Execucao, Status, Vaga } from "./tipos";

// Acesso ao Supabase pela API REST (PostgREST), sempre no servidor, com a chave secreta.
// Com DEMO_ARQUIVO definido, usa um JSON local em memória (para desenvolver sem banco).

function base(): string {
  const url = process.env.SUPABASE_URL;
  if (!url) throw new Error("SUPABASE_URL não configurada");
  let raiz = url.trim().replace(/\/+$/, "");
  if (raiz.endsWith("/rest/v1")) raiz = raiz.slice(0, -"/rest/v1".length);
  return raiz + "/rest/v1";
}

function cabecalhos(extra: Record<string, string> = {}): Record<string, string> {
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
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
type Demo = { vagas: Vaga[]; candidaturas: Map<string, Candidatura>; execucoes: Execucao[] };
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
  if (d) return d.vagas.filter((v) => d.candidaturas.has(v.id)).map((v) => ({ ...v, candidatura: d.candidaturas.get(v.id)! }));
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

/** Emails de candidatura enviados hoje (horário de Brasília), para o limite diário. */
export async function enviadosHoje(): Promise<number> {
  const inicio = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) + "T00:00:00-03:00").toISOString();
  const d = emDemo();
  if (d) return [...d.candidaturas.values()].filter((c) => c.status === "enviada" && (c.enviada_em ?? "") >= inicio).length;
  const linhas = await rest<{ vaga_id: string }[]>(
    `/candidaturas?select=vaga_id&enviada_em=gte.${encodeURIComponent(inicio)}&status=eq.enviada`,
  );
  return linhas.length;
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
      rest(`/execucoes?select=aprendizado&limit=1`),
    ]);
    return true;
  } catch {
    return false;
  }
}
