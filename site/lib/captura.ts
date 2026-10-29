import "server-only";
import { createHash } from "node:crypto";
import { buscarVaga, gravarVaga, lerPreferencias } from "./db";
import { extrairVaga } from "./ia";
import { capturaNoPerfil } from "./preferencias";
import { PERFIL } from "./gerado/perfil";

/** O email é de um domínio da lista de excluídos? (mesma regra de coletor/envio.py) */
export function dominioExcluido(email: string): boolean {
  const dominio = email.split("@").pop()?.toLowerCase() ?? "";
  return (PERFIL.dominiosExcluidos as readonly string[]).some((d) => dominio === d || dominio.endsWith("." + d));
}

export type MotivoRecusa = "curto" | "nao_vaga" | "repetida" | "sem_email" | "fora_do_perfil";

export type ResultadoCaptura =
  | { ok: true; id: string; titulo: string; nota: number; email: string | null; lista: string }
  | { ok: false; erro: string; motivo: MotivoRecusa };

type Opcoes = {
  /** Número do post do LinkedIn (urn:li:activity:<n>): vira o id da vaga e evita repetir. */
  idPost?: string | null;
  /** Captura em lote: só grava vaga com email, júnior/sem nível e em local aceito. */
  lote?: boolean;
};

/** Texto de um post/anúncio -> vaga com nota, gravada no banco. */
export async function capturar(texto: string, url: string | null, op: Opcoes = {}): Promise<ResultadoCaptura> {
  const limpo = texto.replace(/\s+\n/g, "\n").trim();
  if (limpo.length < 80) return { ok: false, motivo: "curto", erro: "Texto muito curto. Selecione o post inteiro da vaga." };

  const fonte = url && /linkedin\.com/.test(url) ? "linkedin" : "manual";
  // Post do LinkedIn: o mesmo id que a coleta automática usa, então a vaga nunca aparece duas vezes.
  const id =
    op.idPost && /^\d{8,25}$/.test(op.idPost)
      ? `linkedin:${op.idPost}`
      : `${fonte}:${createHash("sha1").update(url || limpo.slice(0, 2000)).digest("hex").slice(0, 16)}`;
  // Já capturado: não gasta IA de novo.
  if (op.lote && (await buscarVaga(id))) return { ok: false, motivo: "repetida", erro: "Vaga já estava no site." };

  const x = await extrairVaga(limpo);
  // Domínios que nunca recebem email (config/preferencias.yaml -> dominios_email_excluidos).
  x.emails = x.emails.filter((e) => !dominioExcluido(e));
  if (!x.e_vaga) return { ok: false, motivo: "nao_vaga", erro: "Isso não parece uma vaga aberta (pode ser lista de candidatos ou divulgação)." };
  if (op.lote) {
    if (!x.emails.length) return { ok: false, motivo: "sem_email", erro: "Post sem email de contato." };
    // Forma de trabalho, cidade e nível conforme a tela Preferências (ou o YAML, se nada foi salvo).
    const { prefs } = await lerPreferencias();
    if (!capturaNoPerfil(prefs, x) || x.nota < PERFIL.notaMinimaPosts) {
      return { ok: false, motivo: "fora_do_perfil", erro: "Fora do seu perfil (nível, local ou área)." };
    }
  }

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
    nivel: x.nivel === "junior" ? "junior" : x.nivel === "nao_informado" ? "nao_informado" : x.nivel,
    nota: x.nota,
    lista,
    motivos: x.motivos,
    habilidades_ok: x.habilidades_ok,
    habilidades_faltando: x.habilidades_faltando,
    componentes: { ia: x.nota / 100 },
  });
  return { ok: true, id, titulo: x.titulo, nota: x.nota, email: x.emails[0] ?? null, lista };
}
