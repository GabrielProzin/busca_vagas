import "server-only";
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
let demo: Demo | null = null;
function emDemo(): Demo | null {
  const arq = process.env.DEMO_ARQUIVO;
  if (!arq) return null;
  if (!demo) {
    const j = JSON.parse(readFileSync(arq, "utf-8"));
    const agora = new Date().toISOString();
    demo = {
      vagas: (j.vagas as Vaga[]).map((v) => ({ ...v, primeira_vez_em: agora, atualizada_em: agora, candidatura: null })),
      candidaturas: new Map(),
      execucoes: [{ id: 1, iniciada_em: agora, ...j.execucao }],
    };
  }
  return demo;
}

function comCandidatura(v: Vaga & { candidatura?: Candidatura | Candidatura[] | null }): Vaga {
  const c = Array.isArray(v.candidatura) ? v.candidatura[0] ?? null : v.candidatura ?? null;
  return { ...v, candidatura: c };
}

// ---------------------------------------------------------------- leitura
const CAMPOS_LISTA =
  "id,fonte,titulo,empresa,url,cidade,estado,modalidade,publicada_em,email_contato,emails,trilha,nivel,nota,lista,motivos,habilidades_ok,habilidades_faltando,componentes,primeira_vez_em,atualizada_em";

/** Vagas vistas pela coleta nos últimos `dias` dias (as outras provavelmente fecharam). */
export async function listarVagas(dias = 3): Promise<Vaga[]> {
  const d = emDemo();
  if (d) return d.vagas.map((v) => ({ ...v, candidatura: d.candidaturas.get(v.id) ?? null }));
  const desde = new Date(Date.now() - dias * 864e5).toISOString();
  const linhas = await rest<Vaga[]>(
    `/vagas?select=${CAMPOS_LISTA},candidatura:candidaturas(*)&atualizada_em=gte.${encodeURIComponent(desde)}&order=nota.desc`,
  );
  return linhas.map(comCandidatura);
}

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
export async function listarCandidaturas(): Promise<Vaga[]> {
  const d = emDemo();
  if (d) return d.vagas.filter((v) => d.candidaturas.has(v.id)).map((v) => ({ ...v, candidatura: d.candidaturas.get(v.id)! }));
  const linhas = await rest<Vaga[]>(
    `/vagas?select=${CAMPOS_LISTA},candidatura:candidaturas!inner(*)&candidatura.status=not.in.(nova,descartada)&order=atualizada_em.desc`,
  );
  return linhas.map(comCandidatura);
}

export async function listarExecucoes(limite = 30): Promise<Execucao[]> {
  const d = emDemo();
  if (d) return d.execucoes;
  return rest<Execucao[]>(`/execucoes?select=*&order=iniciada_em.desc&limit=${limite}`);
}

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

export async function mudarStatus(vagaId: string, status: Status): Promise<void> {
  const campos: Partial<Candidatura> = { status };
  if (status === "aplicada" || status === "enviada") campos.enviada_em = new Date().toISOString();
  await salvarCandidatura(vagaId, campos);
}
