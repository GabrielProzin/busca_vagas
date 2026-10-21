import "server-only";
import { createHash } from "node:crypto";
import { gravarVaga } from "./db";
import { extrairVaga } from "./ia";

export type ResultadoCaptura =
  | { ok: true; id: string; titulo: string; nota: number; email: string | null; lista: string }
  | { ok: false; erro: string };

/** Texto de um post/anúncio colado -> vaga com nota, gravada no banco. */
export async function capturar(texto: string, url: string | null): Promise<ResultadoCaptura> {
  const limpo = texto.replace(/\s+\n/g, "\n").trim();
  if (limpo.length < 80) return { ok: false, erro: "Texto muito curto. Selecione o post inteiro da vaga." };
  const x = await extrairVaga(limpo);
  if (!x.e_vaga) return { ok: false, erro: "Isso não parece uma vaga aberta (pode ser lista de candidatos ou divulgação)." };

  const fonte = url && /linkedin\.com/.test(url) ? "linkedin" : "manual";
  // Mesmo post enviado duas vezes vira a mesma vaga.
  const id = `${fonte}:${createHash("sha1").update(url || limpo.slice(0, 2000)).digest("hex").slice(0, 16)}`;
  const nivelJunior = x.nivel === "junior";
  const lista = x.habilidades_faltando.length > 0 || x.nota < 50 ? "vale_tentar" : "principal";

  await gravarVaga({
    id,
    fonte,
    titulo: x.titulo,
    empresa: x.empresa,
    url: url && /^https?:\/\//.test(url) ? url : null,
    descricao: limpo.slice(0, 20000),
    cidade: x.cidade,
    estado: x.estado,
    modalidade: x.modalidade,
    publicada_em: new Date().toISOString(),
    email_contato: x.emails[0] ?? null,
    emails: x.emails,
    trilha: null,
    nivel: nivelJunior ? "junior" : x.nivel === "nao_informado" ? "nao_informado" : x.nivel,
    nota: x.nota,
    lista,
    motivos: x.motivos,
    habilidades_ok: x.habilidades_ok,
    habilidades_faltando: x.habilidades_faltando,
    componentes: { ia: x.nota / 100 },
  });
  return { ok: true, id, titulo: x.titulo, nota: x.nota, email: x.emails[0] ?? null, lista };
}
