import "server-only";

// Currículo em PDF num bucket PRIVADO do Supabase Storage ("privado/curriculo.pdf").
// Só o servidor, com a chave secreta, lê e escreve.

import { supabaseChave, supabaseUrl } from "./ambiente";

const BUCKET = "privado";
export const ARQUIVO_CV = "curriculo.pdf";

function storage(): { base: string; h: Record<string, string> } {
  let raiz = supabaseUrl().replace(/\/+$/, "");
  if (raiz.endsWith("/rest/v1")) raiz = raiz.slice(0, -"/rest/v1".length);
  const chave = supabaseChave();
  const h: Record<string, string> = { apikey: chave };
  if (!chave.startsWith("sb_")) h.Authorization = `Bearer ${chave}`;
  return { base: `${raiz}/storage/v1`, h };
}

async function garantirBucket(): Promise<void> {
  const { base, h } = storage();
  const r = await fetch(`${base}/bucket/${BUCKET}`, { headers: h, cache: "no-store" });
  if (r.ok) return;
  const c = await fetch(`${base}/bucket`, {
    method: "POST",
    headers: { ...h, "Content-Type": "application/json" },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false, file_size_limit: 5 * 1024 * 1024, allowed_mime_types: ["application/pdf"] }),
  });
  if (!c.ok && c.status !== 409) throw new Error(`Não consegui criar o bucket: ${c.status} ${(await c.text()).slice(0, 200)}`);
}

export async function salvarCurriculo(pdf: ArrayBuffer): Promise<void> {
  if (process.env.DEMO_ARQUIVO) { G.__demoCv = Buffer.from(pdf); return; }
  await garantirBucket();
  const { base, h } = storage();
  const r = await fetch(`${base}/object/${BUCKET}/${ARQUIVO_CV}`, {
    method: "POST",
    headers: { ...h, "Content-Type": "application/pdf", "x-upsert": "true" },
    body: pdf,
  });
  if (!r.ok) throw new Error(`Falha ao salvar o PDF: ${r.status} ${(await r.text()).slice(0, 200)}`);
}

export async function lerCurriculo(): Promise<Buffer | null> {
  if (process.env.DEMO_ARQUIVO) return G.__demoCv ?? null;
  const { base, h } = storage();
  const r = await fetch(`${base}/object/${BUCKET}/${ARQUIVO_CV}`, { headers: h, cache: "no-store" });
  if (r.status === 400 || r.status === 404) return null;
  if (!r.ok) throw new Error(`Falha ao ler o PDF: ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

const G = globalThis as unknown as { __demoCv?: Buffer | null };

/** Data da última atualização do PDF, ou null se ainda não foi enviado. */
export async function infoCurriculo(): Promise<{ atualizado: string | null; tamanho: number | null } | null> {
  if (process.env.DEMO_ARQUIVO) return G.__demoCv ? { atualizado: null, tamanho: G.__demoCv.length } : null;
  const { base, h } = storage();
  const r = await fetch(`${base}/object/info/${BUCKET}/${ARQUIVO_CV}`, { headers: h, cache: "no-store" });
  if (!r.ok) return null;
  const j = await r.json().catch(() => ({}));
  return { atualizado: j.updated_at ?? j.last_modified ?? null, tamanho: j.size ?? j.metadata?.size ?? null };
}
